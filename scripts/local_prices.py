#!/usr/bin/env python3
"""Fetch real local prices for top Shopmate products from retailers with public, machine-readable search.

- Nigeria: Pointek (WooCommerce Store API, NGN)
- South Africa: Takealot (public search API, ZAR)

A price is only recorded when the store's listing title contains every required token for that product and
none of the excluded ones, so a "Pro Max" never stands in for a base model. The matched listing title, URL and
check date are saved, so the UI can show exactly what was matched. Nothing is ever estimated or invented.
Writes src/data/local_prices.json.  Usage: python3 scripts/local_prices.py
"""
import datetime as dt, html, json, os, re, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src/data/local_prices.json")
UA = "Mozilla/5.0 (Shopmate local price check; +https://shopmate-web-xi.vercel.app)"
TODAY = dt.date.today().isoformat()

# id: (search query, required tokens, excluded tokens)
TARGETS = {
    "w-hp4": ("Sony WH-CH510", ["ch510"], []),
    "d-ele1": ("Galaxy Buds2", ["buds2"], ["pro", "buds2 pro", "live"]),
    "w-hp3": ("JBL Live 650", ["jbl", "live 650"], []),
    "d-pho4": ("iPhone 15 128GB", ["iphone 15", "128"], ["pro", "plus", "max"]),
    "d-pho6": ("iPhone 15 Pro Max 256GB", ["iphone 15 pro max", "256"], []),
    "d-pho3": ("Galaxy A16", ["a16"], []),
    "d-gam1": ("PlayStation 5 Slim", ["slim"], ["portal", "controller only", "cover", "skin", "game", "stand", "digital"]),
    "w-lp3": ("MacBook Air M1", ["macbook air", "m1"], []),
    "w-lp1": ("Acer Aspire 5", ["acer", "aspire 5", "i5"], []),
    "w-lp2": ("IdeaPad Slim 3 Ryzen 5", ["ideapad", "slim 3", "ryzen 5"], []),
    "w-ms1": ("Logitech M185", ["m185"], []),
    "w-sp1": ("Soundcore Select 4 Go", ["select 4 go"], []),
    "w-sw1": ("Fitbit Inspire 3", ["inspire 3"], []),
    "d-com3": ("Samsung 870 EVO 1TB", ["870", "1tb"], []),
    "d-off3": ("Casio fx-991CW", ["991cw"], []),
    "d-foo1": ("Nike Air Force 1", ["air force 1"], ["wallet", "card", "keychain", "socks"]),
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def norm(s):
    return re.sub(r"[^a-z0-9 ]+", " ", html.unescape(s).lower().replace("-", "")).replace("  ", " ")


# Accessories and used stock never count as the product itself.
ACCESSORY = ["case", "cover", "strap", "straps", "pads", "pad", "laces", "shoelaces", "protector", "charger", "cable", "skin",
             "compatible", "sticker", "replacement", "pre owned", "preowned", "refurbished", "used", "sleeve", "stand", "for"]


def ok(title, req, exc):
    t = " " + re.sub(r"\s+", " ", norm(title)) + " "
    return all(norm(x).strip() in t for x in req) and not any(f" {norm(x).strip()} " in t for x in exc + ACCESSORY)


def pointek(q, req, exc):
    rows = get("https://www.pointekonline.com/wp-json/wc/store/v1/products?per_page=20&search=" + urllib.parse.quote(q))
    hits = []
    for p in rows:
        pr = p.get("prices") or {}
        if not p.get("is_purchasable", True) or pr.get("currency_code") != "NGN" or not ok(p["name"], req, exc):
            continue
        price = int(pr["price"]) / (10 ** int(pr.get("currency_minor_unit", 0)))
        if price > 0 and p.get("is_in_stock"):
            hits.append({"title": html.unescape(p["name"]), "price": price, "url": p["permalink"], "inStock": bool(p.get("is_in_stock"))})
    hits.sort(key=lambda h: (not h["inStock"], h["price"]))
    return hits[0] if hits else None


def takealot(q, req, exc):
    d = get("https://api.takealot.com/rest/v-1-11-0/searches/products?qsearch=" + urllib.parse.quote(q))
    hits = []
    for r in d.get("sections", {}).get("products", {}).get("results", [])[:20]:
        pv = r.get("product_views", {})
        c, bb = pv.get("core", {}), pv.get("buybox_summary", {})
        prices = bb.get("prices") or []
        if not prices or not ok(c.get("title", ""), req, exc + ["parallel import"]):
            continue
        hits.append({"title": c["title"], "price": float(min(prices)), "url": f"https://www.takealot.com/{c['slug']}/PLID{c['id']}", "inStock": True})
    hits.sort(key=lambda h: h["price"])
    return hits[0] if hits else None


STORES = [("NG", "Pointek", "NGN", pointek), ("ZA", "Takealot", "ZAR", takealot)]


def main():
    out = {"checkedAt": TODAY, "note": "Real listings matched by required title tokens. Not estimates.", "prices": {}}
    for pid, (q, req, exc) in TARGETS.items():
        for country, store, cur, fn in STORES:
            try:
                h = fn(q, req, exc)
            except Exception as e:  # network or format issue: record nothing
                print(f"  ! {store} {pid}: {e}")
                h = None
            if h:
                out["prices"].setdefault(pid, []).append({"country": country, "store": store, "currency": cur, "date": TODAY, **h})
                print(f"  + {pid} {store}: {h['title']} {cur} {h['price']:,.0f}")
            time.sleep(0.6)
    json.dump(out, open(OUT, "w"), indent=2, ensure_ascii=False)
    print(f"Wrote {sum(len(v) for v in out['prices'].values())} local prices to {OUT}")


if __name__ == "__main__":
    main()
