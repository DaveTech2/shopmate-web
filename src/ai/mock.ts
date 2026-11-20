// DEMO MODE ONLY. Used when no Firebase project is configured (or as a labelled fallback if a
// Firebase AI Logic call fails). Deterministic rules, clearly badged "Demo · simulated" in the UI.
import { categories, getProduct, money, symbolOf, toCurrency, type Currency, type Product } from "../lib/catalog";
import { resolvePlace } from "../lib/delivery";
import type { CartOps, CompareResult, Intent, RankResult } from "./schemas";

const CAT_HINTS: Array<[RegExp, string]> = [
  [/headphone|earbud|earphone|speaker/i, "electronics"],
  [/laptop|macbook|keyboard|mouse|ssd|router/i, "computing"],
  [/shoe|sneaker|trainer|running/i, "footwear"],
  [/phone|iphone|galaxy/i, "phones"],
  [/toothpaste|toothbrush|deodorant|shampoo|body wash|razor|toiletr/i, "toiletries"],
  [/kettle|microwave/i, "home-kitchen"],
  [/watch|sunglasses/i, "jewelry-watches"],
];

const CUR_SIGNS: Array<[RegExp, string]> = [
  [/€|\beur(?:os?)?\b/, "EUR"], [/£|\bgbp\b|\bpounds?\b/, "GBP"], [/₦|\bngn\b|\bnaira\b/, "NGN"], [/₹|\binr\b|\brupees?\b/, "INR"],
  [/¥|\bjpy\b|\byen\b/, "JPY"], [/\bkes\b|\bksh\b/, "KES"], [/\bghs\b|\bcedis?\b|₵/, "GHS"], [/\bzar\b|\brand\b/, "ZAR"],
  [/\bcad\b|c\$/, "CAD"], [/\baud\b|a\$/, "AUD"], [/\baed\b|\bdirhams?\b/, "AED"], [/\$|\busd\b|\bdollars?\b/, "USD"],
];

export function mockIntent(text: string, cur = "USD"): Intent {
  const t = text.trim();
  const lower = t.toLowerCase();
  let budget_max = 0;
  let budget_currency = cur;
  const amt = lower.match(/(?:under|below|less than|max|budget(?: of)?|<|for)\s*(?:[^\d\s]{1,3}\s?)?(\d[\d,]*(?:\.\d+)?)\s*(k)?/) || lower.match(/[$€£₦₹¥]\s?(\d[\d,]*)(k)?/);
  if (amt && /under|below|less than|max|budget|<|[$€£₦₹¥]/.test(amt[0])) {
    budget_max = Number(amt[1].replace(/,/g, "")) * (amt[2] ? 1000 : 1);
    budget_currency = CUR_SIGNS.find(([re]) => re.test(lower))?.[1] || cur;
  }
  const size = Number(lower.match(/size\s*(\d{2})/)?.[1] || 0);
  const qty = Number(lower.match(/\b(\d{1,3})\s*(?:x|pcs|pieces|units|of)\b/)?.[1] || lower.match(/\bfor\s+(\d{1,3})\s+(?:people|staff|guests|students)/)?.[1] || 0);
  const category = CAT_HINTS.find(([re]) => re.test(lower))?.[1] || "";
  const use = lower.match(/\bfor\s+([a-z ]+?)(?:,|\.|$| under| below| size)/)?.[1]?.trim() || "";
  const lm = t.match(/\b(?:deliver(?:ed|y)? to|ship(?:ped)? to|to|in)\s+([A-Z][\p{L}.' -]+(?:,\s*[A-Z][\p{L}. ]+)?)/u);
  const resolved = lm ? resolvePlace(lm[1].trim()) : null;
  const location = resolved ? resolved.name : "";
  const location_country = resolved ? resolved.country : "";
  let action: Intent["action"] = "search";
  if (/\bcompare\b|\bvs\.?\b|\bversus\b|which is better/.test(lower)) action = "compare";
  else if (/\b(remove|delete|take out)\b/.test(lower)) action = "cart_remove";
  else if (/\badd\b.*\bcart\b|\bput\b.*\bcart\b/.test(lower)) action = "cart_add";
  else if (/\b(track|where is my order|order status)\b/.test(lower)) action = "track_order";
  else if (/\b(bulk|office|event|party|restock|for \d+ (people|staff|guests|students))\b/.test(lower)) action = "bulk_plan";
  else if (/^(hi|hello|hey|thanks|thank you)\b/.test(lower)) action = "chitchat";
  const query = lower
    .replace(/(?:under|below|less than|budget(?: of)?)\s*[^\d\s]{0,3}\s?\d[\d,]*k?\s*(naira|ngn|euros?|eur|pounds?|gbp|usd|dollars?|rupees?)?/g, "")
    .replace(/\b(?:deliver(?:ed|y)? to|ship(?:ped)? to)\s+.*$/, "")
    .replace(/size\s*\d+/g, "")
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    action, query, category, budget_max, budget_currency, use, size, location, location_country, quantity: qty || 1,
    must_have: /battery/.test(lower) ? ["battery"] : [],
    reply: action === "chitchat" ? "Hi! Tell me what you need, your budget and what it's for." : "",
  };
}

function reasonsFor(p: Product, intent: Intent, cur: Currency): string[] {
  const r: string[] = [];
  const s = p.specs || {};
  if (intent.budget_max) {
    const usd = toCurrency(p.price, p.currency, "USD");
    const cap = toCurrency(intent.budget_max, intent.budget_currency || "USD", "USD");
    if (usd <= cap) r.push(`${money(p.price, p.currency, cur)}, within your ${symbolOf(intent.budget_currency || "USD")}${intent.budget_max.toLocaleString()} budget`);
  }
  if (s.Battery && /battery/i.test(intent.query + (intent.must_have || []).join(" "))) r.push(`Battery: ${s.Battery}`);
  if (s.Support && /flat|arch|stability/i.test(intent.query + intent.use)) r.push(`${s.Support}`);
  if (intent.size && p.sizes?.includes(intent.size)) r.push(`Available in EU ${intent.size}`);
  if (s.RAM && /program|coding|develop/i.test(intent.query + intent.use)) r.push(`${s.RAM} RAM + ${s.Storage || "SSD"} for dev tools`);
  if (s.CPU && r.length < 2) r.push(`${s.CPU} processor`);
  if (s.Type && r.length < 3) r.push(s.Type);
  if (r.length < 2) r.push(`Sold by ${p.merchant}, ships from the nearest Shopmate hub`);
  return r.slice(0, 3);
}

export function mockRank(intent: Intent, candidates: Product[], cur: Currency): RankResult {
  const picks = candidates.slice(0, 6).map((p, i) => ({ id: p.id, reasons: reasonsFor(p, intent, cur), fit: Math.max(55, 94 - i * 7) }));
  const n = picks.length;
  return {
    summary: n
      ? `Found ${n} match${n > 1 ? "es" : ""}${intent.budget_max ? " in your budget" : ""}. Top pick: ${getProduct(picks[0].id)?.title}.`
      : "I couldn't find a match in the catalog. Try a different budget or wording.",
    picks,
  };
}

export function mockCompare(items: Product[], cur: Currency): CompareResult {
  const sorted = [...items].sort((a, b) => toCurrency(a.price, a.currency, "USD") - toCurrency(b.price, b.currency, "USD"));
  const cheapest = sorted[0];
  const premium = sorted[sorted.length - 1];
  return {
    verdict: `${cheapest.title} is the value pick at ${money(cheapest.price, cheapest.currency, cur)}. Go for ${premium.title} if you want the extra features and can stretch the budget.`,
    winner_id: cheapest.id,
    items: items.map((p) => ({
      id: p.id,
      best_for: p === cheapest ? "Best value" : p === premium ? "Premium pick" : "Balanced choice",
      pros: Object.entries(p.specs || {}).slice(0, 2).map(([k, v]) => `${k}: ${v}`).concat(p === cheapest ? ["Lowest price"] : []),
      cons: p === premium ? ["Highest price"] : p === cheapest && items.length > 1 ? ["Fewer premium features"] : [],
    })),
  };
}

export function mockCartOps(text: string, cart: Array<{ id: string; qty: number }>): CartOps {
  const lower = text.toLowerCase();
  const ops: CartOps["ops"] = [];
  for (const line of cart) {
    const p = getProduct(line.id);
    if (!p) continue;
    const words = p.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (!words.some((w) => lower.includes(w))) continue;
    if (/remove|delete|drop/.test(lower)) ops.push({ op: "remove", product_id: p.id, qty: 0 });
    else {
      const n = Number(lower.match(/(\d+)/)?.[1] || 0);
      if (n) ops.push({ op: "set_qty", product_id: p.id, qty: n });
    }
  }
  return { ops, note: ops.length ? "Updated your cart." : "I couldn't match that to an item in your cart." };
}

export const demoCategoryIds = categories.map((c) => c.id);
