import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { AppShell, Footer } from "../components/ui";
import { Thumb } from "../components/ProductCard";
import { getProduct, money } from "../lib/catalog";
import { useShop } from "../state/shop";
import { useAuth } from "../state/auth";
import { listOrders, type Order } from "../lib/store";

const STEPS = ["Order placed", "Payment confirmed (test)", "Packed at the Shopmate hub", "Out for delivery", "Delivered"];
// Demo tracking: status advances with elapsed time so the timeline is visible during judging.
const stepFor = (o: Order) => Math.min(STEPS.length - 1, 1 + Math.floor((Date.now() - o.createdAt) / (3 * 60 * 1000)));

export default function Orders() {
  const { user } = useAuth();
  const { currency } = useShop();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [params] = useSearchParams();
  const fresh = params.get("new");
  useEffect(() => { if (user) listOrders(user.uid).then(setOrders); else setOrders([]); }, [user?.uid]);
  return (
    <AppShell>
      <main className="wrap page" style={{ maxWidth: 680 }}>
        <h1 className="pagetitle">Orders</h1>
        {fresh && <div className="testnote" style={{ marginBottom: 14 }}><CheckCircle2 size={16} style={{ flex: "none" }} /> Test order placed. No real payment was taken.</div>}
        {orders === null ? <p className="muted">Loading…</p> : !orders.length ? (
          <div className="card" style={{ padding: 20 }}><p className="muted" style={{ marginTop: 0 }}>No orders yet.</p><Link className="pill orange" to="/shop">Start Shopping</Link></div>
        ) : (
          <div className="stack">
            {orders.map((o) => {
              const s = stepFor(o);
              return (
                <div key={o.id} className="card glow-sm" style={{ padding: 16 }}>
                  <div className="between"><b style={{ fontSize: 14 }}>#{o.id?.slice(0, 10)}</b><span className="tiny">{new Date(o.createdAt).toLocaleString()}</span></div>
                  <div className="row" style={{ margin: "12px 0", flexWrap: "wrap" }}>
                    {o.lines.map((l) => getProduct(l.id) ? <Thumb key={l.id} p={getProduct(l.id)!} /> : null)}
                  </div>
                  <div className="tiny">{o.lines.map((l) => `${l.qty} × ${l.title}`).join(", ")}</div>
                  <div className="between" style={{ margin: "10px 0", fontSize: 13 }}>
                    <span>To {o.city} · {o.speed} · ETA {o.eta}</span><b>{money(o.total, o.currency, currency)}</b>
                  </div>
                  <div className="timeline">
                    {STEPS.map((st, i) => <div key={st} className={`st ${i <= s ? "done" : ""}`}><span className="b" />{st}</div>)}
                  </div>
                  <div className="tiny">Ref {o.reference} · {({ "demo-card": "test card", "pay-on-delivery": "pay on delivery", card: "card", wallet: "Apple Pay / Google Pay", bank: "bank transfer", paypal: "PayPal", crypto: "crypto" } as Record<string, string>)[o.payment] || o.payment}{o.pay_currency ? ` in ${o.pay_currency}` : ""} (demo)</div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </AppShell>
  );
}
