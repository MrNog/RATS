# RatStash — bag window background (1:1, NO text)

## v3 (2026-09-29) — art on the RIGHT, plain on the left

The free space in a bag window is on the **right** (short rows end on the left). The addon now keeps the
**right edge** of the picture on the tall bags window and lays a dark fade from the left, like Okanvil's
wallpaper. So the subject lives in the **right third**; the left two thirds stay plain.

```
Digital fantasy illustration, square 1:1 (1024x1024), World of Warcraft cinematic concept art, dark-souls Horde style, painterly, subtle film-grain texture overlay.

Subject: a tall, tattered black war banner hanging straight down along the RIGHT third of the image, from the top edge to near the bottom, its torn tail ending in ragged strips. On the banner, a large dull-bronze painted rat's head in profile facing left, with a notched ear and long whiskers. The banner hangs from a dark iron pole across the top right. Behind everything, a plain dark stone wall.

Composition: the banner and rat head occupy only the RIGHT third; the LEFT two thirds are empty, calm dark stone with no objects. Big simple shapes, so the banner still reads when small icons cover parts of it.

Light & palette: very dark — charcoal stone, black cloth, dull bronze paint; one soft light from the upper right grazing the banner, the left side falling into deep shadow. Nothing bright.

Render quality: CLEAN — no particles, no speckled noise, no haze, no bloom.

Do NOT include: any lettering, name, number, logo or Horde insignia; a full rat body or more than one rat head, a cute or cartoon rat; anything on the left two thirds; bright colours, gold glow, shiny metal; many small objects; blood, gore; plain white background.
```

## v2 (2026-09-29) — one big embossed crest (rejected: centered, covered by the icons)

v1 (the supply cellar, below) was too busy: behind the icons nobody could tell what it was. v2 uses
**one large, simple shape in the center** so it stays recognisable under the items and survives the crop
to a tall (bags) or wide (bank) window.

```
Digital fantasy illustration, square 1:1 (1024x1024), World of Warcraft cinematic concept art, dark-souls Horde style, painterly, subtle film-grain texture overlay.

Subject: the flap of a huge, old black leather war-satchel seen flat and straight on, filling the whole square. In the exact center, a large embossed crest pressed into the leather: a fierce rat's head in profile facing left, with a notched ear and long whiskers, inside a simple round shield outline. The crest is tooled into the leather (raised relief), its edges catching a thin line of dull bronze light. Around it, plain dark leather with a few worn scratches and a double row of stitching running around the outer edge of the square.

Light & palette: very dark — near-black leather, deep brown, dull bronze only on the raised edges of the crest; one soft light from the top, fading to black at the corners. The crest is the only thing that stands out, and only gently.

Composition: symmetrical, the crest centered and large (about half the width of the image), nothing else competing. Big simple shapes, no small detail, so it still reads when covered by small icons and when cropped to a tall or a wide rectangle.

Render quality: CLEAN — no particles, no speckled noise, no haze, no bloom.

Do NOT include: any lettering, name, number, logo or Horde insignia; a full rat body, more than one rat head, a cute or cartoon rat; bright colours, gold glow, shiny metal; busy texture or many small objects; blood, gore; plain white background.
```

## v1 — the supply cellar

Background art behind the RatStash bag and bank windows (WoW addon). It sits **under a grid of 37px item
icons**, so it must be dark and quiet: texture and mood, not a scene to look at.

- **Square 1:1**, export 1024×1024. It becomes a 512×512 BLP (DXT5) in `RatStash/Media/`
  (`scripts/png2blp_dxt5.py`); the addon crops it to the window's shape and lays a dark fade on top.
- The bags window is **tall**, the bank **wide**: keep the interest spread and low-contrast, nothing
  important at the very edges.
- **No rat** (a figure behind the icons would be cut to pieces). The guild's stash is the subject.
- **NO text, logo, watermark or insignia.**

```
Digital fantasy illustration, square 1:1 (1024x1024), World of Warcraft cinematic concept art, dark-souls Horde style, painterly brushwork, subtle film-grain texture overlay.

Scene: the inside of a Horde war-quartermaster's hidden supply cellar, seen straight on like a wall of shelving — dark rough-hewn timber shelves and iron-banded wooden crates, stacked leather satchels and travel packs with brass buckles, rolled furs, a few sealed potion bottles, a small heap of old gold coins and a battered lockbox half in shadow. Faded black-and-gold Horde cloth draped over one crate. Stone wall behind, cracked and old.

Light & palette: very dark and low-contrast overall — charcoal, iron, deep brown leather, muted bronze; one soft warm lantern glow low in the lower-left corner fading out, everything else in deep shadow. The middle of the image is the darkest and calmest area. No bright spots, no strong highlights.

Composition: even, texture-like, no single focal point, no object in the exact center. Detail stays soft and slightly blurred so small icons laid on top remain readable. Nothing important touching the edges.

Render quality: CLEAN — clear air, NO floating dust motes, NO ember particles, NO speckled glowing dots, NO haze, NO bloom.

Do NOT include: any character, rat, person, face or creature; any lettering, title, name, watermark, logo or Horde insignia; bright colours, pastel or pink; strong highlights or glowing center; floating dust/ember particles, speckled noise, heavy haze, excessive bloom; modern objects; Alliance symbols; plain white background.
```
