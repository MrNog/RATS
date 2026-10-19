# Generic class banners (profile fallback)

Per-class profile banners used when a toon has **no custom art**. The profile hero cascade is:

`<main>/<name>.png` → `<main>/<main>.png` → **`_class/<slug>.png`** (these) → CSS no-art gradient.

**What they are (since 19 Oct 2026):** one generic, anonymous rat per class (helmet, hood or mask, so
nobody mistakes it for a raider's portrait). They're the same images as Okanvil's Ranking-card
fallback. These files are 4:1 strips cut from the 2:1 originals in
[`../../okanvil/class-rats/`](../../okanvil/class-rats/). The prompts are in
`docs/art/addon/okanvil-class-defaults.md`.

## Files (10 — lowercased slugs, match `CLASS_ICON` in `profile.js`)

| Class | File | Accent (class colour) |
|-------|------|-----------------------|
| Death Knight | `deathknight.png` | `#C41E3A` |
| Druid | `druid.png` | `#FF7C0A` |
| Hunter | `hunter.png` | `#AAD372` |
| Mage | `mage.png` | `#3FC7EB` |
| Paladin | `paladin.png` | `#F58CBA` |
| Priest | `priest.png` | `#E6E6E6` |
| Rogue | `rogue.png` | `#FFF569` |
| Shaman | `shaman.png` | `#0070DD` |
| Warlock | `warlock.png` | `#8788EE` |
| Warrior | `warrior.png` | `#C69B6D` |

- **Format:** 2400×600 (4:1), the same shape as the character banners.
- **The left third stays dark** (the page overlays the name and spec there); the rat sits on the right.
- **To redo one:** replace the 2:1 original in `images/okanvil/class-rats/`, then cut a 4:1 band across
  the full width at about the head and shoulders, and resize it to 2400×600.
