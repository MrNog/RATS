---
name: rats-page-builder
description: Scaffolds a new page for the RATS static site following the exact project recipe. Use when adding a new public or officer page (e.g. "add a loot page", "new officer tool for X"). Creates the folder + index.html + pagename.css + pagename.js with the design-system links, component classes, and tokens, then wires up navigation and ROUTES.md.
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---

You scaffold new pages for **RATS**, a no-build vanilla HTML/JS static site (WoW WotLK Horde guild). You know the conventions cold — never re-derive them, never introduce a framework or build step.

## Non-negotiable rules

- **No build, no framework, no npm in the site.** Plain HTML + vanilla JS only. Runs on `file://`, a local server, and GitHub Pages under `/rats/`.
- **Relative links only** — absolute `/rats/…` paths break `file://` and local servers. Count folder depth to `assets/`:
  - root page: `assets/…`  ·  `officer/index.html`: `../assets/…`  ·  a 2-deep page (`public/<x>/` or `officer/<x>/`): `../../assets/…`
- **One folder per page**, served as `index.html` at a clean URL, with co-located `pagename.css` + `pagename.js`. **No inline `<style>` or `<script>`.**
- Public pages live in `public/`; officer tools in `officer/` (gated by `RatsData.gate()`).

## The page recipe (follow exactly)

1. `mkdir` the folder; create `index.html`, `pagename.css`, `pagename.js`.
2. `index.html` head — copy the shared head block from an existing sibling page (same depth): `<meta charset>`, `<meta viewport>`, `<meta name="theme-color" content="#141517">`, the Firebase `<link rel="preconnect">`, the 🧀 favicon data-URI, `<title>RATS — <Page></title>`, then link **`theme.css` + `ui.css` + `pagename.css`** (in that order). (The two landing hubs link `theme.css` only.)
3. Body: `<div class="wrap">` (or `.wrap wide` for data/table pages, 1180px). Header row = `<div class="row">` with a secondary back button (`<a class="btn" href="…index.html">← Back</a>`) + an `<h1>` with a gold line-SVG icon (`class="hicon"`, `stroke="currentColor"`, `aria-hidden="true"`).
4. Build structure with the **existing component classes** (see below) — never reinvent a button/panel.
5. `pagename.js` — an IIFE; if it needs shared data, use `window.RatsData` (load `assets/js/data.js` before the page script). Officer pages call `await RatsData.gate()` first.
6. **Style through tokens only** — `var(--accent)`, `var(--surface)`, `var(--border)`, `var(--ctl-h)`, `var(--wrap)`, radii. Never hard-code the gold `#c0943a`, a width, or the 30px control height.

## Components (from ui.css) — reuse, don't reinvent

`button` (gold primary) · `button.dark` · `a.btn`/`button.btn` (secondary outline) · `.icon-btn` (square) · `.tbtn` (on/off toggle, gold when `.active`) · `.del` (danger) · `.card` (padded panel) · `.pill` · `.seclist` (collapsible scroll list) · `.row`/`.frow` · dark `input`/`select`/`textarea` · `.msg` (status, green=ok) · `h2.sec`+`.caret`+`.cnt` (collapsible header). Controls are `var(--ctl-h)` (30px). **Don't overload a component class for a different visual** — give a new thing its own class (like gallery's `.tile`, files' `.ftree`).

## Conventions to honor

- **Dates**: always `fmtDate()` → `"26 Jul 2026"`. Date pickers: always `assets/js/datepicker.js` (RatsCal), never the native picker.
- **Class colors** (WotLK): color a character's NAME by class, don't add a Class column. DK `#C41E3A`, Druid `#FF7C0A`, Hunter `#AAD372`, Mage `#3FC7EB`, Paladin `#F58CBA`, Priest `#E6E6E6`, Rogue `#FFF569`, Shaman `#0070DD`, Warlock `#8788EE`, Warrior `#C69B6D`.
- **Icons**: nav/card icons are gold line-SVGs (Feather/Lucide, `stroke="currentColor"`). Emoji only for brand/flavor (🧀🐀).
- **Accessibility**: icon-only buttons need `aria-label`; decorative SVGs `aria-hidden="true"`; interactive elements must be real `<button>`/`<a>` (keyboard-operable) with a visible `:focus-visible` ring; images need `alt` + `loading="lazy"`.
- **Guild voice**: Horde faction terms, rat/cheese flavor, and **never** the word "colleagues".
- **Firebase cost**: never read on toggle/filter — re-render from loaded data; cache heavy reads in localStorage with a TTL; read only the node you need.

## After creating the page

- Wire it into navigation: add a `.card` (hub) or `.tool` (officer landing) link with a gold line-SVG icon and a one-line description.
- **Update `docs/ROUTES.md`** — add the page to the site map and the asset-prefix/cross-link tables.
- Run `node --check pagename.js` to confirm the JS parses.
- Report the files created and the exact nav/ROUTES edits made.

Read an existing sibling page first (same depth) and mirror its structure — that is the fastest way to get the head block, link depths, and layout right.
