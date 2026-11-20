import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, Sparkles } from "lucide-react";
import { AppShell, AIBadge, Footer } from "../components/ui";
import { Thumb } from "../components/ProductCard";
import { getProduct, money, type Product } from "../lib/catalog";
import { quote } from "../lib/delivery";
import { useShop } from "../state/shop";
import { cartEdit, ensureDeviceModel, type AIResult } from "../ai/hybrid";
import type { CartOps } from "../ai/schemas";

export function useTotals(speed: "standard" | "express" = "standard") {
  const { cart, place } = useShop();
  const lines = cart.map((l) => ({ ...l, p: getProduct(l.id) })).filter((l) => l.p) as Array<{ id: string; qty: number; p: Product }>;
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const q = lines.length ? quote(place, lines.map((l) => [l.p, l.qty] as [Product, number]), speed) : null;
  return { lines, subtotal, q, total: subtotal + (q?.fee || 0) };
}

export default function Cart() {
  const { currency, place, setQty, cart } = useShop();
  const { lines, subtotal, q, total } = useTotals();
  const nav = useNavigate();
  const [cmd, setCmd] = useState("");
  const [res, setRes] = useState<AIResult<CartOps> | null>(null);
  const [busy, setBusy] = useState(false);

  async function edit() {
    if (!cmd.trim()) return;
    ensureDeviceModel();
    setBusy(true);
    const r = await cartEdit(cmd, cart, currency);
    for (const op of r.data.ops) {
      if (!getProduct(op.product_id)) continue;
      const cur = cart.find((l) => l.id === op.product_id)?.qty || 0;
      await setQty(op.product_id, op.op === "remove" ? 0 : op.op === "add" ? cur + Math.max(1, op.qty) : op.qty);
    }
    setRes(r);
    setCmd("");
    setBusy(false);
  }

  return (
    <AppShell>
      <main className="wrap wide page" style={{ maxWidth: 760 }}>
        <h1 className="pagetitle">Your cart</h1>
        {!lines.length ? (
          <div className="card" style={{ padding: 20 }}>
            <p className="muted" style={{ marginTop: 0 }}>Your cart is empty.</p>
            <Link className="pill orange" to="/shop">Start Shopping</Link>
          </div>
        ) : (
          <div className="stack">
            <div className="card glow-sm" style={{ padding: 14 }}>
              <form className="row" onSubmit={(e) => { e.preventDefault(); edit(); }}>
                <Sparkles size={15} color="var(--orange)" />
                <input className="input" placeholder="“make it 2 kettles and remove the toothpaste”" value={cmd} onChange={(e) => setCmd(e.target.value)} />
                <button className="pill orange" disabled={busy}>{busy ? "…" : "Update"}</button>
              </form>
              {res && <div className="row" style={{ marginTop: 10, flexWrap: "wrap", position: "relative", zIndex: 1 }}><span style={{ fontSize: 13 }}>{res.data.note}</span><AIBadge label="Cart edit" source={res.source} route={res.route} ms={res.ms} /></div>}
            </div>
            {lines.map((l) => (
              <div key={l.id} className="card line">
                <Thumb p={l.p} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link to={`/p/${l.id}`}><b style={{ fontSize: 13 }}>{l.p.title}</b></Link>
                  <div className="tiny">{money(l.p.price, l.p.currency, currency)} each</div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <div className="qty"><button onClick={() => setQty(l.id, l.qty - 1)} aria-label="Decrease">−</button><span>{l.qty}</span><button onClick={() => setQty(l.id, l.qty + 1)} aria-label="Increase">+</button></div>
                    <button className="iconbtn" onClick={() => setQty(l.id, 0)} aria-label="Remove"><Trash2 size={14} /></button>
                  </div>
                </div>
                <b>{money(l.p.price * l.qty, l.p.currency, currency)}</b>
              </div>
            ))}
            <div className="card sum">
              <div className="r"><span>Subtotal</span><b>{money(subtotal, "USD", currency)}</b></div>
              <div className="r"><span>Est. delivery to {place.name}, {place.country} ({q!.eta})</span><b>{money(q!.fee, q!.fee_currency, currency)}</b></div>
              <div className="r t"><span>Total</span><span>{money(total, "USD", currency)}</span></div>
              <button className="btn block" onClick={() => nav("/checkout")}>Checkout</button>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </AppShell>
  );
}
