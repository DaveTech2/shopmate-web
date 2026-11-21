import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Plus, Scale, Truck, Sparkles, ShieldCheck } from "lucide-react";
import { AppShell, AIBadge, Footer } from "../components/ui";
import { Thumb } from "../components/ProductCard";
import { categoryName, getProduct, money } from "../lib/catalog";
import { quote } from "../lib/delivery";
import { useShop } from "../state/shop";
import { TrustReportCard } from "../components/TrustReport";
import { ensureDeviceModel, summarizeProduct, trustReport, type AIResult } from "../ai/hybrid";
import type { TrustReportData } from "../lib/trust";

export default function ProductPage() {
  const { id = "" } = useParams();
  const p = getProduct(id);
  const { currency, place, addToCart, toggleCompare, compare } = useShop();
  const [qty, setQty] = useState(1);
  const [ans, setAns] = useState<AIResult<string> | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AIResult<TrustReportData> | null>(null);
  const [checking, setChecking] = useState(false);
  const [params, setParams] = useSearchParams();
  const auto = useRef(false);
  const reportRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setReport(null); auto.current = false; }, [id, currency, place.name]);
  useEffect(() => {
    if (params.get("trust") && p && !auto.current) { auto.current = true; setParams({}, { replace: true }); void runTrust(); }
  });
  if (!p) return <AppShell><main className="wrap page"><p>Product not found. <Link className="link" to="/discover">Browse</Link></p></main></AppShell>;
  const std = quote(place, [[p, qty]]);
  const exp = quote(place, [[p, qty]], "express");
  async function askAI(q?: string) {
    ensureDeviceModel();
    setBusy(true);
    setAns(await summarizeProduct(p!, currency, q));
    setBusy(false);
  }
  async function runTrust() {
    ensureDeviceModel();
    setChecking(true);
    const r = await trustReport(p!, currency, place);
    setReport(r);
    setChecking(false);
    setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }
  return (
    <AppShell>
      <main className="wrap wide page">
        <div className="pgrid" style={{ alignItems: "start" }}>
          <div className="card" style={{ padding: 12 }}><Thumb p={p} lg /></div>
          <div className="stack">
            <span className="tiny">{categoryName(p.category)} · {p.merchant}</span>
            <h1 className="pagetitle" style={{ margin: 0 }}>{p.title}</h1>
            <div className="price" style={{ fontSize: 26 }}>{money(p.price, p.currency, currency)} {currency !== "USD" && <small>{money(p.price, p.currency, "USD")}</small>}</div>
            {p.priceSource?.url && p.priceUpdatedAt && <span className="tiny">Price checked {p.priceUpdatedAt} at <a className="link" href={p.priceSource.url} target="_blank" rel="noopener noreferrer">{p.priceSource.name}</a></span>}
            {p.specs && (
              <table className="ctable"><tbody>{Object.entries(p.specs).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
            )}
            <div className="card sum">
              <div className="r"><span className="row"><Truck size={14} /> Standard to {place.name}, {place.country}</span><b>{money(std.fee, std.fee_currency, currency)} · {std.eta}</b></div>
              <div className="r"><span>Express</span><b>{money(exp.fee, exp.fee_currency, currency)} · {exp.eta}</b></div>
              <div className="tiny">Estimate · ships from {std.from}{std.international ? " (international)" : ""} · {std.band} · ~{std.distance_km.toLocaleString()} km</div>
            </div>
            <div className="row">
              <div className="qty"><button onClick={() => setQty(Math.max(1, qty - 1))}>−</button><span>{qty}</span><button onClick={() => setQty(qty + 1)}>+</button></div>
              <button className="btn" onClick={() => addToCart(p.id, qty)}><Plus size={15} /> Add to cart</button>
              <button className="pill" onClick={() => toggleCompare(p.id)}><Scale size={14} /> {compare.includes(p.id) ? "In compare" : "Compare"}</button>
            </div>
            <div className="card trustcta">
              <span className="tshield"><ShieldCheck size={20} /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b>Check before you buy</b>
                <div className="tiny" style={{ marginTop: 2 }}>Shopmate checks the seller, price, specs, cheaper alternatives and return policy.</div>
              </div>
              <button className="pill orange sm" onClick={runTrust} disabled={checking}>{checking ? "Checking…" : report ? "Run again" : "Trust report"}</button>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div className="between"><b style={{ fontSize: 13 }}><Sparkles size={13} color="var(--orange)" /> Ask about this product</b></div>
              <form className="row" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); askAI(question || undefined); }}>
                <input className="input" placeholder="Is it good for long trips?" value={question} onChange={(e) => setQuestion(e.target.value)} />
                <button className="pill orange" disabled={busy}>{busy ? "…" : "Ask"}</button>
              </form>
              {!ans && !busy && <button className="pill sm ghost" style={{ marginTop: 10 }} onClick={() => askAI()}>Quick take: who is it for?</button>}
              {ans && <p style={{ fontSize: 13, lineHeight: 1.6, margin: "12px 0 8px" }}>{ans.data}</p>}
              {ans && <AIBadge source={ans.source} route={ans.route} ms={ans.ms} />}
            </div>
          </div>
        </div>
        <div ref={reportRef} className="trustwrap">
          {checking && (
            <div className="card tchecking" role="status"><span className="typing"><i /><i /><i /></span> Investigating {p.title}: seller, price history, alternatives, return policy…</div>
          )}
          {report && !checking && <TrustReportCard p={p} res={report} currency={currency} />}
        </div>
      </main>
      <Footer />
    </AppShell>
  );
}
