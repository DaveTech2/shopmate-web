// Plain JSON Schemas shared by both inference paths:
//  - on-device (Chrome Prompt API):   onDeviceParams.promptOptions.responseConstraint
//  - cloud (Gemini via Firebase AI):  inCloudParams.generationConfig.responseJsonSchema
import { categories } from "../lib/catalog";

export const ACTIONS = ["search", "compare", "cart_add", "cart_remove", "bulk_plan", "track_order", "trust_check", "chitchat"] as const;
export type Action = (typeof ACTIONS)[number];

export interface Intent {
  action: Action;
  query: string;
  category?: string;
  budget_max?: number;
  budget_currency?: string;
  location_country?: string;
  use?: string;
  size?: number;
  location?: string;
  quantity?: number;
  product_refs?: string[];
  must_have?: string[];
  reply?: string;
}

export const intentSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: [...ACTIONS] },
    query: { type: "string", description: "short product search phrase, e.g. 'wireless headphones'" },
    category: { type: "string", enum: ["", ...categories.map((c) => c.id)] },
    budget_max: { type: "number", description: "max budget amount, 0 if none" },
    budget_currency: { type: "string", description: "ISO 4217 code of the budget currency, e.g. USD, EUR, GBP, NGN, INR. Empty if no budget" },
    use: { type: "string", description: "what it is for, e.g. 'programming', 'flat feet'" },
    size: { type: "number", description: "EU shoe size or 0" },
    location: { type: "string", description: "delivery city (any city worldwide) if the shopper mentions one, else empty" },
    location_country: { type: "string", description: "ISO 3166 alpha-2 code of that delivery city's country, e.g. US, DE, NG, GB, else empty" },
    quantity: { type: "integer" },
    product_refs: { type: "array", items: { type: "string" }, description: "product ids or names the user refers to" },
    must_have: { type: "array", items: { type: "string" } },
    reply: { type: "string", description: "one short friendly sentence for chitchat, else empty" },
  },
  required: ["action", "query"],
} as const;

export interface RankResult {
  summary: string;
  picks: Array<{ id: string; reasons: string[]; fit: number }>;
}
export const rankSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "1-2 sentence overview for the shopper" },
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          reasons: { type: "array", items: { type: "string" }, description: "2-3 short reasons why it fits" },
          fit: { type: "integer", description: "fit score 0-100" },
        },
        required: ["id", "reasons", "fit"],
      },
    },
  },
  required: ["summary", "picks"],
} as const;

export interface CompareResult {
  verdict: string;
  winner_id: string;
  items: Array<{ id: string; best_for: string; pros: string[]; cons: string[] }>;
}
export const compareSchema = {
  type: "object",
  properties: {
    verdict: { type: "string", description: "2 sentences: which to buy and why" },
    winner_id: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          best_for: { type: "string" },
          pros: { type: "array", items: { type: "string" } },
          cons: { type: "array", items: { type: "string" } },
        },
        required: ["id", "best_for", "pros", "cons"],
      },
    },
  },
  required: ["verdict", "winner_id", "items"],
} as const;

export interface CartOps {
  ops: Array<{ op: "add" | "remove" | "set_qty"; product_id: string; qty: number }>;
  note: string;
}
export const cartOpsSchema = {
  type: "object",
  properties: {
    ops: {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["add", "remove", "set_qty"] },
          product_id: { type: "string" },
          qty: { type: "integer" },
        },
        required: ["op", "product_id", "qty"],
      },
    },
    note: { type: "string", description: "one short sentence confirming the change" },
  },
  required: ["ops", "note"],
} as const;

// ---------- Trust Report ----------
export const trustSchema = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      description: "exactly four sections, one per key",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: ["authenticity", "seller", "price", "returns"] },
          status: { type: "string", enum: ["good", "caution", "concern", "unclear"] },
          headline: { type: "string", description: "one short line, 3 to 8 words" },
          points: { type: "array", items: { type: "string" }, description: "2 to 4 short facts, each grounded in the given facts" },
        },
        required: ["key", "status", "headline", "points"],
      },
    },
    overall: { type: "string", enum: ["good", "caution", "concern", "unclear"] },
    summary: { type: "string", description: "2 sentences: what the shopper should know before purchasing" },
    alternative_ids: { type: "array", items: { type: "string" }, description: "ids of cheaper alternatives from the given list, best first" },
  },
  required: ["sections", "overall", "summary", "alternative_ids"],
} as const;

// ---------- Screenshot to shopping ----------
export interface VisionResult {
  usable: boolean;
  reason: string;
  product_name: string;
  product_type: string;
  category: string;
  brand_guess: string;
  characteristics: string[];
  search_terms: string[];
  budget_max: number;
  budget_currency: string;
  summary: string;
  confidence: "high" | "medium" | "low";
}
export const visionSchema = {
  type: "object",
  properties: {
    usable: { type: "boolean", description: "false if the picture is blurry, too dark, too small, cropped so the item is unclear, or does not show a product someone could buy" },
    reason: { type: "string", description: "when usable is false: one friendly sentence on what is wrong and what a better picture looks like, else empty" },
    product_name: { type: "string", description: "best plain-language name, e.g. 'white leather low-top sneakers'" },
    product_type: { type: "string", description: "generic product noun, e.g. sneakers, headphones, handbag, dress" },
    category: { type: "string", enum: ["", ...categories.map((c) => c.id)] },
    brand_guess: { type: "string", description: "brand only if a logo or text is clearly visible, else empty. Never guess" },
    characteristics: { type: "array", items: { type: "string" }, description: "3 to 7 visual traits: colour, material, shape, pattern, style, notable details" },
    search_terms: { type: "array", items: { type: "string" }, description: "2 to 6 single or two-word catalog search terms, most specific first" },
    budget_max: { type: "number", description: "max budget in the shopper's message, 0 if none" },
    budget_currency: { type: "string", description: "ISO 4217 code of that budget, empty if none" },
    summary: { type: "string", description: "1 or 2 sentences starting with what you see" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["usable", "reason", "product_name", "product_type", "category", "characteristics", "search_terms", "summary", "confidence"],
} as const;
