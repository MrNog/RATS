# RATS — Migration Plan
## Separate HTML / CSS / JS · Extract reusable components · No build step

---

## Target structure

HTML files stay at their current URLs — no broken links. CSS and JS move to co-located files.
Shared code lives in `assets/`.

```
RATS/
├── index.html              ← thin shell: markup only
├── index.css               ← page-specific styles
├── index.js                ← page logic
├── addons.html / addons.css / addons.js
├── gallery.html / gallery.css / gallery.js
├── vacations.html / vacations.css / vacations.js
├── rankings.html / rankings.css / rankings.js
│
├── officer/
│   ├── guild.html / guild.css / guild.js
│   ├── comp.html / comp.css / comp.js
│   ├── history.html / history.css / history.js
│   ├── vacations.html / vacations.css / vacations.js
│   ├── changelog.html / changelog.css / changelog.js
│   ├── lore.html / lore.css / lore.js
│   ├── files.html / files.css / files.js
│   └── admin.html / admin.css / admin.js
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

| Component | Currently in | Extract to |
|---|---|---|
| CSS vars + dark bg + scrollbar | every page `<style>` | `assets/css/theme.css` |
| card · btn · frow · input · .msg | every page `<style>` | `assets/css/ui.css` |
| seclist + collapsibles | vacations, history, guild | `assets/css/ui.css` |
| `fmtDate()`, `classColor()` | inline in multiple pages | `assets/js/utils.js` |
| per-class quips (vacation card flavour) | vacations public + officer | `assets/js/utils.js` |
| Discord embed preview renderer | vacations, changelog, lore | `assets/js/components.js` |
| webhook test button logic | admin, changelog | `assets/js/components.js` |
| nav back-button markup | every officer page | `assets/js/components.js` |

---

## Phases

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

- For each HTML file: create `pagename.css` in the same folder
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
- Add `<script src="assets/js/utils.js">` and `components.js` to all pages that use them
  (load order: `data.js` → `datepicker.js` → `utils.js` → `components.js` → page script)
- Update inline call sites to use `RatsUtils.fmtDate()` etc.

---

### Phase 4 — Most work: extract per-page JS

Move each page's `<script>` block to its own `.js` file.

- For each HTML: create `pagename.js` in the same folder
- Move the `<script>` content (minus anything already extracted in Phase 3)
- Replace `<script>…</script>` with `<script src="pagename.js"></script>`
- No module system needed — page scripts use globals, same as today

**Order:** same as Phase 2 — gallery first (simplest), officer/history + officer/guild last.

---

## What each HTML file looks like after migration

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="...">
  <title>RATS — Addons</title>

  <!-- shared -->
  <link rel="stylesheet" href="assets/css/theme.css">
  <link rel="stylesheet" href="assets/css/ui.css">
  <!-- page-specific -->
  <link rel="stylesheet" href="addons.css">
</head>
<body>

  <!-- HTML structure only — no inline styles, no inline scripts -->
  <div class="wrap">...</div>

  <!-- shared -->
  <script src="assets/data.js"></script>
  <script src="assets/datepicker.js"></script>
  <script src="assets/js/utils.js"></script>
  <script src="assets/js/components.js"></script>
  <!-- page-specific -->
  <script src="addons.js"></script>

</body>
</html>
```

---

## Rules

- **Relative paths only.** GitHub Pages serves at `/rats/`, never `/`.
  Root pages use `assets/css/theme.css`; officer pages use `../assets/css/theme.css`.
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

| Step | Files | Phase(s) |
|---|---|---|
| 1 | All pages (CSS only) | Phase 1 |
| 2 | gallery | Phase 2 + 4 |
| 3 | addons | Phase 2 + 4 |
| 4 | officer/files | Phase 2 + 4 |
| 5 | index | Phase 2 + 4 |
| 6 | vacations (public) | Phase 2 + 4 |
| 7 | Shared JS utilities | Phase 3 |
| 8 | officer/lore | Phase 2 + 4 |
| 9 | officer/changelog | Phase 2 + 4 |
| 10 | officer/admin | Phase 2 + 4 |
| 11 | officer/vacations | Phase 2 + 4 |
| 12 | officer/comp | Phase 2 + 4 |
| 13 | officer/history | Phase 2 + 4 |
| 14 | officer/guild | Phase 2 + 4 |
