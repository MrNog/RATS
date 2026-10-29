# RatBites — app icon, settings background, README banner

## 3. README banner — 21:9 (title text added in the image)

Top of the GitHub README (`RatBites/docs/images/banner.jpg`, shown full width, like RatStash's
1920×809 banner). The one piece that carries the addon's name.

- Export about 1920×820. Save as JPG.

```
Digital fantasy illustration, ultra-wide cinematic banner 21:9 (1920x820), World of Warcraft cinematic concept art, dark-souls Horde style, painterly brushwork, ultra-detailed, subtle film-grain texture overlay.

Scene: ONE lean, battle-scarred rat warrior in battered black-and-gold Horde plate, mid-lunge in the LEFT third, jaws open, biting down on the edge of a huge wooden training dummy in the RIGHT third. Glowing combat numbers burst off the dummy where the blow lands, floating upward in a short arc: big orange crit numbers, smaller grey and gold ones, each with a tiny square spell icon beside it, like World of Warcraft floating combat text. A Horde war camp at dusk behind, out of focus, one torch on the right.

Title: across the upper middle, "RatBites" in rough hand-painted brush-stroke lettering, thick uneven strokes, visible bristle texture and grunge torn edges, sandy tan-gold #C8A96E. Below it, smaller, the tagline "Combat numbers with bite" in the same brush style, grey.

Composition: rat left, dummy right, title centred above the gap between them; the numbers rising between the rat and the title. Keep the bottom 15% calm and dark.

Light & palette: dark and moody — charcoal, iron, deep brown, bronze-gold; the hottest light is the orange glow of the crit numbers and the torch. Rat's face sharp and readable.

Render quality: CLEAN — clear air, no floating dust motes, no ember particles, no haze, no bloom; razor-sharp focus on the rat's face, teeth and the numbers.

Do NOT include: more than one rat, a cute or cartoon rat, chubby build, extra tails or limbs; any text other than "RatBites" and the tagline; misspelled title; real readable spell names; RATS logo or watermark; pastel or pink colours; blood or gore; plain white background.
```

---

# App icon + settings background (NO text)

RatBites draws damage and heal numbers on nameplates and raid frames. Two pieces of art:

## 1. App icon (medallion) — 1:1

Cut round and shown in a gold ring over the settings window's top-left corner, **60×60 px** in game.
So one bold silhouette that still reads small, centered, nothing important near the corners (they are
cut off by the circle).

- Export 1024×1024. Becomes `RatBites/Media/UI/medallion.blp` (128×128, scaled down).

```
Digital fantasy illustration, square 1:1 (1024x1024), World of Warcraft game icon style, painterly, dark-souls Horde mood, bold and simple like a WoW spell icon.

Subject: the head of ONE fierce battle-scarred rat in 3/4 profile facing left, jaws wide open mid-bite, long yellowed incisors bared, whiskers swept back, a notched ear, sharp narrowed eye. Its teeth are sinking into a jagged shard of glowing orange-gold light, the brightest point of the image, cracking apart like a struck blow. Dark fur, a strip of black-and-gold Horde plate at the neck.

Composition: the head and the glowing shard fill about 75% of the square, centered so it survives being cut to a circle; small even margin; nothing important in the four corners. Simple near-black backdrop with a soft circular bronze glow behind the head so the silhouette pops.

Light & palette: one hot orange-gold key light from the shard catching the teeth, the snout and the eye; deep shadow elsewhere; charcoal fur, iron, bronze-gold, blood-orange. High contrast so it reads at 60x60 pixels.

Render quality: CLEAN and crisp — NO sparks, NO embers, NO particles, NO haze, NO bloom. Sharp edges on the teeth and whiskers.

Do NOT include: any lettering, numbers, digits, logo, watermark or Horde insignia; more than one rat or more than one head; a full body; a cute or cartoon rat; blood or gore; a border, frame or ring; busy background; pastel or pink colours; plain white background.
```

## 2. Settings window background — 4:3

Sits behind the RatBites settings window (about 775×600, two columns of setting rows). The addon lays a
dark wash over it, so the art is mood behind the rows, never a scene to read. The medallion covers the
top-left corner.

- Export 1024×768. Becomes `RatBites/Media/settings-bg.blp` (1024×512 DXT5, `png2blp_dxt5.py`).

```
Digital fantasy illustration, wide 4:3 (1024x768), World of Warcraft cinematic concept art, dark-souls Horde style, painterly brushwork, subtle film-grain texture overlay.

Scene: a dark Horde war-camp training yard at dusk seen from low and close: a battered wooden training dummy in the RIGHT third, hacked and splintered, with a rat's deep claw-and-bite marks torn into its straw and leather; a few broken arrow shafts stuck in it. Behind, a rough stone wall and a black-and-gold Horde war banner hanging limp, out of focus.

Composition: the dummy fills the right third, from bottom to about two thirds of the height; the left two thirds and the top-left corner stay plain, calm dark stone and shadow. Big simple shapes, soft detail, so rows of text laid on top stay readable.

Light & palette: very dark and low-contrast — charcoal, iron, deep brown leather, dull bronze; one warm torch glow low on the right grazing the dummy, everything else falling into deep shadow. Nothing bright.

Render quality: CLEAN — no particles, no embers, no speckled noise, no haze, no bloom.

Do NOT include: any character, rat, person or creature (only the marks a rat left); any lettering, number, logo, watermark or Horde insignia text; floating damage numbers; anything in the left two thirds; bright colours, gold glow, shiny metal; blood or gore; pastel or pink colours; plain white background.
```
