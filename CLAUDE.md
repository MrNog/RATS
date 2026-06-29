# RATS — project rules & conventions

Static site for the WoW (WotLK 3.3.5 / Warmane) Horde guild **RATS**. Public **hub** + gated
**officer tools**, merged into this one `rats/` folder. Read this before adding features so you don't
re-derive the conventions.

## What this is / how it ships
- Plain **HTML + vanilla JS**, no build step, no framework. Hosted on **GitHub Pages**.
- The user **deploys via the Fork GUI** (no `gh` CLI, no CI build). Leave the repo commit-ready; don't push unless asked.
- Edit the source **here in `Projects\rats`** — never the live WoW AddOns copy.

## Layout
- Root = **public hub** (everyone): `index.html`, `addons.html`, `gallery.html`, `vacations.html`.
- `officer/` = **officer tools**, gated by the guild key: `index.html`, `guild.html`, `comp.html`,
  `history.html`, `vacations.html`, `lore.html`, `files.html`, `admin.html`, `changelog.html`.
- `assets/data.js` = shared data layer (`RatsData`): encryption, gate, Firebase, vacations/members helpers.
- `images/<category>/`, `downloads/` (patch-y.mpq), `files/` (officer sheets), `scripts/` (gallery builder).
- `docs/` = **maintainer-only, gitignored** (`PROMPTS.md` image-prompt library, PLAN/DEV/IDEAS). Never push.

## Data — Firebase is the source of truth
- Realtime DB via unauthenticated REST: `https://rats-tools-default-rtdb.europe-west1.firebasedatabase.app/rats/<node>.json`
- Nodes: `roster` (encrypted), `history` (encrypted), `vacations` (plain, push-keyed),
  `members` (plain name+class, for the public picker), `changelog` (plain), `gate`.
- Officer roster/history are **AES-encrypted** (PBKDF2 from the guild key). The gate overlay (`RatsData.gate()`)
  locks officer pages until the key is entered. "Admin" = anyone with the key (`localStorage.ratsGuildKey`).
- Members can only write plain nodes (`vacations`). They can't read webhooks/encrypted data — so the
  **officer tool** does any Discord posting on their behalf (poll + announce pattern).

## Formatting rules
- **Dates display as `26 Jul 2026`** everywhere (helper `fmtDate`, accepts ISO or dd-mm-yyyy).
- **Date pickers use the shared dark calendar** `assets/datepicker.js` — it auto-enhances every
  `<input type="date">` into a themed button + popup (keeping the input as the value holder, so
  `.value` reads and `input`/`change` listeners still work). After rendering inputs dynamically call
  `RatsCal.enhanceAll()`; after a programmatic `.value` reset call `RatsCal.sync()`. Opt into the raid
  "WED — JUN 26" label with `data-cal-format="weekday"` (default is `26 Jun 2026`). Don't reintroduce
  the native picker or day/month/year dropdowns.
- **Class colors**: WotLK map (DK `#C41E3A`, Druid `#FF7C0A`, Hunter `#AAD372`, Mage `#3FC7EB`,
  Paladin `#F58CBA`, Priest `#E6E6E6`, Rogue `#FFF569`, Shaman `#0070DD`, Warlock `#8788EE`,
  Warrior `#C69B6D`). Color the **name** by class instead of adding a Class column.
- Accent gold = `#c0943a`. Dark UI (`#141517` bg).
- **Highlight color = gold.** Any time you want to draw the eye to a word/hint/accent (e.g. a "(click)"
  cue, an active state, a small callout), use the gold accent `#c0943a` (`var(--accent)`), not blue/green/etc.

## Icons
- **Navigation / card icons = gold line-SVG** (Feather/Lucide style, `stroke="currentColor"` so they
  inherit the gold title color). Match the Addons/Gallery icons.
- **Emoji** are kept only for **brand/flavor** (🧀 cheese, 🐀 rat) and section/button accents — not for nav tiles.

## Discord webhooks & cards
- Webhooks live in `localStorage.ratsWebhooks` (named); matched by keyword: `/vacation/i`, `/log|okanor/i`.
- Build every embed from **one builder function** (e.g. `buildVacEmbed`) so the live preview === what's posted.
- Use **Discord dynamic timestamps** (`<t:unix:D>` / `:R`) for live, localized dates + countdowns.
- Discord renders the **embed title white** — class/person color only shows on the **left bar**.
- Vacation cards carry a **per-class quip** (seeded by name+start so preview matches the post).

## Vacations rules
- **25-man = mandatory** (counts for everyone since join date); **10-man = optional** (counts for Fangs
  + whoever actually played). **Vacations are excused.** New members protected by join date.
- **On +add** → post the "will be away" card. **Day before start** → post a reminder. Each flagged so it posts once.
- **Ended vacations auto-delete** as soon as they're over (keeps the DB tidy).
- **Public (guildies) vacations page**: can add + see a live preview, **no remove, no calendar**.
- **Officer vacations page**: edit/remove/repost + the **month calendar** (calendar is officers-only).
- "Currently away" shows a **progress bar** (day X/N · %). Lists are **boxed collapsible sections**
  (`.seclist`, scroll, sticky header), ordered **chronologically by start date**.

## Changelog / dev-log
- Authored in `officer/changelog.html` → writes to the `changelog` node.
- Default: posts to **#okanor-logs** (the detailed dev log). Tick **🌐 show on public hub** only for **major** updates.
- **Public hub** drawer shows only `pub` entries (clean, major) + a **notification badge** (unseen count,
  clears on open). **Officer drawer** shows **all** entries (🌐 marks public ones).

## Roster (officer/guild.html)
- **Fangs** marked with 💀 (`data.fangs`); **join dates** (`data.joined`); import is a **merge** that
  preserves fangs + join dates and auto-dates new members.
- One **hierarchy icon** per member, highest wins: 👑 GM > ⭐ Officer > 💀 Fang (never doubled).
- Each row has a 🔗 **Warmane armory** link: `https://armory.warmane.com/character/<Name>/Onyxia/summary`.
- **Low-level (<80)** toons grouped in a collapsed section at the bottom.
- Name matching: `NAME_ALIASES` (Discord nick → in-game) + alt→main; exact/alias only, no fuzzy guessing.

## Guild voice
- Horde faction (use Horde spell/term names). Rat/cheese flavor. **Never** the word "colleagues".

## Automation (GitHub Actions)
- `build-gallery.yml` — rebuilds `gallery.json` from `images/**` on push.
- `release-notify.yml` — notifies Discord when a watched addon cuts a release (`releases.json`, state in `release-state.json`).
