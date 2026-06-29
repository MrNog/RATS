# 🐀 RATS — guild site

Public **hub** + gated **officer tools** in one static site (plain HTML + vanilla JS, no build step).
Hosted on GitHub Pages; deployed via the Fork GUI.

## Structure

Every page lives in its own folder as `index.html` with co-located `pagename.css` + `pagename.js`
(no inline `<style>`/`<script>`). Shared styling is a small design system in `assets/css/`.

```
index.html  index.css  index.js     Public hub (landing) — Officer Tools card → officer/
addons/     gallery/   vacations/    Public pages (each is index.html + .css + .js)
gallery.json  images/                Public gallery data + art
assets/
  css/theme.css                      Design tokens (:root vars) + base reset — linked on EVERY page
  css/ui.css                         Components (button, .card, .frow, inputs, .seclist, .tbtn, .del…)
  js/utils.js                        Optional RatsUtils helpers for new pages
  data.js                            Shared data layer (RatsData): gate, Firebase, vacations/members
  datepicker.js                      RatsCal dark calendar
officer/    index.html index.css index.js   Officer tools menu (← Back to Hub)
  guild/ comp/ history/ lore/ files/ admin/ changelog/   Each: index.html + .css + .js
.github/workflows/
  build-gallery.yml                  Rebuilds gallery.json from images/** on push
  release-notify.yml                 Discord ping when a watched addon cuts a release
releases.json  release-state.json    Watched addons + hub link / notifier state
downloads/  files/  docs/  scripts/
```

**Vacations is one shared page** at `vacations/` for everyone — it detects officer mode by the guild
key (`localStorage.ratsGuildKey`): guildies get add + live preview + read-only lists; officers also get
edit/remove/repost, the month calendar, and the auto-announce poll. Both hubs link to it.

Hub ⇄ Officer: the hub has an **Officer Tools** card; the officer menu has **← Back to Hub**. Officer
pages call `RatsData.gate()` so they unlock with the guild key (public pages don't).

**New page recipe:** make `folder/index.html`, link `assets/css/theme.css` + `ui.css` + `pagename.css`,
write structure with the component classes, drop a `pagename.js`. Style through tokens so one change
in `theme.css` moves the whole site. See `CLAUDE.md` + `.claude/rules/html.md` for conventions.

## Run locally

`file://` blocks fetch/crypto/webhooks — use a server: VS Code **Live Server** or `python -m http.server 8000`.
Internal links point at explicit `index.html` so routing works on `file://`, any local server, and Pages.

## ⭐ Release notifier — setup
1. Push as a GitHub repo with Pages enabled.
2. Repo **Settings → Secrets → Actions** → add `LOG_WEBHOOK` = the "Logs" Discord webhook URL.
3. Edit **releases.json**: confirm `hubUrl` (the live addons page, `…/rats/addons/`) and the watched `addons` list.
- First run records current versions (no spam); after that any new release pings Discord. Runs every 30 min
  (and on-demand from the Actions tab).
