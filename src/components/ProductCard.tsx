import { Link } from "react-router-dom";
import { Truck, Plus, Scale, Check, ImageOff } from "lucide-react";
import { useState } from "react";
import { money, type Product } from "../lib/catalog";
import { quote } from "../lib/delivery";
import { useShop } from "../state/shop";

export function Thumb({ p, lg = false }: { p: Product; lg?: boolean }) {
  const [bad, setBad] = useState(false);
  return (
    <div className={`thumb${lg ? " lg" : ""}`}>
      {bad ? <ImageOff size={22} color="#9a8a84" /> : <img src={p.image} alt={p.title} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />}
    </div>
  );
}

export function ProductCard({ p, reasons, fit }: { p: Product; reasons?: string[]; fit?: number }) {
  const { currency, place, addToCart, compare, toggleCompare } = useShop();
  const q = quote(place, [[p, 1]]);
  const inCmp = compare.includes(p.id);
  return (
    <div className="card pcard glow-sm">
      <div className="top">
        <Link to={`/p/${p.id}`}><Thumb p={p} /></Link>
        <div style={{ minWidth: 0, position: "relative", zIndex: 1 }}>
          <Link to={`/p/${p.id}`}><h3>{p.title}</h3></Link>
          <div className="price">
            {money(p.price, p.currency, currency)}
            <small>{currency === "USD" ? money(p.price, p.currency, "NGN") : money(p.price, p.currency, "USD")}</small>
          </div>
          <div className="deliv"><Truck size={12} /> {money(q.fee, q.fee_currency, currency)} delivery to {place.name} · {q.eta}</div>
          {fit !== undefined && <div className="fit" style={{ marginTop: 4 }}>{fit}% fit</div>}
        </div>
      </div>
      {reasons && reasons.length > 0 && (
        <ul className="why" aria-label="Why it fits">{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      )}
      <div className="actions">
        <button className="pill orange sm" onClick={() => addToCart(p.id)}><Plus size={13} /> Add to cart</button>
        <button className={`pill sm ${inCmp ? "on" : ""}`} onClick={() => toggleCompare(p.id)}>
          {inCmp ? <Check size={13} /> : <Scale size={13} />} {inCmp ? "In compare" : "Compare"}
        </button>
        <Link className="pill sm ghost" to={`/p/${p.id}`}>Details</Link>
      </div>
    </div>
  );
}

export function CompareTray({ low = false }: { low?: boolean }) {
  const { compare, clearCompare } = useShop();
  if (compare.length === 0) return null;
  return (
    <div className={`tray${low ? " low" : ""}`}>
      <Scale size={14} color="var(--orange)" /> {compare.length} selected
      <Link to="/compare" className="pill orange sm">Compare {compare.length >= 2 ? "now" : "(pick 2+)"}</Link>
      <button className="pill sm ghost" onClick={clearCompare}>Clear</button>
    </div>
  );
}
