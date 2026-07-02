# RATS — project rules & conventions

Static site for the WoW (WotLK 3.3.5 / Warmane) Horde guild **RATS**. Public **hub** + gated
**officer tools**, merged into this one `rats/` folder. Read this before adding features so you don't
re-derive the conventions.

## What this is / how it ships

- Plain **HTML + vanilla JS**, no build step, no framework. Hosted on **GitHub Pages**.
- The user **deploys via the Fork GUI** (no `gh` CLI, no CI build). Leave the repo commit-ready; don't push unless asked.
- Edit the source **here in `Projects\rats`** — never the live WoW AddOns copy.

## Layout

- **One folder per page**, served as `index.html` at a clean URL. Each page folder also holds its own
  `pagename.css` + `pagename.js` (no inline `<style>`/`<script>`).
- Root = the **hub** (`index.*`, the public landing). **Public pages** live in `public/`: `public/addons/`,
  `public/gallery/`, `public/vacations/` (and `public/rankings/` when built). The root stays clean: hub · `public/` · `officer/` · `assets/`.
- `officer/` = **officer tools**, gated by the guild key: `index.*`, `guild/`, `comp/`,
  `history/`, `lore/`, `files/`, `admin/`, `changelog/`. (Vacations is **one shared page** at `public/vacations/`
  that reveals officer controls when the guild key is present — see Vacations rules.)
- `assets/css/theme.css` + `assets/css/ui.css` = the **design system** (see below) — linked by every page.
- `assets/js/data.js` = shared data layer (`RatsData`): encryption, gate, Firebase, vacations/members helpers.
- `assets/js/datepicker.js` = `RatsCal` dark calendar.
- `images/<category>/`, `downloads/` (patch-y.mpq), `files/` (officer sheets), `scripts/` (gallery builder).
- `docs/` = maintainer notes (`ARCHITECTURE.md`, `ROUTES.md` = site map, `COLORS.md` = palette, `MIGRATION.md`, `RANKINGS_API_REQUEST.md`), tracked in git.
- `docs/art/` = the hero-art system: `STYLE.md` (locked style tokens + a template per format — card, profile banner, Discord icon, iPhone wallpaper, lore, raid, Warchiefs, Fangs) and `characters/<main>/<main>.md` (**ONE sheet per player, not per toon**). The main's locked look sits at the top; the player's **alts live in an `## Alts` section at the bottom of that same file** (condensed: rat/armor/weapon/signature + palette + scenes per alt) — do NOT create a separate file per alt. Recalled by name via a recursive search `characters/**/*.md` (match the main name or an alt name inside). New player = new folder + one sheet from `_TEMPLATE.md`; new alt = add a block to that player's Alts section. `chronicles/` = guild-history lore pieces (e.g. Val'anyr). The `/rat-art` + `/rats loremaster` skills read these.
- **Run locally with a server** — `file://` blocks fetch/crypto/webhooks. Use VS Code Live Server or `python -m http.server 8000`.

## Design system (`assets/css/theme.css` + `ui.css`)

- **`theme.css`** = design tokens (`:root` CSS vars) + base reset (`body`, `.wrap`/`.wrap.wide`, `h1`/`h2`,
  `code`, gold scrollbar). Linked on **every** page. Change a token here → the whole site follows.
  Key tokens: `--accent`, surfaces (`--surface`/`--surface-2`/`--surface-3`/`--field`), `--border`,
  text (`--text`/`--text-dim`/`--text-dim-2`/`--text-faint`/`--white`), `--ok`, `--wrap` (960) / `--wrap-wide` (1180),
  `--ctl-h` (control height, 30px), `--radius`/`--radius-lg`/`--radius-xl`.
- **`ui.css`** = reusable components: `button` (gold primary) / `button.dark` / `a.btn`·`button.btn` (secondary) /
  `.icon-btn` / `.tbtn` (on-off toggle) / `.del` (danger), `.row`/`.frow`, dark `input`/`select`/`textarea`,
  `.msg`, `.card` (panel), `.pill`, `.seclist`, `h2.sec`/`.caret`/`.cnt` (collapsible header). Linked on all
  content/form pages; the two **landing hubs** link `theme.css` only (they keep a centered splash layout).
- **New page recipe:** make `folder/index.html`, link `theme.css` + `ui.css` + `pagename.css`, write structure
  with the component classes, drop a `pagename.js`. Style everything through tokens — never hard-code the gold,
  a width, or a control height; use the var so one change propagates.
- **Don't reuse a component class name for a different thing.** `.card` is the padded panel; gallery's masonry
  tile is `.tile`, the file tree row is `.ftree` (renamed to avoid colliding with shared components).
- Wide data pages use `<div class="wrap wide">` (1180). `comp/` is the one width exception (1280, set in `comp.css`).

## Data — Firebase is the source of truth

- Realtime DB via unauthenticated REST: `https://rats-tools-default-rtdb.europe-west1.firebasedatabase.app/rats/<node>.json`
- Nodes: `roster` (encrypted), `history` (encrypted), `vacations` (plain, push-keyed),
  `members` (plain name+class, for the public picker), `changelog` (plain), `gate`, `rankings` (plain snapshot).
- Officer roster/history are **AES-encrypted** (PBKDF2 from the guild key). The gate overlay (`RatsData.gate()`)
  locks officer pages until the key is entered. "Admin" = anyone with the key (`localStorage.ratsGuildKey`).
- Members can only write plain nodes (`vacations`). They can't read webhooks/encrypted data — so the
  **officer tool** does any Discord posting on their behalf (poll + announce pattern).

## Firebase cost rules (free tier ~360 MB/day download)

- **Reads cost** — REST reads the whole node each time. Never read on every interaction.
- **Never re-fetch on toggle/filter** — re-render from already-loaded data, no network.
- **Cache in `localStorage` with a TTL** — re-visits within TTL read nothing. Default TTL: 30 min for public pages.
- **Read only the node you need** — never read the whole tree; per-feature nodes only.
- Public pages must not read big encrypted nodes (`roster`, `history`).

## `RatsData` key functions (`assets/js/data.js`)

`gate()`, `loadRoster/saveRoster`, `loadHistory/saveHistory`, `cachedHistory()`,
`loadVacations/addVacation/updateVacation/removeVacation`, `publishMembers/loadMembers`,
`backup()`, `encrypt/decrypt`, `aliasFor(discordNick)`, `fbOn/getPass/setPass/clearPass`.

**`localStorage` keys:** `ratsGuildKey` (officer unlock), `ratsGuild` (decrypted roster cache),
`ratsHistory` (decrypted history cache), `ratsWebhooks` (named webhook array), `ratsAdminKey`,
`ratsRankCache` (rankings snapshot + TTL), `ratsStaleNotifiedFor`, plus per-feature seen-counts.

## Formatting rules

- **Dates display as `26 Jul 2026`** everywhere (helper `fmtDate`, accepts ISO or dd-mm-yyyy).
- **Date pickers use the shared dark calendar** `assets/js/datepicker.js` — it auto-enhances every
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
  - whoever actually played). **Vacations are excused.** New members protected by join date.
- **On +add** → post the "will be away" card. **Day before start** → post a reminder. Each flagged so it posts once.
- **Ended vacations auto-delete** as soon as they're over (keeps the DB tidy).
- **One shared page** at `public/vacations/` for everyone (no separate officer copy). It detects officer mode by
  `localStorage.ratsGuildKey` (`const isOfficer` in `vacations.js`): guildies get add + live preview + **read-only**
  lists (picker from the public `members` node); officers additionally get **edit/remove/repost**, the **month
  calendar**, the day-before reminder preview, and the **auto-announce + purge poll** (picker from the decrypted
  roster). The `vacations` node is plain/world-readable, so this is a UI split, not a security boundary.
- "Currently away" shows a **progress bar** (day X/N · %). Lists are **boxed collapsible sections**
  (`.seclist`, scroll, sticky header), ordered **chronologically by start date**.

## Changelog / dev-log

- Authored in `officer/changelog/` → writes to the `changelog` node.
- Default: posts to **#okanor-logs** (the detailed dev log). Tick **🌐 show on public hub** only for **major** updates.
- **Public hub** drawer shows only `pub` entries (clean, major) + a **notification badge** (unseen count,
  clears on open). **Officer drawer** shows **all** entries (🌐 marks public ones).

## Roster (officer/guild/)

- **Fangs** marked with 💀 (`data.fangs`); **join dates** (`data.joined`); import is a **merge** that
  preserves fangs + join dates and auto-dates new members.
- One **hierarchy icon** per member, highest wins: 👑 GM > ⭐ Officer > 💀 Fang (never doubled).
- Each row has a 🔗 **Warmane armory** link: `https://armory.warmane.com/character/<Name>/Onyxia/summary`.
- **Low-level (<80)** toons grouped in a collapsed section at the bottom.
- Name matching: `NAME_ALIASES` (Discord nick → in-game) + alt→main; exact/alias only, no fuzzy guessing.

## Guild voice

- Horde faction (use Horde spell/term names). Rat/cheese flavor. **Never** the word "colleagues".

## Rankings (rankings/) — logs-fed, public

No attendance here — absences show naturally in the stats. Tabs: **🏆 Leaderboards** (MVP, Top DPS/HPS,
Most improved, Records), **📊 Guild progress** (week-over-week verdicts, per-boss kill times),
**🎉 Fun & shame** (deaths, wipe counter, awards), **📜 Logs** (per-report badges, Fangs-night at ≥5 fangs).

**Data flow (cost-safe):** officer's **🔄 Fetch** (gold, guild-key-gated) calls the wow-logs API, computes,
writes ONE `rankings` snapshot to Firebase. Public visitors read that snapshot **once per visit** (TTL 30 min)
and filter client-side — no extra reads. Full API contract in `docs/RANKINGS_API_REQUEST.md`.
See `.claude/rules/rankings.md` for the full spec when building this page.

## Automation (GitHub Actions)

- `build-gallery.yml` — rebuilds `gallery.json` from `images/**` on push.
- `release-notify.yml` — notifies Discord when a watched addon cuts a release (`releases.json`, state in `release-state.json`). Secret: `LOG_WEBHOOK` = the "Logs" webhook URL.
