# RATS logs API — contract

> ⚠️ **SUPERSEDED (2026-07-06).** This is the shape we *requested*. The dev shipped Public API V1 with
> **different** requests/responses ("follow the documentation") and confirmed `activity`, `biggestHit`
> etc. are **not** available. Build against **[`WOWLOGS_API.md`](WOWLOGS_API.md)** — the real, delivered
> API. Kept here only as the historical request. Do not code to the shape below.

---


The fight-level + rankings feed the `public/rankings/` page consumes (wow-logs dev). Plain JSON, raw numbers,
times in **seconds**, **CORS** enabled for `https://mrnog.github.io`. The full page spec lives in
`.claude/rules/rankings.md`; this doc is just the API shape.

> Called straight from the browser (front-end only, GitHub Pages). Only an officer triggers the fetch — the
> key stays in their browser and the result is cached as one public `rankings` snapshot. `RANKINGS_URL` is
> empty until the API is live, so the page renders the bundled `SAMPLE`.

## Endpoints

- `GET /api/v1/guild/{realm}/{guild}/latest` — latest report + its fights
- `GET /api/v1/guild/{realm}/{guild}/reports?limit=10` — last N reports (array), for backfill

## Success — 200

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
            "name": "Kobee",
            "class": "Rogue",
            "spec": "Assassination",
            "dps": 6210,
            "hps": 0,
            "damage": 13662000,
            "healing": 0,
            "deaths": 0,
            "interrupts": 2,
            "damageTaken": 410000,
            "overhealing": 0,
            "activity": 0.97,
            "biggestHit": { "ability": "Mutilate", "amount": 18234 }
          }
        ]
      }
    ]
  }
}
```

A wipe = same object with `"kill": false`. For `/reports`: `data.reports: [ { report, fights } ]`.
Empty `fights: []` is not an error.

## Fields

**report:** `reportId`, `reportUrl` (`https://wow-logs.co.in/{id}`), `raid` (slug: icc/ulduar/toc…), `size` (10|25), `uploadedAt` (ISO)
**fights[]** (one per boss encounter, kill OR wipe): `encounter` (stable name, we group by it), `boss` (bool), `kill` (bool), `hardmode` (bool), `start` (ISO), `durationSec`, `players[]`
**players[]:** `name`, `class` (full WotLK: Death Knight, Druid, Hunter, Mage, Paladin, Priest, Rogue, Shaman, Warlock, Warrior), `spec`, `dps`, `hps`, `damage`, `healing`, `deaths`, `interrupts`, `damageTaken`, `overhealing`, `activity` (0–1), `biggestHit` (`{ability, amount}`)

## Character rankings feed

Each entry (for the leaderboard columns) also exposes:

```json
{
  "rankings": {
    "raid": "ulduar",
    "difficulty": "25 HC",
    "ladder": "Regular",
    "bossPoints": 815.76,
    "average": 81.6,
    "bosses": {
      "XT-002 Deconstructor": 97.2,
      "Thorim": 97.5,
      "Freya": 78.6,
      "Hodir": null
    }
  }
}
```

- `difficulty`: `10 NM` · `10 HC` · `25 NM` · `25 HC`; `ladder` (e.g. `Regular`) + the list of ladders if more than one.
- Include the list of boss encounters per raid/difficulty so columns are built dynamically, not hardcoded.

## Errors

`{ "ok": false, "error": { "code", "message" } }` + matching HTTP status:
`400 BAD_REQUEST` · `404 NOT_FOUND` · `429 RATE_LIMITED` · `500 SERVER_ERROR`

## Proposed — consumables (PENDING, not live yet)

> Requested from the wow-logs dev, not yet in the feed. Powers "🎉 Fun & shame" awards
> (Drunk Rat / No prep / Well fed). **All fields OPTIONAL** — the page treats them as absent when
> missing, so adding them is non-breaking and needs no other API change. Extends each `players[]` entry:

```json
{
  "name": "Kobee",
  "consumables": {
    "potionsUsed": 3,          // combat potions consumed this fight (int)
    "healthstonesUsed": 1,     // warlock healthstones used (int)
    "flaskActive": true,       // had a flask/elixir buff during the fight (bool)
    "flaskUptime": 1.0,        // 0–1, fraction of fight with a flask/elixir up
    "foodBuff": true,          // had a Well Fed / food buff at pull (bool)
    "hadPrepot": true          // pre-potted (potion in the last ~2s before pull) (bool)
  }
}
```

- `potionsUsed` / `healthstonesUsed`: raw counts per player per fight (we sum across the raid).
- `flaskActive` / `foodBuff`: simple booleans are enough for the "No prep" shame award; `flaskUptime`
  is a nice-to-have for a "Well Fed" 100%-uptime award.
- If any field can't be computed, **omit it** rather than sending 0/false — the page distinguishes
  "no data" from "genuinely zero".
