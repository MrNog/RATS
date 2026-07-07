# WoW-Logs Public API — reference (our side)

What the wow-logs dev **actually shipped** (v1, read-only, Bearer keys). This is the ground-truth
reference for building `public/rankings/`. Captured from the live docs + `openapi.json` + a real
`/health` call on 2026-07-06.

> ⚠️ This is the **real, shipped** API — it differs from the draft we originally proposed (that old
> `RANKINGS_API_REQUEST.md` draft has been removed; `.claude/rules/rankings.md` still has the old shape).
> See **§9 Divergences** before touching the page code.

> 💡 **FUTURE FEATURE — server-wide percentiles (Boss Points V2).** `/rankings` returns each guild
> member's **percentile vs the whole server** per boss (`bosses{}`), plus `bossPoints` (0–1000) and
> `averagePercent` — the same "Rank-H/C/R + H%/C%/R%" the site shows when you open a log. Verified live
> 2026-07-06: RATS Ulduar **season 5**, 25-hc/regular → 121 players, e.g. Shmurda 81.4% avg (Thorim
> 97.6%, XT-002 97.2%). **Explore-only for now** (not built). Key facts when we build it:
> - **raid must match the season's scoring phase** or percentiles come back all-null. Onyxia mapping we
>   confirmed: Ulduar = **season 5** (season 4/6 return empty for Ulduar). Use `/meta/seasons` for the
>   live map; drive season off the selected raid.
> - params: `raid` + `season` + `difficulty` (25-hc/10-hc/25-nm/10-nm/overall) + `ladder`
>   (regular/competitive/hardcore) or `ladders=all`. Build boss columns from `data.bossOrder`.
> - `null` percentile = guild didn't kill that boss that season (shows as `-`). Distinct from our
>   INTERNAL parse leaderboards — this is RATS vs the server, great for recruitment/pride.

---

## 1. Base URL & host

```
https://api.wow-logs.co.in/api/v1
```

- **Always use the `api.` subdomain** (DNS-only / grey cloud). The bare `wow-logs.co.in` is behind
  Cloudflare Bot Fight Mode and returns HTML challenges / `403 Forbidden` to scripts and `fetch`.
  Same paths, same keys — just the hostname changes.
- CORS: needs to allow `https://mrnog.github.io` for the browser-only fetch (confirm with dev — the
  page is called straight from GitHub Pages).

## 2. Auth

- Header on **every** request except `/openapi.json`:
  `Authorization: Bearer wl_live_…`
- Keys: `wl_live_` (prod) / `wl_test_` (dev), same limits. Created/revoked at **Account → Public API Keys**.
- Read-only. Only **public** guilds are accessible — private guilds return `404`.

## 3. Rate limits & tiers

| | Free | Pro |
|---|---|---|
| Requests / month | 15,000 | 100,000 |
| Requests / minute | 30 | 300 |
| Active keys | 1 | 5 |
| Log-list `limit` max | **5** | 25 |

- **Our key is `free` tier** (confirmed via `/health`: `monthlyLimit 15000`, `rpmLimit 30`, `logsListMax 5`).
- **Log-list requests cost their `limit` against the RPM budget** — `/logs?limit=5` = 5 of your 30 rpm.
  Use `/logs` for history; use `/logs/latest` or `/logs/{id}` only when you need full fight payloads.
- Responses can be server-cached (`meta.cached: true`).
- **Rate-limit headers** on every response: `X-RateLimit-Limit` (30/min), `X-RateLimit-Remaining` (this
  minute — **DOES** decrement per cost), `X-RateLimit-Cost` (this call's cost), `X-RateLimit-Monthly-Limit`
  (15000), `X-RateLimit-Monthly-Remaining`.
- ⚠️ **`X-RateLimit-Monthly-Remaining` is BROKEN — always `14999`** regardless of how many calls we make
  (verified: 3 real `/logs?limit=5` calls = cost 5 each, per-minute Remaining dropped 30→25→… correctly, but
  Monthly-Remaining stayed 14999 every time). `/health` only returns the *limits*, not usage. So there is **no
  reliable server-side monthly-usage figure**. We therefore track our own monthly total in Firebase
  `apiUsage` ({month,count}), bumped by `Σ X-RateLimit-Cost` per Fetch, shown in the Admin console.
  **📨 TO ASK THE DEV:** *"`X-RateLimit-Monthly-Remaining` seems stuck at 14999 — it never decrements even
  after many billed calls (per-minute `Remaining` works fine). Is monthly usage tracked/exposed anywhere?
  A `used`/`remaining` field on `/health` would let us monitor the 15k quota."*

## 4. Response envelope

```jsonc
// success
{ "ok": true, "data": { … }, "meta": { "apiVersion": "v1", "requestId": "req_…", "cached": true } }
// error
{ "ok": false, "error": { "code": "…", "message": "…" } }
```

Error codes (+ matching HTTP status): `400 BAD_REQUEST` · `401` (bad/missing key) · `404 NOT_FOUND`
(unknown or private guild) · `429 RATE_LIMITED` · `500 SERVER_ERROR`.

## 5. Endpoints (all 11)

All require `Authorization: Bearer` except `/openapi.json`. `{realm}` = server slug (e.g.
`warmane-onyxia`), `{guild}` = guild slug (case-insensitive, e.g. `rats`).

### Meta / reference (build dropdowns, don't hardcode)

| Method · Path | Returns |
|---|---|
| `GET /health` | key validity + tier limits |
| `GET /meta/servers` | all realms: `{id, slug, name, serverName}` |
| `GET /meta/seasons?serverId=3` | active season/phase + `rankingRaid` + `phases[]→primaryRaid`. Omit `serverId` = all |
| `GET /meta/raids?serverId=3&season=6` | raids for a server (`season` optional): `{id, slug, name}` |
| `GET /meta/raids/{raidSlug}/bosses` | canonical boss list + `bossOrder[]` (deduped by name) |
| `GET /meta/ladders` | `regular` / `competitive` / `hardcore` (`{id, name, enum}`) |
| `GET /meta/difficulties` | `25-hc, 10-hc, 25-nm, 10-nm, overall` (`{id, enum, label}`) |

### Guild logs

| Method · Path | Returns |
|---|---|
| `GET /guilds/{realm}/{guild}/logs?limit=5` | **metadata only** history; paginate with `meta…pagination.nextCursor` (pass as `?cursor=`). Weight = `limit`. |
| `GET /guilds/{realm}/{guild}/logs/latest` | latest log, **full fights + players**. Optional `?include=consumables,interrupts` |
| `GET /guilds/{realm}/{guild}/logs/{logId}` | one log, full fights + players. Same shape as `/latest`. Optional `?include=…` |

### Guild rankings (Boss Points V2)

| Method · Path | Returns |
|---|---|
| `GET /guilds/{realm}/{guild}/rankings?raid=&season=&difficulty=&ladder=` | one ladder |
| `…&ladders=all` | `regular` + `competitive` + `hardcore` in one payload |

### Schema

| `GET /api/v1/openapi.json` | machine-readable stub, **no auth** |

## 6. Parameters

- **`raid`** = raid slug (`icc, ulduar, toc, naxx, onyxia, obsidian-sanctum, eye-of-eternity,
  ruby-sanctum, voa`). Get valid slugs from `/meta/raids`.
- **`season`** = integer. **`raid` must match the season's scoring phase** or boss percentiles come back
  empty. Use `/meta/seasons` → `phases[]` to map phase→raid. (Onyxia now: season 6 / phase 3 = `toc`.)
- **`difficulty`** = `25-hc | 10-hc | 25-nm | 10-nm | overall` (note the **hyphen**, not `"25 HC"`).
- **`ladder`** = `regular | competitive | hardcore`; or **`ladders=all`** for all three at once.
- **`include`** (logs only) = comma list, `consumables,interrupts`.
- **`limit`** (logs history) = 1..5 (free) / 1..25 (pro). **`cursor`** = opaque token from `nextCursor`.

## 7. Response shapes (real, from production samples)

### `/logs` (history, metadata only)

```jsonc
data: {
  guild: { id, name, realm: { slug, name } },
  logs: [ {
    logId,                 // number  e.g. 21705
    logUrl,                // "https://wow-logs.co.in/21705"
    title,                 // "TOC"
    uploadedAt,            // ISO
    server: { slug, name, serverName },
    raid:   { slug, name, id },
    size                   // 10 | 25
  } ],
  pagination: { limit, nextCursor }   // nextCursor absent on last page — BUT SEE §7.6, cursor cycles
}
```

> ⚠️ **The history feed does NOT include `logStatus`** — you only learn a log is archived after fetching
> its full detail. So dedup (§7.5) happens after the per-log fetch, not from the history list.

### `/logs/latest` and `/logs/{id}` (full)

```jsonc
data: {
  guild: { id, name, realm },
  log: {
    logId, logUrl, title, uploadedAt,
    server, raid, size,
    logStatus,           // null = Original | "ARCHIVED" = superseded, DISCARD it
    canonicalLogId,      // the Original this archived log was replaced by (null if Original)
    requestedLogId,      // = the id you asked for
    effectiveLogId,      // = canonicalLogId when archived, else self
    fights: [ {
      fightId,             // number
      encounter,           // "Northrend Beasts (kill)" — has (kill)/(wipe) suffix
      boss,                // bool
      bossId, bossName,    // canonical boss id + name (bossName is clean, no suffix)
      kill,                // bool
      hardmode,            // bool | null
      start,               // ISO
      durationSec,         // number
      difficulty,          // ENUM form: "TEN_HC" / "TWENTY_FIVE_HC" …
      players: [ {
        name, class, spec, role,        // class = full WotLK ("Death Knight"); role = "DPS"/"HEALER"/"TANK"
        dps, hps,                       // numbers (floats)
        damage, healing,                // numbers
        // ⚠️ NULL in the truncated docs sample — CONFIRM against a real full object:
        deaths, damageTaken, activity, overhealing, biggestHit
        // with ?include=interrupts   → interrupts (per player)
        // with ?include=consumables  → consumables { … } (shape TBC — see §8)
      } ]
    } ]
  }
}
```

### `/rankings` (single ladder)

```jsonc
data: {
  guild: { id, name, realm },
  bossOrder: [ "Northrend Beasts", "Lord Jaraxxus", … ],   // build columns from THIS
  filters: {
    raid: { slug, name, id },
    difficulty: { id, enum, label },
    ladder,            // "regular" (or "all")
    season             // number
  },
  rankings: {
    players: [ {
      name, class, spec,          // spec often null
      bossPoints,                 // number — the ranking metric
      averagePercent,             // number 0–100
      bosses: { "<bossName>": <percent|null>, … }
    } ]
  }
}
```

### `/rankings?ladders=all`

Same, but `data.ladders = { regular: {players[]}, competitive: {players[]}, hardcore: {players[]} }`
instead of `data.rankings`.

## 7.5 Archived logs — dedup rule (IMPORTANT)

A log can be **re-uploaded** (fixing a bad/split/wrong capture). The old one is flagged and points at the
replacement. On the wow-logs site this is the **"Log status" / "Active log"** columns.

- `logStatus === "ARCHIVED"` → **discard this log entirely.** It's a superseded/erroneous copy; its
  `canonicalLogId` is the good ("Original") log that replaced it.
- `logStatus === null` → **Original**, keep it.
- **Never count an archived log** — it duplicates the same bosses/parses as its canonical. (This is why a
  naive lockout grouping showed "4 logs merged": 2 of them were archived copies of the other 2.)

Real example (RATS, 2026-07-06): `19986 → ARCHIVED → 20458`, `20459 → ARCHIVED → 20922`. So of 11 history
rows, **only 9 are real**. Build history as: fetch each, drop `ARCHIVED`, keep the rest.

> ⚠️ `logStatus` is **only on the full log detail**, not the `/logs` history list. You must fetch a log
> to know if it's archived — factor that into the request budget.

## 7.6 Pagination cursor bug (bug-report candidate)

`/logs` `nextCursor` **cycles back to the start** instead of ending. After the last page it hands out a
cursor that replays page 1. **Do not loop on cursor alone** — dedup by `logId` and stop when a page adds
**zero new ids** (or when `nextCursor` repeats). Report to `#bug-reports`.

## 8. Field trust table (free tier)

**Verified against 11 real RATS logs (268 player-rows), 2026-07-06.** The `null`s are real — the fields
don't exist. Don't build any widget that needs a ❌ field until the dev adds it.

| Field | Where | Status |
|---|---|---|
| `logId, logUrl, title, uploadedAt, raid, size, server` | logs | ✅ always present |
| `logStatus, canonicalLogId, requestedLogId, effectiveLogId` | log detail | ✅ present (see §7.5 dedup) |
| `fightId, encounter, boss, bossId, bossName, kill, start, durationSec, difficulty` | fights | ✅ always present |
| `name, class, spec, role, dps, hps, damage, healing` | players | ✅ **always present** (spec too — not null in real logs) |
| `bossPoints, averagePercent, bosses{}` | rankings | ✅ present |
| `hardmode` | fights | ⚠️ **always `null`** — DON'T use it. Use `difficulty` (`_HC`/`_NM`) for hard mode instead |
| `difficulty` | fights | ✅ **per-fight** `TWENTY_FIVE_HC`/`_NM` — the real hard-mode signal (verified) |
| `durationSec, start` | fights | ✅ on **every** fight incl. wipes — powers timeline, pull-gaps, kill-times |
| `deaths` | players | ❌ **always `null`** (170/170 + 98/98) — no deaths widget |
| `activity, damageTaken, overhealing, biggestHit` | players | ❌ **always `null`** — dev-confirmed absent |
| `interrupts` / `consumables{}` | players | ❌ `?include=` param **returns HTTP 500** — feature broken server-side (bug-report) |

**Structural facts from real logs:**
- **Wipes (`kill:false`) carry `players: []`** — no parse. Only kills have player rows.
- **`difficulty` is per-fight, not per-log** — one log mixes `TWENTY_FIVE_HC` and `TWENTY_FIVE_NM` bosses.
- **`role` is only `DPS`/`HEALER`** — never `TANK` (prot specs show as DPS). Can't split tanks reliably.
- A kill can have `players: []` too (e.g. General Vezax in 20925) — counts as progress, not parse.
- Group by **`bossName`** (clean), not `encounter` (has ` (kill)`/` (wipe)` suffix).

> **Open a bug report** (dev pointed us to `#bug-reports`) for anything that should be there but returns
> `null` — e.g. if `deaths` or `?include=` fields come back empty. Don't assume; report + confirm.

> **📨 TO ASK THE DEV — deaths & damageTaken (blocks Tanking + half of Fun & Shame).** Both are always
> `null`, which kills: a **Tanking leaderboard** (no mitigation/survivability metric) AND the fun **Hall of
> Shame** ideas — "most deaths 💀", per-boss "who died in the wipe", "most damage taken by a non-tank DPS".
> Message to send: *"Could you expose `deaths` (count per player per fight) and `damageTaken` (total, boss-
> only) in the players[] payload? Right now both are null. `deaths` powers a wipe/death hall-of-fame and
> `damageTaken` a tank leaderboard + 'squishy DPS' award. Even just these two would unlock a lot."*
> Until then: the Tanking tab and any deaths/damage-taken widgets are on hold; Fun & Shame ships with the
> damage/healing/duration/wipe data we DO have (carry %, consistency, fastest kills, per-boss wipe counts).

> **✅ HARD MODE — USE `difficulty`, NOT `hardmode`.** (Corrected 2026-07-07 by inspecting real logs.)
> The `fights[].hardmode` bool is always `null` — **ignore it**. But `fights[].difficulty` is **per-fight**
> and reliably carries `TWENTY_FIVE_HC` vs `TWENTY_FIVE_NM` (and the 10-man equivalents). That IS the
> hard-mode signal: verified in real logs — e.g. #21158 XT/Hodir = `_HC`, Kologarn/Thorim/Freya = `_NM`;
> #20922 XT/IC/Hodir/Thorim = `_HC`. So a boss killed on `_HC` = hard mode. One log mixes HC and NM
> bosses. `hm(fight) = /_HC$/.test(fight.difficulty)`. **No dev request needed — the data is already there.**
> Note **Flame Leviathan is vehicle damage** (no guild-player parse), so FL never appears in
> `players[]`/`rows[]`; its kill only shows via `kill:true` on the fight. Don't treat "FL missing from DPS"
> as a bug.

> **✅ RICH PROGRESSION DATA — confirmed present (2026-07-07).** Everything the wow-logs SITE charts, we can
> rebuild from the full-log payload — no extra endpoint:
> - **`durationSec` on EVERY fight** (kills AND wipes) — e.g. Yogg wiped 6× at 64/278/182/517/166/528s.
> - **`start` (ISO) on every fight** → **pull-gap** = `start[i+1] − (start[i] + durationSec[i])`, and a
>   **cumulative-kills timeline** (boss count vs minutes-into-raid).
> - **Guild DPS/HPS** = `Σ player.damage / Σ kill.durationSec` across the run (verified #21158 = 78.5k guild
>   DPS, 191M total, 41m boss time vs 160m raid span = 90m downtime). Compare run-vs-run.
> - **Per-boss best kill time**, **wipes-per-boss** (`kill:false` count), **HC/NM** (via `difficulty`).
> These feed the Guild Progress tab: run-vs-run summary, kill-times bars, pull-gaps bars, cumulative timeline,
> guild-DPS trend, HC progression. `deaths/damageTaken/activity/overhealing/biggestHit` stay null (unusable).

## 9. Divergences from our old draft (MUST fix in the page)

The delivered API is **not** what our old draft / `rules/rankings.md` describe. Fix before coding:

| Our draft expected | Delivered API |
|---|---|
| host `wow-logs.co.in` | `api.wow-logs.co.in` |
| `/guild/{r}/{g}/...` (singular) | `/guilds/{r}/{g}/...` (**plural**) |
| `/latest` | `/logs/latest` |
| `/reports?limit=10` | `/logs?limit=5` (free cap **5**, not 10) |
| `data.report` + `data.fights` (flat) | `data.log` → `log.fights` (**nested**) |
| `report.reportId` (string) | `log.logId` (**number**) |
| `report.raid` (string slug) | `raid: { slug, name, id }` (**object**) |
| `difficulty: "25 HC"` | `difficulty: "25-hc"` (param) / `"TWENTY_FIVE_HC"` (in fight) |
| `interrupts` always present | only with `?include=interrupts` |
| no auth mentioned | **Bearer key required** (officer's key, browser-side) |
| rankings `average` | `averagePercent` |
| rankings `bosses` keyed by encounter | same idea, key = `bossName` from `bossOrder[]` |

## 10. Map: API → rankings page tabs

| Tab / widget | Source | Feasible? |
|---|---|---|
| 🏆 Top DPS / Top HPS | `fights[].players[].dps/hps` | ✅ |
| 🏆 Records (best parse) | iterate `/logs/{id}` history, max per boss | ✅ (N calls — cache!) |
| 🏆 Most improved / Needs work | same player across ≥2 logs over time | ✅ (needs history) |
| 📊 Guild progress | `fights[].kill/durationSec/bossName` (**NOT `hardmode` — null**) | ⚠️ speed+wipes+milestones only, no HM |
| 🎉 Fun & shame — wipe counter | `kill:false` = wipe | ✅ (from fights) |
| 🎉 Fun & shame — deaths | `deaths` | ⚠️ verify, else drop |
| 🎉 Fun awards (drunk/no-prep/well-fed) | `?include=consumables` | ❓ verify, else drop |
| 📜 Logs (per-report badges) | `/logs` metadata + fight kill counts | ✅ |
| Leaderboard columns (Boss Points) | `/rankings` `bossPoints/averagePercent/bosses` | ✅ |

### What we can build **today** with confirmed fields only

Player = `name, class, spec?, role, dps, hps, damage, healing`. Fight = `encounter, bossName, kill,
hardmode, start, durationSec, difficulty`. Rankings = `bossPoints, averagePercent, bosses{}`.

- ✅ **Top DPS / Top HPS** — sort players by `dps` / `hps`.
- ✅ **MVP** — composite from dps/hps/damage/healing (no `activity`, so weight raw output).
- ✅ **Records** — max `dps`/`hps` per boss over history (`damage`/`healing` too).
- ✅ **Most improved / Needs work** — same player's dps/hps across logs over time.
- ⚠️ **Guild progress** — `durationSec` (speed) + `kill:false` (wipes/boss) + first-kill dates (milestones).
  **NOT hard-mode** (`hardmode` is null — see the dev note above); a plain kill counter is meaningless.
- ✅ **Wipe counter** (Fun & shame) — count `kill:false` fights per boss/night.
- ✅ **Logs tab** — per-report badges from `/logs` + fight kill counts.
- ✅ **Boss Points leaderboard** — straight from `/rankings`.
- ❌ **Drop / gate**: any award using `activity` (afk/uptime), `biggestHit`, `damageTaken`,
  `overhealing`. Deaths-based awards and consumable awards = **gate behind a verify** (show only if the
  field is non-null; otherwise hide the widget — never render an empty/zero shame board).

## 11. Known reference values (2026-07-06)

- **RATS** guild: `id 124`, realm `warmane-onyxia`, slug `rats` (case-insensitive). Guild is **public**.
- **warmane-onyxia** = `serverId 3`; active **season 6 / phase 3**, `rankingRaid = toc`.
  Phase→raid map: 1 naxx · 2 ulduar · 3 toc · 4 icc.
- Onyxia raids (`/meta/raids`): naxx, onyxia, eye-of-eternity, obsidian-sanctum, ruby-sanctum, toc,
  ulduar, voa, unsupported-content.

## 12. Fetch strategy for the page (cost-safe)

- Officer's **🔄 Fetch** (guild-key-gated, key stays in their browser) calls the API, computes, writes
  **one `rankings` snapshot** to Firebase. Visitors read that snapshot once/visit (TTL 30 min), filter client-side.
- First run / backfill: `/logs?limit=5` (free cap), then `/logs/{id}` per new report. Subsequent: `/logs/latest` only.
- Respect **30 rpm** — a full backfill of 5 logs = 5 list-weight + 5 detail calls; sequence them, don't burst.
- `SAMPLE` constant in the page stays the fallback while `RANKINGS_URL`/key is empty.
