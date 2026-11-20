// Plain JSON Schemas shared by both inference paths:
//  - on-device (Chrome Prompt API):   onDeviceParams.promptOptions.responseConstraint
//  - cloud (Gemini via Firebase AI):  inCloudParams.generationConfig.responseJsonSchema
import { categories } from "../lib/catalog";

export const ACTIONS = ["search", "compare", "cart_add", "cart_remove", "bulk_plan", "track_order", "chitchat"] as const;
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
