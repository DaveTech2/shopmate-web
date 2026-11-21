/**
 * Store facts used by the Shopmate Trust Report.
 *
 * Return policies were read from each retailer's own published policy pages (and cross-checked against
 * current policy roundups) on 2026-11-21. Policies change, so the report always links the store's page and
 * tells the shopper to confirm at checkout. A store that is not listed here is reported as "no policy on file"
 * rather than guessed.
 */
export const POLICY_REVIEWED = "2026-11-21";

export type StoreKind = "major" | "brand" | "specialty" | "grocery";

export interface Retailer {
  name: string;
  kind: StoreKind;
  /** One line on why the seller is (or is not) well known. Never rating data we do not have. */
  profile: string;
  /** Standard window in days for most items, when published. */
  days?: number;
  returns?: string;
  /** Category or brand specific rules that shorten (or change) the standard window. */
  rules?: Array<{ test: (cat: string, title: string) => boolean; days: number; text: string }>;
  /** Seasonal extension, shown only while it applies. */
  holiday?: { from: string; to: string; text: string; skip?: (cat: string, title: string) => boolean };
  url?: string;
}

const phone = (c: string, t: string) => c === "phones" || /iphone|galaxy|smartphone/i.test(t);
const apple = (_c: string, t: string) => /apple|iphone|macbook|airpods|ipad/i.test(t);
const electronics = (c: string) => ["electronics", "computing", "gaming", "phones"].includes(c);

export const RETAILERS: Record<string, Retailer> = {
  "best buy": {
    name: "Best Buy", kind: "major",
    profile: "Large US electronics retailer with its own stores, customer service and a published returns promise.",
    days: 15,
    returns: "15 days for most products (60 days for My Best Buy Plus and Total members, not on Marketplace items).",
    rules: [
      { test: phone, days: 14, text: "Phones and other activatable devices have 14 days (Verizon 30 days) and can carry a $45 restocking fee." },
    ],
    holiday: {
      from: "2026-10-30", to: "2026-12-31",
      text: "Holiday window: most purchases made Oct 30 to Dec 31, 2026 can be returned through Jan 15, 2027.",
      skip: (c, t) => phone(c, t),
    },
    url: "https://www.bestbuy.com/site/help-topics/return-exchange-policy/pcmcat260800050014.c",
  },
  walmart: {
    name: "Walmart", kind: "major",
    profile: "Large US retailer. Items sold by Walmart itself follow its published policy; Marketplace sellers can differ.",
    days: 90,
    returns: "90 days for most items sold by Walmart.",
    rules: [
      { test: phone, days: 14, text: "Most wireless phones have 14 days." },
      { test: (c) => electronics(c), days: 30, text: "Consumer electronics and PC components have 30 days." },
    ],
    url: "https://www.walmart.com/cp/returns/1231920",
  },
  target: {
    name: "Target", kind: "major",
    profile: "Large US retailer with a published returns policy. Target Plus partner items have their own terms.",
    days: 90,
    returns: "90 days for most unopened items sold by Target.",
    rules: [
      { test: (c, t) => phone(c, t) || apple(c, t), days: 14, text: "Apple, Beats and phones have 14 days." },
      { test: (c) => electronics(c), days: 30, text: "Electronics and entertainment items have 30 days." },
    ],
    holiday: {
      from: "2026-11-01", to: "2026-12-24",
      text: "Holiday window: electronics bought Nov 1 to Dec 24 can be returned until Jan 24, 2027 (Apple, Beats and phones until Jan 8, 2027).",
      skip: (c) => !electronics(c),
    },
    url: "https://www.target.com/help/articles/returns-exchanges/returns",
  },
  amazon: {
    name: "Amazon", kind: "major",
    profile: "Large online marketplace. Sold by Amazon and sold by third-party sellers are different things, so check the seller line.",
    days: 30,
    returns: "30 days for most items, with free returns at many drop-off locations.",
    rules: [{ test: (c, t) => apple(c, t), days: 15, text: "Apple-branded products have 15 days." }],
    holiday: { from: "2026-11-01", to: "2026-12-31", text: "Holiday window: most items bought Nov 1 to Dec 31, 2026 can be returned through Jan 31, 2027 (Apple until Jan 15)." },
    url: "https://www.amazon.com/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKWX7",
  },
  cvs: {
    name: "CVS", kind: "major",
    profile: "Large US pharmacy and drugstore chain.",
    days: 60,
    returns: "60 days for most new, unopened items. Some health and personal care items cannot be returned.",
    url: "https://www.cvs.com/retail/help/return_policy/",
  },
  "dick's sporting goods": {
    name: "DICK'S Sporting Goods", kind: "major",
    profile: "Large US sporting goods chain.",
    days: 90,
    returns: "90 days for most items with proof of purchase.",
    rules: [{ test: (c) => electronics(c), days: 30, text: "Opened electronics have a shorter window." }],
    url: "https://www.dickssportinggoods.com/s/return-policy",
  },
  "macy's": {
    name: "Macy's", kind: "major",
    profile: "Large US department store.",
    days: 30,
    returns: "30 days for most items. Returns by mail cost $9.99 for non-members. Watches and jewelry are inspected before a refund.",
    url: "https://www.macys.com/customer-service/articles/what-is-macys-return-policy",
  },
  nike: {
    name: "Nike", kind: "brand",
    profile: "Sold directly by the brand, so the stock comes from the maker.",
    days: 60,
    returns: "60 day return window for Nike Members, including worn shoes.",
    url: "https://www.nike.com/us/en/help/a/returns-policy",
  },
  "casio america": {
    name: "Casio America", kind: "brand",
    profile: "Sold directly by the brand, so the stock comes from the maker.",
    url: "https://www.casio.com/us/",
  },
  kroger: { name: "Kroger", kind: "grocery", profile: "Large US grocery chain." },
  safeway: { name: "Safeway", kind: "grocery", profile: "Large US grocery chain." },
  "whole foods market": { name: "Whole Foods Market", kind: "grocery", profile: "US grocery chain owned by Amazon." },
};

export interface StoreInfo {
  /** Store label cleaned for display. */
  store: string;
  retailer?: Retailer;
  /** Third-party seller named in brackets, e.g. "Walmart (IGM Inc)". */
  thirdParty?: string;
  /** Price came from a shopper's receipt (Open Prices), not a live store listing. */
  receipt: boolean;
  /** Price has never been re-checked against a store. */
  unchecked: boolean;
}

export function resolveStore(raw: string | undefined | null): StoreInfo {
  const name = (raw || "").trim();
  if (!name || /not yet re-checked/i.test(name)) return { store: "an unchecked store", receipt: false, unchecked: true };
  const receipt = /open prices|receipt/i.test(name);
  const paren = name.match(/\(([^)]+)\)/)?.[1];
  const base = name.replace(/\([^)]*\)/g, "").trim();
  const thirdParty = paren && !/open prices|receipt/i.test(paren) ? paren : undefined;
  return { store: base || name, retailer: RETAILERS[base.toLowerCase()], thirdParty, receipt, unchecked: false };
}
