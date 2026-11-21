/**
 * Shopmate hybrid inference: Firebase AI Logic (firebase/ai).
 *
 * Light, private, latency-sensitive tasks prefer the on-device model (Gemini Nano via Chrome's
 * Prompt API) and fall back to cloud Gemini automatically:
 *   - intent parsing (what / budget / use / size / location → structured JSON)
 *   - 2 or 3 item compare, quick product summaries, natural-language cart edits
 * Heavier reasoning prefers the cloud and can still fall back to on-device:
 *   - ranking a candidate set with "why it fits" reasons
 * Tool-driven agent work is cloud-only (function calling is not supported on-device):
 *   - bulk-order planning that calls the shop's own tools (search, delivery quote, add to plan)
 *
 * Every response carries `inferenceSource` (ON_DEVICE | IN_CLOUD), surfaced as a badge in the UI.
 */
import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  Schema,
  type GenerativeModel,
  type FunctionCall,
} from "firebase/ai";
import { ai, flag, isFirebaseConfigured, loadRemoteConfig } from "../lib/firebase";
import { getProduct, productBrief, searchCatalog, money, symbolOf, type Currency, type Product } from "../lib/catalog";
import { quote, resolvePlace, placeLabel, type Place } from "../lib/delivery";
import {
  cartOpsSchema, compareSchema, intentSchema, rankSchema, trustSchema, visionSchema,
  type CartOps, type CompareResult, type Intent, type RankResult, type VisionResult,
} from "./schemas";
import { baselineReport, buildFacts, factsForPrompt, mergeReport, type TrustReportData } from "../lib/trust";
import { countryOf } from "../data/countries";
import { storesFor } from "../data/localStores";

/** Store context for prompts outside the US, so the model never pushes US-only stores to non-US shoppers. */
export function localContext(place: Place): string {
  if (!place.country || place.country === "US") return "";
  const name = countryOf(place.country)?.name || place.country;
  const st = storesFor(place.country);
  return `Shopper is in ${name}. Catalog prices were checked at US stores, most of which do not deliver to ${name}. Retailers that sell and deliver in ${name}: ${st.map((x) => x.name).join(", ")}. Never say a US-only store (Best Buy, Walmart, Target, CVS and similar) delivers to ${name}; if you mention where to buy, use these retailers.\n`;
}
import { mockCartOps, mockCompare, mockIntent, mockRank } from "./mock";

export type Source = "on_device" | "in_cloud" | "demo" | "fallback";
export type Route = "on-device" | "cloud";
export interface AIResult<T> { data: T; source: Source; route: Route; ms: number; note?: string }

export type ModeSetting = "auto" | "PREFER_ON_DEVICE" | "ONLY_ON_DEVICE" | "PREFER_IN_CLOUD" | "ONLY_IN_CLOUD";
let modeSetting: ModeSetting = (localStorage.getItem("sm_mode") as ModeSetting) || "auto";
export const getModeSetting = () => modeSetting;
export function setModeSetting(m: ModeSetting) {
  modeSetting = m;
  localStorage.setItem("sm_mode", m);
  models.clear();
}

export const aiLive = isFirebaseConfigured && !!ai;

// ---------- on-device model status (Chrome Prompt API) ----------
export type DeviceStatus = "unsupported" | "unavailable" | "downloadable" | "downloading" | "available" | "checking";
type LM = { availability(o?: object): Promise<string> };
const LMOPTS = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };

export async function deviceStatus(): Promise<DeviceStatus> {
  const lm = (globalThis as unknown as { LanguageModel?: LM }).LanguageModel;
  if (!lm) return "unsupported";
  try {
    return (await lm.availability(LMOPTS)) as DeviceStatus;
  } catch {
    return "unavailable";
  }
}

const listeners = new Set<(p: number | null) => void>();
export const onDownloadProgress = (fn: (p: number | null) => void) => (listeners.add(fn), () => listeners.delete(fn));
let deviceInit: Promise<void> | null = null;

/** Must run on a user gesture (click / submit) before the first prompt, per Firebase docs. */
export function ensureDeviceModel(): void {
  if (!aiLive || deviceInit) return;
  const m = model("intent");
  deviceInit = m
    .initializeDeviceModel((v) => listeners.forEach((fn) => fn(v)))
    .then(() => listeners.forEach((fn) => fn(null)))
    .catch(() => listeners.forEach((fn) => fn(null)));
}

// ---------- model factory ----------
type Task = "intent" | "rank" | "compare" | "cartops" | "summary" | "trust" | "vision";
const TASK_MODE: Record<Task, keyof typeof InferenceMode> = {
  intent: "PREFER_ON_DEVICE",
  compare: "PREFER_ON_DEVICE",
  cartops: "PREFER_ON_DEVICE",
  summary: "PREFER_ON_DEVICE",
  rank: "PREFER_IN_CLOUD",
  trust: "PREFER_IN_CLOUD", // heavier reasoning: cloud first, on-device if the network is down
  vision: "ONLY_IN_CLOUD", // images are analysed in the cloud (Gemini Nano image input is not widely available)
};
const TASK_SCHEMA: Partial<Record<Task, object>> = {
  intent: intentSchema, rank: rankSchema, compare: compareSchema, cartops: cartOpsSchema, trust: trustSchema, vision: visionSchema,
};
const SYSTEM: Record<Task, string> = {
  intent:
    "You are Shopmate's intent parser. Convert the shopper's message into JSON that matches the schema. " +
    "Use action=search for product requests, compare when they want to compare items, cart_add/cart_remove for cart edits, " +
    "bulk_plan for big multi-item orders (office, event, restock, many people), track_order for order status, " +
    "trust_check when they ask if a product or seller is trustworthy, legit, safe to buy, or whether to check it before buying (put the product they mean in product_refs), chitchat otherwise. " +
    "budget_currency is the ISO 4217 code of any money amount the shopper gives ($ is USD, € EUR, £ GBP, ₦ or naira NGN, ₹ INR, etc.); if they give a bare number use the shopper's current currency stated in the message. " +
    "location is any delivery city in the world they mention, with location_country as its ISO country code. Use 0 or empty string when unknown.",
  rank:
    "You are Shopmate, a personal shopper. Rank ONLY the given catalog items for the shopper's need. " +
    "Never invent products, prices or specs. Give 2-3 short, concrete reasons per pick, referencing budget, specs, size and delivery.",
  compare:
    "You compare 2-3 products for a shopper. Be concrete and brief. Pick one winner for the stated need. Use only the facts given.",
  cartops:
    "You edit a shopping cart. Map the shopper's request to add/remove/set_qty operations using ONLY product ids from the given cart or catalog list.",
  trust:
    "You write the SHOPMATE TRUST REPORT, an honest pre-purchase check. You get verified facts and a rules-based draft. " +
    "Use ONLY those facts. Never invent reviews, ratings, seller history, discounts, policies or prices. " +
    "If a fact is NOT AVAILABLE or unknown, say it is unclear instead of guessing. Keep every caveat in the draft. Missing review data alone is NOT a reason for caution: mention it as a point and set the status from the other facts. " +
    "Statuses: good (no issue found), caution (something to confirm), concern (a real warning), unclear (no data). You may make a status more cautious than the draft, never less. " +
    "The headline must agree with the status (for good: a positive line; for caution or concern: name the issue; for unclear: say what is missing). Never say 'no red flags' unless the status is good. Write for a regular shopper in plain words, each point under 25 words. Quote amounts in the display currency given. " +
    "Return exactly four sections: authenticity, seller, price, returns. In the summary, tell the shopper what to know before purchasing.",
  vision:
    "You are Shopmate's visual shopping assistant. The shopper sends a screenshot, photo or social media image of something they want to buy. " +
    "First decide if the picture is clear enough: if it is blurry, dark, tiny, heavily cropped, or shows no purchasable item (for example a selfie, landscape or document), set usable=false and explain in one friendly sentence what a better picture looks like. " +
    "Otherwise identify the product in plain language, list its important visual traits (colour, material, shape, pattern, style, details), and give catalog search terms. " +
    "Name a brand only if a logo or text is clearly legible; never guess brands or prices. When the picture shows a whole outfit, pick the most prominent single item and mention the others in characteristics. " +
    "If the shopper's message states a budget, extract it. Use confidence=low if you are unsure what the item is.",
  summary: "You are a concise shopping assistant. Answer in at most 2 short sentences using only the facts given.",
};
const STYLE = " Write in plain, natural language. Never use em dashes or en dashes; use commas or periods instead.";
(Object.keys(SYSTEM) as Task[]).forEach((k) => { SYSTEM[k] += STYLE; });

const models = new Map<string, GenerativeModel>();
function effectiveMode(task: Task): (typeof InferenceMode)[keyof typeof InferenceMode] {
  if (task === "vision") return InferenceMode.ONLY_IN_CLOUD;
  const key = modeSetting === "auto" ? (task === "intent" ? (flag("inference_mode") as keyof typeof InferenceMode) : TASK_MODE[task]) : modeSetting;
  return InferenceMode[key] ?? InferenceMode.PREFER_ON_DEVICE;
}

function model(task: Task): GenerativeModel {
  const mode = effectiveMode(task);
  const k = `${task}:${mode}`;
  const hit = models.get(k);
  if (hit) return hit;
  const schema = TASK_SCHEMA[task];
  const m = getGenerativeModel(ai!, {
    mode,
    inCloudParams: {
      model: flag("cloud_model"),
      systemInstruction: SYSTEM[task],
      generationConfig: schema
        ? { responseMimeType: "application/json", responseJsonSchema: schema as Record<string, unknown>, temperature: 0.2 }
        : { temperature: 0.4, maxOutputTokens: 160 },
    },
    onDeviceParams: {
      createOptions: {
        ...LMOPTS,
        initialPrompts: [{ role: "system", content: [{ type: "text", value: SYSTEM[task] }] }],
      } as never,
      ...(schema ? { promptOptions: { responseConstraint: schema } } : {}),
    },
  });
  models.set(k, m);
  return m;
}

function parseJSON<T>(text: string): T {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  return JSON.parse(t) as T;
}

async function run<T>(task: Task, prompt: string, route: Route, fallback: () => T, json = true): Promise<AIResult<T>> {
  const t0 = performance.now();
  if (!aiLive) {
    await new Promise((r) => setTimeout(r, 350 + Math.random() * 300));
    return { data: fallback(), source: "demo", route, ms: Math.round(performance.now() - t0) };
  }
  await loadRemoteConfig();
  try {
    const res = await model(task).generateContent(prompt);
    const text = res.response.text().replace(/\s*[\u2014\u2013]\s*/g, ", "); // house style: no em dashes
    const data = json ? parseJSON<T>(text) : (text as unknown as T);
    const source: Source = res.response.inferenceSource === InferenceSource.ON_DEVICE ? "on_device" : "in_cloud";
    return { data, source, route, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    console.warn(`[shopmate] ${task} failed, using rules fallback`, e);
    return { data: fallback(), source: "fallback", route, ms: Math.round(performance.now() - t0), note: String((e as Error)?.message || e) };
  }
}

// ---------- public tasks ----------
export function parseIntent(text: string, ctx: { lastResults?: string[]; cart?: string[]; place?: Place; currency?: string } = {}) {
  const prompt =
    `Shopper message: "${text}"\n` +
    (ctx.place ? `Shopper currently delivers to ${placeLabel(ctx.place)}; current currency ${ctx.currency || "USD"}.\n` : "") +
    (ctx.lastResults?.length ? `Products currently on screen: ${ctx.lastResults.join(" | ")}\n` : "") +
    (ctx.cart?.length ? `Cart: ${ctx.cart.join(" | ")}\n` : "") +
    "Return the JSON.";
  return run<Intent>("intent", prompt, "on-device", () => mockIntent(text, ctx.currency)).then((r) => ({ ...r, data: normalizeIntent(r.data, text, ctx.currency) }));
}

function normalizeIntent(i: Intent, text: string, cur?: string): Intent {
  const m = mockIntent(text, cur);
  return {
    ...i,
    action: i.action || m.action,
    query: i.query || m.query,
    budget_max: i.budget_max || m.budget_max,
    budget_currency: (i.budget_currency || m.budget_currency || cur || "USD").toUpperCase(),
    location: i.location || m.location,
    location_country: (i.location_country || m.location_country || "").toUpperCase(),
    size: i.size || m.size,
    category: i.category || "",
  };
}

export function rankProducts(text: string, intent: Intent, candidates: Product[], cur: Currency, place: Place) {
  const lines = candidates.map((p) => {
    const q = quote(place, [[p, 1]]);
    return `${productBrief(p, cur)}; estimated delivery to ${placeLabel(place)}: ${money(q.fee, q.fee_currency, cur)} (${q.eta}${q.international ? ", international from " + q.from : ""})`;
  });
  const prompt =
    `Shopper said: "${text}"\nShopper delivers to ${placeLabel(place)} and sees prices in ${cur}. Quote all prices and fees in ${cur}.\n${intent.budget_max ? `Shopper budget: up to ${symbolOf(intent.budget_currency || cur)}${intent.budget_max} per item. Quote each item's own price, never call the price the budget.\n` : ""}Parsed need: ${JSON.stringify({ query: intent.query, budget: intent.budget_max, currency: intent.budget_currency, use: intent.use, size: intent.size })}\n` +
    localContext(place) +
    `Catalog candidates:\n${lines.join("\n")}\n` +
    `Rank the best ${Math.min(candidates.length, Number(flag("max_results")) || 6)} (ids from the list only). Drop items that clearly don't fit.`;
  return run<RankResult>("rank", prompt, "cloud", () => mockRank(intent, candidates, cur)).then((r) => ({
    ...r,
    data: { ...r.data, picks: (r.data.picks || []).filter((p) => candidates.some((c) => c.id === p.id)) },
  }));
}

export function compareProducts(items: Product[], need: string, cur: Currency) {
  const prompt = `Shopper need: "${need || "general use"}"\nCompare:\n${items.map((p) => productBrief(p, cur)).join("\n")}`;
  return run<CompareResult>("compare", prompt, "on-device", () => mockCompare(items, cur));
}

export function cartEdit(text: string, cart: Array<{ id: string; qty: number }>, cur: Currency) {
  const lines = cart.map((l) => `${l.qty} x ${productBrief(getProduct(l.id)!, cur)}`);
  const prompt = `Cart:\n${lines.join("\n")}\nShopper request: "${text}"`;
  return run<CartOps>("cartops", prompt, "on-device", () => mockCartOps(text, cart));
}

export function summarizeProduct(p: Product, cur: Currency, question?: string) {
  const prompt = `${productBrief(p, cur)}\n${question ? `Question: ${question}` : "In 2 sentences, who is this best for and one thing to watch out for?"}`;
  return run<string>(
    "summary", prompt, "on-device",
    () => `${p.title} suits shoppers who want ${Object.values(p.specs || {})[0] || p.product_type || "a reliable pick"} at ${money(p.price, p.currency, cur)}. Check delivery time to your city before ordering.`,
    false,
  );
}

/** SHOPMATE TRUST REPORT: rules-based facts first, then the model words it. Never less cautious than the rules. */
export async function trustReport(p: Product, cur: Currency, place: Place): Promise<AIResult<TrustReportData>> {
  const facts = buildFacts(p, place.country);
  const base = baselineReport(facts, cur);
  const country = countryOf(place.country)?.name || place.country;
  const r = await run<Partial<TrustReportData>>("trust", factsForPrompt(facts, cur, `${country} (delivering to ${placeLabel(place)})`), "cloud", () => base);
  return { ...r, data: r.source === "demo" || r.source === "fallback" ? base : mergeReport(r.data, base) };
}

// ---------- screenshot to shopping (multimodal, cloud) ----------
export interface ImagePayload { mimeType: string; base64: string }
export async function identifyImage(img: ImagePayload, text: string, cur: Currency, place: Place): Promise<AIResult<VisionResult | null>> {
  const t0 = performance.now();
  if (!aiLive) return { data: null, source: "demo", route: "cloud", ms: 0, note: "Image analysis needs the cloud AI, which is not configured in demo mode." };
  await loadRemoteConfig();
  try {
    const prompt =
      `Shopper's message: ${text ? `"${text}"` : "(none)"}\nShopper delivers to ${placeLabel(place)}; display currency ${cur}. ` +
      "Analyse the attached picture and return the JSON.";
    const res = await model("vision").generateContent([{ type: "text", text: prompt }, { type: "inlineData", inlineData: { mimeType: img.mimeType, data: img.base64 } }]);
    const data = parseJSON<VisionResult>(res.response.text().replace(/\s*[\u2014\u2013]\s*/g, ", "));
    return { data, source: "in_cloud", route: "cloud", ms: Math.round(performance.now() - t0) };
  } catch (e) {
    console.warn("[shopmate] vision failed", e);
    return { data: null, source: "fallback", route: "cloud", ms: Math.round(performance.now() - t0), note: String((e as Error)?.message || e) };
  }
}

// ---------- cloud agent: bulk-order planner with function calling ----------
export interface PlanLine { id: string; qty: number; why: string }
export interface BulkPlan { lines: PlanLine[]; summary: string }

const tools = [
  {
    functionDeclarations: [
      {
        name: "search_catalog",
        description: "Search Shopmate's live catalog. Returns ids, titles, prices and key specs.",
        parameters: Schema.object({
          properties: {
            query: Schema.string({ description: "what to look for" }),
            budget_max_usd: Schema.number({ description: "per-unit max price in USD, 0 for none" }),
          },
          optionalProperties: ["budget_max_usd"],
        }),
      },
      {
        name: "quote_delivery",
        description: "Estimated delivery fee and ETA for a set of items to the shopper's chosen city and country.",
        parameters: Schema.object({
          properties: {
            items: Schema.array({ items: Schema.object({ properties: { id: Schema.string(), qty: Schema.integer() } }) }),
          },
        }),
      },
      {
        name: "add_to_plan",
        description: "Add a product line to the order plan the shopper will review before adding to cart.",
        parameters: Schema.object({
          properties: { id: Schema.string(), qty: Schema.integer(), why: Schema.string({ description: "short reason" }) },
        }),
      },
    ],
  },
];

export async function planBulkOrder(text: string, cur: Currency, place: Place): Promise<AIResult<BulkPlan>> {
  const t0 = performance.now();
  const plan: BulkPlan = { lines: [], summary: "" };
  const exec = (call: FunctionCall): object => {
    const a = (call.args || {}) as Record<string, unknown>;
    if (call.name === "search_catalog") {
      return { results: searchCatalog({ query: String(a.query || ""), budget_max: Number(a.budget_max_usd || 0), budget_currency: "USD" }, 6).map((p) => productBrief(p, cur)) };
    }
    if (call.name === "quote_delivery") {
      const items = ((a.items as Array<{ id: string; qty: number }>) || []).map((i) => [getProduct(i.id), i.qty] as const).filter((x) => x[0]);
      const q = quote(place, items as Array<[Product, number]>);
      return { fee: money(q.fee, q.fee_currency, cur), eta: q.eta, from: q.from, to: placeLabel(place), international: q.international, note: "estimate" };
    }
    if (call.name === "add_to_plan") {
      const p = getProduct(String(a.id));
      if (!p) return { ok: false, error: "unknown id" };
      plan.lines.push({ id: p.id, qty: Math.max(1, Number(a.qty) || 1), why: String(a.why || "") });
      return { ok: true };
    }
    return { error: "unknown tool" };
  };

  if (!aiLive || flag("enable_bulk_planner") !== "true") {
    await new Promise((r) => setTimeout(r, 600));
    const i = mockIntent(text);
    const n = Number(text.match(/\b(\d{1,3})\b/)?.[1]) || (i.quantity && i.quantity > 1 ? i.quantity : 10);
    const found = searchCatalog({ query: i.query, category: i.category, budget_max: i.budget_max, budget_currency: i.budget_currency }, 20);
    const seen = new Set<string>();
    const picks = found.filter((p) => { const k = p.product_type || p.title.split(" ").slice(-2).join(" "); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4);
    picks.forEach((p) => plan.lines.push({ id: p.id, qty: n, why: `1 per person × ${n}` }));
    plan.summary = picks.length ? `Drafted a ${plan.lines.length}-line plan for ${n}. Review quantities before adding to cart.` : "I couldn't build a plan from the catalog for that.";
    return { data: plan, source: "demo", route: "cloud", ms: Math.round(performance.now() - t0) };
  }

  await loadRemoteConfig();
  try {
    // Function calling isn't supported on-device, so the agent is explicitly cloud-only.
    const agent = getGenerativeModel(ai!, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: flag("cloud_model"),
        tools,
        systemInstruction:
          `You are Shopmate's bulk-order planner. Delivery to: ${placeLabel(place)}. Quote everything in ${cur}. ` +
          "Use search_catalog to find items, add_to_plan for each line with a sensible quantity, optionally quote_delivery, then reply with a 2-sentence summary." + STYLE,
      },
    });
    const chat = agent.startChat();
    let res = await chat.sendMessage(text);
    for (let step = 0; step < 8; step++) {
      const calls = res.response.functionCalls();
      if (!calls?.length) break;
      res = await chat.sendMessage(calls.map((c) => ({ type: "functionResponse" as const, functionResponse: { name: c.name, response: exec(c) as Record<string, unknown> } })));
    }
    plan.summary = res.response.text();
    return { data: plan, source: "in_cloud", route: "cloud", ms: Math.round(performance.now() - t0) };
  } catch (e) {
    console.warn("[shopmate] bulk planner failed", e);
    return { data: { lines: [], summary: "The cloud planner is unavailable right now. Try a regular search." }, source: "fallback", route: "cloud", ms: Math.round(performance.now() - t0), note: String(e) };
  }
}

export { resolvePlace };
