# RATS — Migration Plan

## Separate HTML / CSS / JS · Extract reusable components · No build step

---

## ✅ DONE (Jun 2026) — completed as a design system, not just a split

All 13 pages now live in their own folder as `index.html` with a co-located `pagename.css` + `pagename.js`,
no inline `<style>`/`<script>`. The shared layer became a **token-driven design system** (the goal shifted
from "dedupe identical CSS" to "one consistent style, change a token once → every page follows"):

- **`assets/css/theme.css`** — `:root` tokens (accent, surfaces, borders, text, `--wrap`/`--wrap-wide`,
  `--ctl-h`, radii, font) + base reset (`body`, `.wrap`/`.wrap.wide`, `h1`/`h2`, `code`, gold scrollbar).
  Linked on every page.
- **`assets/css/ui.css`** — components: `button`/`button.dark`/`a.btn`·`button.btn`/`.icon-btn`/`.tbtn`/`.del`,
  `.row`/`.frow`, dark `input`/`select`/`textarea`, `.msg`, `.card` (panel), `.pill`, `.seclist`,
  `h2.sec`+`.caret`+`.cnt`. Linked on all content/form pages.

**Deviations from the original plan (intentional):**

- The two landing hubs (`index`, `officer/index`) link `theme.css` only — they keep a centered splash layout,
  not the form-page components.
- Name collisions were resolved by renaming, since they were different components: gallery masonry `.card`→`.tile`,
  files tree row `.frow`→`.ftree`.
- Widths unified to the `--wrap` token (960) / `.wrap.wide` (1180). `comp/` keeps 1280 (set in `comp.css`) — the
  one genuine width exception, alongside the gallery masonry which uses the wide tier.
- Recurring widgets were promoted into `ui.css` (`.tbtn`, `.del`, the collapsible `h2.sec` header, `button:disabled`,
  `input[type=password]`) so future pages get them for free.
- Phase 3 (shared JS `utils.js`/`components.js`) was **not** rewired into the existing pages — each page keeps its
  own working `pagename.js`. An optional `assets/js/utils.js` toolkit exists for _new_ pages.

---

## Target structure

Each page lives in its own folder as `index.html` so the browser serves it at a clean URL
(`/addons/` instead of `/addons.html`). CSS and JS are co-located in the same folder.
Shared code lives in `assets/`.

```
RATS/
├── index.html              ← root hub, stays at root
├── index.css
├── index.js
│
├── addons/
│   ├── index.html          (was addons.html  → URL: /addons/)
│   ├── addons.css
│   └── addons.js
├── gallery/
│   ├── index.html          (was gallery.html → URL: /gallery/)
│   ├── gallery.css
│   └── gallery.js
├── vacations/
│   ├── index.html          (was vacations.html → URL: /vacations/)
│   ├── vacations.css
│   └── vacations.js
├── rankings/
│   ├── index.html          (was rankings.html → URL: /rankings/)
│   ├── rankings.css
│   └── rankings.js
│
├── officer/
│   ├── index.html          ← officer hub, stays at officer/
│   ├── index.css
│   ├── index.js
│   ├── guild/
│   │   ├── index.html      (was officer/guild.html → URL: /officer/guild/)
│   │   ├── guild.css
│   │   └── guild.js
│   ├── comp/
│   │   ├── index.html
│   │   ├── comp.css
│   │   └── comp.js
│   ├── history/
│   │   ├── index.html
│   │   ├── history.css
│   │   └── history.js
│   ├── vacations/
│   │   ├── index.html
│   │   ├── vacations.css
│   │   └── vacations.js
│   ├── changelog/
│   │   ├── index.html
│   │   ├── changelog.css
│   │   └── changelog.js
│   ├── lore/
│   │   ├── index.html
│   │   ├── lore.css
│   │   └── lore.js
│   ├── files/
│   │   ├── index.html
│   │   ├── files.css
│   │   └── files.js
│   └── admin/
│       ├── index.html
│       ├── admin.css
│       └── admin.js
│
└── assets/
    ├── data.js             ← RatsData (unchanged)
    ├── datepicker.js       ← RatsCal (unchanged)
    ├── css/
    │   ├── theme.css       ← CSS vars, dark bg, typography, scrollbar
    │   └── ui.css          ← card, btn, frow, input, seclist, .msg
    └── js/
        ├── utils.js        ← fmtDate, classColor, quips  →  window.RatsUtils
        └── components.js   ← embed preview, webhook tester, nav header  →  window.RatsUI
```

---

## Reusable components to extract

| Component                               | Currently in               | Extract to                |
| --------------------------------------- | -------------------------- | ------------------------- |
| CSS vars + dark bg + scrollbar          | every page `<style>`       | `assets/css/theme.css`    |
| card · btn · frow · input · .msg        | every page `<style>`       | `assets/css/ui.css`       |
| seclist + collapsibles                  | vacations, history, guild  | `assets/css/ui.css`       |
| `fmtDate()`, `classColor()`             | inline in multiple pages   | `assets/js/utils.js`      |
| per-class quips (vacation card flavour) | vacations public + officer | `assets/js/utils.js`      |
| Discord embed preview renderer          | vacations, changelog, lore | `assets/js/components.js` |
| webhook test button logic               | admin, changelog           | `assets/js/components.js` |
| nav back-button markup                  | every officer page         | `assets/js/components.js` |

---

## Phases

### Phase 0 — Restructure: move each page into its folder

Before any CSS/JS extraction, rename every HTML file into its own directory.

- `addons.html` → `addons/index.html`
- `gallery.html` → `gallery/index.html`
- `vacations.html` → `vacations/index.html`
- `rankings.html` → `rankings/index.html`
- `officer/guild.html` → `officer/guild/index.html`
- `officer/comp.html` → `officer/comp/index.html`
- `officer/history.html` → `officer/history/index.html`
- `officer/vacations.html` → `officer/vacations/index.html`
- `officer/changelog.html` → `officer/changelog/index.html`
- `officer/lore.html` → `officer/lore/index.html`
- `officer/files.html` → `officer/files/index.html`
- `officer/admin.html` → `officer/admin/index.html`

Update every internal `href` and `src` in the moved files to use the new relative depth
(one `../` for root sub-pages, two `../../` for officer sub-pages — see Rules below).
Update any cross-page links in `index.html` and `officer/index.html` (`addons.html` → `addons/`).

**Verify:** every nav link resolves correctly in Live Server before continuing.

---

### Phase 1 — Zero risk: extract shared CSS

Pull the identical `<style>` blocks present in every page into two files.

- Create `assets/css/theme.css` — `:root` vars, `body`, scrollbar, `h1/h2`, `code`, `a.btn`
- Create `assets/css/ui.css` — `.card`, `button`, `button.dark`, `.frow`, `input`, `textarea`, `.msg`, `.seclist`, `.row`, `.sub`
- Add `<link>` tags to every HTML `<head>` (relative paths — see rules below)
- Delete the duplicated `<style>` blocks from each HTML file

**Verify:** open each page in Live Server — visual output must be identical.

---

### Phase 2 — Low risk: extract per-page CSS

Whatever page-specific `<style>` remains after Phase 1 moves to its own `.css` file.

- For each page folder: create `pagename.css` alongside `index.html`
- Move remaining `<style>` content into it
- Replace `<style>…</style>` with `<link rel="stylesheet" href="pagename.css">`

**Order (easiest → hardest):** gallery → addons → index → vacations → officer/files →
officer/lore → officer/changelog → officer/admin → officer/vacations → officer/comp →
officer/history → officer/guild

---

### Phase 3 — Moderate: extract shared JS utilities + components

Pull repeated pure functions and widgets into shared files before extracting per-page scripts.

- Create `assets/js/utils.js` — exposes `window.RatsUtils`:
  `fmtDate`, `classColor`, `quipFor`, `lockoutStart`
- Create `assets/js/components.js` — exposes `window.RatsUI`:
  `embedPreview(opts)`, `webhookTest(btn)`, `renderNav(backHref, title)`
- Add `<script src="…/assets/js/utils.js">` and `components.js` to all pages that use them
  (load order: `data.js` → `datepicker.js` → `utils.js` → `components.js` → page script)
- Update inline call sites to use `RatsUtils.fmtDate()` etc.

---

### Phase 4 — Most work: extract per-page JS

Move each page's `<script>` block to its own `.js` file.

- For each page folder: create `pagename.js` alongside `index.html`
- Move the `<script>` content (minus anything already extracted in Phase 3)
- Replace `<script>…</script>` with `<script src="pagename.js"></script>`
- No module system needed — page scripts use globals, same as today

**Order:** same as Phase 2 — gallery first (simplest), officer/history + officer/guild last.

---

## What each HTML file looks like after migration

### Root sub-page (`addons/index.html`) — one level deep

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="../assets/img/favicon.ico">
  <title>RATS — Addons</title>

  <!-- shared -->
  <link rel="stylesheet" href="../assets/css/theme.css">
  <link rel="stylesheet" href="../assets/css/ui.css">
  <!-- page-specific -->
  <link rel="stylesheet" href="addons.css">
</head>
<body>

  <!-- HTML structure only — no inline styles, no inline scripts -->
  <div class="wrap">...</div>

  <!-- shared -->
  <script src="../assets/data.js"></script>
  <script src="../assets/datepicker.js"></script>
  <script src="../assets/js/utils.js"></script>
  <script src="../assets/js/components.js"></script>
  <!-- page-specific -->
  <script src="addons.js"></script>

</body>
</html>
```

### Officer sub-page (`officer/guild/index.html`) — two levels deep

```html
  <!-- shared -->
  <link rel="stylesheet" href="../../assets/css/theme.css">
  <link rel="stylesheet" href="../../assets/css/ui.css">
  <!-- page-specific -->
  <link rel="stylesheet" href="guild.css">
  ...
  <script src="../../assets/data.js"></script>
  <script src="../../assets/datepicker.js"></script>
  <script src="../../assets/js/utils.js"></script>
  <script src="../../assets/js/components.js"></script>
  <script src="guild.js"></script>
```

---

## Rules

- **Relative paths by depth.**
  | Location | Prefix to `assets/` |
  |---|---|
  | Root (`index.html`) | `assets/` |
  | Root sub-page (`addons/index.html`) | `../assets/` |
  | Officer hub (`officer/index.html`) | `../assets/` |
  | Officer sub-page (`officer/guild/index.html`) | `../../assets/` |
- **No build step.** All files loaded directly by the browser via `<link>` and `<script src>`.
  No Webpack, Vite, or bundler.
- **Globals only.** Shared code exposes objects on `window` (`RatsUtils`, `RatsUI`).
  No `import/export` — ES modules require a server and add complexity.
- **No inline JS strings with Unicode.** Extracted `.js` files can use normal Unicode,
  but strings injected via `innerHTML` must still use HTML entities.
- **Prettier ignores HTML.** `.prettierignore` already excludes `**/*.html`.
  Extracted `.js` and `.css` files are safe to format.

---

## Migration order (full sequence)

| Step | Files                | Phase(s)                           |
| ---- | -------------------- | ---------------------------------- |
| 0    | All pages            | Phase 0 (restructure into folders) |
| 1    | All pages (CSS only) | Phase 1                            |
| 2    | gallery              | Phase 2 + 4                        |
| 3    | addons               | Phase 2 + 4                        |
| 4    | officer/files        | Phase 2 + 4                        |
| 5    | index                | Phase 2 + 4                        |
| 6    | vacations (public)   | Phase 2 + 4                        |
| 7    | Shared JS utilities  | Phase 3                            |
| 8    | officer/lore         | Phase 2 + 4                        |
| 9    | officer/changelog    | Phase 2 + 4                        |
| 10   | officer/admin        | Phase 2 + 4                        |
| 11   | officer/vacations    | Phase 2 + 4                        |
| 12   | officer/comp         | Phase 2 + 4                        |
| 13   | officer/history      | Phase 2 + 4                        |
| 14   | officer/guild        | Phase 2 + 4                        |
