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

## API contract (wow-logs dev)

Base: `https://wow-logs.co.in/api/v1/guild/{realm}/{guild}/`

### Endpoints
- `GET /latest` — latest report + its fights
- `GET /reports?limit=10` — last N reports for backfill

### Success 200
```json
{
  "ok": true,
  "data": {
    "report": {
      "reportId": "20459",
      "reportUrl": "https://wow-logs.co.in/20459",
      "raid": "icc",
      "size": 25,
      "uploadedAt": "2026-06-25T23:55:00Z"
    },
    "fights": [
      {
        "encounter": "Festergut",
        "boss": true,
        "kill": true,
        "hardmode": false,
        "start": "2026-06-25T21:14:03Z",
        "durationSec": 220,
        "players": [
          {
            "name": "Kobee", "class": "Rogue", "spec": "Assassination",
            "dps": 6210, "hps": 0, "damage": 13662000, "healing": 0,
            "deaths": 0, "interrupts": 2, "damageTaken": 410000,
            "overhealing": 0, "activity": 0.97,
            "biggestHit": { "ability": "Mutilate", "amount": 18234 }
          }
        ]
      }
    ]
  }
}
```
A wipe = same shape with `"kill": false`. For `/reports`: `data.reports: [{ report, fights }]`.

### Field reference
**report:** `reportId`, `reportUrl`, `raid` (slug: icc/ulduar/toc…), `size` (10|25), `uploadedAt` (ISO)

**fights[]:** `encounter` (stable name — group by this), `boss` (bool), `kill` (bool), `hardmode` (bool),
`start` (ISO), `durationSec`, `players[]`

**players[]:** `name`, `class` (full WotLK name e.g. "Death Knight"), `spec`, `dps`, `hps`, `damage`,
`healing`, `deaths`, `interrupts`, `damageTaken`, `overhealing`, `activity` (0–1),
`biggestHit { ability, amount }`

### Errors
`{ "ok": false, "error": { "code", "message" } }` + matching HTTP status.
Codes: `400 BAD_REQUEST` · `404 NOT_FOUND` · `429 RATE_LIMITED` · `500 SERVER_ERROR`

## Fetch strategy
- First run (empty history): `/reports?limit=10` for backfill.
- Subsequent runs: `/latest` only.
- After fetch: compute rankings client-side → write one JSON blob to Firebase `rankings` node.
- `SAMPLE` constant in the page is the data contract + fallback while API is not live (`RANKINGS_URL` empty).
