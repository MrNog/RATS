---
description: Scaffold a new RATS site page the project way (folder + index.html with correct depth links + pagename.css/.js using the design system) and wire it into docs/ROUTES.md
argument-hint: <folder-name> [public|officer] [title] — e.g. "roster public Roster Browser" | "comp officer Raid Comp"
---

Scaffold a new page for the RATS static site (no build step, vanilla JS, GitHub Pages). Request: `$ARGUMENTS`.

## Read the conventions FIRST
- `CLAUDE.md` ("Layout", "Design system") and `.claude/rules/html.md` — the hard rules.
- `docs/ROUTES.md` — the site map + the asset-link-prefix-by-depth table. You WILL update it.
- Look at a sibling page (`public/vacations/`) for the exact head/body boilerplate.

## Parse the request
- **folder** — clean URL segment (lowercase, no spaces), e.g. `roster`.
- **tier** — `public` → `public/<folder>/` · `officer` → `officer/<folder>/`. Both are 2 levels deep → asset prefix `../../assets/`.
- **title** — the `<h1>` / `<title>` text (default: Title-Cased folder name).

## Create exactly three files in `<tier>/<folder>/`

**`index.html`** — copy the project boilerplate:
- `<!doctype html>`, `<html lang="en">`, meta charset + viewport, the 🧀 SVG favicon data-URI.
- `<title>RATS — <title></title>`.
- Link **`../../assets/css/theme.css`**, **`../../assets/css/ui.css`**, then **`<folder>.css`** (in that order). **No inline `<style>`.**
- `<body>` → `<div class="wrap">` (or `wrap wide` for data-heavy pages) → a `.row` header: a `← Back` link
  (`a.btn` → `../../index.html`, or `../index.html` for officer hub context) + an `<h1>` with a **gold
  line-SVG `.hicon`** (Feather/Lucide style, `stroke="currentColor"`) + the title.
- A content container the JS renders into.
- Before `</body>`: `<script src="../../assets/js/utils.js"></script>`, `<script src="../../assets/js/data.js"></script>`, `<script src="<folder>.js"></script>`. **No inline `<script>`.**
- **Officer pages:** call `RatsData.gate()` on boot (guild-key gate) — see `.claude/rules/officer.md`.

**`<folder>.css`** — a header comment, then styles that go **only through tokens** (`var(--accent)`,
`var(--surface)`, `var(--border)`, `var(--ctl-h)`, `var(--wrap)`…). Never hard-code the gold, a width, or a
control height. Don't overload a shared component class (`.card` = padded panel); give new visuals their own class.

**`<folder>.js`** — an IIFE `(function(){ "use strict"; … })();` using `window.RatsUtils` (`esc`, `fmtDate`,
`classColor`, `todayStr`, `fbGet`…). Respect the **Firebase cost rules**: read only the node you need, cache
in `localStorage` with a 30-min TTL, never re-fetch on toggle/filter (re-render from loaded data), no
encrypted nodes on public pages. Expose any inline `onclick`/`oninput` handlers on `window` at the end.

## Wire it up (don't skip)
- **`docs/ROUTES.md`** — add the page to the tier tree, add a cross-page link row if it links elsewhere, and
  confirm the asset prefix matches its depth.
- Add a nav tile/link from the relevant hub (`index.html` for public, `officer/index.html` for officer) with a
  gold line-SVG icon matching the Addons/Gallery style.
- Dates → `fmtDate`; date inputs → `RatsCal` (`assets/js/datepicker.js`), never the native picker.

Finish with a short summary of the files created and the one-line ROUTES.md entry added. Then remind: run
locally with a server (Live Server / `python -m http.server`), `file://` breaks fetch/crypto.
