"""Turn a real product photo into Shopmate tiles: 600x600 WebP, dark (maroon/orange glow) and light (cream/peach) variants.
Uses rembg for a clean cutout when available; falls back to a framed card when the cutout looks wrong.
Usage: python process_image.py SRC OUT_DARK OUT_LIGHT [--framed]"""
import sys
from PIL import Image, ImageFilter, ImageDraw

S = 600
_sess = None


def _backdrop(light: bool) -> Image.Image:
    base, glow, k = ((250, 244, 238), (255, 214, 186), 0.9) if light else ((30, 16, 14), (150, 62, 28), 0.75)
    bg = Image.new("RGB", (S, S), base)
    g = Image.new("L", (S, S), 0)
    ImageDraw.Draw(g).ellipse((60, 40, 540, 520), fill=255)
    g = g.filter(ImageFilter.GaussianBlur(110))
    return Image.composite(Image.new("RGB", (S, S), glow), bg, g.point(lambda v: int(v * k)))


def _cutout(im: Image.Image):
    global _sess
    try:
        from rembg import remove, new_session
    except Exception:
        return None
    if _sess is None:
        _sess = new_session("isnet-general-use")
    return remove(im, session=_sess)


def process(src: str, out_dark: str, out_light: str, framed: bool = False) -> str:
    im = Image.open(src).convert("RGBA")
    im.thumbnail((900, 900))
    cut = None if framed else _cutout(im)
    mode = "framed"
    if cut is not None:
        a = cut.split()[-1]
        hist = a.point(lambda v: 255 if v > 128 else 0).histogram()
        cov = hist[255] / (a.width * a.height)
        bbox = a.point(lambda v: 255 if v > 40 else 0).getbbox()
        if bbox and 0.04 < cov < 0.93:
            mode = "cutout"
    for light, out in ((False, out_dark), (True, out_light)):
        o = _backdrop(light)
        if mode == "cutout":
            obj = cut.crop(bbox)
            r = 470 / max(obj.size)
            obj = obj.resize((max(1, int(obj.width * r)), max(1, int(obj.height * r))), Image.LANCZOS)
            x, y = (S - obj.width) // 2, (S - obj.height) // 2 - 10
            sh = Image.new("L", (S, S), 0)
            ImageDraw.Draw(sh).ellipse((x + obj.width * 0.12, y + obj.height - 8, x + obj.width * 0.88, y + obj.height + 26), fill=90 if light else 150)
            o.paste((120, 60, 30) if light else (8, 3, 2), (0, 0), sh.filter(ImageFilter.GaussianBlur(14)))
            o.paste(obj, (x, y), obj)
        else:
            ph = im.convert("RGB")
            ph.thumbnail((470, 470), Image.LANCZOS)
            card = Image.new("RGB", (520, 520), (255, 255, 255) if light else (246, 242, 238))
            card.paste(ph, ((520 - ph.width) // 2, (520 - ph.height) // 2))
            m = Image.new("L", (520, 520), 0)
            ImageDraw.Draw(m).rounded_rectangle((0, 0, 519, 519), 40, fill=255)
            sh = Image.new("L", (S, S), 0)
            ImageDraw.Draw(sh).rounded_rectangle((48, 56, 552, 572), 40, fill=70 if light else 160)
            o.paste((120, 60, 30) if light else (8, 3, 2), (0, 0), sh.filter(ImageFilter.GaussianBlur(16)))
            o.paste(card, (40, 40), m)
        o.save(out, quality=82, method=6)
    return mode


if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    print(process(a[0], a[1], a[2], "--framed" in sys.argv))
