# RATS logs API — request (posted to wow-logs dev)

> Title: `[RATS] Logs API request — fight-level JSON for guild rankings`
> Posted on the wow-logs forum/Discord appeals request. This is the exact body sent.

---

Hi — for our guild **rankings / leaderboard** page we'd love a fight-level logs feed. Spec below.
Plain JSON, raw numbers, times in **seconds**. Please enable **CORS**.

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

## Fields

**report:** `reportId`, `reportUrl` (`https://wow-logs.co.in/{id}`), `raid` (slug: icc/ulduar/toc…), `size` (10|25), `uploadedAt` (ISO)
**fights[]** (one per boss encounter, kill OR wipe): `encounter` (stable name, we group by it), `boss` (bool), `kill` (bool), `hardmode` (bool), `start` (ISO), `durationSec` (seconds), `players[]`
**players[]:** `name`, `class` (full WotLK: Death Knight, Druid, Hunter, Mage, Paladin, Priest, Rogue, Shaman, Warlock, Warrior), `spec`, `dps`, `hps`, `damage`, `healing`, `deaths`, `interrupts`, `damageTaken`, `overhealing`, `activity` (0–1), `biggestHit` (`{ability, amount}`)

## Errors

`{ "ok": false, "error": { "code", "message" } }` + matching HTTP status:

- `400 BAD_REQUEST` · `404 NOT_FOUND` · `429 RATE_LIMITED` · `500 SERVER_ERROR`

Empty `fights: []` is not an error. Thanks! 🧀
