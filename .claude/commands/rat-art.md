---
description: Generate a RATS hero-art image prompt (character card, raid banner, profile banner, Discord icon, iPhone wallpaper, or lore art) — reads the locked style + per-rat character sheets
argument-hint: <format> <rat name> [details] — e.g. "card Skarn, Fury Warrior, twin axes, red/black" | "banner ICC 25" | "icon Grunho" | "wallpaper Kobe"
---

You produce paste-ready ChatGPT/DALL-E image prompts for the **RATS** guild in its locked art style.
Request: `$ARGUMENTS`.

## Read the art system FIRST (source of truth — never re-invent the style)

- **`docs/art/STYLE.md`** — the ONE rule (lock the style, freely vary everything else), locked style tokens,
  the "Do NOT include" clause, content-safety rules, the archetype pose banks, and one **format template**
  per output. Follow it exactly.
- **`docs/art/characters/<main>/<name>.md`** — the rat's saved sheet (locked look, gear, weapon, palette).
  Sheets are grouped in **one folder per main** (e.g. `okanor/okanor.md` + the pack `okanor/okanata.md`,
  `okanor/okanath.md`…). Find a sheet by name with a **recursive search** (`characters/**/<name>.md`) — don't
  assume it's flat. Always check by name:
  - **Exists** → use that locked LOOK so the rat matches every past image of them.
  - **Doesn't exist** and this is a character-specific request → **create it**: copy
    `docs/art/characters/_TEMPLATE.md` → `<main>/<name>.md` (lowercase; put it in the main's folder — a new
    main gets its own folder, an alt goes in its main's folder), fill from `$ARGUMENTS` + the class
    art-direction below, THEN generate. Tell the user you saved a new sheet.

## Pick the format (maps to a template in STYLE.md)

| Ask | Format in STYLE.md |
|---|---|
| `card` / commission / character card | A — Character card (21:9) — also output a COMBAT variant |
| `banner` / raid banner | F — Raid banner (16:9, ICC style) |
| `profile` / profile banner / hero strip | B — Profile banner (4:1, NO text) |
| `icon` / avatar / discord icon | C — Discord icon (1:1, face crop, NO text) |
| `wallpaper` / phone / iphone | D — iPhone wallpaper (9:19.5, dark zones for clock/home-bar) |
| `lore` / story art | E — Lore moment (NO text) |
| `warchiefs` / `officers` · `fangs` · `ceremony` | G · H · I |

If the format is unclear, ask which one.

## The ONE rule (from STYLE.md) — apply to EVERY prompt

**Lock only the style tokens; make pose · stance · camera · framing · position · lighting · environment ·
weather · mood FRESH and different every time.** The pose banks are inspiration to riff on, not a menu —
invent new poses/scenes, never repeat one used recently. Stay in the rat's **archetype** (Casters / Melee /
Tanks / Ranged / Stealth) so the pose fits the class. **Casters:** don't default to "floating" — rotate.
Then describe the pose in 2–3 concrete sentences (camera + what each limb/weapon does).

## Class → art direction (to fill a new sheet or infer missing details)

- **Fire Mage:** amber/orange/gold, warm hearth/lava fire (NO red, NO lightning); dark ruined landscape.
- **Frost Mage:** ice-blue + white, crystalline; frozen tundra. **Arcane:** violet + silver, rune circles; astral void.
- **Shadow Priest / Warlock:** purple + black, void tendrils, skulls; corrupted cathedral / blight.
- **Holy Paladin / Disc Priest:** gold + ivory, radiant rays; siege field / sanctum.
- **Resto/Balance Druid:** emerald + moonsilver, vines; forest ruins. **Feral:** antlers, pelts, claws.
- **Enh/Ele Shaman:** blue-white lightning, totems, lava. **DK:** frost-blue runes, bone/black plate, green eyes.
- **Rogue:** shadow, twin blades, smoke, crimson. **Hunter:** brown-green, companion, wilderness.
- **Warrior:** heavy battle-worn plate, siege/arena.

## Anatomy & gear — state it explicitly (models get this wrong)

Follow STYLE.md's **anatomy & gear correctness** rule in every prompt: the rat has **exactly ONE tail**, no
extra limbs/heads. **Name the weapon(s), count them, say which hand** — a two-hander is in BOTH hands; a
shield goes on the OTHER hand (never stacked with the weapon); add "NO extra weapons, ONLY the weapon(s)
listed." Carry ONLY the gear from the character sheet — don't invent a spare dagger etc. (e.g. Rellik =
greatsword in both hands, NO dagger; Okanor = mace in one hand, shield on the other, not the same hand).

## Output

Build from the reusable block(s) in STYLE.md for the chosen format — full style tokens + the "Do NOT include"
clause, correct ratio, no-text formats strip the "Visual identity" line. No preamble, no explaining choices.

- **Card:** output TWO prompts — `## PROMPT 1 — SHOWCASE` (solo heroic, name/title brush text) and
  `## PROMPT 2 — COMBAT` (same rat, a power moment; NEVER use battle/fight/attack/kill/enemy/slay/blood;
  enemies = unnamed dark silhouettes; keep name/font/Horde symbol; different composition each time).
- **Every other format:** output ONE prompt in a fenced code block.

Then a short closer: "Paste into ChatGPT. Want a different pose/scene or angle?" — and mention any sheet you
created or updated.
