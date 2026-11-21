import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUp, Sparkles, ShoppingCart, Plus, X, ImagePlus, Eye, ExternalLink } from "lucide-react";
import { AppShell, AIBadge } from "../components/ui";
import { BagMark } from "../components/BagMark";
import { CompareTray, ProductCard, Thumb } from "../components/ProductCard";
import { useShop } from "../state/shop";
import { useAuth } from "../state/auth";
import { getProduct, matchImage, money, searchCatalog, symbolOf, toCurrency, withinBudget, type Product } from "../lib/catalog";
import { resolveStore } from "../data/retailers";
import { prepareImage, type PreparedImage } from "../lib/image";
import { TrustReportCard } from "../components/TrustReport";
import { mockIntent } from "../ai/mock";
import { resolvePlace, placeLabel } from "../lib/delivery";
import { countryOf } from "../data/countries";
import { flag } from "../lib/firebase";
import { saveSearch, setCartQty } from "../lib/store";
import {
  compareProducts, ensureDeviceModel, parseIntent, planBulkOrder, rankProducts, cartEdit, identifyImage, trustReport,
  type AIResult, type BulkPlan, type Source, type Route,
} from "../ai/hybrid";
import type { CompareResult, Intent, RankResult } from "../ai/schemas";
import type { TrustReportData } from "../lib/trust";

const CLEAR_TIP = "Use a clear picture of the item for the best matches.";
interface VisionCard {
  name: string; summary: string; traits: string[]; confidence: string; unclear?: boolean;
  span?: { lo: Product; hi: Product } | null; searchQ?: string; loose?: boolean;
}

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
  img?: string;
  vision?: VisionCard;
  trust?: { id: string; res: AIResult<TrustReportData> };
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
  const { currency: curNow, place, setPlace, addToCart, cart, compare, toggleCompare, notify } = useShop();
  const currency = curNow;
  const { ensureGuest } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>(() => JSON.parse(sessionStorage.getItem(KEY) || "[]"));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const ran = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [attached, setAttached] = useState<PreparedImage | null>(null);
  const [prepping, setPrepping] = useState(false);

  async function attach(file: File | undefined | null) {
    if (!file) return;
    setPrepping(true);
    try { setAttached(await prepareImage(file)); } catch (e) { notify((e as Error).message); } finally { setPrepping(false); }
  }

  useEffect(() => { sessionStorage.setItem(KEY, JSON.stringify(msgs.filter((m) => !m.pending))); }, [msgs]);
  useEffect(() => { document.documentElement.classList.toggle("ai-thinking", busy); return () => document.documentElement.classList.remove("ai-thinking"); }, [busy]);
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

  async function askWithImage(q: string, img: PreparedImage, reply: (m: Omit<Msg, "role">) => void) {
    const vr = await identifyImage({ mimeType: img.mimeType, base64: img.base64 }, q, curNow, place);
    const b1 = badge("Picture", vr);
    const v = vr.data;
    if (!v) {
      return reply({
        text: vr.source === "demo"
          ? "Picture search needs the cloud AI, which isn't connected in this demo. Describe the item in words and I'll search for it."
          : "I couldn't analyze that picture just now. Please try again in a moment, or describe the item in words.",
        badges: [b1],
      });
    }
    if (!v.usable || v.confidence === "low") {
      return reply({
        text: (v.reason?.trim() || "I can't tell what the item is from this picture.") + " A clear, well-lit picture with the whole item in frame works best, so please try another one.",
        badges: [b1],
        ...(v.usable && v.summary ? { vision: { name: v.product_name || "", summary: v.summary, traits: [], confidence: v.confidence || "low", unclear: true } } : {}),
      });
    }
    const fromText = mockIntent(q, curNow);
    const budget_max = v.budget_max || fromText.budget_max || 0;
    const budget_currency = (v.budget_currency || fromText.budget_currency || curNow || "USD").toUpperCase();
    const terms = [...(v.search_terms || []), v.product_type].filter(Boolean);
    const found = matchImage({ terms, category: v.category, budget_max, budget_currency });
    const searchQ = [v.brand_guess, v.product_name].filter(Boolean).join(" ").trim() || terms.join(" ");
    const card: VisionCard = { name: v.product_name, summary: v.summary, traits: (v.characteristics || []).slice(0, 7), confidence: v.confidence, searchQ, loose: found.loose };
    if (!found.items.length) {
      return reply({
        text: "I couldn't find a close match for that in our catalog across stores yet. You can search the look in other stores below.",
        vision: card, badges: [b1],
      });
    }
    const intent: Intent = { action: "search", query: terms.slice(0, 3).join(" "), category: v.category, budget_max, budget_currency, use: "", size: 0 };
    const said = `Shopper shared a picture of: ${v.product_name}. Visual traits: ${(v.characteristics || []).join(", ")}. ${q ? `Shopper note: ${q}. ` : ""}Pick the closest alternatives to the pictured item and say in the reasons how each one matches or differs visually. Drop items that are a different kind of product.`;
    const rr = await rankProducts(said, intent, found.items, curNow, place);
    const trusted = rr.source === "in_cloud" || rr.source === "on_device";
    let picks = trusted ? rr.data.picks : found.loose ? [] : found.items.map((c) => ({ id: c.id, reasons: [] as string[], fit: 70 }));
    let over = false;
    if (budget_max) {
      const cap = toCurrency(budget_max, budget_currency, "USD");
      const inB = picks.filter((p) => { const c = getProduct(p.id); return c && toCurrency(c.price, c.currency, "USD") <= cap; });
      if (inB.length) picks = inB; else if (picks.length) over = true;
    }
    picks = picks.slice(0, Number(flag("max_results")) || 6);
    const items = picks.map((p) => getProduct(p.id)).filter((x): x is Product => !!x);
    if (!items.length) {
      return reply({ text: "I couldn't find a close match for that in our catalog across stores yet. You can search the look in other stores below.", vision: card, badges: [b1, badge("Matched", rr)] });
    }
    const byPrice = [...items].sort((a, b) => toCurrency(a.price, a.currency, "USD") - toCurrency(b.price, b.currency, "USD"));
    card.span = { lo: byPrice[0], hi: byPrice[byPrice.length - 1] };
    ensureGuest().then((u) => saveSearch(u.uid, `[picture] ${v.product_name}`, vr.source)).catch(() => undefined);
    const note = over ? ` Nothing is within ${symbolOf(budget_currency)}${budget_max.toLocaleString()}, so these are the closest options above your budget.` : "";
    return reply({ text: `${rr.data.summary || `Found ${items.length} close match${items.length > 1 ? "es" : ""}.`}${note}`, picks, vision: card, badges: [b1, badge("Matched", rr)] });
  }

  async function ask(q: string, img?: PreparedImage | null) {
    if ((!q.trim() && !img) || busy) return;
    ensureDeviceModel();
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: q, ...(img ? { img: img.thumb } : {}) }, { role: "bot", pending: true }]);
    const reply = (m: Omit<Msg, "role">) => setMsgs((all) => [...all.filter((x) => !x.pending), { ...m, ...(typeof m.text === "string" ? { text: m.text.replace(/\s*[—–]\s*/g, ", ") } : {}), role: "bot" }]);
    try {
      if (img) return await askWithImage(q, img, reply);
      const pool = lastResults();
      const ir = await parseIntent(q, {
        lastResults: pool.map((id, i) => `${i + 1}. [${id}] ${getProduct(id)?.title}`),
        cart: cart.map((l) => `[${l.id}] ${getProduct(l.id)?.title} x${l.qty}`),
        place, currency: curNow,
      });
      const intent = ir.data;
      const b1 = badge("Understood", ir);
      let dest = place;
      let currency = curNow;
      if (intent.location || intent.location_country) {
        const p = resolvePlace(intent.location, intent.location_country);
        if (p && (p.name !== place.name || p.country !== place.country)) {
          dest = p; setPlace(p); currency = countryOf(p.country)?.currency || currency;
          notify(`Delivering to ${placeLabel(p)}`);
        }
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
        case "trust_check": {
          const ids = matchRefs(intent.product_refs, pool);
          const id = ids[0] || (intent.query ? searchCatalog(intent, 1)[0]?.id : undefined) || pool[0] || compare[0];
          const prod = id ? getProduct(id) : undefined;
          if (!prod) return reply({ text: "Tell me which product to check. Search for something first, or open a product and tap Trust report.", badges: [b1], intent });
          const tr = await trustReport(prod, currency, dest);
          return reply({ text: `Here is the Shopmate Trust Report for ${prod.title}.`, trust: { id: prod.id, res: tr }, badges: [b1], intent });
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
    const q = text, img = attached;
    setText(""); setAttached(null);
    ask(q, img);
  }

  return (
    <AppShell>
      <main className="wrap wide page">
        {msgs.length === 0 && (
          <div style={{ maxWidth: 560 }}>
            <h1 className="pagetitle">What are you shopping for?</h1>
            <p className="muted" style={{ fontSize: 14 }}>Say the product, your budget and what it's for. Your request is understood on your device with Gemini Nano when available; ranking uses cloud Gemini.</p>
            <button className="card ex shotcta" onClick={() => fileRef.current?.click()}>
              <span className="q"><ImagePlus size={17} /></span>
              <span style={{ textAlign: "left" }}><b>Screenshot to shopping</b><div className="tiny" style={{ marginTop: 2 }}>Upload a screenshot, photo or social media image of something you want. {CLEAR_TIP}</div></span>
            </button>
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
              <div key={i} className="msg user">
                {m.img && <img className="userimg" src={m.img} alt="Your picture" />}
                {m.text}
              </div>
            ) : (
              <div key={i} className="msg bot">
                <div className="botrow"><BagMark size={30} still={!m.pending && i !== msgs.length - 1} />
                <div className="bubble">
                  {m.pending ? <span className="typing"><i /><i /><i /></span> : m.text}
                  {m.intent && m.intent.action === "search" && (
                    <div className="intent">
                      {m.intent.query && <span>“{m.intent.query}”</span>}
                      {m.intent.budget_max ? <span>budget ≤ {symbolOf(m.intent.budget_currency || "USD")}{m.intent.budget_max.toLocaleString()}</span> : null}
                      {m.intent.use && <span>for {m.intent.use}</span>}
                      {m.intent.size ? <span>size {m.intent.size}</span> : null}
                      {m.intent.category && <span>{m.intent.category}</span>}
                      <span>deliver to {place.name}</span>
                    </div>
                  )}
                  {m.vision && (
                    <div className={`vcard${m.vision.unclear ? " unclear" : ""}`}>
                      <div className="vhead"><Eye size={14} /> {m.vision.unclear ? "What I could make out" : "What I see"}</div>
                      {m.vision.summary && <p>{m.vision.summary}</p>}
                      {m.vision.traits.length > 0 && <div className="vtraits">{m.vision.traits.map((t, k) => <span key={k}>{t}</span>)}</div>}
                      {m.vision.span && (
                        <div className="vspan">
                          Matches across stores: <b>{money(m.vision.span.lo.price, m.vision.span.lo.currency, currency)}</b> at {resolveStore(m.vision.span.lo.priceSource?.name).store}
                          {m.vision.span.hi.id !== m.vision.span.lo.id && <> up to <b>{money(m.vision.span.hi.price, m.vision.span.hi.currency, currency)}</b> at {resolveStore(m.vision.span.hi.priceSource?.name).store}</>}
                          {m.vision.loose && <div className="tiny">Closest options in our catalog, not an exact match.</div>}
                        </div>
                      )}
                      {m.vision.unclear && <div className="tiny" style={{ marginTop: 6 }}>{CLEAR_TIP}</div>}
                    </div>
                  )}
                  {m.badges && <div className="badges">{m.badges.map((b, j) => <AIBadge key={j} {...b} />)}</div>}
                </div></div>
                {m.picks && (
                  <div className="pgrid three" style={{ marginTop: 12 }}>
                    {m.picks.map((p) => getProduct(p.id) && <ProductCard key={p.id} p={getProduct(p.id)!} reasons={p.reasons} fit={p.fit} />)}
                  </div>
                )}
                {m.vision && !m.vision.unclear && m.vision.searchQ && (!m.picks || m.picks.length < 3) && (
                  <div className="searchlinks">
                    <span className="tiny">Search this look in other stores:</span>
                    {[
                      ["Google Shopping", `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(m.vision.searchQ)}`],
                      ["Amazon", `https://www.amazon.com/s?k=${encodeURIComponent(m.vision.searchQ)}`],
                      ["Walmart", `https://www.walmart.com/search?q=${encodeURIComponent(m.vision.searchQ)}`],
                      ["Target", `https://www.target.com/s?searchTerm=${encodeURIComponent(m.vision.searchQ)}`],
                    ].map(([n, u]) => <a key={n} className="pill sm ghost" href={u} target="_blank" rel="noopener noreferrer">{n} <ExternalLink size={11} /></a>)}
                  </div>
                )}
                {m.trust && getProduct(m.trust.id) && (
                  <div style={{ marginTop: 12 }}><TrustReportCard p={getProduct(m.trust.id)!} res={m.trust.res} currency={currency} /></div>
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
                        <b>{money(getProduct(l.id)!.price * l.qty, getProduct(l.id)!.currency, currency)}</b>
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
          {(attached || prepping) && (
            <div className="attachrow">
              {attached ? (
                <span className="attachthumb"><img src={attached.thumb} alt="Attached picture preview" /><button type="button" onClick={() => setAttached(null)} aria-label="Remove picture"><X size={12} strokeWidth={3} /></button></span>
              ) : <span className="attachthumb"><span className="typing"><i /><i /><i /></span></span>}
              <span className="tiny">{prepping ? "Preparing your picture…" : CLEAR_TIP}</span>
            </div>
          )}
          <form onSubmit={submit}>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" className="attach" onClick={() => fileRef.current?.click()} aria-label="Attach a screenshot or photo" title={`Screenshot to shopping. ${CLEAR_TIP}`} disabled={busy}><Plus size={18} /></button>
            <input
              value={text} onChange={(e) => setText(e.target.value)} aria-label="Ask Shopmate"
              placeholder={attached ? "Add a budget or note (optional), e.g. under $80" : "e.g. headphones under $50, compare the first two, add the second one"}
              onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); void attach(f); } }}
            />
            <button className="send" disabled={busy || prepping || (!text.trim() && !attached)} aria-label="Send"><ArrowUp size={18} /></button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
