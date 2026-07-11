# RATS hub — working notes

Curated knowledge for the RATS website: the conventions and data contracts that aren't
obvious from the code. Read this and `../CLAUDE.md` before making changes. Deeper
references live in the other `docs/` files (linked below); this page is the map.

The hub is a static site (plain HTML + vanilla JS, no build step, no framework), hosted on
GitHub Pages. Public landing + gated officer tools, merged into one `rats/` folder. See
[`ARCHITECTURE.md`](ARCHITECTURE.md) and the site map in [`ROUTES.md`](ROUTES.md).

## Golden rules

- **Push via the Fork GUI**, no `gh` CLI, no CI build. Pages publishes on push. Leave the
  repo commit-ready; don't push unless asked.
- **Edit source in `Projects\rats`** — never the live WoW AddOns copy of anything.
- **Run locally with a server** (`python -m http.server 8000` or Live Server) — `file://`
  blocks fetch/crypto/webhooks.
- **Firebase is the source of truth** and reads cost money (free tier). Never re-fetch on
  toggle/filter — re-render from already-loaded data. Cache heavy reads in `localStorage`
  with a TTL. Read only the node you need. Public pages must not read the big encrypted
  nodes (`roster`, `history`).

## Design system

Tokens live in `assets/css/theme.css`; components in `assets/css/ui.css`. **Style through
tokens, never hard-code** the gold, a width, or a control height.

- Accent **gold `#c0943a`** (`var(--accent)`) on dark `#141517`. Highlight/accent text is
  always gold — never blue or green.
- **Class colours:** colour the *name* by class, don't add a Class column. WotLK map in
  `assets/js/utils.js` `classColor()` (falls back to `#fff` for unknown).
- Nav/card icons = gold line-SVG (Feather/Lucide, `stroke="currentColor"`). Emoji only for
  brand flavour (🧀 🐀).
- **Inline JS strings: ASCII only.** Smart quotes, em dashes, ellipsis survive the HTML but
  break JS string literals at parse time.
- Dates always via `fmtDate()` → `26 Jul 2026`. Date pickers always via `RatsCal`
  (`assets/js/datepicker.js`), never the native `<input type="date">`.

## Guild voice

Horde faction (use Horde spell/term names — the user is Horde). Rat/cheese flavour.
**Never** the word "colleagues".

## Roster & counting

- **Ranks** (WoW rank = Discord role): Sewer Rat → Raider Rat → Warchief's Fangs →
  Warchief Rat (+ Pug). Blood-red title art is the **Fangs tier only**.
- **MAINS count = real people, not toons.** An entry is an ALT if rankIndex 4, OR "alt" in
  the rank name, OR the officer note starts with "<Main> alt". The in-game addon Home and
  the website must give the same count.
- One hierarchy icon per member, highest wins: 👑 GM > ⭐ Officer > 💀 Fang.

## Loot & raids — data contracts (must match the addon)

The addon (Okanvil) exports loot; the hub imports and merges it. Keep these in sync.

- **Export contract** (`L.SessionJSON` in the addon): each drop is
  `{ts, player, class, itemId, name, icon, quality, boss, raid, size, runId, de, boe, tip}`.
  See [`LOOT_EXPORT.md`](LOOT_EXPORT.md).
- **Import is a MERGE, keyed by `ts + itemId`** (deliberately NOT including `player`): the
  winner is corrected on the site, so a re-import must never overwrite it. Existing drops
  are enriched with addon-owned fields (`tip/icon/quality/boe/boss`), never `player`.
- **Item quality colour:** names coloured 0–5 by WoW rarity via `qualityColor(q)` (default
  epic when missing). Fed by the addon's exported `quality` field.
- **Item tooltips on hover** come from the addon scanning the client's real GameTooltip —
  no Wowhead dependency. Socket squares are recovered from the line text (the client sends
  them as plain grey). "Copy missing ids" → `/okdebug scan` in game → paste the dictionary
  back to backfill history whose in-game sessions were deleted.
- **A raid's unique key is `r.id` (a UUID), not its date.** Two raids on one day coexist;
  always resolve via `findRaid(ref)` where `ref = r.id || r.date` (date only for legacy
  id-less entries). `instKey(r)` splits lockout obligations by difficulty — ToC Normal and
  ToC Heroic are separate mandatory 25s.
- **Loot Priority** = fairness metric (attendance × items won), officer-only, excludes
  fragments/mats + unusable armor (one armor type per class, WotLK proficiencies).

## Rankings & logs (wow-logs API)

- **The real API is NOT the draft we sent the dev.** Ground truth:
  [`WOWLOGS_API.md`](WOWLOGS_API.md) (`api.` subdomain, Bearer key, `data.log` nested).
  Some fields we assumed (`activity`, `biggestHit`) don't exist — weight raw dps/hps.
- **Cost-safe flow:** officer's Fetch computes one `rankings` snapshot → Firebase; visitors
  read it once per visit (TTL 30 min) and filter client-side. Zero extra reads.
- **API key** shared via encrypted Firebase `config/logsApiKey` + localStorage cache;
  managed in the admin console (`RatsData.saveApiKey/loadApiKey/clearApiKey`).
- Progression can be rich: hard mode is the `difficulty` enum (`_HC`/`_NM`), NOT a null
  `hardmode` field; `durationSec`+`start` on every fight enable timelines.

## Hero art

The guild art system lives in `docs/art/` — `STYLE.md` (locked style tokens + a template
per format) and `characters/<main>/<main>.md` (ONE sheet per player; alts in an `## Alts`
section at the bottom, never a separate file). Read `STYLE.md` before any art prompt.
