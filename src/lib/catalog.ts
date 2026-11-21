import data from "../data/catalog.json";
import { flag } from "./firebase";
import { DEFAULT_RATES } from "../data/countries";

export interface Product {
  id: string;
  title: string;
  category: string;
  price: number;
  currency: string;
  image: string;
  merchant: string;
  brand?: string;
  product_type?: string;
  size?: string;
  sizes?: number[];
  specs?: Record<string, string>;
  tags?: string[];
  barcode?: string;
  priceUpdatedAt?: string | null;
  priceSource?: { name: string; url: string };
  priceHistory?: Array<{ date: string; price: number; store?: string | null }>;
}
export interface Category { id: string; name: string }

export const categories: Category[] = data.categories;
export const products: Product[] = data.products as Product[];
/** Latest date any price was re-checked against a real US source (set by scripts/refresh_catalog.py). */
export const pricesUpdatedAt: string | null = (data as { pricesUpdatedAt?: string | null }).pricesUpdatedAt ?? null;
const byId = new Map(products.map((p) => [p.id, p]));
export const getProduct = (id: string) => byId.get(id);
export const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

export type Currency = string;
/** Units per 1 USD. Remote Config "fx_rates" (JSON) overrides individual rates. */
export function rate(cur: string): number {
  if (cur === "USD") return 1;
  try {
    const o = JSON.parse(flag("fx_rates") || "{}") as Record<string, number>;
    if (o[cur]) return Number(o[cur]);
  } catch { /* ignore bad JSON */ }
  return DEFAULT_RATES[cur] ?? 1;
}
export const currencies = Object.keys(DEFAULT_RATES);

export function toCurrency(amount: number, from: string, to: Currency): number {
  if (from === to) return amount;
  return (amount / rate(from)) * rate(to);
}

const ZERO_DEC = new Set(["JPY", "KRW", "VND", "IDR", "CLP", "COP", "UGX", "RWF", "XAF", "XOF", "TZS", "NGN", "HUF", "PKR", "LKR", "ARS", "KES", "INR", "BDT", "ETB", "TWD", "PHP", "THB", "JMD", "UAH", "EGP", "TRY"]);
export function money(amount: number, from: string, to: Currency): string {
  const v = toCurrency(amount, from, to);
  const dec = ZERO_DEC.has(to) || v >= 100 ? 0 : 2;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: to, currencyDisplay: "narrowSymbol", minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  } catch {
    return `${to} ${v.toFixed(dec)}`;
  }
}
export function symbolOf(cur: string): string {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((x) => x.type === "currency")?.value || cur; } catch { return cur; }
}

export interface SearchQuery {
  query?: string;
  category?: string;
  budget_max?: number;
  budget_currency?: string;
  use?: string;
  size?: number;
  must_have?: string[];
}

const STOP = new Set(["a", "an", "the", "for", "with", "and", "or", "under", "below", "less", "than", "good", "best", "some", "me", "i", "need", "want", "of", "to", "in", "on", "my", "size", "cheap", "buy", "find", "show", "life"]);
const SYN: Record<string, string[]> = {
  headphones: ["headphones", "earbuds", "earphones", "headphone"],
  earbuds: ["earbuds", "headphones", "earphones"],
  laptop: ["laptop", "notebook", "macbook"],
  programming: ["programming", "developer", "coding", "16gb"],
  coding: ["programming", "developer", "coding"],
  shoes: ["shoes", "sneakers", "running"],
  sneakers: ["sneakers", "shoes"],
  "flat": ["flat feet", "stability", "arch support", "overpronation"],
  feet: ["flat feet", "stability"],
  battery: ["battery", "long battery"],
  phone: ["phones", "iphone", "galaxy", "smartphone"],
  toothpaste: ["toothpaste"],
};

const NOUNS = new Set(["headphones", "headphone", "earbuds", "earphones", "laptop", "laptops", "shoes", "sneakers", "phone", "phones", "toothpaste", "speaker", "keyboard", "mouse", "smartwatch", "kettle", "microwave", "deodorant", "shampoo", "router", "drill", "chair", "watch"]);

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => !STOP.has(t) && t.length > 1);
}

function haystack(p: Product): string {
  return [p.title, p.brand, p.product_type, p.category, categoryName(p.category), ...(p.tags || []), ...Object.values(p.specs || {})]
    .join(" ")
    .toLowerCase();
}

/** Deterministic catalog retrieval. The AI parses intent and ranks; this keeps prices and stock grounded in real data. */
export function searchCatalog(q: SearchQuery, limit = 8): Product[] {
  const words = tokens([q.query, q.use, ...(q.must_have || [])].filter(Boolean).join(" "));
  const budgetUsd =
    q.budget_max && q.budget_max > 0 ? toCurrency(q.budget_max, q.budget_currency || "USD", "USD") : undefined;
  const scored = products
    .map((p) => {
      const h = haystack(p);
      let score = 0;
      let kw = 0;
      for (const w of words) {
        const alts = SYN[w] || [w];
        if (alts.some((a) => h.includes(a))) {
          kw++;
          score += p.title.toLowerCase().includes(w) ? 3 : 2;
        }
      }
      // If the shopper named a product noun, the item must be that kind of product.
      const nouns = words.filter((w) => NOUNS.has(w));
      if (nouns.length && !nouns.some((w) => (SYN[w] || [w]).some((a) => h.includes(a)))) return { p, score: -99, usd: 0 };
      // Must match the request itself (a keyword, or the category when no keywords were given).
      if (words.length ? kw === 0 : q.category ? p.category !== q.category : false) return { p, score: -99, usd: 0 };
      if (q.category && p.category === q.category) score += 3;
      if (q.size && p.sizes) score += p.sizes.includes(q.size) ? 2 : -5;
      const usd = toCurrency(p.price, p.currency, "USD");
      if (budgetUsd !== undefined) score += usd <= budgetUsd ? 2 : -4;
      // Prefer items matching the core product noun (first keyword) over accessories.
      if (words.length > 1 && kw < Math.min(2, words.length)) score -= 2;
      return { p, score, usd };
    })
    .filter((x) => x.score > -50)
    .sort((a, b) => b.score - a.score || a.usd - b.usd);
  return scored.slice(0, limit).map((x) => x.p);
}

export function withinBudget(p: Product, q: SearchQuery): boolean {
  if (!q.budget_max) return true;
  return toCurrency(p.price, p.currency, "USD") <= toCurrency(q.budget_max, q.budget_currency || "USD", "USD");
}

/** Compact product facts for prompts (keeps on-device prompts well under the token limit). */
export function productBrief(p: Product, cur: Currency): string {
  const specs = Object.entries(p.specs || {}).map(([k, v]) => `${k}: ${v}`).join("; ");
  const sizes = p.sizes ? `; sizes EU ${p.sizes.join(",")}` : "";
  return `[${p.id}] ${p.title}: ${money(p.price, p.currency, cur)}${specs ? "; " + specs : ""}${sizes}`;
}

export interface ImageQuery { terms: string[]; category?: string; budget_max?: number; budget_currency?: string }
/**
 * Candidates for a picture the shopper uploaded. Tries the specific description first, then single terms, then
 * the same category. `loose` tells the caller the match is category-level so the AI ranker must vet it.
 */
export function matchImage(q: ImageQuery, limit = 8): { items: Product[]; loose: boolean } {
  const base = { budget_max: q.budget_max, budget_currency: q.budget_currency };
  const terms = q.terms.map((t) => t.trim()).filter(Boolean);
  let items = searchCatalog({ ...base, query: terms.join(" "), category: q.category }, limit);
  if (items.length) return { items, loose: false };
  const seen = new Set<string>();
  for (const t of terms) {
    for (const p of searchCatalog({ ...base, query: t }, limit)) if (!seen.has(p.id)) { seen.add(p.id); items.push(p); }
  }
  if (items.length) return { items: items.slice(0, limit), loose: false };
  if (q.category) {
    items = searchCatalog({ ...base, category: q.category }, limit);
    if (items.length) return { items, loose: true };
  }
  return { items: [], loose: false };
}
