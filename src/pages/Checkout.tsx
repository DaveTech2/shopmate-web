import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, Lock, CreditCard, Smartphone, Landmark, Wallet, Coins } from "lucide-react";
import { AppShell, Footer } from "../components/ui";
import { money, currencies, toCurrency } from "../lib/catalog";
import { countryOf } from "../data/countries";
import { useShop } from "../state/shop";
import { useAuth } from "../state/auth";
import { createOrder, clearCart } from "../lib/store";
import { useTotals } from "./Cart";
import { placeLabel } from "../lib/delivery";

type Method = "card" | "wallet" | "bank" | "paypal" | "crypto";
const METHODS: Array<{ id: Method; label: string; icon: typeof CreditCard }> = [
  { id: "card", label: "Card", icon: CreditCard },
  { id: "wallet", label: "Apple Pay / Google Pay", icon: Smartphone },
  { id: "bank", label: "Bank transfer", icon: Landmark },
  { id: "paypal", label: "PayPal", icon: Wallet },
  { id: "crypto", label: "Crypto (USDC/USDT)", icon: Coins },
];

export default function Checkout() {
  const { currency, place, cart } = useShop();
  const { ensureGuest, user } = useAuth();
  const [speed, setSpeed] = useState<"standard" | "express">("standard");
  const [pay, setPay] = useState<Method>("card");
  const [payCur, setPayCur] = useState<string>(() => countryOf(place.country)?.currency || "USD");
  const [coin, setCoin] = useState<"USDC" | "USDT">("USDC");
  const [name, setName] = useState(user && !user.isAnonymous ? user.name : "");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const { lines, subtotal, q, total } = useTotals(speed);
  const nav = useNavigate();
  const toPay = toCurrency(total, "USD", payCur);
  const payLabel = pay === "crypto" ? `${total.toFixed(2)} ${coin}` : money(total, "USD", payCur);
  if (!lines.length) return <AppShell><main className="wrap page"><p>Your cart is empty. <Link className="link" to="/shop">Start Shopping</Link></p></main></AppShell>;

  async function place_(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const u = await ensureGuest();
    await new Promise((r) => setTimeout(r, 900)); // simulated payment processing, no real charge
    const id = await createOrder({
      uid: u.uid,
      lines: lines.map((l) => ({ id: l.id, title: l.p.title, qty: l.qty, price: l.p.price, currency: l.p.currency, image: l.p.image })),
      subtotal, delivery: q!.fee, total, currency: "USD", speed, eta: q!.eta, city: placeLabel(place),
      address: `${name}, ${address}`, payment: pay, pay_currency: pay === "crypto" ? coin : payCur, pay_amount: pay === "crypto" ? Math.round(total * 100) / 100 : Math.round(toPay * 100) / 100, reference: "TEST-" + Math.random().toString(36).slice(2, 10).toUpperCase(), createdAt: Date.now(),
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
            <div className="field"><label>Delivery address in {placeLabel(place)}</label><input className="input" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area" /></div>
            <div className="between"><span style={{ fontSize: 13 }}>Delivery speed</span>
              <div className="seg"><button type="button" className={speed === "standard" ? "on" : ""} onClick={() => setSpeed("standard")}>Standard</button><button type="button" className={speed === "express" ? "on" : ""} onClick={() => setSpeed("express")}>Express</button></div>
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <b style={{ fontSize: 15 }}>Payment</b>
            <p className="tiny" style={{ margin: "4px 0 12px" }}>Pay in any currency, any way you like.</p>
            <div className="paygrid" role="radiogroup" aria-label="Payment method">
              {METHODS.map((m) => (
                <button type="button" key={m.id} role="radio" aria-checked={pay === m.id} className={`paym${pay === m.id ? " on" : ""}`} onClick={() => setPay(m.id)}>
                  <m.icon size={16} /> <span>{m.label}</span>
                </button>
              ))}
            </div>
            {pay !== "crypto" ? (
              <div className="between" style={{ marginTop: 14 }}>
                <span style={{ fontSize: 13 }}>Pay in</span>
                <select className="select" style={{ width: "auto" }} value={payCur} onChange={(e) => setPayCur(e.target.value)} aria-label="Pay in currency">
                  {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ) : (
              <div className="between" style={{ marginTop: 14 }}>
                <span style={{ fontSize: 13 }}>Stablecoin</span>
                <div className="seg">{(["USDC", "USDT"] as const).map((c) => <button type="button" key={c} className={coin === c ? "on" : ""} onClick={() => setCoin(c)}>{c}</button>)}</div>
              </div>
            )}
            <div className="stack" style={{ marginTop: 12 }}>
              {pay === "card" && (<>
                <input className="input" value="4242 4242 4242 4242" readOnly aria-label="Test card number" />
                <div className="row"><input className="input" value="12/30" readOnly aria-label="Expiry" /><input className="input" value="123" readOnly aria-label="CVC" /></div>
              </>)}
              {pay === "wallet" && <p className="tiny" style={{ margin: 0 }}>Apple Pay or Google Pay sheet is simulated here. Tap Place test order to approve.</p>}
              {pay === "bank" && <p className="tiny" style={{ margin: 0 }}>You'd get local transfer details for {payCur}. Demo reference only, no account is shown.</p>}
              {pay === "paypal" && <p className="tiny" style={{ margin: 0 }}>A PayPal approval window is simulated. No PayPal account is contacted.</p>}
              {pay === "crypto" && <p className="tiny" style={{ margin: 0 }}>Pay {coin} at 1:1 with USD on a supported network. Demo only, no wallet address is shown and nothing is sent.</p>}
              <span className="tiny"><Lock size={11} /> Demo checkout. Nothing is charged.</span>
            </div>
          </div>
          <div className="card sum">
            {lines.map((l) => <div key={l.id} className="r"><span>{l.qty} × {l.p.title}</span><span>{money(l.p.price * l.qty, l.p.currency, currency)}</span></div>)}
            <div className="r"><span>Est. delivery · {speed} · {q!.eta}</span><span>{money(q!.fee, q!.fee_currency, currency)}</span></div>
            <div className="r t"><span>Total</span><span>{money(total, "USD", currency)}</span></div>
            {payLabel !== money(total, "USD", currency) && <div className="r"><span>You pay</span><b>{payLabel}</b></div>}
            <button className="btn block" disabled={busy}>{busy ? "Processing test payment…" : `Place test order · ${payLabel}`}</button>
          </div>
        </form>
      </main>
      <Footer />
    </AppShell>
  );
}
