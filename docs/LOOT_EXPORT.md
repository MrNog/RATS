# Loot export — contract (Okanvil → site)

The JSON the **Okanvil** addon generates (`/okanvil export`) and the `public/loot/` (or officer) page
consumes. Okanvil reads the **MRT loot history** (`MRT.lua` → `LootHistory.list`) — the source of truth for
*who actually kept the item*, which survives the "master looter loots to self, then trades" case that plain
`CHAT_MSG_LOOT` tracking gets wrong.

## Why MRT (not RCLootCouncil / not chat loot)

- RCLootCouncil only stores full history on the **Master Looter's** SavedVariables — not reliably present.
- Chat `CHAT_MSG_LOOT` records *who physically looted* → wrong when the ML loots then trades.
- **MRT `LootHistory` records who ended up with the item** → correct regardless of trade. It's already
  running in the raid, so no extra addon adoption needed — Okanvil just reads it and exports clean JSON.

## Lessons learned from parsing real MRT data (build these into Okanvil)

Extracting a real `MRT.lua` (479 entries) surfaced problems the addon must handle. **The item is the source
of truth for the boss — NOT the bossId MRT recorded.**

1. **MRT logs the bossId of the last NPC that died**, which is often wrong:
   - **Adds/sub-NPCs get the loot** — e.g. `Molten Colossus`, `Chamber Overseer`, `Rune Etched Sentry` are
     XT-002 adds; `Steelbreaker`/`Brundir`/`Molgeim` ARE the Assembly of Iron; the 3 Elders ARE Freya. Loot
     dropped on the add, not the boss. → Okanvil needs an **add → encounter** map (see `BOSS_ALIAS` in the
     extractor for the Ulduar list).
   - **Loot handed out later inherits a stale bossId** — items traded/distributed an hour after a kill got
     tagged with whatever boss was last in memory (we saw Vezax/Freya/Auriaya loot logged under Brundir).
     An add-map does NOT fix this — only an **itemId → boss** table does.
2. **Duplicate log lines** — MRT sometimes writes the same drop twice within a few seconds. De-dupe by
   `itemId + player` within a ~30s window (keep legit repeats like Val'anyr fragments hours/days apart).
   - **Val'anyr fragments** (`Fragment of Val'anyr`) drop from **every boss, but at most ONE per boss per
     lockout**. So a fragment is legit across different bosses/runs, but **two fragments from the SAME boss in
     the SAME run = a logging dup** → drop it. Good validation rule for Okanvil.
3. **Unnamed bosses** — some entries have a bossId with no `bossNames` entry (`Boss 0`) → label "Trash & adds".

**The definitive fix (do this in Okanvil):** resolve the boss **from the item**, in-game, at loot time —
`GetLootSourceInfo()` gives the exact source unit, or use the current-encounter context. In-game the addon
knows the real boss with zero guessing, so the exported `boss` field is authoritative and the site needs no
correction. Fall back to the MRT bossId (+ add-map) only for back-filling old history where live context is
gone.

### Back-fill boss-resolution algorithm (what worked on the real data — 200 items, 0 inflated bosses)

Two layers, applied in order — works for ANY item:

1. **Item-name table** (`docs/ulduar-loot-table.json`, 438 items scraped once from the Wowhead Ulduar loot
   guide). Match the item **by NAME, not id** — names are stable across client versions, ids can differ
   (our server is 3.3.5a 2008; Wowhead documents WotLK Classic 2022). If the item is in the table, its boss
   is authoritative → overrides whatever the MRT logged. This fixes gear mis-attributed to adds/late trades.
2. **By time** for items NOT in the table (Val'anyr fragments, patterns, plans, formulas, BoE — they drop from
   many bosses / trash, so they have no fixed boss). Rule: **the boss is the last REAL boss killed before that
   timestamp in the same run.** You loot on the way through trash, so a drop logged on an add/trash belongs to
   the boss you just downed. (Confirmed: a fragment logged on "Dark Rune Thunderer" = Thorim trash actually
   belonged to Auriaya, the last boss killed before it.)

Rules that fell out of the data:
- **Each boss drops MANY items** — no per-boss cap. (Don't assume "1 item per boss".)
- **Val'anyr fragments: at most ONE per boss per lockout** — 2+ from the same boss in one run = a logging dup.
- The 14 real Ulduar bosses anchor the timeline; the 3 Iron Council members map to **Assembly of Iron**.

## MRT source format (what Okanvil parses)

Each entry in `MRT.lua` → `["LootHistory"]["list"]` is a `#`-separated string:

```
1780518194 # 33113 # 0 # 2 # Kobee # 4 # 1 # item:45107:0:0:0:0:0:0:0:80
    ts       bossId  inst size player class  ?   itemString
```

| Field | Meaning | Resolve via |
|-------|---------|-------------|
| `ts` | unix timestamp | — |
| `bossId` | NPC id of the boss | `MRT.LootHistory.bossNames[bossId]` |
| `inst` | instance index | `MRT.LootHistory.instanceNames[inst]` (e.g. `0` = Ulduar) |
| `size` | raid size / lockout code (2 = 25, 1 = 10 — verify in-game) | — |
| `player` | winner name | — |
| `class` | WotLK class index (1=Warrior … 4=Rogue …) | class map |
| `?` | (unconfirmed — count/quantity, usually 1) | — |
| `itemString` | `item:<itemId>:...` | `itemId` → `GetItemInfo()` in-game for the name |

## Two data sources, one record (drops + assignments)

Okanvil records loot from **two** angles so nothing is ever lost:

1. **Boss drops (automatic, easy, reliable)** — when a boss dies and its loot is announced, Okanvil logs
   *what dropped*. This always fires, independent of how the item is later handed out.
2. **Assignments (who kept it)** — from MRT `LootHistory` where available.

A dropped item whose winner isn't known yet is exported with **`player: null`** (unassigned). The site then
lets an officer **edit who got it** — so manual rolls / off-spec / anything MRT missed is fixed on the site,
never lost. The site is the correction layer on top of the addon's automatic capture.

## Export JSON (what the site reads)

```json
{
  "exportedAt": 1780700000,
  "loot": [
    {
      "ts": 1780518194,
      "player": "Kobee",
      "class": "Rogue",
      "itemId": 45107,
      "name": "Leviathan's Gaze",
      "icon": "inv_jewelry_ring_73",
      "boss": "Flame Leviathan",
      "raid": "Ulduar",
      "size": 25,
      "runId": "2026-06-04-ulduar-25"
    },
    {
      "ts": 1780518260,
      "player": null,
      "itemId": 45038,
      "name": "Fragment of Val'anyr",
      "boss": "Flame Leviathan",
      "raid": "Ulduar",
      "size": 25,
      "runId": "2026-06-04-ulduar-25"
    }
  ]
}
```

Second entry = a **drop with no winner yet** (`player: null`) → officer assigns it on the site.

### Field rules

- **`itemId`** (int) — required. Site builds the icon + Wowhead link from it.
- **`name`** (string) — Okanvil resolves it in-game with `GetItemInfo(itemId)` at export time (MRT does not
  store names — its `LootLink` table is empty). If the item isn't cached client-side, Okanvil may omit `name`
  and the site falls back to the id until resolved.
- **`icon`** (string) — the icon **slug** (e.g. `inv_sword_39`), NOT the itemId. The CDN serves icons by slug,
  not by id, so the addon must export it. Okanvil gets it in-game via `GetItemIcon(itemId)` /
  `select(10, GetItemInfo(itemId))` (strip the path + extension → just the slug). If omitted, the site shows a
  question-mark placeholder.
- **`class`** — full WotLK class name (Death Knight, Druid, Hunter, Mage, Paladin, Priest, Rogue, Shaman,
  Warlock, Warrior) so the site colours the name per the project class-colour rule.
- **`boss`** / **`raid`** — resolved by Okanvil from `bossNames` / `instanceNames`.
- **`size`** — `25` or `10`.
- **`runId`** — groups loot from the same lockout/run even across multiple days:
  `"<YYYY-MM-DD of run start>-<raid slug>-<size>"`. Lets the page show loot per weekly run, not just per
  raid type. Okanvil derives it from the first `ts` of a contiguous run.
- **`boe`** (bool, optional) — `true` if the item is **Bind on Equip** (tradeable / sellable), `false`/absent
  for BoP. Okanvil reads it in-game by scanning the item tooltip (`isBoE` in `Loot.lua`) at loot time.
  The site shows a small gold **BoE** pill next to the item name so it's clear which drops could be sold or
  passed around. Absent = treated as BoP (no tag).

## Site side (plan)

- **Import (officer):** paste / load the export JSON → parse in-browser → **merge** into the `loot` Firebase
  node (plain, world-readable). Merge (not overwrite) so manual edits already made on the site aren't wiped
  by a re-import; de-dupe by `ts`+`itemId`+`player`.
- **Assign / edit (officer):** any item with `player: null` shows an **"assign winner"** control (picker from
  the roster). Officers can also re-assign a wrong winner. Edits write back to the `loot` node.
- **Public read:** read the `loot` node once per visit (TTL 30 min), all filtering client-side — zero extra
  reads (same cost pattern as `rankings`).
- **Views:** history per run · per player · per boss · "who hasn't won loot in N runs" · unassigned drops
  (officer, so they get resolved).
- No BiS/OS/roll response column — MRT doesn't record it, and we decided who-got-what is enough.
