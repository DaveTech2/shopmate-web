import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, Lock } from "lucide-react";
import { AppShell, Footer } from "../components/ui";
import { money } from "../lib/catalog";
import { useShop } from "../state/shop";
import { useAuth } from "../state/auth";
import { createOrder, clearCart } from "../lib/store";
import { useTotals } from "./Cart";

export default function Checkout() {
  const { currency, place, cart } = useShop();
  const { ensureGuest, user } = useAuth();
  const [speed, setSpeed] = useState<"standard" | "express">("standard");
  const [pay, setPay] = useState<"demo-card" | "pay-on-delivery">("demo-card");
  const [name, setName] = useState(user && !user.isAnonymous ? user.name : "");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const { lines, subtotal, q, total } = useTotals(speed);
  const nav = useNavigate();
  if (!lines.length) return <AppShell><main className="wrap page"><p>Your cart is empty. <Link className="link" to="/shop">Start Shopping</Link></p></main></AppShell>;

  async function place_(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const u = await ensureGuest();
    await new Promise((r) => setTimeout(r, 900)); // simulated payment processing, no real charge
    const id = await createOrder({
      uid: u.uid,
      lines: lines.map((l) => ({ id: l.id, title: l.p.title, qty: l.qty, price: l.p.price, currency: l.p.currency, image: l.p.image })),
      subtotal, delivery: q!.fee, total, currency: "NGN", speed, eta: q!.eta, city: place.name,
      address: `${name}, ${address}`, payment: pay, reference: "TEST-" + Math.random().toString(36).slice(2, 10).toUpperCase(), createdAt: Date.now(),
    });
    await clearCart(u.uid, cart);
    nav(`/orders?new=${id}`);
  }

  return (
    <AppShell>
      <main className="wrap page" style={{ maxWidth: 620 }}>
        <h1 className="pagetitle">Checkout</h1>
        <div className="testnote" style={{ margin: "8px 0 16px" }}><ShieldCheck size={16} style={{ flex: "none" }} /> Demo checkout, test mode only. No real payment is taken and nothing will ship.</div>
        <form className="stack" onSubmit={place_}>
          <div className="card" style={{ padding: 16 }}>
            <div className="field"><label>Full name</label><input className="input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="field"><label>Delivery address in {place.name}</label><input className="input" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area" /></div>
            <div className="between"><span style={{ fontSize: 13 }}>Delivery speed</span>
              <div className="seg"><button type="button" className={speed === "standard" ? "on" : ""} onClick={() => setSpeed("standard")}>Standard</button><button type="button" className={speed === "express" ? "on" : ""} onClick={() => setSpeed("express")}>Express</button></div>
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="between" style={{ marginBottom: 12 }}><span style={{ fontSize: 13 }}>Payment</span>
              <div className="seg"><button type="button" className={pay === "demo-card" ? "on" : ""} onClick={() => setPay("demo-card")}>Test card</button><button type="button" className={pay === "pay-on-delivery" ? "on" : ""} onClick={() => setPay("pay-on-delivery")}>Pay on delivery</button></div>
            </div>
            {pay === "demo-card" && (
              <div className="stack">
                <input className="input" value="4084 0840 8408 4081" readOnly aria-label="Test card number" />
                <div className="row"><input className="input" value="12/30" readOnly aria-label="Expiry" /><input className="input" value="408" readOnly aria-label="CVV" /></div>
                <span className="tiny"><Lock size={11} /> Public sandbox test card (Paystack test mode format). Simulated, never charged.</span>
              </div>
            )}
          </div>
          <div className="card sum">
            {lines.map((l) => <div key={l.id} className="r"><span>{l.qty} × {l.p.title}</span><span>{money(l.p.price * l.qty, "NGN", currency)}</span></div>)}
            <div className="r"><span>Delivery · {speed} · {q!.eta}</span><span>{money(q!.fee, q!.fee_currency, currency)}</span></div>
            <div className="r t"><span>Total</span><span>{money(total, "NGN", currency)}</span></div>
            <button className="btn block" disabled={busy}>{busy ? "Processing test payment…" : `Place test order · ${money(total, "NGN", currency)}`}</button>
          </div>
        </form>
      </main>
      <Footer />
    </AppShell>
  );
}
