/**
 * Retailers that sell to and deliver within each country, for the Trust Report, product pages and
 * Screenshot to shopping links.
 *
 * Reviewed 2026-11-21:
 *  - live: the store's site (or search page) responded to Shopmate's check that day. Some stores block automated
 *    checks with a bot wall (403/503); that still counts as live because the site answered.
 *  - returns: copied from the store's own returns page or terms (found via search and read that day). When a store
 *    does not publish a window, `returns` is left empty and the UI says the policy is unclear. Nothing is guessed.
 *  - Stores with `returns` empty are link-only: Shopmate links to their search page but states no policy.
 */
export const STORES_REVIEWED = "2026-11-21";

export interface LocalStore {
  name: string;
  /** Search URL with {q} where the product name goes. */
  search: string;
  /** What the store covers, kept to what is public and well documented. */
  delivery: string;
  returns?: string;
  returnsUrl?: string;
  /** Holiday or other notes, shown under the returns line. */
  note?: string;
  /** Ships from abroad (import fees may apply). */
  international?: boolean;
}

const EU_NOTE = "EU law gives you 14 days to withdraw from most online purchases.";

const AMAZON_GLOBAL: LocalStore = {
  name: "Amazon.com (AmazonGlobal)",
  search: "https://www.amazon.com/s?k={q}",
  delivery: "Ships eligible items to many countries. Delivery is offered only if checkout accepts your address; shipping and import fees are charged at checkout.",
  returns: "Most items 30 days from delivery; international returns may cost extra.",
  returnsUrl: "https://www.amazon.com/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKWX7",
  international: true,
};
const ALIEXPRESS: LocalStore = {
  name: "AliExpress",
  search: "https://www.aliexpress.com/w/wholesale-{q}.html",
  delivery: "Ships from China and local warehouses to most countries. Delivery times and fees vary by seller.",
  returns: "Buyer Protection refunds orders that are missing, damaged or not as described. Change-of-mind returns depend on the seller.",
  returnsUrl: "https://www.aliexpress.com/s/buyerprotection-s/index",
  international: true,
};
export const INTERNATIONAL: LocalStore[] = [AMAZON_GLOBAL, ALIEXPRESS];

const jumia = (cc: string, domain: string, country: string, returns?: string): LocalStore => ({
  name: `Jumia ${country}`, search: `https://www.${domain}/catalog/?q={q}`,
  delivery: `Online marketplace delivering across ${country}, with home delivery and pickup stations.`,
  ...(returns ? { returns } : {}),
});
const amazonLocal = (domain: string, country: string, returns?: string, returnsUrl?: string, note?: string): LocalStore => ({
  name: `Amazon.${domain.split("amazon.")[1]}`, search: `https://www.${domain}/s?k={q}`,
  delivery: `Amazon's ${country} store, delivering nationwide.`,
  ...(returns ? { returns } : {}), ...(returnsUrl ? { returnsUrl } : {}), ...(note ? { note } : {}),
});

export const LOCAL_STORES: Record<string, LocalStore[]> = {
  NG: [
    { ...jumia("NG", "jumia.com.ng", "Nigeria"), returns: "15 days for Jumia Official Store items, 7 days for other eligible items. Phones and electronics must have the seal unbroken." },
    { name: "Konga", search: "https://www.konga.com/search?search={q}", delivery: "Nigerian online marketplace delivering nationwide, with Konga drop-off locations.",
      returns: "7 days from delivery for eligible items (wrong, defective, damaged or not as described; change of mind for unused fashion only). Beauty and personal care cannot be returned.",
      returnsUrl: "https://backend.konga.com/return-policy" },
    { name: "Slot", search: "https://slot.ng/?s={q}", delivery: "Nigerian phone and electronics chain with stores and online orders.",
      returns: "Refunds and returns only for dead-on-arrival items: report within 24 hours, replacement within 7 days. Other faults are repaired under warranty.",
      returnsUrl: "https://slot.ng/warranty-policy" },
    { name: "Pointek", search: "https://www.pointekonline.com/?s={q}&post_type=product", delivery: "Nigerian online electronics store, prices in naira." },
  ],
  GB: [
    { ...amazonLocal("amazon.co.uk", "UK", "Most items 30 days from delivery.", "https://www.amazon.co.uk/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKWX7",
      "Holiday: most items bought Nov 1 to Dec 25, 2026 can be returned until Jan 31, 2027.") },
    { name: "Argos", search: "https://www.argos.co.uk/search/{q}/", delivery: "UK retailer with home delivery and store collection.",
      returns: "30 days from collection or delivery for unused items in original packaging.",
      returnsUrl: "https://help.argos.co.uk/help/refunds-&-returns/returns-product-support-and-repairs/returnsproductsupportrepairs",
      note: "Holiday: items bought Sep 23 to Dec 25, 2026 can be returned until Jan 31, 2027." },
    { name: "Currys", search: "https://www.currys.co.uk/search?q={q}", delivery: "UK electronics retailer with home delivery and stores.",
      returns: "30 days. Online orders can be returned even if opened for inspection, if like new with all accessories.",
      returnsUrl: "https://www.currys.co.uk/services/shopping-with-us/returns-refunds.html" },
    { name: "John Lewis", search: "https://www.johnlewis.com/search?search-term={q}", delivery: "UK department store with home delivery and Click & Collect.",
      returns: "30 days in original condition with proof of purchase.", returnsUrl: "https://www.johnlewis.com/customer-services/returns",
      note: "Holiday: gifts bought Oct 1 to Dec 24, 2026 can be returned until Jan 23, 2027." },
  ],
  DE: [
    { ...amazonLocal("amazon.de", "German", "30-day return guarantee only for some categories (sport, clothing, shoes, watches, jewellery, Amazon devices). Electronics fall back to the 14-day legal withdrawal right.",
      "https://www.amazon.de/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKWX7", "Holiday: most items bought Nov 1 to Dec 25, 2026 until Jan 31, 2027.") },
    { name: "OTTO", search: "https://www.otto.de/suche/{q}/", delivery: "German online retailer and marketplace delivering across Germany.",
      returns: "30 days from receipt, free returns.", returnsUrl: "https://www.otto.de/shoppages/lp_ruecksendung",
      note: "Items sold by OTTO and ordered since Nov 1, 2026 can be returned until Jan 31, 2027." },
    { name: "MediaMarkt", search: "https://www.mediamarkt.de/de/search.html?query={q}", delivery: "German electronics chain with home delivery and store pickup.",
      returns: "30 days from receipt (not for marketplace sellers).", returnsUrl: "https://www.mediamarkt.de/de/service/umtausch-rueckgabe",
      note: "Purchases Oct 27 to Dec 1, 2026 can be returned until Dec 31, 2026." },
    { name: "Saturn", search: "https://www.saturn.de/de/search.html?query={q}", delivery: "German electronics chain with home delivery and store pickup.",
      returns: "30 days from receipt, free returns (not for marketplace sellers).", returnsUrl: "https://www.saturn.de/de/service/umtausch-rueckgabe",
      note: "Purchases Oct 27 to Dec 1, 2026 can be returned until Dec 31, 2026." },
  ],
  FR: [
    { ...amazonLocal("amazon.fr", "French", "14 days (legal withdrawal) for electronics and computing; 30 days for eligible categories marked on the product page.",
      "https://www.amazon.fr/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKWX7") },
    { name: "Fnac", search: "https://www.fnac.com/SearchResult/ResultList.aspx?Search={q}", delivery: "French retailer with home delivery and store pickup.",
      returns: "15 days from purchase or delivery.", returnsUrl: "https://www.fnac.com/retour-produit" },
    { name: "Darty", search: "https://www.darty.com/nav/recherche?text={q}", delivery: "French electronics and appliance chain with home delivery.",
      returns: "15 days from purchase or delivery; free in store, by post at your cost.",
      returnsUrl: "https://www.darty.com/assets/darty-cms-hub/pdf/cg/conditions-generales-de-vente.pdf" },
    { name: "Cdiscount", search: "https://www.cdiscount.com/search/10/{q}.html", delivery: "French online retailer and marketplace delivering across France.",
      returns: "14 days (legal withdrawal right).", returnsUrl: "https://i2.cdscdn.com/cgv/documents/cgv_20260304_033619.pdf" },
  ],
  CA: [
    { ...amazonLocal("amazon.ca", "Canadian", "Most items 30 days from delivery; Apple products 15 days.", "https://www.amazon.ca/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKWX7",
      "Holiday: most items bought Nov 1 to Dec 31, 2026 until Jan 31, 2027.") },
    { name: "Best Buy Canada", search: "https://www.bestbuy.ca/en-ca/search?search={q}", delivery: "Canadian electronics retailer with home delivery and store pickup.",
      returns: "30 days for most products; phones on a carrier plan 15 days.",
      returnsUrl: "https://www.bestbuy.ca/en-ca/help/returns-and-exchanges/best-buy-return-and-exchange-policies",
      note: "Holiday: purchases Nov 2 to Dec 31, 2026 until Jan 10, 2027." },
    { name: "Walmart Canada", search: "https://www.walmart.ca/search?q={q}", delivery: "Walmart's Canadian store with delivery and pickup.",
      returns: "90 days for most items; consumer electronics 30 days." },
  ],
  IN: [
    { ...amazonLocal("amazon.in", "Indian", "Electronics usually have a 7 or 10 day replacement window, shown on each product page.", "https://www.amazon.in/gp/help/customer/display.html?nodeId=202111910") },
    { name: "Flipkart", search: "https://www.flipkart.com/search?q={q}", delivery: "Indian online marketplace delivering across India.",
      returns: "Electronics usually 7-day replacement; some brands need a service-centre check.", returnsUrl: "https://stories.flipkart.com/flipkart-product-returns-process" },
    { name: "Croma", search: "https://www.croma.com/searchB?q={q}", delivery: "Indian electronics chain with home delivery and stores.",
      returns: "7-day replacement for mobiles, laptops and tablets if defective or damaged; refunds only if no replacement stock.", returnsUrl: "https://www.croma.com/cancellation-and-return" },
  ],
  ZA: [
    { name: "Takealot", search: "https://www.takealot.com/all?qsearch={q}", delivery: "South African online retailer delivering nationwide, with pickup points.",
      returns: "30 days from delivery for change of mind; defects within 6 months.", returnsUrl: "https://terms-and-policies.takealot.com/" },
    { ...amazonLocal("amazon.co.za", "South African", "Most items 30 days from receipt; defects within 6 months.", "https://www.amazon.co.za/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKWX7") },
    { name: "Makro", search: "https://www.makro.co.za/search/?text={q}", delivery: "South African retailer with delivery and stores.",
      returns: "14 days for unused change-of-mind returns; phones only if defective within 7 days.", returnsUrl: "https://www.makro.co.za/pages/return-policy-new" },
    { name: "Incredible", search: "https://www.incredible.co.za/catalogsearch/result/?q={q}", delivery: "South African electronics chain with delivery and stores.",
      returns: "7-day cooling-off period for online orders (return costs deducted); defects within 6 months.", returnsUrl: "https://www.incredible.co.za/services/terms-and-conditions" },
  ],
  KE: [
    jumia("KE", "jumia.co.ke", "Kenya", "7 days for eligible items."),
    { name: "Kilimall", search: "https://www.kilimall.co.ke/search?q={q}", delivery: "Kenyan online marketplace; local warehouse items and overseas items.",
      returns: "7 days free returns for local warehouse and local seller items; overseas items only for quality issues." },
  ],
  GH: [
    jumia("GH", "jumia.com.gh", "Ghana", "7 days for eligible items."),
    { name: "Franko Trading", search: "https://www.frankotrading.com/?s={q}&post_type=product", delivery: "Ghanaian phone and electronics retailer with stores and delivery.",
      returns: "Returns, exchanges or refunds within 7 days of purchase." },
  ],
  AE: [
    { ...amazonLocal("amazon.ae", "UAE", "Most items 15 days from receipt; some categories 30 days.", "https://www.amazon.ae/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKWX7") },
    { name: "noon", search: "https://www.noon.com/uae-en/search/?q={q}", delivery: "Online marketplace delivering across the UAE.",
      returns: "15 days from receipt for eligible items.", returnsUrl: "https://www.noon.com/uae-en/return-policy/" },
    { name: "Sharaf DG", search: "https://uae.sharafdg.com/?q={q}", delivery: "UAE electronics chain with delivery and stores.",
      returns: "14 days from collection or home delivery.", returnsUrl: "https://uae.sharafdg.com/return-exchange-and-warranty/" },
  ],
  AU: [
    { ...amazonLocal("amazon.com.au", "Australian", "Most unused items fulfilled by Amazon 30 days for change of mind; Apple 14 days.", "https://www.amazon.com.au/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKWX7") },
    { name: "JB Hi-Fi", search: "https://www.jbhifi.com.au/search?query={q}", delivery: "Australian electronics chain with delivery and click and collect.",
      returns: "30 days for a refund on most unused, unopened items." },
    { name: "Officeworks", search: "https://www.officeworks.com.au/shop/officeworks/search?q={q}", delivery: "Australian retailer with delivery and stores.",
      returns: "30 days change of mind in store, unused and in original packaging.", returnsUrl: "https://www.officeworks.com.au/information/policies/return-policy" },
  ],
  BR: [
    { name: "Mercado Livre", search: "https://lista.mercadolivre.com.br/{q}", delivery: "Brazilian marketplace delivering nationwide.",
      returns: "30 days after receipt for new products; free when you changed your mind.", returnsUrl: "https://www.mercadolivre.com.br/compra-garantida" },
    { ...amazonLocal("amazon.com.br", "Brazilian", "Most physical products 30 days after delivery.", "https://www.amazon.com.br/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKWX7") },
    { name: "Magazine Luiza", search: "https://www.magazineluiza.com.br/busca/{q}/", delivery: "Brazilian retailer delivering nationwide.",
      returns: "7 calendar days from receipt.", returnsUrl: "https://atendimento.magazineluiza.com.br/hc/pt-br/articles/360046394831" },
  ],
  JP: [
    { ...amazonLocal("amazon.co.jp", "Japanese", "30 days from delivery; opened items returned for your own reasons get a 50% refund.", "https://www.amazon.co.jp/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKWX7") },
    { name: "Rakuten Ichiba", search: "https://search.rakuten.co.jp/search/mall/{q}/", delivery: "Japanese marketplace of independent shops delivering in Japan.",
      returns: "No platform-wide window: each shop sets its own terms, so check the shop's return notes." },
    { name: "Yodobashi", search: "https://www.yodobashi.com/?word={q}", delivery: "Japanese electronics chain delivering nationwide.",
      returns: "Unopened, unused items within 8 days of delivery; defects within 30 days.", returnsUrl: "https://www.yodobashi.com/ec/support/afterservice/return_exchange/index.html" },
  ],
  // Link-only: site verified live, return policy not reviewed, so the report says unclear.
  MX: [amazonLocal("amazon.com.mx", "Mexican"), { name: "Mercado Libre", search: "https://listado.mercadolibre.com.mx/{q}", delivery: "Latin American marketplace delivering across Mexico." }],
  ES: [amazonLocal("amazon.es", "Spanish")],
  IT: [amazonLocal("amazon.it", "Italian")],
  NL: [{ name: "bol", search: "https://www.bol.com/nl/nl/s/?searchtext={q}", delivery: "Dutch online retailer delivering in the Netherlands and Belgium." }, amazonLocal("amazon.nl", "Dutch")],
  BE: [{ name: "bol", search: "https://www.bol.com/be/nl/s/?searchtext={q}", delivery: "Online retailer delivering in Belgium." }, amazonLocal("amazon.com.be", "Belgian")],
  PL: [amazonLocal("amazon.pl", "Polish")],
  TR: [amazonLocal("amazon.com.tr", "Turkish")],
  EG: [jumia("EG", "jumia.com.eg", "Egypt"), amazonLocal("amazon.eg", "Egyptian")],
  SA: [amazonLocal("amazon.sa", "Saudi"), { name: "noon", search: "https://www.noon.com/saudi-en/search/?q={q}", delivery: "Online marketplace delivering across Saudi Arabia." }],
  MA: [jumia("MA", "jumia.ma", "Morocco")],
  CI: [jumia("CI", "jumia.ci", "Côte d'Ivoire")],
  SN: [jumia("SN", "jumia.sn", "Senegal")],
  UG: [jumia("UG", "jumia.ug", "Uganda")],
  PK: [{ name: "Daraz", search: "https://www.daraz.pk/catalog/?q={q}", delivery: "Online marketplace delivering across Pakistan." }],
  BD: [{ name: "Daraz", search: "https://www.daraz.com.bd/catalog/?q={q}", delivery: "Online marketplace delivering across Bangladesh." }],
  SG: [amazonLocal("amazon.sg", "Singapore"), { name: "Lazada", search: "https://www.lazada.sg/catalog/?q={q}", delivery: "Online marketplace delivering across Singapore." }],
  MY: [{ name: "Lazada", search: "https://www.lazada.com.my/catalog/?q={q}", delivery: "Online marketplace delivering across Malaysia." }],
  TH: [{ name: "Lazada", search: "https://www.lazada.co.th/catalog/?q={q}", delivery: "Online marketplace delivering across Thailand." }],
  PH: [{ name: "Lazada", search: "https://www.lazada.com.ph/catalog/?q={q}", delivery: "Online marketplace delivering across the Philippines." }],
};

const EU = new Set(["IE", "DE", "FR", "ES", "PT", "IT", "NL", "BE", "AT", "SE", "DK", "FI", "PL", "CZ", "GR", "RO"]);

/** Stores for a country: local ones first, then international stores that ship there. */
export function storesFor(country: string): LocalStore[] {
  const local = (LOCAL_STORES[country] || []).map((s) => (EU.has(country) && !s.returns ? { ...s, note: EU_NOTE } : s));
  return [...local, ...INTERNATIONAL];
}
export const hasLocalStores = (country: string) => (LOCAL_STORES[country] || []).length > 0;
export const searchUrl = (s: LocalStore, q: string) => s.search.replace("{q}", encodeURIComponent(q.trim()).replace(/%20/g, s.search.includes("={q}") ? "+" : "-"));
