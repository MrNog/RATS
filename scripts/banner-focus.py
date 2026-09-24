"""Frame every profile banner for the small cards that reuse it (the rankings podium).

The banners are made for the profile page: wide, the rat on the right, the left side left dark for
the name. A 2:1 card cut from the middle loses the rat. This finds, for each banner, the 2:1 window
that holds the rat and writes it to images/profile-bg/focus.json:

    { "okanor/okanor.png": { "z": 1.35, "x": 0.62, "y": 0.10 }, ... }

z = zoom (banner width / window width), x and y = where the window starts, as a share of the room
the image has to move (0 = left/top edge, 1 = right/bottom edge) — the same meaning as a CSS
background/object position in %.

The rankings podium does not zoom (a card taller than 2:1 plus a zoom cut heads): it only uses the
window's CENTRE to slide the banner sideways, at the card's real size. So what matters in the
preview is that the rat sits in the middle of each crop.

The window comes from where the detail is (edges weighted by brightness), which is the rat on a
dark ground. OVERRIDES wins for the banners where that guess is wrong: look at the preview sheets
(--preview) and add a line.

    python scripts/banner-focus.py            # write focus.json
    python scripts/banner-focus.py --preview  # also write contact sheets to scripts/_focus/
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "images", "profile-bg")
OUT = os.path.join(SRC, "focus.json")
ASPECT = 2.0          # the card's width / height
MIN_ZOOM, MAX_ZOOM = 1.0, 1.8

# hand fixes, same shape as the output: "<main>/<name>.png": {"z":…, "x":…, "y":…}
OVERRIDES = {
    # the guess cut the top of the head (crown, hood, ears): window to the top, less zoom
    "grunho/grunho.png": {"z": 1.45, "x": 1.0, "y": 0.0},
    "khaddash/khaddash.png": {"z": 1.45, "x": 0.8, "y": 0.0},
    "okanor/okanata.png": {"z": 1.09, "x": 1.0, "y": 0.0},
    "fazcafe/fazcafe.png": {"z": 1.35, "x": 0.9, "y": 0.0},
    "jiskob/jiskob.png": {"z": 1.4, "x": 1.0, "y": 0.0},
}


def energy(im):
    g = im.convert("L").resize((400, int(400 * im.height / im.width)))
    a = np.asarray(g, dtype=np.float32) / 255.0
    e = np.asarray(g.filter(ImageFilter.FIND_EDGES), dtype=np.float32) / 255.0
    return e * (0.35 + a)       # detail, and more of it where it is lit


def frame(path):
    im = Image.open(path)
    W, H = im.size
    e = energy(im)
    h, w = e.shape
    col = e.sum(axis=0)
    row = e.sum(axis=1)
    # the subject's horizontal extent: the band holding the middle 70% of the detail
    c = np.cumsum(col) / col.sum()
    x0, x1 = np.searchsorted(c, 0.15), np.searchsorted(c, 0.85)
    r = np.cumsum(row) / row.sum()
    y0, y1 = np.searchsorted(r, 0.08), np.searchsorted(r, 0.80)
    cx = (x0 + x1) / 2 / w
    cy = (y0 + y1) / 2 / h
    # window height: the subject's height with room around it, never taller than the image
    sub_h = (y1 - y0) / h
    win_h = min(1.0, max(sub_h * 1.35, 1.0 / MAX_ZOOM * (W / H) / ASPECT))
    win_w_px = win_h * H * ASPECT
    if win_w_px > W:                     # image narrower than 2:1 at this height: width decides
        win_w_px = W
        win_h = W / ASPECT / H
    z = W / win_w_px
    z = max(MIN_ZOOM, min(MAX_ZOOM, z))
    win_w_px = W / z
    win_h_px = win_w_px / ASPECT
    left = cx * W - win_w_px / 2
    top = cy * H - win_h_px * 0.45       # a little more room above the head than below
    left = max(0, min(W - win_w_px, left))
    top = max(0, min(H - win_h_px, top))
    x = left / (W - win_w_px) if W > win_w_px else 0.5
    y = top / (H - win_h_px) if H > win_h_px else 0.5
    return {"z": round(z, 3), "x": round(x, 3), "y": round(y, 3)}


def crop_of(path, f):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    ww = W / f["z"]
    wh = ww / ASPECT
    left = (W - ww) * f["x"]
    top = (H - wh) * f["y"] if H > wh else 0
    return im.crop((int(left), int(top), int(left + ww), int(top + min(wh, H))))


def main():
    files = sorted(p for p in glob.glob(os.path.join(SRC, "**", "*.png"), recursive=True)
                   if os.sep + "_class" + os.sep not in p)
    out = {}
    for p in files:
        key = os.path.relpath(p, SRC).replace("\\", "/")
        out[key] = OVERRIDES.get(key) or frame(p)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1, sort_keys=True)
    print("framed", len(out), "banners ->", os.path.relpath(OUT, ROOT))

    if "--preview" in sys.argv:
        dst = os.path.join(ROOT, "scripts", "_focus")
        os.makedirs(dst, exist_ok=True)
        keys = sorted(out)
        TW, TH, per = 300, 150, 12
        for n in range(0, len(keys), per):
            chunk = keys[n:n + per]
            sheet = Image.new("RGB", (TW * 3, (TH + 16) * ((len(chunk) + 2) // 3)), "black")
            for i, k in enumerate(chunk):
                t = crop_of(os.path.join(SRC, k), out[k]).resize((TW, TH))
                x, y = (i % 3) * TW, (i // 3) * (TH + 16)
                sheet.paste(t, (x, y + 16))
                ImageDraw.Draw(sheet).text((x + 4, y + 2), f"{n + i + 1}. {k}", fill="yellow")
            sheet.save(os.path.join(dst, f"sheet{n // per + 1}.jpg"), quality=80)
        print("preview sheets ->", os.path.relpath(dst, ROOT))


if __name__ == "__main__":
    main()
