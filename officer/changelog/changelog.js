const FB = "https://rats-tools-default-rtdb.europe-west1.firebasedatabase.app/rats/";
const GOLD = 0xC0943A;
const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const msg = (t, c) => { const e = document.getElementById("msg"); e.style.color = c || "#7CFC8A"; e.textContent = t || ""; };
const todayStr = () => { const d = new Date(), z = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };
// project-wide date format: "26 Jul 2026" (accepts ISO 2026-07-26 or DD-MM-YYYY 26-07-2026)
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(s) {
  s = String(s == null ? "" : s).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (m) return (+m[3]) + " " + MON[+m[2] - 1] + " " + m[1];
  m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s); if (m) return (+m[1]) + " " + MON[+m[2] - 1] + " " + m[3];
  return s;
}

async function fbGet(p) { try { const r = await fetch(FB + p + ".json", { cache: "no-store" }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
async function fbPost(p, o) { const r = await fetch(FB + p + ".json", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) }); if (!r.ok) throw new Error("HTTP " + r.status); return (await r.json()).name; }
async function fbDelete(p) { const r = await fetch(FB + p + ".json", { method: "DELETE" }); if (!r.ok) throw new Error("HTTP " + r.status); }

let LOGS = [];
// #okanor-logs webhook saved in this browser (Admin → Discord webhooks); matched by name
function logWebhook() { try { const a = JSON.parse(localStorage.getItem("ratsWebhooks") || "[]"); const h = a.find(x => /log|okanor/i.test(x.name || "")); return (h && h.url) || ""; } catch (e) { return ""; } }

function draft() {
  const ver = document.getElementById("ver").value.trim();
  const date = document.getElementById("date").value.trim() || todayStr();
  const items = document.getElementById("items").value.split("\n").map(s => s.trim()).filter(Boolean);
  return { ver, date, items };
}
function buildEmbed(e) {
  const head = fmtDate(e.date) + (e.ver ? " · " + e.ver : "");
  return {
    author: { name: "RATS • App update" },
    title: "📜 What's new" + (e.ver ? " — " + e.ver : ""),
    description: (e.items.length ? e.items.map(i => "• " + i).join("\n") : "_(no items yet)_") + "\n\n*" + head + "*",
    color: GOLD,
    footer: { text: "FOR THE RATS 🧀" }
  };
}
function renderCard(embed) {
  const hex = "#" + (embed.color || 0).toString(16).padStart(6, "0");
  const desc = esc(embed.description).replace(/\*(.+?)\*/g, "<i>$1</i>").replace(/\n/g, "<br>");
  return `<div style="border-left:4px solid ${hex};background:#2b2d31;border-radius:4px;padding:11px 15px;max-width:460px;font-family:'gg sans','Segoe UI',sans-serif">
    <div style="font-size:12px;font-weight:600;color:#fff;margin-bottom:6px">${esc(embed.author.name)}</div>
    <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:9px">${esc(embed.title)}</div>
    <div style="font-size:14px;color:#dbdee1;line-height:1.5">${desc}</div>
    <div style="font-size:12px;color:#949ba4;margin-top:10px">${esc(embed.footer.text)}</div>
  </div>`;
}
function renderPreview() { document.getElementById("preview").innerHTML = renderCard(buildEmbed(draft())); }

// toggle button backed by a hidden checkbox (keeps .checked reads working)
function toggleChk(id, btn) { const c = document.getElementById(id); c.checked = !c.checked; btn.classList.toggle("active", c.checked); }

async function postToDiscord(e) {
  const url = logWebhook();
  if (!url) { msg("❌ No #okanor-logs webhook saved (Admin → Discord webhooks, name it with 'log').", "#ff6b6b"); return false; }
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [buildEmbed(e)] }) });
  return true;
}
async function addEntry() {
  const e = draft();
  if (!e.items.length) { msg("Write at least one change (one per line).", "#ff6b6b"); return; }
  const pub = document.getElementById("pub").checked;
  msg("⏳ Saving…", "#8a8d93");
  try {
    await fbPost("changelog", { date: e.date, ver: e.ver, items: e.items, pub: pub, ts: Date.now() });
    let note = pub ? "✅ Saved + shown on the public hub." : "✅ Saved (officer-only — not on public hub).";
    if (document.getElementById("alsoPost").checked) { try { if (await postToDiscord(e)) note += " Posted to #okanor-logs."; } catch (err) { note += " (Discord post failed: " + err.message + ")"; } }
    document.getElementById("ver").value = ""; document.getElementById("items").value = ""; document.getElementById("date").value = "";
    document.getElementById("pub").checked = false;
    document.getElementById("pubBtn").classList.remove("active");
    if (window.RatsCal) RatsCal.sync();
    renderPreview(); await reload(); msg(note);
  } catch (err) { msg("❌ " + (err && err.message ? err.message : err), "#ff6b6b"); }
}
async function repost(key) {
  const e = LOGS.find(x => x.key === key); if (!e) return;
  msg("⏳ Posting…", "#8a8d93");
  try { if (await postToDiscord(e)) msg("✅ Re-posted " + (e.ver || e.date) + " to #okanor-logs."); }
  catch (err) { msg("❌ " + err.message, "#ff6b6b"); }
}
async function del(key) {
  if (!confirm("Delete this changelog entry? It disappears from the hub too.")) return;
  msg("⏳ Deleting…", "#8a8d93");
  try { await fbDelete("changelog/" + key); await reload(); msg("✅ Deleted."); }
  catch (err) { msg("❌ " + err.message, "#ff6b6b"); }
}
let listOpen = true;
function toggleList() {
  listOpen = !listOpen;
  document.getElementById("listWrap").style.display = listOpen ? "" : "none";
  document.getElementById("caretList").textContent = listOpen ? "▼" : "▶";
}
function renderList() {
  const box = document.getElementById("list");
  document.getElementById("cntList").textContent = LOGS.length ? "(" + LOGS.length + ")" : "";
  if (!LOGS.length) { box.innerHTML = '<div class="empty">No entries yet.</div>'; return; }
  box.innerHTML = LOGS.map(e => `<div class="entry">
    <div class="row" style="justify-content:space-between">
      <div class="d">${esc(fmtDate(e.date))}${e.ver ? " · " + esc(e.ver) : ""}${e.pub ? ' <span style="color:#7CFC8A;font-size:11px">🌐 public</span>' : ' <span style="color:#6e7178;font-size:11px">officer-only</span>'}</div>
      <div style="white-space:nowrap"><button class="del" onclick="repost('${e.key}')" style="background:#3b4178;border:1px solid #5865F2;color:#dfe2ff;margin-right:6px">📣 Post to Discord</button><button class="del" onclick="del('${e.key}')">delete</button></div>
    </div>
    <ul>${(e.items || []).map(i => `<li>${esc(i)}</li>`).join("")}</ul>
  </div>`).join("");
}
async function reload() {
  const o = await fbGet("changelog");
  LOGS = o ? Object.keys(o).map(k => Object.assign({ key: k }, o[k])).sort((a, b) => (b.ts || 0) - (a.ts || 0)) : [];
  renderList();
}

["ver", "date", "items"].forEach(id => document.getElementById(id).addEventListener("input", renderPreview));
if (window.RatsData) RatsData.gate();
document.getElementById("date").value = todayStr();
if (window.RatsCal) RatsCal.sync();
renderPreview();
reload();
