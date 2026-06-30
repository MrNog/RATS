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
    "report": { "reportId":"20459", "reportUrl":"https://wow-logs.co.in/20459", "raid":"icc", "size":25, "uploadedAt":"2026-06-25T23:55:00Z" },
    "fights": [
      { "encounter":"Festergut", "boss":true, "kill":true, "hardmode":false, "start":"2026-06-25T21:14:03Z", "durationSec":220,
        "players": [
          { "name":"Kobee", "class":"Rogue", "spec":"Assassination", "dps":6210, "hps":0, "damage":13662000, "healing":0, "deaths":0, "interrupts":2, "damageTaken":410000, "overhealing":0, "activity":0.97, "biggestHit":{"ability":"Mutilate","amount":18234} }
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

## Second message POST

One more thing that would be incredibly useful for our guild rankings page.

Would it be possible to also expose the **ranking data** that's shown on the Character Rankings page?

Ideally, each ranking entry would include:

- `raid` (e.g. `ulduar`, `icc`, `toc`)
- `difficulty` (`10 NM`, `10 HC`, `25 NM`, `25 HC`)
- `bossPoints`
- `average` (overall %)
- `bosses` (per-encounter percentages)

Example:

```json
{
  "rankings": {
    "raid": "ulduar",
    "difficulty": "25 HC",
    "bossPoints": 815.76,
    "average": 81.6,
    "bosses": {
      "XT-002 Deconstructor": 97.2,
      "Assembly of Iron": 93.1,
      "Hodir": null,
      "Thorim": 97.5,
      "Freya": 78.6,
      "Mimiron": null,
      "Yogg-Saron": 87.5
    }
  }
}
```

Additionally, would it be possible to expose the list of boss encounters available for a given raid/difficulty (or include it in the rankings response)? This would let us dynamically build the leaderboard columns instead of hardcoding encounters for each raid.

This would allow us to build guild leaderboards like the Character Rankings page without scraping HTML or trying to recreate the scoring ourselves.

If exposing the raw ranking values isn't possible, an endpoint returning the same data used by the Character Rankings page would be perfect.

Thanks! :heart:

---

## Third message POST

Thanks for the go-ahead! Just a couple of small things on top of the request above:

- Could each entry include which **`ladder`** it's from (e.g. `Regular`), plus the list of ladders if there's more than one?
- Otherwise, feel free to return **everything you already have** per character — more raw data is better; we'll decide what to surface on our side. (No need for season filtering on your end.)

On auth + setup — a couple of important notes about our side:

- **It's a very simple project: front-end only, hosted on GitHub Pages** (no backend, no server). So the API gets called **straight from the browser**. For that to work, please **enable CORS** for our origin (`https://mrnog.github.io`) — otherwise the browser will block the request.
- I already have an account as the guild owner (**`okanor`** — https://wow-logs.co.in/user/okanor). Where do I find the **API ID / key**? (account/profile settings, or will you generate one for me?)
- How should we send the key — `?key=...` query param, or a header (`Authorization` / `X-API-Key`)? Only an officer ever triggers the fetch, so the key stays in their browser; the result is cached as one public snapshot.

Thanks again! :heart:
