---
description: Audit changed RATS site files against the project's own rules — design-system tokens, no inline style/script, dates/pickers, Firebase cost rules, and JS-string safety
argument-hint: [files or "all"] — default: the current git diff
---

Review the RATS site code for violations of the project's OWN documented rules (in `CLAUDE.md` and
`.claude/rules/`). This is a rules-compliance pass, not a general code review. Target: `$ARGUMENTS`
(default = files changed in the current `git diff`; use `git status` to find them).

## What to flag (cite file:line, quote the offending code, give the fix)

**Design system / HTML** (`.claude/rules/html.md`, CLAUDE.md "Design system"):
- Inline `<style>` blocks or inline `<script>` (page JS must live in `pagename.js`).
- Missing/incorrect stylesheet links: every content page links `theme.css` + `ui.css` + its `pagename.css`
  (the 2 landing hubs link `theme.css` only).
- **Hard-coded values that should be tokens:** the gold (`#c0943a`/`#C8A96E` in CSS), a raw pixel width that
  should be `var(--wrap)`/`.wrap.wide`, a control height that should be `var(--ctl-h)` (30px). Flag literal
  hex/px where a `var(--…)` exists.
- Light backgrounds introduced (never — dark UI only). Accent/highlight text using blue/green instead of `var(--accent)`.
- **Overloaded component class** — reusing `.card`/`.pill`/`.btn` for a different visual instead of a new class.
- Wrong asset-link depth for the page's location (see `docs/ROUTES.md` prefix table).

**Dates & pickers:**
- Dates formatted inline instead of via `fmtDate()` (must render `26 Jul 2026`).
- Native `<input type="date">` picker used instead of `RatsCal` (`assets/js/datepicker.js`); missing
  `RatsCal.enhanceAll()` after dynamic render or `RatsCal.sync()` after a programmatic `.value` reset.

**JS-string safety** (breaks at parse time):
- Unicode smart quotes (`“ ” ‘ ’`), em dashes (`—`) or ellipsis (`…`) **inside JS string literals**. (They're
  fine in HTML text and markdown — only literal JS strings break.) Suggest ASCII / HTML entities.
- Any framework / npm / build-step dependency (project is plain vanilla JS, no build).

**Firebase cost rules** (CLAUDE.md "Firebase cost rules", `.claude/rules/officer.md`):
- Re-fetching on a toggle/filter instead of re-rendering from already-loaded in-memory data.
- A heavy read with no `localStorage` cache + TTL check before it.
- Reading the whole tree / a node you don't need; reading encrypted nodes (`roster`, `history`) from a public page.
- Hard-coded webhook URLs instead of matching `localStorage.ratsWebhooks` by name/regex.

**Voice (only if the file contains guild-facing copy):**
- The word **"colleagues"** (banned). Horde-faction spell/term names expected.

## Output
- A concise list grouped by severity: **🔴 Breaks a hard rule** · **🟡 Should fix** · **🔵 Nit**.
- Each: `path:line` — what's wrong (quote it) — the exact fix. No praise, no restating unchanged code.
- If clean, say so in one line.
- Do **not** edit files unless the user says to fix them.
