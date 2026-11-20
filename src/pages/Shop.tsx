import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUp, Sparkles, ShoppingCart } from "lucide-react";
import { AppShell, AIBadge } from "../components/ui";
import { CompareTray, ProductCard, Thumb } from "../components/ProductCard";
import { useShop } from "../state/shop";
import { useAuth } from "../state/auth";
import { getProduct, money, searchCatalog, withinBudget, type Product } from "../lib/catalog";
import { resolvePlace } from "../lib/delivery";
import { flag } from "../lib/firebase";
import { saveSearch, setCartQty } from "../lib/store";
import {
  compareProducts, ensureDeviceModel, parseIntent, planBulkOrder, rankProducts, cartEdit,
  type AIResult, type BulkPlan, type Source, type Route,
} from "../ai/hybrid";
import type { CompareResult, Intent, RankResult } from "../ai/schemas";

interface B { label: string; source: Source; route: Route; ms: number }
interface Msg {
  role: "user" | "bot";
  text?: string;
  intent?: Intent;
  badges?: B[];
  picks?: RankResult["picks"];
  compare?: CompareResult;
  plan?: BulkPlan;
  pending?: boolean;
}
const badge = (label: string, r: AIResult<unknown>): B => ({ label, source: r.source, route: r.route, ms: r.ms });
const KEY = "sm_chat";

function matchRefs(refs: string[] | undefined, pool: string[]): string[] {
  if (!refs?.length) return [];
  const out: string[] = [];
  const ord: Record<string, number> = { first: 0, "1": 0, one: 0, second: 1, "2": 1, two: 1, third: 2, "3": 2, three: 2, last: pool.length - 1 };
  for (const r of refs) {
    const k = r.toLowerCase().trim();
    if (getProduct(r) && !out.includes(r)) { out.push(r); continue; }
    const o = Object.keys(ord).find((w) => new RegExp(`\\b${w}\\b`).test(k));
    if (o !== undefined && pool[ord[o]]) { if (!out.includes(pool[ord[o]])) out.push(pool[ord[o]]); continue; }
    const hit = pool.find((id) => {
      const t = getProduct(id)!.title.toLowerCase();
      return k.split(/\s+/).filter((w) => w.length > 2).some((w) => t.includes(w));
    });
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const { currency, place, setPlace, addToCart, cart, compare, toggleCompare } = useShop();
  const { ensureGuest } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>(() => JSON.parse(sessionStorage.getItem(KEY) || "[]"));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const ran = useRef(false);

  useEffect(() => { sessionStorage.setItem(KEY, JSON.stringify(msgs.filter((m) => !m.pending))); }, [msgs]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs.length, busy]);
  useEffect(() => {
    const q = params.get("q");
    if (q && !ran.current) {
      ran.current = true;
      setParams({}, { replace: true });
      ask(q);
    }
  }, []);

  const lastResults = () => [...msgs].reverse().find((m) => m.picks?.length)?.picks!.map((p) => p.id) || [];

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    ensureDeviceModel();
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "bot", pending: true }]);
    const reply = (m: Omit<Msg, "role">) => setMsgs((all) => [...all.filter((x) => !x.pending), { ...m, ...(typeof m.text === "string" ? { text: m.text.replace(/\s*[—–]\s*/g, ", ") } : {}), role: "bot" }]);
    try {
      const pool = lastResults();
      const ir = await parseIntent(q, {
        lastResults: pool.map((id, i) => `${i + 1}. [${id}] ${getProduct(id)?.title}`),
        cart: cart.map((l) => `[${l.id}] ${getProduct(l.id)?.title} x${l.qty}`),
      });
      const intent = ir.data;
      const b1 = badge("Understood", ir);
      let dest = place;
      if (intent.location) {
        const p = resolvePlace(intent.location);
        if (p) { dest = p; setPlace(p); }
      }
      switch (intent.action) {
        case "compare": {
          let ids = matchRefs(intent.product_refs, pool);
          if (ids.length < 2) ids = compare.length >= 2 ? compare : pool.slice(0, 2);
          if (ids.length < 2) return reply({ text: "Search for a product first, then ask me to compare the top picks.", badges: [b1], intent });
          const items = ids.slice(0, 3).map((id) => getProduct(id)!) as Product[];
          ids.slice(0, 3).forEach((id) => !compare.includes(id) && toggleCompare(id));
          const cr = await compareProducts(items, intent.use || intent.query, currency);
          return reply({ text: cr.data.verdict, compare: cr.data, badges: [b1, badge("Compared", cr)], intent });
        }
        case "cart_add": {
          const ids = matchRefs(intent.product_refs, pool);
          const id = ids[0] || pool[0];
          if (!id) return reply({ text: "Tell me which product to add. Search for something first.", badges: [b1], intent });
          await addToCart(id, Math.max(1, intent.quantity || 1));
          return reply({ text: `Added ${Math.max(1, intent.quantity || 1)} × ${getProduct(id)!.title} to your cart.`, badges: [b1], intent });
        }
        case "cart_remove": {
          if (!cart.length) return reply({ text: "Your cart is empty.", badges: [b1], intent });
          const ops = await cartEdit(q, cart, currency);
          const u = await ensureGuest();
          for (const op of ops.data.ops) {
            if (!getProduct(op.product_id)) continue;
            const cur = cart.find((l) => l.id === op.product_id)?.qty || 0;
            await setCartQty(u.uid, op.product_id, op.op === "remove" ? 0 : op.op === "add" ? cur + Math.max(1, op.qty) : op.qty);
          }
          return reply({ text: ops.data.note, badges: [b1, badge("Cart edit", ops)], intent });
        }
        case "bulk_plan": {
          const pr = await planBulkOrder(q, currency, dest);
          return reply({ text: pr.data.summary, plan: pr.data, badges: [b1, { label: "Planner (function calling)", source: pr.source, route: "cloud", ms: pr.ms }], intent });
        }
        case "track_order":
          return reply({ text: "You can follow every order's delivery timeline on the Orders page.", badges: [b1], intent });
        case "chitchat":
          return reply({ text: intent.reply || "Tell me what you need, your budget and what it's for.", badges: [b1], intent });
        default: {
          const cands = searchCatalog(intent, 8).filter((c, i, all) => i < 3 || withinBudget(c, intent) || !intent.budget_max || all.length < 4);
          if (!cands.length) return reply({ text: "I couldn't find anything matching that in the catalog yet. Try different words or a higher budget.", badges: [b1], intent });
          const rr = await rankProducts(q, intent, cands, currency, dest);
          const max = Number(flag("max_results")) || 6;
          const picks = (rr.data.picks.length ? rr.data.picks : cands.map((c) => ({ id: c.id, reasons: [] as string[], fit: 70 }))).slice(0, max);
          ensureGuest().then((u) => saveSearch(u.uid, q, ir.source)).catch(() => undefined);
          return reply({ text: rr.data.summary, picks, badges: [b1, badge("Ranked", rr)], intent });
        }
      }
    } catch (e) {
      reply({ text: "Something went wrong: " + ((e as Error).message || e) });
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = text;
    setText("");
    ask(q);
  }

  return (
    <AppShell>
      <main className="wrap wide page">
        {msgs.length === 0 && (
          <div style={{ maxWidth: 560 }}>
            <h1 className="pagetitle">What are you shopping for?</h1>
            <p className="muted" style={{ fontSize: 14 }}>Say the product, your budget and what it's for. Your request is understood on your device with Gemini Nano when available; ranking uses cloud Gemini.</p>
            <div className="stack" style={{ marginTop: 18 }}>
              {["Wireless headphones under $50 with good battery life", "A laptop for programming under $700", "Running shoes for flat feet, size 43", "Plan an office restock of toiletries for 20 staff"].map((q) => (
                <button key={q} className="card ex" onClick={() => ask(q)}><Sparkles size={15} color="var(--orange)" /><b>{q}</b></button>
              ))}
            </div>
          </div>
        )}
        <div className="chat">
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="msg user">{m.text}</div>
            ) : (
              <div key={i} className="msg bot">
                <div className="bubble">
                  {m.pending ? <span className="typing"><i /><i /><i /></span> : m.text}
                  {m.intent && m.intent.action === "search" && (
                    <div className="intent">
                      {m.intent.query && <span>“{m.intent.query}”</span>}
                      {m.intent.budget_max ? <span>budget ≤ {m.intent.budget_currency === "NGN" ? "₦" : "$"}{m.intent.budget_max.toLocaleString()}</span> : null}
                      {m.intent.use && <span>for {m.intent.use}</span>}
                      {m.intent.size ? <span>size {m.intent.size}</span> : null}
                      {m.intent.category && <span>{m.intent.category}</span>}
                      <span>deliver to {place.name}</span>
                    </div>
                  )}
                  {m.badges && <div className="badges">{m.badges.map((b, j) => <AIBadge key={j} {...b} />)}</div>}
                </div>
                {m.picks && (
                  <div className="pgrid three" style={{ marginTop: 12 }}>
                    {m.picks.map((p) => getProduct(p.id) && <ProductCard key={p.id} p={getProduct(p.id)!} reasons={p.reasons} fit={p.fit} />)}
                  </div>
                )}
                {m.compare && (
                  <div className="card" style={{ marginTop: 12, padding: 14 }}>
                    {m.compare.items.map((it) => getProduct(it.id) && (
                      <div key={it.id} className="row" style={{ padding: "6px 0" }}>
                        <Thumb p={getProduct(it.id)!} />
                        <div>
                          <b style={{ fontSize: 13 }}>{getProduct(it.id)!.title}</b> {it.id === m.compare!.winner_id && <span className="badge demo" style={{ marginLeft: 6 }}>Winner</span>}
                          <div className="tiny">{it.best_for} · {money(getProduct(it.id)!.price, getProduct(it.id)!.currency, currency)}</div>
                        </div>
                      </div>
                    ))}
                    <Link to="/compare" className="pill sm" style={{ marginTop: 8 }}>Open full comparison</Link>
                  </div>
                )}
                {m.plan && m.plan.lines.length > 0 && (
                  <div className="card" style={{ marginTop: 12, padding: 14 }}>
                    {m.plan.lines.map((l) => getProduct(l.id) && (
                      <div key={l.id} className="between" style={{ padding: "6px 0", fontSize: 13 }}>
                        <span>{l.qty} × {getProduct(l.id)!.title}<div className="tiny">{l.why}</div></span>
                        <b>{money(getProduct(l.id)!.price * l.qty, "NGN", currency)}</b>
                      </div>
                    ))}
                    <button className="pill orange sm" style={{ marginTop: 8 }} onClick={async () => { for (const l of m.plan!.lines) await addToCart(l.id, l.qty); }}>
                      <ShoppingCart size={13} /> Add plan to cart
                    </button>
                  </div>
                )}
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>
      </main>
      <CompareTray />
      <div className="composer">
        <div className="wrap wide">
          <form onSubmit={submit}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. headphones under $50, compare the first two, add the second one" aria-label="Ask Shopmate" />
            <button className="send" disabled={busy || !text.trim()} aria-label="Send"><ArrowUp size={18} /></button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
