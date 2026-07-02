# Generic class banners (profile fallback)

Plain per-class profile banners used when a toon has **no custom art**. The profile hero cascade is:

`<main>/<name>.png` → `<main>/<main>.png` → **`_class/<slug>.png`** (these) → CSS no-art gradient.

**Design intent — keep them PLAIN.** These are the *default*. A commissioned character banner should feel
**special and unique** by contrast, so the class fallback must stay simple: a dark class-coloured backdrop
with a subtle class emblem/motif and NO rat hero, NO character, NO text. Understated on purpose.

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

- **Format:** wide profile strip, ~2400×600 (4:1) — same shape as the character banners.
- **LEFT ~third stays darkest** (the page overlays name/spec there), motif sits centre/right.

## Prompt (fill in CLASS + ACCENT + MOTIF, generate 10 times)

```
Minimal abstract fantasy profile banner, cinematic 4:1 ultra-wide strip (2400x600). NO text, NO title, NO watermark, NO logo, NO character, NO creature, NO rat, NO people — pure simple background only.

A dark, moody, understated backdrop for a [CLASS] class. Deep near-black charcoal base with a single subtle [ACCENT]-coloured glow washing from the right side; the LEFT ~third stays darkest and almost empty (text is overlaid there later). Centre-right holds ONE faint, simple [MOTIF] motif — softly glowing, low-contrast, tasteful, NOT busy. Smooth gradient, soft vignette, gentle film grain.

Deliberately plain and minimal — this is a generic fallback, it must look calm and unremarkable so a detailed commissioned banner stands out beside it. Flat painterly texture, dark-souls muted palette.

Do NOT include: any lettering/text/logo/watermark, any character/creature/rat/person, busy detail, bright saturated colour beyond the single accent glow, a full illustration or scene, plain white background.
```

### MOTIF per class (keep it a simple single emblem/shape)
- **Death Knight** — a faint runeblade / frost-green rune ring
- **Druid** — a soft leaf / antler silhouette
- **Hunter** — a bow curve / arrow line
- **Mage** — a frost/arcane rune circle
- **Paladin** — a shield / radiant sunburst
- **Priest** — a soft holy halo / light shard
- **Rogue** — crossed dagger silhouettes
- **Shaman** — totem / interlocking element sigils
- **Warlock** — a fel rune / summoning circle
- **Warrior** — crossed sword-and-axe / a plain warblade
