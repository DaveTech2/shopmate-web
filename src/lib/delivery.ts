// Generalised from Shopmate's delivery.py (github.com/DaveTech2/Shopmate): distance bands + size surcharges,
// now global: nearest fulfilment hub, domestic vs international bands, fees are estimates in USD.
import places from "../data/locations.json";
import { COUNTRIES, HUBS, countryOf } from "../data/countries";
import type { Product } from "./catalog";

export interface Place { name: string; state?: string | null; country: string; lat: number; lon: number; key?: string; approx?: boolean }
export type SizeClass = "small" | "medium" | "large" | "bulky";

const PLACES = places as unknown as Record<string, Place>;
type Band = { base: number; per_km: number; eta: [number, number] };
/** Rate card in USD (Shopmate band style). Domestic bands are scaled by the country's cost level. */
const BANDS: Record<"same_city" | "regional" | "national" | "international", Band> = {
  same_city: { base: 4.5, per_km: 0, eta: [0, 1] },
  regional: { base: 7, per_km: 0.015, eta: [1, 3] },
  national: { base: 9, per_km: 0.006, eta: [2, 5] },
  international: { base: 22, per_km: 0.0025, eta: [6, 12] },
};
const SIZE_USD: Record<SizeClass, number> = { small: 0, medium: 3, large: 12, bulky: 45 };
const EXPRESS = { multiplier: 1.8, days_faster: 1 };
const ROAD_FACTOR = 1.3;
/** Default delivery place for new visitors: United States. */
export const DEFAULT_PLACE: Place = { name: "New York", country: "US", lat: 40.71, lon: -74.01 };

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

export interface Quote { fee: number; fee_currency: "USD"; eta: string; band: string; distance_km: number; from: string; international: boolean }

/** Nearest hub in the shopper's country, else the nearest hub anywhere (international). */
export function originFor(dest: Place) {
  const local = HUBS.filter((h) => h.country === dest.country);
  const pool = local.length ? local : HUBS;
  return pool.reduce((b, h) => (km(h, dest) < km(b, dest) ? h : b), pool[0]);
}

/** Estimated delivery fee (USD) + ETA from the nearest Shopmate hub. */
export function quote(dest: Place, items: Array<[Product, number]>, speed: "standard" | "express" = "standard"): Quote {
  const origin = originFor(dest);
  const d = km(origin, dest);
  const intl = origin.country !== dest.country;
  const band: keyof typeof BANDS = intl ? "international" : d <= 40 ? "same_city" : d <= 400 ? "regional" : "national";
  const r = BANDS[band];
  const lvl = intl ? 1 : countryOf(dest.country)?.cost ?? 1;
  let sizeFee = 0;
  for (const [p, q] of items) {
    const s = SIZE_USD[sizeClass(p)] * (intl ? 1.6 : 1);
    sizeFee += s + s * 0.5 * Math.min(Math.max(q - 1, 0), 9) + s * 0.15 * Math.max(q - 10, 0);
  }
  let fee = (r.base + r.per_km * d + sizeFee) * lvl;
  let [lo, hi] = r.eta;
  if (intl && d > 9000) hi += 3;
  if (speed === "express") {
    fee *= EXPRESS.multiplier;
    lo = Math.max(0, lo - EXPRESS.days_faster);
    hi = Math.max(1, hi - (intl ? 3 : EXPRESS.days_faster));
  }
  fee = Math.ceil(fee * 4) / 4;
  const eta = hi === 0 ? "same day" : lo ? `${lo}-${hi} days` : `within ${hi} day${hi > 1 ? "s" : ""}`;
  return { fee, fee_currency: "USD", eta, band: band.replace("_", " "), distance_km: Math.round(d), from: origin.name, international: intl };
}

const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const ALIASES: Record<string, string> = { usa: "US", "u.s.": "US", "united states of america": "US", america: "US", uk: "GB", england: "GB", britain: "GB", "great britain": "GB", scotland: "GB", wales: "GB", uae: "AE", emirates: "AE", holland: "NL", turkey: "TR", "ivory coast": "CI", korea: "KR" };
const countryFrom = (q: string) => (ALIASES[q] ? countryOf(ALIASES[q]) : COUNTRIES.find((c) => norm(c.name) === q || c.code.toLowerCase() === q));

/** Resolve any "city", "city, country" or country name to a Place. Optional ISO country hint. */
export function resolvePlace(text?: string | null, countryHint?: string | null): Place | null {
  const raw = norm(text || "").replace(/ state$/, "");
  const hint = (countryHint || "").toUpperCase();
  const parts = raw.split(",").map((x) => x.trim()).filter(Boolean);
  const cityQ = parts[0] || "";
  const ctryQ = parts.slice(1).join(" ");
  const want = (hint && countryOf(hint)) || (ctryQ ? countryFrom(ctryQ) : undefined);
  if (!cityQ && !want) return null;
  if (cityQ === "nyc") return { ...DEFAULT_PLACE };
  if (cityQ) for (const c of want ? [want] : COUNTRIES)
    for (const [n, lat, lon] of c.cities) if (norm(n) === cityQ) return { name: n, country: c.code, lat, lon };
  if (cityQ && (!want || want.code === "NG") && PLACES[cityQ]) return { ...PLACES[cityQ], key: cityQ };
  const whole = countryFrom(raw) || countryFrom(cityQ);
  if (whole) { const [n, lat, lon] = whole.cities[0]; return { name: n, country: whole.code, lat, lon }; }
  if (want) {
    const [n0, lat, lon] = want.cities[0];
    return cityQ ? { name: cityQ.replace(/\b\w/g, (m) => m.toUpperCase()), country: want.code, lat, lon, approx: true } : { name: n0, country: want.code, lat, lon };
  }
  for (const c of COUNTRIES) for (const [n, lat, lon] of c.cities) if (cityQ.length >= 4 && norm(n).startsWith(cityQ)) return { name: n, country: c.code, lat, lon };
  return null;
}

export function placeLabel(p: Place) {
  const c = countryOf(p.country);
  return `${p.name}, ${c?.name ?? p.country}`;
}
