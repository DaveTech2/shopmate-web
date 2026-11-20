import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { AppShell, Footer } from "../components/ui";
import { CompareTray, ProductCard } from "../components/ProductCard";
import { categories, products, pricesUpdatedAt, searchCatalog } from "../lib/catalog";

export default function Discover() {
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") || "";
  const [q, setQ] = useState("");
  const used = useMemo(() => categories.filter((c) => products.some((p) => p.category === c.id)), []);
  const list = useMemo(() => {
    const base = q.trim() ? searchCatalog({ query: q }, 60) : products;
    return cat ? base.filter((p) => p.category === cat) : base;
  }, [q, cat]);
  return (
    <AppShell>
      <main className="wrap wide page">
        <h1 className="pagetitle">Discover</h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>Browse listings from Shopmate merchants. Delivery fees are calculated to your city.</p>
        {pricesUpdatedAt && <p className="tiny" style={{ marginTop: -6 }}>Prices updated {new Date(pricesUpdatedAt + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · USD</p>}
        <div className="composer" style={{ position: "static", background: "none", padding: "8px 0 12px" }}>
          <form onSubmit={(e) => e.preventDefault()}><Search size={16} color="var(--muted)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter listings" aria-label="Filter listings" />
          </form>
        </div>
        <div className="cats">
          <button className={`pill sm ${!cat ? "on" : ""}`} onClick={() => setParams({})}>All</button>
          {used.map((c) => <button key={c.id} className={`pill sm ${cat === c.id ? "on" : ""}`} onClick={() => setParams({ cat: c.id })}>{c.name}</button>)}
        </div>
        <div className="pgrid three">{list.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        {!list.length && <p className="muted">Nothing here yet.</p>}
      </main>
      <CompareTray low />
      <Footer />
    </AppShell>
  );
}
