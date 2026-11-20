import data from "../data/catalog.json";
import { flag } from "./firebase";

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
}
export interface Category { id: string; name: string }

export const categories: Category[] = data.categories;
export const products: Product[] = data.products as Product[];
const byId = new Map(products.map((p) => [p.id, p]));
export const getProduct = (id: string) => byId.get(id);
export const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

export type Currency = "USD" | "NGN";
export const fxNgnPerUsd = () => Number(flag("fx_ngn_per_usd")) || 1500;

export function toCurrency(amount: number, from: string, to: Currency): number {
  if (from === to) return amount;
  if (from === "NGN" && to === "USD") return amount / fxNgnPerUsd();
  if (from === "USD" && to === "NGN") return amount * fxNgnPerUsd();
  return amount;
}

export function money(amount: number, from: string, to: Currency): string {
  const v = toCurrency(amount, from, to);
  return to === "USD"
    ? "$" + v.toLocaleString("en-US", { minimumFractionDigits: v < 100 ? 2 : 0, maximumFractionDigits: v < 100 ? 2 : 0 })
    : "₦" + Math.round(v).toLocaleString("en-US");
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
  return `[${p.id}] ${p.title} — ${money(p.price, p.currency, cur)}${specs ? "; " + specs : ""}${sizes}`;
}
