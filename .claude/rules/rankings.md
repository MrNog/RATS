---
globs: ['rankings/**']
---

# rankings/ — design spec & API contract

Public page, no guild-key required. Officer's **🔄 Fetch** button (gold, visible only with guild key) pulls
the API, computes the snapshot, writes to Firebase `rankings` node. Visitors read once per visit (TTL 30 min),
all filters are client-side — zero extra Firebase reads.

## Tabs

| Tab | Content |
|-----|---------|
| 🏆 Leaderboards | MVP · Top DPS · Top HPS · Most improved · Needs work · Records |
| 📊 Guild progress | Week-over-week verdict · per-boss kill times (✅ killed / ⏳ pending / ✖ no-kill) |
| 🎉 Fun & shame | Deaths · wipe counter · fun awards |
| 📜 Logs | Per-report badges · 💀 Fangs-night badge at ≥5 fangs · filter by raid+size+period |

**Top controls:** raid segment selector (from API `raids[]`) · 25/10-man toggle · Week / Month / All.

**Period semantics on Guild progress:**
- **Week** = this lockout vs last lockout
- **Month** = per-boss best/avg + trend ("vs month avg")
- **All** = guild-best kill ever + fastest full clear (no cross-period comparison)

## API contract

> ⚠️ The draft we sent the dev is **NOT** what shipped. The dev opened the Public API V1 with
> different request/response shapes and said "follow the documentation." **The ground-truth reference
> is [`docs/WOWLOGS_API.md`](../../docs/WOWLOGS_API.md)** — read it before building this page. Summary below.

Base (note the `api.` subdomain and **plural** `guilds`, Bearer key required):
`https://api.wow-logs.co.in/api/v1/guilds/{realm}/{guild}/`

### Endpoints we use
- `GET /logs/latest` — latest log, full fights + players (was `/latest`)
- `GET /logs?limit=5` — metadata-only history, paginate via `nextCursor` (was `/reports?limit=10`; **free cap 5**)
- `GET /logs/{logId}` — one full log, for backfill of older reports
- `GET /rankings?raid=&season=&difficulty=&ladder=` — Boss Points leaderboard

### Real response shape (full log)
`data.log` (nested — NOT `data.report`) → `log.fights[]` → `fights[].players[]`. Ids are **numbers**
(`logId`, `fightId`). `raid`/`server` are **objects** `{slug,name,id}`. `difficulty` in a fight is the
enum form (`"TWENTY_FIVE_HC"`); the `/rankings` param uses `"25-hc"`.

### Fields — CONFIRMED available
- **fights[]:** `encounter`, `bossName`, `boss`, `kill`, `hardmode`, `start`, `durationSec`, `difficulty`
- **players[]:** `name`, `class` (full WotLK), `spec` (often null), `role`, `dps`, `hps`, `damage`, `healing`
- **rankings players[]:** `bossPoints`, `averagePercent`, `bosses{}` (build columns from `data.bossOrder[]`)

### Fields — NOT in the API (dev-confirmed 2026-07-06)
`activity`, `biggestHit`, and per the dev's "etc" assume `damageTaken`/`overhealing` are absent too.
`deaths`, `interrupts` (`?include=interrupts`), `consumables` (`?include=consumables`) are **unverified** —
gate any widget on them (render only if non-null) and open a `#bug-reports` ticket if they come back empty.
**Don't build** MVP/awards that need activity/biggestHit — weight raw dps/hps/damage/healing instead.

### Errors
`{ "ok": false, "error": { "code", "message" } }` + HTTP status.
`400 BAD_REQUEST` · `401` (bad key) · `404 NOT_FOUND` (unknown/private guild) · `429 RATE_LIMITED` · `500 SERVER_ERROR`.

## Fetch strategy
- Officer's key stays browser-side; **30 rpm / 15k month** (free) — log-list weight = `limit`. Sequence, don't burst.
- First run / backfill: `/logs?limit=5` then `/logs/{id}` per new report. Subsequent: `/logs/latest` only.
- Compute client-side → write one JSON blob to Firebase `rankings` node (visitors read once/visit, TTL 30 min).
- `SAMPLE` constant = fallback + data contract while key/`RANKINGS_URL` empty. **Update it to the real nested
  shape before wiring live data** (the current SAMPLE uses the old flat `report`/`reportId` shape).
