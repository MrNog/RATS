---
globs: ['officer/**']
---

# Officer tools

- Every page is gated by `RatsData.gate()` (guild key in `localStorage.ratsGuildKey`). Never expose key in output.
- The admin console (`officer/admin/`) has a second layer: admin password (`localStorage.ratsAdminKey`) + `admin.json`.
- Roster + history are AES-encrypted (PBKDF2). Always decrypt before display; never log raw ciphertext blobs.
- Firebase REST base: `https://rats-tools-default-rtdb.europe-west1.firebasedatabase.app/rats/<node>.json`
  - Encrypted nodes: `roster`, `history`
  - Plain nodes: `vacations`, `members`, `changelog`, `gate`
- Webhooks: `localStorage.ratsWebhooks` → array of `{ name, url }`. Canonical names: **RatRoster**, **Logs**, **Vacations**, **LoreMaster**. Match by regex — never hardcode a URL.
- 10-man raids deduplicate per WoW Wed→Wed lockout window. One obligation per lockout per instance, not per raid date.

## Firebase reads (cost rules)
- Never re-fetch when toggling or filtering — re-render from the already-loaded in-memory data.
- Cache heavy reads in `localStorage` with a TTL; check cache before every fetch.
- Read only the specific node needed — never the whole tree.
- Encrypted nodes (`roster`, `history`) must never be read from public pages.

## localStorage keys used by officer tools
`ratsGuildKey`, `ratsGuild` (decrypted roster), `ratsHistory` (decrypted history),
`ratsWebhooks`, `ratsAdminKey`, `ratsRankCache`, `ratsStaleNotifiedFor`.

