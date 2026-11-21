/**
 * Shopmate Trust Report: the deterministic half.
 *
 * Everything the report states as fact is computed here from data Shopmate really has: the store the price
 * was checked at, the check date and history, catalog alternatives from other stores, and published store
 * return policies (src/data/retailers.ts). The AI (src/ai/hybrid.ts) only turns these facts into plain
 * language and may make a section MORE cautious, never less. When the AI is unavailable the report below is
 * shown as is. Anything Shopmate has no data for (reviews, a "was" price, live stock) is reported as unclear.
 */
import { products, money, toCurrency, categoryName, type Currency, type Product } from "./catalog";
import { POLICY_REVIEWED, resolveStore, type StoreInfo } from "../data/retailers";

export type TStatus = "good" | "caution" | "concern" | "unclear";
export type SectionKey = "authenticity" | "seller" | "price" | "returns";
export interface TrustSection { key: SectionKey; status: TStatus; headline: string; points: string[] }
export interface TrustReportData {
  sections: TrustSection[];
  overall: TStatus;
  summary: string;
  alternative_ids: string[];
}

export const SECTION_TITLE: Record<SectionKey, string> = {
  authenticity: "Product authenticity signals",
  seller: "Seller reliability",
  price: "Price competitiveness",
  returns: "Return policy clarity",
};
export const STATUS_LABEL: Record<TStatus, string> = { good: "Good", caution: "Caution", concern: "Concern", unclear: "Unclear" };
const RANK: Record<TStatus, number> = { good: 0, unclear: 1, caution: 2, concern: 3 };
/** Returns the more cautious of two statuses. */
export const worse = (a: TStatus, b: TStatus): TStatus => (RANK[b] > RANK[a] ? b : a);

/** Photos that show a close equivalent of the listed product (see CREDITS.md). */
const PHOTO_EQUIVALENT = new Set([
  "d-toi8", "d-bea1", "d-bea3", "d-bab3", "d-toi2", "d-toi5", "d-dri3", "d-toi9", "d-toi10", "d-toi14",
  "d-spo2", "d-ele4", "d-gar1", "d-off3", "d-dri5", "w-lp2", "w-rs2", "w-rs3", "w-rs4", "w-rs5",
]);

const KINDS: Array<[RegExp, string]> = [
  [/iphone|galaxy [as]\d|smartphone/i, "phone"],
  [/laptop|macbook/i, "laptop"],
  [/running shoes|sneakers|shoes/i, "shoes"],
  [/headphones|earbuds/i, "headphones"],
  [/toothpaste/i, "toothpaste"],
  [/body wash/i, "body wash"],
  [/toothbrush/i, "toothbrush"],
  [/wipes/i, "wipes"],
  [/shampoo/i, "shampoo"],
  [/sunglasses/i, "sunglasses"],
  [/watch|fitness tracker/i, "watch"],
  [/mouse/i, "mouse"],
  [/speaker/i, "speaker"],
];
/** A coarse "what is this" label so alternatives are real substitutes, not just the same category. */
export function kindOf(p: Product): string {
  const t = `${p.title} ${p.product_type || ""}`;
  for (const [re, k] of KINDS) if (re.test(t)) return k;
  return p.product_type || p.category;
}

const daysSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso + "T12:00:00").getTime()) / 86_400_000));
const usd = (p: Product) => toCurrency(p.price, p.currency, "USD");
const pct = (n: number) => `${Math.round(Math.abs(n) * 100)}%`;

export interface Alt { id: string; store: string; savePct: number }
export interface TrustFacts {
  p: Product;
  store: StoreInfo;
  checked: { date: string | null; ageDays: number | null; url: string };
  history: { date: string; price: number; store?: string | null }[];
  change: { pct: number; from: number; fromDate: string; sameStore: boolean } | null;
  kind: string;
  peers: number;
  rankInKind: { cheaperCount: number; total: number } | null;
  alts: Alt[];
  photoEquivalent: boolean;
  refurbished: boolean;
  returnsInfo: { text: string; days: number | null; rules: string[]; holiday: string | null; known: boolean; url: string | null };
}

export function buildFacts(p: Product): TrustFacts {
  const store = resolveStore(p.priceSource?.name);
  const hist = [...(p.priceHistory || [])].sort((a, b) => a.date.localeCompare(b.date));
  let change: TrustFacts["change"] = null;
  if (hist.length >= 2) {
    const prev = hist[hist.length - 2], last = hist[hist.length - 1];
    if (prev.price > 0 && prev.price !== last.price) {
      change = { pct: (last.price - prev.price) / prev.price, from: prev.price, fromDate: prev.date, sameStore: (prev.store || "") === (last.store || "") };
    }
  }
  const kind = kindOf(p);
  const peersAll = products.filter((q) => q.id !== p.id && kindOf(q) === kind);
  const mine = usd(p);
  const alts: Alt[] = peersAll
    .filter((q) => usd(q) < mine * 0.95)
    .sort((a, b) => usd(a) - usd(b))
    .slice(0, 3)
    .map((q) => ({ id: q.id, store: resolveStore(q.priceSource?.name).store, savePct: (mine - usd(q)) / mine }));
  const rankInKind = peersAll.length >= 1 ? { cheaperCount: peersAll.filter((q) => usd(q) < mine).length, total: peersAll.length + 1 } : null;

  const r = store.retailer;
  const today = new Date().toISOString().slice(0, 10);
  const rules = (r?.rules || []).filter((x) => x.test(p.category, p.title));
  const shortest = rules.length ? Math.min(...rules.map((x) => x.days)) : null;
  const hol = r?.holiday && today >= r.holiday.from && today <= r.holiday.to && !r.holiday.skip?.(p.category, p.title) ? r.holiday.text : null;
  const days = shortest ?? r?.days ?? null;
  return {
    p, store,
    checked: { date: p.priceUpdatedAt || null, ageDays: p.priceUpdatedAt ? daysSince(p.priceUpdatedAt) : null, url: p.priceSource?.url || "" },
    history: hist, change, kind,
    peers: peersAll.length, rankInKind, alts,
    photoEquivalent: PHOTO_EQUIVALENT.has(p.id),
    refurbished: /refurbished|renewed|open[- ]box|pre-owned|used/i.test(p.title),
    returnsInfo: {
      text: r?.returns || "",
      days,
      rules: rules.map((x) => x.text),
      holiday: hol,
      known: !!r?.returns && !store.thirdParty,
      url: r?.url || null,
    },
  };
}

/** Rules-based report. Used as the AI's grounding and as the fallback when the AI is unavailable. */
export function baselineReport(f: TrustFacts, cur: Currency): TrustReportData {
  const { p, store } = f;
  const r = store.retailer;

  // ---- authenticity ----
  let a: TStatus = "good";
  const ap: string[] = [];
  if (p.brand) ap.push(`Brand listed: ${p.brand}.`); else { a = worse(a, "caution"); ap.push("No brand is recorded for this listing."); }
  if (p.barcode) ap.push(`Barcode ${p.barcode} is on record, which makes the exact product easy to verify.`);
  if (p.specs && Object.keys(p.specs).length) ap.push(`${Object.keys(p.specs).length} specs are listed. Shopmate cannot confirm they match the store page, so compare them there.`);
  else ap.push("No spec sheet is listed here, so there is nothing to compare against the store page.");
  if (f.refurbished) { a = worse(a, "caution"); ap.push("The title says refurbished or used. Confirm the condition grade and warranty before buying."); }
  if (f.photoEquivalent) { a = worse(a, "caution"); ap.push("The photo shows a close equivalent of this product (for example other packaging or an earlier model), so the item may look slightly different."); }
  if (store.thirdParty) { a = worse(a, "caution"); ap.push("Sold by a third-party seller, so Shopmate cannot vouch that the item is genuine."); }
  ap.push("Reviews: Shopmate has no review data for this listing, so it cannot check for inconsistent or suspicious reviews. Read recent verified reviews on the store page.");

  // ---- seller ----
  let s: TStatus; const sp: string[] = [];
  if (store.unchecked) { s = "unclear"; sp.push("This price has not been re-checked against a store yet, so the seller is unknown."); }
  else if (store.thirdParty) { s = "caution"; sp.push(`Listed on ${store.store} but sold by ${store.thirdParty}, a third-party seller. Check their seller rating and who handles returns.`); }
  else if (store.receipt) { s = "caution"; sp.push(`The price comes from a shopper's receipt at ${store.store}, not a live listing, so it may differ in your store or online.`); }
  else if (r && (r.kind === "major" || r.kind === "brand")) { s = "good"; sp.push(`${store.store}: ${r.profile}`); }
  else if (r) { s = "unclear"; sp.push(`${store.store}: ${r.profile} Shopmate has no further seller data.`); }
  else { s = "unclear"; sp.push(`${store.store} is not a store Shopmate has seller facts for. Check its reviews and contact details before paying.`); }
  if (!store.unchecked) sp.push(f.checked.url ? `The price was checked at ${store.store}, listing linked below.` : `Checked at ${store.store}.`);

  // ---- price ----
  let pr: TStatus = "good"; const pp: string[] = [];
  const priceTxt = money(p.price, p.currency, cur);
  if (f.checked.date) {
    pp.push(`${priceTxt} at ${store.store}, checked ${f.checked.date}${f.checked.ageDays ? ` (${f.checked.ageDays} day${f.checked.ageDays > 1 ? "s" : ""} ago)` : " (today)"}.`);
    if ((f.checked.ageDays ?? 0) > 14) { pr = worse(pr, "caution"); pp.push("That check is more than two weeks old, so the price may have changed."); }
  } else { pr = "unclear"; pp.push(`Listed at ${priceTxt}, but the price has not been re-checked at a store yet.`); }
  if (f.change) {
    const c = f.change;
    pp.push(`Between our checks the price moved from ${money(c.from, "USD", cur)} (${c.fromDate}) to ${priceTxt}, ${c.pct > 0 ? "up" : "down"} ${pct(c.pct)}${c.sameStore ? "" : ", and the store changed too"}.`);
    if (c.pct > 0.25) { pr = worse(pr, "caution"); pp.push("A jump this size means the earlier price may have been a sale or a mismatch. Confirm the price on the store page."); }
    if (c.pct < -0.25) pp.push("A drop this size can be a real deal or a different version of the item. Check it is the same model.");
  } else if (f.history.length >= 2) pp.push("The price has been stable across our checks.");
  else pp.push("There is only one price check on record, so there is no price trend yet.");
  pp.push("Shopmate does not record a 'was' price, so it cannot confirm that an advertised discount is real.");
  if (f.alts.length) {
    const best = f.alts[0], bp = products.find((x) => x.id === best.id)!;
    pp.push(`Cheaper alternatives in our catalog: ${bp.title} at ${best.store} is ${pct(best.savePct)} less (${money(bp.price, bp.currency, cur)}).`);
    if (best.savePct > 0.2) pr = worse(pr, "caution");
  } else if (f.rankInKind && f.rankInKind.total > 1) pp.push(`Lowest price among the ${f.rankInKind.total} similar items we track.`);
  else pp.push("No similar item from another store is in the catalog to compare against.");

  // ---- returns ----
  let rt: TStatus; const rp: string[] = [];
  const ri = f.returnsInfo;
  if (store.thirdParty) { rt = "caution"; rp.push(`Third-party seller (${store.thirdParty}): return terms are set by them and can be shorter than ${store.store}'s own. Read the listing before buying.`); }
  else if (ri.known) {
    rp.push(ri.text);
    ri.rules.forEach((x) => rp.push(x));
    if (ri.holiday) rp.push(ri.holiday);
    rt = ri.days !== null && ri.days <= 15 && !ri.holiday ? "caution" : "good";
  } else if (store.receipt) { rt = "unclear"; rp.push(`${store.store} groceries: Shopmate has no return policy on file. Perishables are often non-returnable.`); }
  else { rt = "unclear"; rp.push(`Shopmate has no published return policy on file for ${store.store}. Find it on the store's site before you pay.`); }
  rp.push(`Policy facts reviewed ${POLICY_REVIEWED}. Policies change, so confirm at checkout.`);

  const sections: TrustSection[] = [
    { key: "authenticity", status: a, headline: a === "good" ? "No red flags in what we can check" : "A few things to confirm", points: ap },
    { key: "seller", status: s, headline: s === "good" ? `${store.store} is an established seller` : s === "unclear" ? "Not enough seller information" : "Check the seller first", points: sp },
    { key: "price", status: pr, headline: pr === "good" ? "Price looks competitive" : pr === "unclear" ? "Price not verified" : "Worth a second look", points: pp },
    { key: "returns", status: rt, headline: rt === "good" ? "Clear return policy" : rt === "unclear" ? "Return policy unclear" : "Returns need a closer look", points: rp },
  ];
  const overall = overallOf(sections);
  const flagged = sections.filter((x) => x.status === "caution" || x.status === "concern" || x.status === "unclear").map((x) => SECTION_TITLE[x.key].toLowerCase());
  const summary = flagged.length
    ? `${p.title} at ${store.store}: confirm ${flagged.join(", ")} before you pay. Shopmate has no review data, so read recent verified reviews on the store page too.`
    : `${p.title} at ${store.store} looks fine on everything Shopmate can check. Shopmate has no review data, so still skim recent verified reviews on the store page.`;
  return { sections, overall, summary, alternative_ids: f.alts.map((x) => x.id) };
}

export function overallOf(sections: TrustSection[]): TStatus {
  if (sections.some((x) => x.status === "concern")) return "concern";
  if (sections.some((x) => x.status === "caution")) return "caution";
  if (sections.every((x) => x.status === "unclear")) return "unclear";
  return "good";
}

/** Plain-text facts handed to the model. Amounts are in the shopper's display currency. */
export function factsForPrompt(f: TrustFacts, cur: Currency, country: string): string {
  const { p, store } = f;
  const b = baselineReport(f, cur);
  const lines = [
    `Product: ${p.title} (${categoryName(p.category)}${p.brand ? ", brand " + p.brand : ""}${p.barcode ? ", barcode " + p.barcode : ""})`,
    `Shopper country: ${country}. Display currency: ${cur}.`,
    `Price: ${money(p.price, p.currency, cur)} (USD ${usd(p).toFixed(2)}) at ${store.store}${store.thirdParty ? `, sold by third-party seller ${store.thirdParty}` : ""}${store.receipt ? ", taken from a shopper's receipt, not a live listing" : ""}; checked ${f.checked.date || "never"}.`,
    `Price history: ${f.history.length ? f.history.map((h) => `${h.date} ${money(h.price, "USD", cur)} at ${h.store || "?"}`).join("; ") : "none"}.`,
    "Advertised 'was' price or discount: NOT AVAILABLE. Reviews and ratings: NOT AVAILABLE.",
    `Specs listed: ${p.specs ? Object.entries(p.specs).map(([k, v]) => `${k}: ${v}`).join("; ") : "none"}. Specs verified against store page: NO.`,
    `Photo is a close equivalent rather than the exact item: ${f.photoEquivalent ? "yes" : "no"}. Refurbished or used: ${f.refurbished ? "yes" : "no"}.`,
    `Seller facts: ${store.retailer ? store.retailer.profile : "none on file"}`,
    `Return policy facts (reviewed ${POLICY_REVIEWED}): ${store.thirdParty ? "third-party seller, terms unknown" : f.returnsInfo.known ? [f.returnsInfo.text, ...f.returnsInfo.rules, f.returnsInfo.holiday].filter(Boolean).join(" ") : "none on file"}`,
    `Cheaper similar items in the catalog from other stores: ${f.alts.length ? f.alts.map((a) => { const q = products.find((x) => x.id === a.id)!; return `[${a.id}] ${q.title} ${money(q.price, q.currency, cur)} at ${a.store} (${pct(a.savePct)} cheaper)`; }).join("; ") : "none"}.`,
    "",
    "Rules-based draft (keep every caveat; you may reword and tighten, and make a status more cautious but never less):",
    JSON.stringify({ sections: b.sections.map((s) => ({ key: s.key, status: s.status, headline: s.headline, points: s.points })) }),
  ];
  return lines.join("\n");
}

/** Merge model output with the rules-based report: statuses can only get more cautious, ids must be real. */
export function mergeReport(ai: Partial<TrustReportData> | undefined, base: TrustReportData): TrustReportData {
  if (!ai || !Array.isArray(ai.sections)) return base;
  const sections = base.sections.map((b) => {
    const m = ai.sections!.find((x) => x?.key === b.key);
    if (!m || !m.headline || !Array.isArray(m.points) || !m.points.length) return b;
    const st: TStatus = (["good", "caution", "concern", "unclear"] as const).includes(m.status as TStatus) ? (m.status as TStatus) : b.status;
    return { key: b.key, status: worse(b.status, st), headline: String(m.headline), points: m.points.map(String).slice(0, 5) };
  });
  const alts = (ai.alternative_ids || []).filter((id) => products.some((q) => q.id === id));
  const overall = worse(overallOf(sections), (ai.overall as TStatus) && RANK[ai.overall as TStatus] !== undefined ? (ai.overall as TStatus) : "good");
  return {
    sections,
    overall: worse(overall, base.overall),
    summary: ai.summary ? String(ai.summary) : base.summary,
    alternative_ids: alts.length ? alts : base.alternative_ids,
  };
}
