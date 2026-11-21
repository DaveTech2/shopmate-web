import { Link } from "react-router-dom";
import { ShieldCheck, Check, TriangleAlert, OctagonAlert, CircleHelp, ExternalLink } from "lucide-react";
import { AIBadge } from "./ui";
import { Thumb } from "./ProductCard";
import { getProduct, money, toCurrency, type Currency, type Product } from "../lib/catalog";
import { resolveStore, POLICY_REVIEWED } from "../data/retailers";
import { SECTION_TITLE, STATUS_LABEL, type TStatus, type TrustReportData } from "../lib/trust";
import type { AIResult } from "../ai/hybrid";

const ICON: Record<TStatus, typeof Check> = { good: Check, caution: TriangleAlert, concern: OctagonAlert, unclear: CircleHelp };

export function StatusPill({ status }: { status: TStatus }) {
  const I = ICON[status];
  return <span className={`tstatus ${status}`}><I size={12} strokeWidth={2.6} /> {STATUS_LABEL[status]}</span>;
}

/** The SHOPMATE TRUST REPORT card. Presentational, so it renders on the product page and inside the chat. */
export function TrustReportCard({ p, res, currency }: { p: Product; res: AIResult<TrustReportData>; currency: Currency }) {
  const r = res.data;
  const store = resolveStore(p.priceSource?.name);
  const alts = r.alternative_ids.map((id) => getProduct(id)).filter((x): x is Product => !!x && x.id !== p.id);
  return (
    <section className={`card trust ${r.overall}`} aria-label="Shopmate trust report">
      <header className="thead">
        <span className="tshield"><ShieldCheck size={20} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="ttitle">SHOPMATE TRUST REPORT</div>
          <div className="tsub">{p.title}</div>
        </div>
        <StatusPill status={r.overall} />
      </header>

      <div className="tsections">
        {r.sections.map((s) => {
          const I = ICON[s.status];
          return (
            <div key={s.key} className={`tsec ${s.status}`}>
              <div className="tsec-h">
                <span className="tico"><I size={15} strokeWidth={2.4} /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="tsec-t">{SECTION_TITLE[s.key]}</div>
                  <div className="tsec-s">{s.headline}</div>
                </div>
                <StatusPill status={s.status} />
              </div>
              <ul>{s.points.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          );
        })}
      </div>

      {alts.length > 0 && (
        <div className="talts">
          <div className="tsec-t" style={{ marginBottom: 8 }}>Cheaper alternatives in other stores</div>
          {alts.map((a) => {
            const save = 1 - toCurrency(a.price, a.currency, "USD") / toCurrency(p.price, p.currency, "USD");
            return (
              <Link key={a.id} to={`/p/${a.id}`} className="talt">
                <Thumb p={a} />
                <div style={{ minWidth: 0 }}>
                  <b>{a.title}</b>
                  <div className="tiny">{resolveStore(a.priceSource?.name).store}</div>
                </div>
                <div className="talt-p">{money(a.price, a.currency, currency)}{save > 0.01 && <small>{Math.round(save * 100)}% less</small>}</div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="tconc">
        <b>Before purchasing, here's what you should know.</b>
        <p>{r.summary}</p>
      </div>

      <footer className="tfoot">
        <AIBadge source={res.source} route={res.route} ms={res.ms} />
        <span className="tiny">Return policy facts reviewed {POLICY_REVIEWED}. Based only on data Shopmate has; reviews are not available.</span>
        <span className="tlinks">
          {p.priceSource?.url && <a className="link" href={p.priceSource.url} target="_blank" rel="noopener noreferrer">{store.store} listing <ExternalLink size={11} /></a>}
        </span>
      </footer>
    </section>
  );
}
