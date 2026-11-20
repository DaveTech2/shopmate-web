// Port of Shopmate's delivery.py (github.com/DaveTech2/Shopmate): distance bands + size surcharges.
import places from "../data/locations.json";
import type { Product } from "./catalog";

export interface Place { name: string; state?: string | null; country: string; lat: number; lon: number; key?: string }
type Band = { base: number; per_km: number; eta: [number, number] };
type Table = { same_city: Band; regional: Band; national: Band; international: Band; size: Record<SizeClass, number> };
export type SizeClass = "small" | "medium" | "large" | "bulky";

const PLACES = places as unknown as Record<string, Place>;
const RATE_TABLES: Record<"NGN" | "USD", Table> = {
  NGN: {
    same_city: { base: 1500, per_km: 0, eta: [0, 1] },
    regional: { base: 2500, per_km: 8, eta: [1, 2] },
    national: { base: 3500, per_km: 10, eta: [2, 5] },
    international: { base: 25000, per_km: 6, eta: [7, 14] },
    size: { small: 0, medium: 1000, large: 4000, bulky: 12000 },
  },
  USD: {
    same_city: { base: 5, per_km: 0, eta: [0, 1] },
    regional: { base: 8, per_km: 0.02, eta: [1, 3] },
    national: { base: 12, per_km: 0.015, eta: [2, 6] },
    international: { base: 35, per_km: 0.004, eta: [6, 14] },
    size: { small: 0, medium: 4, large: 15, bulky: 60 },
  },
};
const EXPRESS = { multiplier: 1.8, days_faster: 1 };
const ROAD_FACTOR = 1.3;
/** Shopmate demo merchants dispatch from Lagos. */
export const DISPATCH: Place = { name: "Lagos", state: "Lagos", country: "NG", lat: 6.45, lon: 3.4 };

const BULKY = /\b(freezer|fridge|refrigerator|washing machine|generator|air ?conditioner|mattress|sofa|wardrobe|3-seater|\d{2,3}\s*(kg)|chest)\b/i;
const LARGE = /\b(toilet roll|pack of 12|suitcase|console|playstation|router|chair|drill|tool box|mop|tv|television|microwave|fan|cookware|dumbbell|inflator|engine oil|carton|bag of|(?:[3-9]|\d{2,})\s*l\b|5kg|10kg|laptop|monitor|printer)\b/i;
const SMALL = /\b(earbuds?|airpods|phone holder|thermometer|charger|cable|lotion|cream|soap|wipes|vitamins?|tablets|capsules|supplement|paracetamol|watch|case|sneakers?|shoes?|trainers|sandals|slides|t-?shirt|shirt|jeans|dress|cap|hat|socks|perfume|lipstick|phone|iphone|smartphone|book|toothpaste|toothbrush|deodorant|roll-on|razor|shampoo|pads|sanitizer|masks?|wallet|sunglasses|mouse|flash drive|pens|calculator|notebook|headphones|earphones)\b/i;
const CAT_SIZE: Record<string, SizeClass> = {
  toiletries: "small", household: "medium", pharmacy: "small", drinks: "medium", footwear: "small", "kids-toys": "medium",
  computing: "small", gaming: "medium", office: "small", pets: "medium", "jewelry-watches": "small", "garden-tools": "medium",
  furniture: "bulky", books: "small", groceries: "medium", phones: "small", electronics: "medium", fashion: "small",
  "home-kitchen": "large", beauty: "small", baby: "medium", health: "small", sports: "medium", automotive: "medium",
};

export function sizeClass(p: Product): SizeClass {
  const t = p.title;
  if (BULKY.test(t) && !/\b(1|2|3|5)\s*kg\b/i.test(t)) return "bulky";
  if (LARGE.test(t)) return "large";
  if (SMALL.test(t)) return "small";
  return CAT_SIZE[p.category] ?? "medium";
}

export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = 6371, rad = Math.PI / 180;
  const la1 = a.lat * rad, la2 = b.lat * rad, dla = la2 - la1, dlo = (b.lon - a.lon) * rad;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h)) * ROAD_FACTOR;
}

export interface Quote { fee: number; fee_currency: "NGN" | "USD"; eta: string; band: string; distance_km: number }

export function quote(dest: Place, items: Array<[Product, number]>, speed: "standard" | "express" = "standard", origin: Place = DISPATCH): Quote {
  const d = km(origin, dest);
  const cur = origin.country === "NG" ? "NGN" : "USD";
  const table = RATE_TABLES[cur];
  const band: keyof Omit<Table, "size"> =
    dest.country !== origin.country ? "international" : d <= 25 ? "same_city" : d <= 300 ? "regional" : "national";
  const r = table[band];
  const distanceFee = r.base + r.per_km * d;
  let sizeFee = 0;
  for (const [p, q] of items) {
    const s = table.size[sizeClass(p)];
    sizeFee += s + s * 0.5 * Math.min(Math.max(q - 1, 0), 9) + s * 0.15 * Math.max(q - 10, 0);
  }
  let fee = distanceFee + sizeFee;
  let [lo, hi] = r.eta;
  if (speed === "express") {
    fee *= EXPRESS.multiplier;
    lo = Math.max(0, lo - EXPRESS.days_faster);
    hi = Math.max(1, hi - EXPRESS.days_faster);
  }
  const step = cur === "NGN" ? 100 : 0.5;
  fee = Math.ceil(fee / step) * step;
  const eta = hi === 0 ? "same day" : lo ? `${lo}-${hi} days` : `within ${hi} day${hi > 1 ? "s" : ""}`;
  return { fee, fee_currency: cur, eta, band: band.replace("_", " "), distance_km: Math.round(d) };
}

/** Offline place resolution (same rules as Shopmate's _resolve_offline). */
export function resolvePlace(text?: string | null): Place | null {
  const k = (text || "").trim().toLowerCase().replace(" state", "");
  if (!k) return null;
  if (PLACES[k]) return { ...PLACES[k], key: k };
  const head = k.split(",")[0].trim();
  const hits = Object.keys(PLACES).filter((key) =>
    new RegExp(`(?<![a-z])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`).test(head),
  );
  if (hits.length) {
    const key = hits.sort((a, b) => b.length - a.length)[0];
    return { ...PLACES[key], key };
  }
  for (const [key, p] of Object.entries(PLACES)) if (head.length >= 4 && key.startsWith(head)) return { ...p, key };
  return null;
}

export const placeOptions: Place[] = (() => {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const [key, p] of Object.entries(PLACES)) {
    const id = `${p.name}|${p.country}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...p, key });
  }
  return out.sort((a, b) => (a.country === b.country ? a.name.localeCompare(b.name) : a.country === "NG" ? -1 : b.country === "NG" ? 1 : a.country.localeCompare(b.country)));
})();

export function nearestPlace(lat: number, lon: number): Place {
  return placeOptions.reduce((best, p) => (km({ lat, lon }, p) < km({ lat, lon }, best) ? p : best), placeOptions[0]);
}
