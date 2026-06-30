# RATS — technical reference (what we have & how it works)

> Maintainer-only, gitignored. The single source of truth for the app's structure & features.
> Conventions (colors, dates, voice, icons) live in `../CLAUDE.md`. The logs API request sent to the
> wow-logs dev is in `RANKINGS_API_REQUEST.md`; image prompts in `PROMPTS.md`.

---

## 1. Stack & shipping

- Plain **HTML + vanilla JS**, no build step, no framework. Hosted on **GitHub Pages**.
- Deployed via the **Fork GUI** (no `gh` CLI, no CI build). Repo kept commit-ready; don't push unless asked.
- One folder `rats/` = public hub (root) + officer tools (`officer/`), sharing `assets/js/data.js`.
- **Design system:** every page is `folder/index.html` + co-located `pagename.css`/`pagename.js` (no inline
  `<style>`/`<script>`). Shared `assets/css/theme.css` (tokens + base) + `ui.css` (components) — see §2/§CLAUDE.
- **Firebase Realtime DB** is the live data store (REST, no SDK). Cost-sensitive — see §5.

## 2. Repo layout

Each page = its own folder served as `index.html`, with `pagename.css` + `pagename.js` beside it. Internal
links point at explicit `index.html` so routing works on `file://`, any local server, and Pages.

```
index.html · index.css · index.js   hub landing + public changelog drawer
public/      PUBLIC pages (everyone) — keeps the root clean
  addons/    mandatory/recommended addons + NEW badge + update notifier preview
  gallery/   art/lore gallery (gallery.json manifest; .tile masonry, not .card)
  vacations/ shared vacations — role-aware (guildie vs officer) via the guild key, see §3
  rankings/  (planned) PUBLIC rankings & hall of fame — not built yet
officer/
  index.*    officer landing + access gate
  guild/     roster browser (armory links, fangs, join dates, low-level group, stale alert)
  comp/      raid comp builder + Save to history + optional toggle  (.wrap width 1280 — the one exception)
  history/   attendance % + raid log (size-aware, optional toggle)
  lore/      post raid stories (markdown + images) to a Discord webhook
  files/     links to officer files (.ftree tree, not .frow)
  changelog/ dev-log authoring (public 🌐 flag) → changelog node + #okanor-logs
  admin/     maintainer console (keys, webhooks, roster/history, backup)
assets/
  css/theme.css      design tokens (:root vars) + base reset — linked on EVERY page
  css/ui.css         components (button/.dark/.btn/.icon-btn/.tbtn/.del/.card/.pill/.seclist/.frow/fields…)
  js/utils.js        optional RatsUtils helpers (esc/fmtDate/classColor/fb*) for NEW pages
  data.js            RatsData shared layer (encryption, gate, Firebase, vacations/members)
  datepicker.js      RatsCal dark calendar
roster.json · history.json · gate.json   encrypted backups / lock token (Firebase wins; files = restore)
releases.json · release-state.json        notifier watchlist + hubUrl / last-seen state
gallery.json                              gallery manifest (built by the Action)
.github/workflows/  build-gallery.yml, release-notify.yml
docs/               THIS folder (gitignored)
```

> NOTE: officer **vacations is no longer a separate page** — it merged into the single `public/vacations/`
> (one file, role-aware). The masonry tile and file-tree row were renamed (`.tile`, `.ftree`) so they don't
> collide with the shared `.card`/`.frow` components.

## 3. Pages & features

### Public hub

- **index.html** — landing cards (gold line-SVG icons) linking each section. Public **changelog drawer**:
  reads `changelog` node, shows only `pub` (major) entries, with an **unseen badge** (count clears on open).
  Note: the word "Hub" links to pornhub.com — **intentional user edit, do not revert**.
- **addons.html** — addon cards (host + plugins). **NEW badge** via GitHub API (latest release or default-branch
  commit), clears on Download (`markSeen`). Dev-only preview of the #okanor-logs update embed.
- **gallery.html** — thumbnail grid from `gallery.json`, click to view/download.
- **vacations/** (shared, role-aware) — ONE page for everyone, flips on the guild key (`isOfficer` in
  `vacations.js`). **Guildie:** add a vacation + **always-on live preview** of the Discord card; progress bars on
  "currently away"; picker from the public `members` node; **read-only lists, no remove, no calendar**. **Officer:**
  all of that **+ edit/remove/repost**, the **month calendar**, the day-before reminder preview, the auto-announce +
  purge poll, and the picker from the decrypted roster. (The `vacations` node is plain/world-readable, so this is a
  UI split, not a security boundary.) Linked from both hubs.
- **rankings/** — see §7 (not built yet).

### Officer tools (gated by the guild key)

- **officer/index.html** — landing + `RatsData.gate()` overlay (locks until key entered).
- **guild.html** — roster browser. Per-row 🔗 Warmane armory link; one hierarchy icon (👑 GM > ⭐ Officer >
  💀 Fang); join dates; **low-level (<80)** collapsed at bottom; **last-import** stat card (warns at 14/30 days);
  **stale-roster alert** to #okanor-logs after 7 days (once per stale roster; preview dev-only).
- **comp.html** — raid comp builder (drag-drop groups), size selector (25/10), **Save to history**, per-member
  optional toggle. Reads spec/class emote IDs from the pasted Raid-Helper JSON.
- **history.html** — attendance. Each raid = one mandatory day; attendance = days present ÷ raids run **since that
  raider's first logged raid**. **Size-aware**: 25-man counts for everyone, 10-man counts for Fangs (+ who played).
  Per-card **Optional toggle** (auto-saves), badges MANDATORY / 💀 FANGS / ⚪ OPTIONAL. Log scrolls after ~7 rows.
  (Officer vacations is the same `public/vacations/` page above — it just shows more once the guild key is present.)
- **changelog.html** — authors entries to `changelog`; default posts to #okanor-logs; tick **🌐** to also show on
  the public hub. Officer drawer shows all entries.
- **lore.html** — post raid stories (markdown + image attachments, multipart) to a chosen webhook.
- **files.html** — links to the officer Google Drive sheets (new tab).
- **admin.html** — maintainer console: set keys, webhooks, roster/history, backup. Self-gates with the admin password.

## 4. Data layer — `assets/js/data.js` (`RatsData`)

Single shared module. `FIREBASE_URL` is set; when empty it falls back to committed files + downloads.

**Encryption / gate:** roster & history are **AES-GCM**, key (PBKDF2, 150k iters) derived from the guild key.
`gate()` shows a full-screen lock, verifies by decrypting `gate` (or `roster`); unlocked state caches the key.
Data is encrypted **in-browser before upload**, so Firebase only holds unreadable blobs.

**Key functions:** `gate()`, `loadRoster()`, `saveRoster()`, `loadHistory()`, `saveHistory()`, `cachedHistory()`,
`loadVacations/addVacation/updateVacation/removeVacation`, `publishMembers/loadMembers`, `backup()`,
`encrypt/decrypt`, `aliasFor()` (Discord nick → in-game via `NAME_ALIASES`), `fbOn/getPass/setPass/clearPass`.

**localStorage keys:** `ratsGuildKey` (guild key = "is officer"), `ratsGuild` (decrypted roster),
`ratsHistory` (decrypted history), `ratsWebhooks` (named webhooks), `ratsAdminKey`, plus per-feature caches
(e.g. `ratsRankCache`, `ratsStaleNotifiedFor`, changelog seen-count).

## 5. Firebase nodes & COST model

REST: `https://rats-tools-default-rtdb.europe-west1.firebasedatabase.app/rats/<node>.json`

| node        | content                              | who writes                 |
| ----------- | ------------------------------------ | -------------------------- |
| `roster`    | encrypted roster blob                | officer (guild.html/admin) |
| `history`   | encrypted history blob               | officer (comp/history)     |
| `vacations` | plain, push-keyed entries            | members + officers         |
| `members`   | plain name+class (public picker)     | officer publish            |
| `changelog` | plain entries (`pub` flag)           | officer                    |
| `gate`      | encrypted lock token                 | admin                      |
| `rankings`  | computed rankings snapshot (planned) | officer Fetch (see §7)     |

**Cost rules (free tier ~360 MB/day download; REST reads the WHOLE node each time):**

- **Reads are the cost**, not images (images are on GitHub Pages, not Firebase).
- **Never read on every interaction.** Toggles/filters re-render from already-loaded data — no network.
- **Cache reads in localStorage** with a TTL; re-visits within the TTL read nothing.
- **Read only the node you need** (per-feature nodes, not the whole tree).
- Public pages should avoid reading big encrypted nodes; the rankings page reads **one** small snapshot, cached.

## 6. Discord webhooks & automation

- Webhooks in `localStorage.ratsWebhooks` (named; matched by keyword `/vacation/i`, `/log|okanor/i`).
- Every embed built from **one builder fn** so the live preview === what's posted. Discord renders the **title
  white** (color only on the left bar). Use **dynamic timestamps** (`<t:unix:D>` / `:R`).
- Members can't post (no webhook access) → the **officer tool posts on their behalf** (poll + announce).
- **GitHub Actions:** `build-gallery.yml` rebuilds `gallery.json` from `images/**`; `release-notify.yml` watches
  EXTERNAL mandatory addons in `releases.json` (release or default-branch commit) → posts to `LOGS_WEBHOOK`
  (#okanor-logs), state in `release-state.json`.

## 7. Rankings (rankings.html) — logs-fed

Public page; **no attendance** (ranking reflects absence naturally). Tabs: **🏆 Leaderboards** (personal: MVP,
Top DPS/HPS, Most improved, Needs work, Records), **📊 Guild progress** (collective: week-over-week verdict +
cards + per-boss kill times with killed/⏳pending/✖no-kill states), **🎉 Fun & shame** (deaths, awards, fun
stats, wipe counter), **📜 Logs** (per-report badges, 💀 Fangs-night at ≥5 fangs, filtered by raid+size+period).

Top controls: raid segs (from API `raids[]`) · 25/10-man · Week/Month/All. Period semantics on Guild progress:
**Week** = this lockout vs last lockout; **Month** = per-boss best/avg + trend ("vs month avg"); **All** =
guild-best kill ever + fastest full clear (no comparison).

**Data flow (cost-safe):** the wow-logs dev builds a fight-level API (see `RANKINGS_API_REQUEST.md`). The
**officer's 🔄 Fetch data** button (gold-on-dark, visible only with the guild key) pulls the logs, computes, and
writes ONE `rankings` snapshot to Firebase. Public visitors read that snapshot **once per visit** (localStorage
TTL 30 min); all raid/size/period toggles filter client-side → ~0 reads. `SAMPLE` in the page is the data
contract and the fallback until the API is live (`RANKINGS_URL`/snapshot node still empty).

## 8. Operational (maintainer)

- **Run locally:** use a server, not `file://` (fetch/crypto/webhooks are blocked on file://). VS Code Live Server
  or `python -m http.server 8000`.
- **Keys:** guild key unlocks the tools + encrypts roster/history (shared in the officer channel, never in repo).
  Admin password locks admin.html. Both live only in `localStorage` / the officer's head.
- **Backup/restore:** Admin → 💾 Backup downloads encrypted `roster.json` + `history.json`; commit via Fork.
  If Firebase is wiped, `loadRoster/loadHistory` restore from the committed files automatically (Firebase wins
  when present). Mitigates the open-rules vandalism risk (blobs are unreadable; risk is overwrite, not read).
- **Rotate:** new guild key → re-arm `gate.json` + re-export `roster.json`; new admin password → new `admin.json`.

## 9. Not built yet / roadmap

- Rankings: wire `fetchData()` to the real API (pull → compute → write snapshot) once the dev ships it;
  smart fetch = `/reports` backfill when history empty, else `/latest`.
- Apply the §5 localStorage cache pattern to the other public reads (vacations/members/changelog) to cut DB cost.
- **Player profile page** (deferred — idea): pick a character → a one-page résumé of that raider. Pulls from
  data we already have + the rankings API: **wow-logs ranking** (boss points / avg / per-boss %), **our own**
  attendance + comp history, and **earned badges** (e.g. "on a 3-raid streak", "Top DPS", "Fang", "perfect
  attendance"). Cool card UI. Feeds off the same `rankings` snapshot + `history`/`roster` — no new data store.
  Guild leaderboard with real numbers comes alongside it. (First we just want the full API data; UI later.)
- Web roster overrides (notes/alt-main/spec/tags) layered on the imported roster via a Firebase `overrides` node.
- Weekly attendance auto-post embed from `history`.
