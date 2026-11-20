import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, X, Plus } from "lucide-react";
import { AppShell, AIBadge, Footer } from "../components/ui";
import { Thumb } from "../components/ProductCard";
import { getProduct, money, type Product } from "../lib/catalog";
import { quote } from "../lib/delivery";
import { useShop } from "../state/shop";
import { compareProducts, type AIResult } from "../ai/hybrid";
import type { CompareResult } from "../ai/schemas";

export default function Compare() {
  const { compare, toggleCompare, currency, place, addToCart } = useShop();
  const items = compare.map(getProduct).filter(Boolean) as Product[];
  const [need, setNeed] = useState("");
  const [res, setRes] = useState<AIResult<CompareResult> | null>(null);
  const [busy, setBusy] = useState(false);
  const key = compare.join(",");
  async function run() {
    if (items.length < 2) return;
    setBusy(true);
    setRes(await compareProducts(items, need, currency));
    setBusy(false);
  }
  useEffect(() => { setRes(null); if (items.length >= 2) run(); }, [key]);

  const specKeys = Array.from(new Set(items.flatMap((p) => Object.keys(p.specs || {}))));
  const win = res?.data.winner_id;
  return (
    <AppShell>
      <main className="wrap wide page">
        <h1 className="pagetitle">Compare</h1>
        {items.length < 2 ? (
          <div className="card" style={{ padding: 20 }}>
            <p className="muted" style={{ marginTop: 0 }}>Pick 2 or 3 products to compare side by side. Tap “Compare” on any listing, or ask in chat: “compare the first two”.</p>
            <div className="row"><Link to="/discover" className="pill orange">Browse listings</Link><Link to="/shop" className="pill">Ask Shopmate</Link></div>
            {items.length === 1 && <p className="tiny">Selected: {items[0].title}</p>}
          </div>
        ) : (
          <>
            <div className="card glow-sm" style={{ padding: 16, marginBottom: 14 }}>
              <form className="row" onSubmit={(e) => { e.preventDefault(); run(); }}>
                <input className="input" placeholder="What's it for? (e.g. gym, long flights, coding)" value={need} onChange={(e) => setNeed(e.target.value)} />
                <button className="pill orange" disabled={busy}>{busy ? "Comparing…" : "Re-compare"}</button>
              </form>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: "14px 0 10px", position: "relative", zIndex: 1 }}>
                {busy && !res ? <span className="typing"><i /><i /><i /></span> : res?.data.verdict}
              </p>
              {res && <AIBadge label="Compared" source={res.source} route={res.route} ms={res.ms} />}
            </div>
            <div className="card scrollx">
              <table className="ctable">
                <thead>
                  <tr><th />{items.map((p) => (
                    <td key={p.id} className={p.id === win ? "win" : ""} style={{ minWidth: 170 }}>
                      <div className="between"><Thumb p={p} /><button className="iconbtn" aria-label="Remove" onClick={() => toggleCompare(p.id)}><X size={14} /></button></div>
                      <Link to={`/p/${p.id}`}><b style={{ fontSize: 13, display: "block", marginTop: 8 }}>{p.title}</b></Link>
                      {p.id === win && <span className="badge demo" style={{ marginTop: 6 }}><Trophy size={11} /> Pick</span>}
                    </td>))}</tr>
                </thead>
                <tbody>
                  <tr><th>Price</th>{items.map((p) => <td key={p.id} className={p.id === win ? "win" : ""}><b>{money(p.price, p.currency, currency)}</b></td>)}</tr>
                  <tr><th>Delivery to {place.name}</th>{items.map((p) => { const q = quote(place, [[p, 1]]); return <td key={p.id} className={p.id === win ? "win" : ""}>{money(q.fee, q.fee_currency, currency)} · {q.eta}</td>; })}</tr>
                  {specKeys.map((k) => <tr key={k}><th>{k}</th>{items.map((p) => <td key={p.id} className={p.id === win ? "win" : ""}>{p.specs?.[k] || "-"}</td>)}</tr>)}
                  {res && <tr><th>Best for</th>{items.map((p) => <td key={p.id} className={p.id === win ? "win" : ""}>{res.data.items.find((i) => i.id === p.id)?.best_for || "-"}</td>)}</tr>}
                  {res && <tr><th>Pros</th>{items.map((p) => <td key={p.id} className={p.id === win ? "win" : ""}>{(res.data.items.find((i) => i.id === p.id)?.pros || []).join(" · ") || "-"}</td>)}</tr>}
                  {res && <tr><th>Cons</th>{items.map((p) => <td key={p.id} className={p.id === win ? "win" : ""}>{(res.data.items.find((i) => i.id === p.id)?.cons || []).join(" · ") || "-"}</td>)}</tr>}
                  <tr><th />{items.map((p) => <td key={p.id} className={p.id === win ? "win" : ""}><button className="pill orange sm" onClick={() => addToCart(p.id)}><Plus size={13} /> Add</button></td>)}</tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
      <Footer />
    </AppShell>
  );
}
