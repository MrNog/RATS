# RATS — routes / site map

Single source of truth for **what page lives where**. There is no runtime router: this is a no-build
static site that must work on `file://`, a local server, and GitHub Pages (`/rats/`), so links are
**relative** (absolute `/rats/…` paths would break the first two). When you move a page, update its
relative links by depth (table at the bottom) and fix this map.

## Tiers (root is symmetric: hub · public · officer · assets)

```
/index.html                         HUB — public landing (Officer Tools card → officer/)
public/                             PUBLIC pages (everyone)
  addons/index.html                 addons · WeakAuras · patch        (+ addons.css/.js)
  gallery/index.html                art/lore gallery                   (+ gallery.css/.js)
  vacations/index.html              vacations — role-aware (see note)  (+ vacations.css/.js)
  profile/index.html                raider profile — armory + badges   (+ profile.css/.js)
  rankings/index.html               rankings & hall of fame (public)   (+ rankings.css/.js)
officer/                            PRIVATE tools (gated by guild key)
  index.html                        officer landing / menu
  guild/index.html                  roster browser                     (+ guild.css/.js)
  comp/index.html                   raid comp builder                  (+ comp.css/.js)
  history/index.html                attendance + raid log              (+ history.css/.js)
  lore/index.html                   post raid stories to Discord       (+ lore.css/.js)
  files/index.html                  officer file links                 (+ files.css/.js)
  changelog/index.html              dev-log authoring                  (+ changelog.css/.js)
  admin/index.html                  maintainer console                 (+ admin.css/.js)
assets/                             SHARED
  css/theme.css                     tokens + base (EVERY page)
  css/ui.css                        components (every page except the 2 hubs)
  js/data.js                        RatsData (Firebase, gate, vacations/members/profile-keys)
  js/datepicker.js                  RatsCal
  js/utils.js                       optional RatsUtils helpers
```

> **Vacations is ONE page** at `public/vacations/`. It detects officer mode by `localStorage.ratsGuildKey`
> and reveals remove/edit/repost + the month calendar; guildies get add + preview only. Both hubs link to it.
> `rankings/` is planned (public), not built yet.
>
> **Profile is ONE page** at `public/profile/`. Public armory view for anyone (picker from `members`,
> stats from the `rankings` snapshot — SAMPLE fallback until the API is live). Private cards (Barracks alts,
> attendance link) reveal for officers (`ratsGuildKey`) or a raider who unlocks their main with a
> **profile key** (`ratsProfileUnlock`). Officers generate per-main keys with the 🔑 button in `officer/guild/`;
> only `salt + SHA-256(salt+key)` is published to the plain `profiles` node — the raw key is never stored.
>
> **Rankings is a public page** at `public/rankings/`. Reads ONE `rankings` snapshot (TTL 30 min, cached);
> raid/size/period toggles filter client-side (no extra reads). The gold **Fetch** button shows only with the
> guild key — it pulls the wow-logs API, computes, and writes the snapshot. `RANKINGS_URL` is empty until the
> API is live, so it renders the bundled `SAMPLE`. Full spec in `.claude/rules/rankings.md`.

## Cross-page links (the ones to keep in sync on a move)

| From                               | To            | Link                                                    |
| ---------------------------------- | ------------- | ------------------------------------------------------- |
| `index.html` (hub)                 | a public page | `public/addons/index.html` · `gallery` · `vacations`    |
| `index.html` (hub)                 | officer       | `officer/index.html`                                    |
| `officer/index.html`               | a tool        | `guild/index.html`, `comp/`, …                          |
| `officer/index.html`               | hub           | `../index.html`                                         |
| `officer/index.html`               | vacations     | `../public/vacations/index.html`                        |
| `officer/<tool>/`                  | officer hub   | `../index.html`                                         |
| `officer/history/`                 | vacations     | `../../public/vacations/index html`                     |
| `public/<page>/`                   | hub           | `../../index.html`                                      |
| `public/vacations/` (officer mode) | officer hub   | `../../officer/index.html` (set in vacations.js `boot`) |

## Asset-link prefix by depth (count the folders to `/`)

| Page location                                  | prefix to `assets/` |
| ---------------------------------------------- | ------------------- |
| `/index.html` (hub)                            | `assets/`           |
| `officer/index.html` (officer hub)             | `../assets/`        |
| `public/<page>/` or `officer/<tool>/` (2 deep) | `../../assets/`     |

## JS-generated / external URLs (absolute — update on a move)

- `public/addons/addons.js` → `HUB_URL = "https://mrnog.github.io/rats/public/addons/"`
- `releases.json` → `"hubUrl": "https://mrnog.github.io/rats/public/addons/"` (used by the release notifier)
- `public/gallery/gallery.js` → image paths are `../../` + the `images/...` path from `gallery.json`
- `public/addons/addons.js` → patch download `../../downloads/patch-y.mpq`
