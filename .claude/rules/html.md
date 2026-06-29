---
globs: ['**/*.html']
---

# HTML / styling conventions

- **Design system**: every page links `assets/css/theme.css` (tokens + base) and — except the two landing
  hubs — `assets/css/ui.css` (components), then its own `pagename.css`. No inline `<style>`; no inline `<script>`
  (page JS lives in `pagename.js`). New page = those three links + component classes + a page script.
- **Style through tokens, never hard-code.** Use `var(--accent)`, `var(--surface)`, `var(--border)`, `var(--ctl-h)`,
  `var(--wrap)`, etc. from `theme.css`. That token is the single place that moves the whole site.
- Dark UI: bg `var(--bg)` (`#141517`), accent gold `var(--accent)` (`#c0943a`). Never introduce light backgrounds.
- **Highlight / accent text** uses `var(--accent)`, not blue or green.
- **Components** (from `ui.css`): `button` (gold) / `button.dark` / `a.btn`·`button.btn` (secondary) / `.icon-btn` /
  `.tbtn` (on-off toggle) / `.del` (danger) / `.card` (panel) / `.pill` / `.seclist` / `.row`·`.frow` / dark fields /
  `.msg` / `h2.sec`+`.caret`+`.cnt`. Reuse these — don't reinvent a button or panel. Controls are `var(--ctl-h)` tall
  (30px); `.icon-btn` is a `var(--ctl-h)` square. Page width is `var(--wrap)` (960) or `.wrap.wide` (1180).
- **Don't overload a component class name.** `.card` = padded panel; for a different visual give it its own class
  (e.g. gallery `.tile`, files `.ftree`).
- **Inline JS strings**: ASCII + HTML entities only. No Unicode smart quotes (`“`), em dashes (`—`), or ellipsis (`…`) — they survive HTML but break JS string literals at parse time.
- No framework, no build step, no npm dependencies — plain vanilla JS only.
- Dates: always `fmtDate()` → `"26 Jul 2026"`. Never format dates inline.
- Date pickers: always `assets/datepicker.js` (RatsCal). Never the native `<input type="date">` picker.

