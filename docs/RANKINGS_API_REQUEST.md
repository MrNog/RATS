# RATS logs API — contract

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
