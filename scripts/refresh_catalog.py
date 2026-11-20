#!/usr/bin/env python3
"""Shopmate catalog refresh.

1. Re-prices existing products in USD from real public sources:
   - Open Prices (prices.openfoodfacts.org): crowdsourced, dated receipts from US stores (Walmart, Target, ALDI...)
     for any product with a `barcode`.
   - Offer files (--offers): dated US retailer listings (store, URL, USD price) gathered by the Shopmate agent
     with its shopping search. Each entry is validated (USD, sane ratio to the last price) before use.
2. Adds a few NEW popular products per run, discovered from recent USD receipts on Open Prices, with the
   product's own Open Food/Beauty Facts photo (CC BY-SA) processed into Shopmate tiles and credited.
3. Never invents a price: if nothing fresh is found, the last price and its date are kept.
4. Writes src/data/catalog.json (+ CREDITS.md), and with --deploy builds, commits and deploys to Vercel prod.

Usage:  python3 scripts/refresh_catalog.py [--offers FILE ...] [--new 4] [--deploy] [--dry-run]
Env:    SHOPMATE_IMG_PY  python with Pillow (+ rembg for cutouts), default: python3
        VERCEL_BIN       vercel CLI path, default: vercel
Runs non-interactively (no prompts). Exit code 0 on success.
"""
import argparse, datetime as dt, json, os, re, subprocess, sys, tempfile, time, urllib.parse, urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "src/data/catalog.json")
CREDITS = os.path.join(ROOT, "CREDITS.md")
PUB = os.path.join(ROOT, "public/products")
UA = "Shopmate-catalog-refresh/1.0 (+https://shopmate-web-xi.vercel.app)"
TODAY = dt.date.today().isoformat()
OP = "https://prices.openfoodfacts.org/api/v1"

# Open Food Facts category tag -> Shopmate category
CAT_MAP = [
    (r"toothpaste|toothbrush|deodorant|shampoo|shower|body-wash|razor|mouthwash|oral", "toiletries"),
    (r"skin|lotion|cream|lip|cosmetic|make-up|sunscreen", "beauty"),
    (r"baby|infant", "baby"),
    (r"dishwashing|detergent|cleaning|laundry|paper-towel|toilet-paper", "household"),
    (r"beverage|drink|juice|soda|water|coffee|tea", "drinks"),
    (r"snack|cereal|breakfast|pasta|rice|sauce|biscuit|cookie|chocolate|spread|canned|dairy|cheese|bread|nut", "groceries"),
]


def get_json(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                return json.load(r)
        except Exception as e:  # network hiccup: back off and retry
            if i == tries - 1:
                print(f"  ! {url[:90]}: {e}", file=sys.stderr)
                return None
            time.sleep(2 * (i + 1))


def op_latest_usd(code, max_age_days=365):
    d = get_json(f"{OP}/prices?product_code={code}&currency=USD&order_by=-date&size=5")
    if not d or not d.get("items"):
        return None
    cutoff = (dt.date.today() - dt.timedelta(days=max_age_days)).isoformat()
    for it in d["items"]:
        if it.get("date", "") >= cutoff and it.get("price"):
            loc = (it.get("location") or {}).get("osm_name") or "US store"
            return dict(price=round(float(it["price"]), 2), date=it["date"], name=f"{loc} (Open Prices receipt)",
                        url=f"https://prices.openfoodfacts.org/products/{code}")
    return None


def apply_offers(cat, files, report):
    byid = {p["id"]: p for p in cat["products"]}
    for f in files:
        for o in json.load(open(f)):
            p = byid.get(o.get("id"))
            if not p:
                report["rejected"].append((o.get("id"), "unknown id"))
                continue
            if o.get("currency", "USD") != "USD" or not o.get("url") or not (o.get("price") or 0) > 0:
                report["rejected"].append((p["id"], "not a USD listing with a URL"))
                continue
            ratio = o["price"] / max(p["price"], 0.01)
            lo, hi = (0.25, 4) if p.get("priceUpdatedAt") else (0.1, 10)  # seed prices were converted, so allow more drift once
            if not (lo <= ratio <= hi) and not o.get("force"):
                report["rejected"].append((p["id"], f"price ratio {ratio:.2f} looks like a different product"))
                continue
            set_price(p, o["price"], o.get("date", TODAY), o.get("seller", "US retailer"), o["url"], report)


def set_price(p, price, date, name, url, report):
    old = p["price"]
    p.update(price=round(float(price), 2), currency="USD", priceUpdatedAt=date, priceSource={"name": name, "url": url})
    report["refreshed"].append((p["id"], old, p["price"], name))


def discover_new(cat, n, img_py, dry, report):
    """Most-receipted US products in the last 60 days that we don't carry yet."""
    have = {p.get("barcode") for p in cat["products"]}
    since = (dt.date.today() - dt.timedelta(days=60)).isoformat()
    counts, sample = defaultdict(int), {}
    for page in range(1, 9):
        d = get_json(f"{OP}/prices?currency=USD&date__gte={since}&order_by=-date&size=100&page={page}")
        if not d or not d.get("items"):
            break
        for it in d["items"]:
            prod = it.get("product") or {}
            code = it.get("product_code")
            if not code or code in have or not prod.get("image_url") or not prod.get("product_name") or not prod.get("brands"):
                continue
            counts[code] += 1
            sample.setdefault(code, (it, prod))
    ranked = sorted(counts, key=lambda c: -counts[c])
    used_cats, added = defaultdict(int), 0
    for code in ranked:
        if added >= n:
            break
        it, prod = sample[code]
        tags = " ".join(prod.get("categories_tags") or [])
        cat_id = next((c for rx, c in CAT_MAP if re.search(rx, tags)), None)
        if not cat_id or used_cats[cat_id] >= 2:
            continue
        latest = op_latest_usd(code, 60)
        if not latest:
            continue
        brand = prod["brands"].split(",")[0].strip()
        name = prod["product_name"].strip()
        qty = (prod.get("quantity") or "").strip()
        title = re.sub(r"\s+", " ", f"{brand} {name}" if brand.lower() not in name.lower() else name)
        if qty and qty.lower() not in title.lower():
            title += f" {qty}"
        pid = f"op-{code}"
        if dry:
            report["added"].append((pid, title, latest["price"], latest["name"]))
            added += 1
            used_cats[cat_id] += 1
            continue
        src = os.path.join(tempfile.gettempdir(), f"{pid}.jpg")
        try:
            urllib.request.urlretrieve(prod["image_url"].replace(".400.", ".full.") if ".400." in prod["image_url"] else prod["image_url"], src)
        except Exception:
            try:
                urllib.request.urlretrieve(prod["image_url"], src)
            except Exception as e:
                report["rejected"].append((pid, f"image download failed: {e}"))
                continue
        r = subprocess.run([img_py, os.path.join(ROOT, "scripts/process_image.py"), src,
                            os.path.join(PUB, f"{pid}.webp"), os.path.join(PUB, "light", f"{pid}.webp")], capture_output=True, text=True)
        if r.returncode != 0:
            report["rejected"].append((pid, "image processing failed: " + r.stderr.strip()[-200:]))
            continue
        offdom = "openbeautyfacts" if cat_id in ("toiletries", "beauty") else "openfoodfacts"
        cat["products"].append({
            "id": pid, "title": title[:90], "category": cat_id, "price": latest["price"], "currency": "USD",
            "image": f"/products/{pid}.webp", "merchant": "Shopmate partner store", "brand": brand,
            "product_type": name.split(" ")[-1].lower(), "size": qty or None, "barcode": code,
            "priceUpdatedAt": latest["date"], "priceSource": {"name": latest["name"], "url": latest["url"]},
            "imageCredit": {"source": f"https://world.{offdom}.org/product/{code}", "license": "CC BY-SA 3.0 (Open Food Facts contributors)"},
            "addedAt": TODAY,
        })
        have.add(code)
        used_cats[cat_id] += 1
        added += 1
        report["added"].append((pid, title, latest["price"], latest["name"]))


def write_credits(cat):
    if not os.path.exists(CREDITS):
        return
    s = open(CREDITS).read()
    rows = [f"| {p['title']} | [{p['imageCredit']['source'].split('/')[2]}]({p['imageCredit']['source']}) | {p['imageCredit']['license']} |"
            for p in cat["products"] if p.get("imageCredit") and p["imageCredit"]["source"] not in s]
    if rows:
        marker = next((m for m in ("\nClose equivalents:", "\n## Other") if m in s), None)
        s = s.replace(marker, "\n".join(rows) + "\n" + marker, 1) if marker else s + "\n" + "\n".join(rows) + "\n"
        open(CREDITS, "w").write(s)


def sh(cmd):
    print("$", " ".join(cmd))
    subprocess.run(cmd, cwd=ROOT, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offers", action="append", default=[], help="JSON list of {id, price, currency, seller, url, date}")
    ap.add_argument("--new", type=int, default=4, help="new products to add this run")
    ap.add_argument("--deploy", action="store_true", help="build, commit locally and deploy to Vercel prod")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    img_py = os.environ.get("SHOPMATE_IMG_PY", sys.executable)
    cat = json.load(open(CATALOG))
    report = {"refreshed": [], "added": [], "rejected": [], "kept": []}

    for p in cat["products"]:
        p.setdefault("priceUpdatedAt", None)
        p.setdefault("priceSource", {"name": "Seed catalog (not yet re-checked)", "url": ""})
        if p.get("barcode"):
            hit = op_latest_usd(p["barcode"])
            if hit:
                set_price(p, hit["price"], hit["date"], hit["name"], hit["url"], report)
    apply_offers(cat, a.offers, report)
    done = {r[0] for r in report["refreshed"]}
    report["kept"] = [p["id"] for p in cat["products"] if p["id"] not in done]
    if a.new > 0:
        discover_new(cat, a.new, img_py, a.dry_run, report)

    dates = [p["priceUpdatedAt"] for p in cat["products"] if p.get("priceUpdatedAt")]
    cat["pricesUpdatedAt"] = max(dates) if dates else None
    cat["refreshedAt"] = TODAY
    cat["refreshStats"] = {"refreshed": len(report["refreshed"]), "added": len(report["added"]), "kept": len(report["kept"]), "total": len(cat["products"])}

    print(f"Refreshed {len(report['refreshed'])} prices, added {len(report['added'])} products, kept last price for {len(report['kept'])}.")
    for r in report["refreshed"]:
        print(f"  ~ {r[0]}: ${r[1]} -> ${r[2]}  ({r[3]})")
    for r in report["added"]:
        print(f"  + {r[0]}: {r[1]}  ${r[2]}  ({r[3]})")
    for r in report["rejected"]:
        print(f"  x {r[0]}: {r[1]}")
    if a.dry_run:
        return
    json.dump(cat, open(CATALOG, "w"), indent=1, ensure_ascii=False)
    write_credits(cat)
    if a.deploy:
        sh(["npm", "run", "build"])
        sh(["git", "add", "-A", "src/data/catalog.json", "CREDITS.md", "public/products"])
        msg = f"Catalog refresh {TODAY}: {len(report['refreshed'])} prices, {len(report['added'])} new"
        r = subprocess.run(["git", "-c", "user.name=Shopmate", "-c", "user.email=dev@shopmate.local", "commit", "-qm", msg], cwd=ROOT)
        if r.returncode not in (0, 1):
            sys.exit(r.returncode)
        sh([os.environ.get("VERCEL_BIN", "vercel"), "deploy", "--prod", "--yes"])


if __name__ == "__main__":
    main()
