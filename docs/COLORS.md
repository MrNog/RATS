# RATS — colour palette

The colours used across the site. **Tokens in `assets/css/theme.css` are the source of truth** — style
through `var(--…)`, never hard-code a token's hex. The non-token sets below (class / raid / status /
Discord) are intentional data-driven exceptions kept in JS.

> Highlight rule: anything you want to draw the eye to (active state, hint, "(click)") uses the **gold accent**.

---

## 1. Core tokens — `theme.css` (`var(--…)`)

| Token            | Hex       | Use                                                     |
| ---------------- | --------- | ------------------------------------------------------- |
| `--accent`       | `#c0943a` | brand gold — primary buttons, highlights, active states |
| `--accent-hi`    | `#e0b860` | gold hover / scrollbar hover                            |
| `--bg`           | `#141517` | page background (darkest)                               |
| `--surface`      | `#202225` | raised chips / secondary buttons                        |
| `--surface-2`    | `#1b1d21` | cards / panels                                          |
| `--surface-3`    | `#16181c` | insets, seclist, scrollbar track                        |
| `--field`        | `#0f1012` | input / textarea background                             |
| `--border`       | `#2f3137` | default 1px borders                                     |
| `--border-2`     | `#34373d` | slightly lighter divider / hover border                 |
| `--field-border` | `#333`    | input borders                                           |
| `--text`         | `#dcddde` | body text                                               |
| `--text-dim`     | `#9aa0a6` | secondary text, icons                                   |
| `--text-dim-2`   | `#8a8d93` | tertiary / muted text                                   |
| `--text-faint`   | `#5e6166` | faint footnotes                                         |
| `--white`        | `#fff`    | titles, emphasis                                        |
| `--ok`           | `#7cfc8a` | success message text                                    |

Non-colour tokens: `--wrap` 960 · `--wrap-wide` 1180 · `--ctl-h` 30px · `--radius` 6 / `-lg` 10 / `-xl` 12.

## 2. Status / semantic (literals — candidates to tokenize)

| Meaning            | Hex                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------ |
| Success / on       | `#7cfc8a` (`--ok`) · progress `#8fdf9f` · bar gradient `#43b581 → #8fdf9f`           |
| Error / danger     | `#ff6b6b` (messages) · `#ff9b9b` (`.del` text) · `#ff8a8a` (mandatory)               |
| Info / accent-blue | `#9ad0ff` (hints, "edit" accent) · link blue `#00a8fc` (Discord-style preview links) |
| Faint label grey   | `#6e7178`                                                                            |

## 3. Discord (matches Discord's own UI — keep as-is)

| Use                      | Hex                                                |
| ------------------------ | -------------------------------------------------- |
| Blurple (mention/border) | `#5865f2`                                          |
| Dark-blue button bg      | `#3b4178` · text `#dfe2ff`                         |
| Embed card bg            | `#2b2d31` · body text `#dbdee1` · footer `#949ba4` |

## 4. Class colours — WotLK (`CLASS_COLOR` in `data.js`)

Colour the **name** by class; never add a Class column.

| Class        | Hex       |     | Class   | Hex       |
| ------------ | --------- | --- | ------- | --------- |
| Death Knight | `#C41E3A` |     | Priest  | `#E6E6E6` |
| Druid        | `#FF7C0A` |     | Rogue   | `#FFF569` |
| Hunter       | `#AAD372` |     | Shaman  | `#0070DD` |
| Mage         | `#3FC7EB` |     | Warlock | `#8788EE` |
| Paladin      | `#F58CBA` |     | Warrior | `#C69B6D` |

## 5. Raid colours (`RAID_COLORS` in `data.js` — the raid-name badge)

| Raid                  | Hex       |     | Raid               | Hex       |
| --------------------- | --------- | --- | ------------------ | --------- |
| ICC (frost blue)      | `#5bc0eb` |     | Naxx (necro green) | `#6fce5a` |
| Ulduar (titan bronze) | `#e0a13e` |     | RS (ruby pink)     | `#ff6b81` |
| ToC (coliseum red)    | `#d9534f` |     | VoA                | `#8ab4f8` |
| Ony (dragon purple)   | `#b76fe0` |     | EoE (teal)         | `#49d6c4` |

## 6. Badge sets (history cards + vacation pills)

Each badge = text / border / background.

| Badge                 | Text      | Border       | Background        |
| --------------------- | --------- | ------------ | ----------------- |
| MANDATORY (red)       | `#ff8a8a` | `#6e2e2e`    | `#3a1c1c`         |
| 💀 FANGS (purple)     | `#e09ad0` | `#5a2e5a`    | `#2e1f33`         |
| ⚪ OPTIONAL (grey)    | `#9aa0a6` | `#3a3d44`    | `#26282d`         |
| CONTINUATION (teal)   | `#5bd6c0` | `#2e5a52`    | `#13302b`         |
| `.del` danger         | `#ff9b9b` | `#5a2e2e`    | `#3a2626` (hover) |
| Vacation · away now   | `#8fdf9f` | `#3a5b42`    | `#23362a`         |
| Vacation · upcoming   | `#9ad0ff` | `#3f5a6a`    | `#2a2f3a`         |
| Vacation · ended      | `#8a8d93` | `#3a3d44`    | `#2a2c31`         |
| Size pill (25/10-man) | `#cfd2d6` | `--border-2` | `--surface`       |

---

_Want a visual swatch page (a `/swatches` dev page) instead of this table? Ask and I'll build one._
