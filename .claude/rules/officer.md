---
globs: ["officer/**"]
---

# Officer tools

- Every page is gated by `RatsData.gate()` (guild key in `localStorage.ratsGuildKey`). Never expose key in output.
- `admin.html` has a second layer: admin password (`localStorage.ratsAdminKey`) + `admin.json`.
- Roster + history are AES-encrypted (PBKDF2). Always decrypt before display; never log raw ciphertext blobs.
- Firebase REST base: `https://rats-tools-default-rtdb.europe-west1.firebasedatabase.app/rats/<node>.json`
  - Encrypted nodes: `roster`, `history`
  - Plain nodes: `vacations`, `members`, `changelog`, `gate`
- Webhooks: `localStorage.ratsWebhooks` → array of `{ name, url }`. Canonical names: **RatRoster**, **Logs**, **Vacations**, **LoreMaster**. Match by regex — never hardcode a URL.
- 10-man raids deduplicate per WoW Wed→Wed lockout window. One obligation per lockout per instance, not per raid date.
