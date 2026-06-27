# 🐀 RATS — unified site (work in progress)

A merge of **rats-hub** (public) + **rats-tools** (officer) into one site, kept in a new folder so the
live repos stay untouched until this is ready.

## Structure
```
index.html            Public hub (landing) — has a 🔧 Officer Tools card → officer/index.html
gallery.html          Public — gallery
addons.html           Public — addons / WeakAuras / patch
vacations.html        Public — members self-serve their vacations (writes shared Firebase node)
gallery.json  images/ Public gallery data + art
assets/
  data.js             Shared data layer (was rats-tools/rats-data.js) — ONE copy for everything
officer/              Officer tools (gated by the guild key via assets/data.js)
  index.html          Officer menu — has ← Back to Hub
  comp.html history.html guild.html admin.html lore.html files.html vacations.html
.github/workflows/
  release-notify.yml  ⭐ Discord ping when a watched addon cuts a new release (no repo ownership needed)
releases.json         Watched addons + the hub link used in the message
```

Hub ⇄ Officer switch: the hub has an **Officer Tools** card; the officer menu has **← Back to Hub**.
Officer pages call `RatsData.gate()` so they unlock with the guild key (public pages don't).

## ⭐ Release notifier — setup
1. Push this folder as a GitHub repo (GitHub Pages).
2. Repo **Settings → Secrets → Actions** → add `RELEASE_WEBHOOK` = your Discord webhook URL.
3. Edit **releases.json**: confirm `hubUrl` (your live addons page) and the watched `addons` list.
- First run just records current versions (no spam); after that, any new release pings Discord with a
  link to the hub. Runs every 30 min (and on-demand from the Actions tab).

## Migration status (separar lógica do HTML)
- ✅ Foundation: shared `assets/data.js`, unified index + officer switch, release notifier.
- ⏳ Pages still carry their inline `<script>` (copied as-is so the site works now). Next step: extract
  each page's logic into `assets/<page>.js` and `<script src>` it — done one page at a time so each is
  testable. Start with the small ones (addons, gallery, vacations), then the big tools (comp, history).
- ⏳ Public `vacations.html` still uses its own inline Firebase helper; can switch to `assets/data.js`
  once data.js is loaded there too.

## Notes
- The officer pages load roster/history/vacations from the **same Firebase** as today (shared), so no
  data is lost — they just live in one site now.
- `downloads/patch-y.mpq` (27 MB) was NOT copied here yet; copy it when you finalize the move.
