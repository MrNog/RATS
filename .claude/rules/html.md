---
globs: ["**/*.html"]
---

# HTML file conventions

- Dark UI: `#141517` bg, `#c0943a` accent gold. Never introduce light backgrounds.
- **Inline JS strings**: ASCII + HTML entities only. No Unicode smart quotes (`“`), em dashes (`—`), or ellipsis (`…`) — they survive HTML but break JS string literals at parse time.
- No framework, no build step, no npm dependencies — plain vanilla JS only.
- Dates: always `fmtDate()` → `"26 Jul 2026"`. Never format dates inline.
- Date pickers: always `assets/datepicker.js` (RatsCal). Never the native `<input type="date">` picker.
- Buttons and inputs align on a `.frow` flex row at `height: 36px`. Icon-only buttons get `.icon-btn` (36×36 square).
- Highlight / accent text uses `var(--accent)` (`#c0943a`), not blue or green.
