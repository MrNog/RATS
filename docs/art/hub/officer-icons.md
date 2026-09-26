# Officer tool emblems — optional icons for the officer tools home

**Not in use yet.** The tiles of `officer/index.html` show a gold line icon on the left and the tool's art
faded in on the right. These painted emblems could replace the line icons if the tiles ever want them.

Shown at about **48×48** on a tile, so each one is an **emblem, not a scene**: one object, a bold
silhouette, high contrast, readable when tiny. Styled like a **WoW spell / achievement icon** (square,
painted, a thin worn-gold bevel), the same family as [`site-icon.md`](site-icon.md).

- **An object, not a rat.** At 48px a rat is a blur and the object is what says what the tool does.
- **One dominant key light, a different colour per icon**, so the eight read apart at a glance.
- Generate **1024×1024**, save as `images/hub/officer/<key>.png`, run `node scripts/thumbs.mjs`
  (thumbs land in `images/_thumb/hub/officer/<key>.webp`). The page does not load them yet.

Keys: `comp` · `attendance` · `loot-prio` · `roster` · `vacations` · `lore` · `admin` · `okanvil`.

**Shared ending** — paste after each prompt:

> Keep it SIMPLE: one object, big shapes, the object fills about 70% of the square, thick clean edges so it
> reads at 48 pixels. Centered. Square icon frame with a thin worn-gold bevel, dark vignette behind the
> object. World of Warcraft spell-icon style, painterly, grim Horde mood, black iron and worn gold #C0943A.
>
> Do NOT include: any lettering, text, numbers, runes that look like letters, watermark or logo; more than
> one main object; rats, faces or characters; thin fine details that vanish when small; busy background;
> cute or cartoon styling, pastel or pink colours; Alliance symbols; photorealism; blurry edges; floating
> dust or ember particles; heavy bloom.

---

## comp — Raid Comp

```
A square game icon, 1024x1024. A battered war-table map pinned with five small iron banner-flags in a tidy formation, seen from a low three-quarter angle, one flag taller with a blood-red Horde pennant. Key light: warm brazier gold from the upper left.
```

## attendance — Attendance & History

```
A square game icon, 1024x1024. A heavy leather-bound ledger lying open, its page ruled into columns of bold tally marks, an iron quill-knife resting across it. Key light: cold moonlit blue-white from above, the ledger's edges catching it.
```

## loot-prio — Loot Priority

```
A square game icon, 1024x1024. Iron merchant's scales, one pan weighed down by a single glowing epic-purple gem, the other pan raised and empty. Key light: violet epic-loot glow from the gem, rim-lighting the scales.
```

## roster — Guild Roster

```
A square game icon, 1024x1024. Three tall war banners on iron poles standing side by side, stepped in height like ranks, each blood-red cloth with a worn gold Horde insignia, the middle one tallest. Key light: warm sunset orange from behind, silhouetting the poles.
```

## vacations — Vacations

```
A square game icon, 1024x1024. A dented horned iron war-helm set down on a mossy rock, a simple wooden fishing rod leaning against it. Key light: soft golden-hour amber from the right, calm and still.
```

## lore — Lore & Stories

```
A square game icon, 1024x1024. An old open tome with a raven-black quill standing in an inkwell beside it, the pages showing only abstract painted scenes, no writing. Key light: flickering campfire red-orange from below.
```

## admin — Admin Console

```
A square game icon, 1024x1024. A heavy iron key ring with three large ornate keys, the biggest key's bow shaped like a Horde spike crest. Key light: pale steel-grey rim light with one gold glint on the biggest key.
```

## okanvil — Okanvil page

```
A square game icon, 1024x1024. A black iron anvil with a war-hammer resting on it, the anvil's face glowing hot where the hammer struck. Key light: forge orange-white from the glowing metal.
```
