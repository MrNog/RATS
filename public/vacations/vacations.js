// ONE vacations page for everyone. Officers (guild key present) get remove / edit / repost,
// the month calendar, the day-before reminder preview, and the auto-announce + purge poll.
// Guildies get add + live preview + read-only lists. The `vacations` node is a plain (world-
// readable) Firebase node, so this split is convenience only — no secret data is gated here.
const isOfficer = !!localStorage.getItem("ratsGuildKey");
const FB = "https://rats-tools-default-rtdb.europe-west1.firebasedatabase.app/rats/";

const CLASS_COLOR = { "Death Knight": "#C41E3A", "DK": "#C41E3A", "Druid": "#FF7C0A", "Hunter": "#AAD372", "Mage": "#3FC7EB", "Paladin": "#F58CBA", "Priest": "#E6E6E6", "Rogue": "#FFF569", "Shaman": "#0070DD", "Warlock": "#8788EE", "Warrior": "#C69B6D" };
function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function msg(t, c) { const e = document.getElementById("msg"); e.style.color = c || "#7CFC8A"; e.textContent = t || ""; }
const todayStr = () => { const d = new Date(); const z = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };

let VACS = [];          // shared vacations from Firebase: [{key,name,class,start,end,note,type}]
let PUBMEMBERS = [];    // guildie picker: the public 'members' node [{name,class}]

// officer picker comes from the decrypted roster (richer); guildie picker from the public members node
function guildRoster() { try { const d = JSON.parse(localStorage.getItem("ratsGuild") || "null"); return (d && d.roster) ? d.roster : []; } catch (e) { return []; } }
function altMainNote(m) { const on = ((m && m.officerNote) || "").trim(); const mm = on.match(/^(.+?)\s+alt\b/i); return mm ? mm[1].trim() : null; }
function isAltG(m) { return m && (m.rankIndex === 4 || /alt/i.test(m.rankName || "") || !!altMainNote(m)); }
function officerMembers() { return guildRoster().filter(m => !isAltG(m) && !/pug/i.test(m.rankName || "")); }
function pickerList() { return isOfficer ? officerMembers() : PUBMEMBERS; }
async function loadPickerMembers() {
  if (isOfficer) { try { if (window.RatsData) await RatsData.loadRoster({ interactive: false }); } catch (e) { } return; }
  if (window.RatsData && RatsData.loadMembers) { try { const m = await RatsData.loadMembers(); if (Array.isArray(m)) { PUBMEMBERS = m; return; } } catch (e) { } }
  try { const r = await fetch(FB + "members.json", { cache: "no-store" }); const o = r.ok ? await r.json() : null; PUBMEMBERS = Array.isArray(o) ? o : []; } catch (e) { PUBMEMBERS = []; }
}

function status(v) {
  const t = todayStr(), end = v.end || v.start;
  if (t < v.start) return "soon";
  if (t > end) return "past";
  return "active";
}
// progress through an active vacation: current day index, total days, % elapsed, days left
function vacProgress(v) {
  const total = daysBetween(v.start, v.end);
  const idx = Math.max(1, Math.min(total, Math.round((new Date(todayStr()) - new Date(v.start)) / 86400000) + 1));
  const p = Math.max(0, Math.min(100, Math.round(idx / total * 100)));
  return { p, idx, total, left: total - idx };
}
let editingKey = "";
function rowHtml(v, editable) {
  const col = CLASS_COLOR[v.class] || "#ddd";
  if (editable && v.key === editingKey) {
    return `<tr>
      <td class="nm" style="color:${col}">${esc(v.name)}</td>
      <td><input type="date" id="edStart" lang="en-GB" value="${esc(v.start)}" style="height:32px;min-width:140px"></td>
      <td><input type="date" id="edEnd" lang="en-GB" value="${esc(v.end || "")}" style="height:32px;min-width:140px"></td>
      <td colspan="2" style="text-align:right;white-space:nowrap">
        <button onclick="saveEdit('${v.key}')" style="padding:6px 12px">Save</button>
        <button class="del" onclick="cancelEdit()" style="border-color:#3a3d44;color:#9aa0a6">Cancel</button>
      </td>
    </tr>`;
  }
  const st = status(v), lbl = { active: "away now", soon: "upcoming", past: "ended" }[st];
  // the note is "for officers" — only shown in officer mode
  const note = (isOfficer && v.note) ? ` <span title="${esc(v.note)}" style="cursor:help">📝</span>` : "";
  const tag = v.type === "personal" ? ` <span title="Personal time off — low-key" style="cursor:help">💤</span>` : "";
  let statusCell = `<span class="pill ${st}">${lbl}</span>`;
  if (st === "active" && v.type !== "personal") {
    const pr = vacProgress(v);
    statusCell = `<div style="min-width:130px" title="${pr.left} day${pr.left !== 1 ? "s" : ""} left">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:#8a8d93;margin-bottom:2px"><span>day ${pr.idx}/${pr.total}</span><span style="font-weight:700;color:#8fdf9f">${pr.p}%</span></div>
      <div style="height:6px;background:#232529;border-radius:4px;overflow:hidden"><i style="display:block;height:100%;width:${pr.p}%;background:linear-gradient(90deg,#43b581,#8fdf9f)"></i></div>
    </div>`;
  }
  const actions = editable
    ? `<button class="del" onclick="repostVac('${v.key}')" style="border-color:#c0943a;color:#e0b860;margin-right:6px" title="Re-post this alert to Discord">📣 repost</button><button class="del" onclick="editVac('${v.key}')" style="border-color:#3a4a5b;color:#9ad0ff;margin-right:6px">edit</button><button class="del" onclick="removeVac('${v.key}')">remove</button>`
    : "";
  return `<tr>
    <td class="nm" style="color:${col}">${esc(v.name)}${tag}${note}</td>
    <td>${esc(fmtDate(v.start))}</td>
    <td>${esc(v.end ? fmtDate(v.end) : "—")}</td>
    <td>${statusCell}</td>
    ${isOfficer ? `<td style="text-align:right;white-space:nowrap">${actions}</td>` : ""}
  </tr>`;
}
function table(list, editable) {
  if (!list.length) return '<div class="empty">None.</div>';
  const head = isOfficer ? '<th>Raider</th><th>From</th><th>To</th><th>Status</th><th></th>' : '<th>Raider</th><th>From</th><th>To</th><th>Status</th>';
  return '<table><thead><tr>' + head + '</tr></thead><tbody>'
    + list.map(v => rowHtml(v, editable)).join("") + '</tbody></table>';
}
function render() {
  // active/upcoming first (by start date), ended pushed to the bottom
  const vs = VACS.slice().sort((a, b) => {
    const pa = status(a) === "past" ? 1 : 0, pb = status(b) === "past" ? 1 : 0;
    return pa - pb || (a.start || "").localeCompare(b.start || "");
  });
  const active = vs.filter(v => status(v) === "active");
  document.getElementById("active").innerHTML = table(active, false);
  document.getElementById("all").innerHTML = table(vs, isOfficer);
  document.getElementById("cntactive").textContent = active.length ? "(" + active.length + ")" : "";
  document.getElementById("cntall").textContent = vs.length ? "(" + vs.length + ")" : "";
  if (isOfficer) { renderCalendar(); if (window.RatsCal) RatsCal.enhanceAll(); }  // enhance edit-row date inputs
}

// ---- month calendar (officers only): who's away each day, overlaps as stacked chips ----
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth();   // month 0-11
function calShift(n) { calMonth += n; if (calMonth < 0) { calMonth = 11; calYear--; } if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); }
function calToday() { const d = new Date(); calYear = d.getFullYear(); calMonth = d.getMonth(); renderCalendar(); }
function vacsOnDay(dStr) { return VACS.filter(v => v.start && dStr >= v.start && dStr <= (v.end || v.start)).sort((a, b) => (a.name || "").localeCompare(b.name || "")); }
function renderCalendar() {
  const box = document.getElementById("calBox"); if (!box) return;
  const z = n => String(n).padStart(2, "0");
  const first = new Date(calYear, calMonth, 1);
  document.getElementById("calLabel").textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const startDow = (first.getDay() + 6) % 7;   // grid starts Monday
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = todayStr(), MAX = 4;
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let html = dow.map(d => `<div class="caldow">${d}</div>`).join("");
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  html += cells.map((d, i) => {
    if (d == null) return `<div class="calcell out"></div>`;
    const dStr = calYear + "-" + z(calMonth + 1) + "-" + z(d);
    const wknd = (i % 7) >= 5;
    const vs = vacsOnDay(dStr);
    let chips = vs.slice(0, MAX).map(v =>
      `<span class="calchip" style="color:${CLASS_COLOR[v.class] || "#ddd"}" title="${esc(v.name)}${v.class ? " · " + esc(v.class) : ""}${v.note ? " — " + esc(v.note) : ""}">${esc(v.name)}</span>`
    ).join("");
    if (vs.length > MAX) chips += `<span class="calchip" style="color:#9aa0a6" title="${vs.slice(MAX).map(v => esc(v.name)).join(", ")}">+${vs.length - MAX} more</span>`;
    return `<div class="calcell${dStr === today ? " today" : ""}${wknd ? " wknd" : ""}"><div class="caldate">${d}</div>${chips}</div>`;
  }).join("");
  box.innerHTML = `<div class="calgrid">${html}</div>`;
}
// collapsible sections — closed by default, fixed-height scroll inside
const secOpen = { active: true, all: false };
function toggleSec(key) {
  secOpen[key] = !secOpen[key];
  document.getElementById(key + "Wrap").style.display = secOpen[key] ? "" : "none";
  document.getElementById("caret" + key).textContent = secOpen[key] ? "▼" : "▶";
}
function editVac(key) { editingKey = key; render(); msg(""); }
function cancelEdit() { editingKey = ""; render(); }
async function saveEdit(key) {
  const v = VACS.find(x => x.key === key); if (!v) return;
  const s = document.getElementById("edStart").value, e = document.getElementById("edEnd").value;
  if (!s) { msg("From date is required.", "#ff6b6b"); return; }
  if (e && e < s) { msg("'To' is before 'From'.", "#ff6b6b"); return; }
  editingKey = "";
  msg("⏳ Saving…", "#8a8d93");
  try { await RatsData.updateVacation(key, { name: v.name, class: v.class || "", start: s, end: e || "", note: v.note || "", type: v.type || "vacation" }); await reload(); msg("✅ Updated " + v.name + " — shared.", "#7CFC8A"); }
  catch (err) { msg("❌ " + (err && err.message ? err.message : err), "#ff6b6b"); }
}
// vacation vs personal-time toggle (segmented, like the 25/10-man toggle)
let vacType = "vacation";
function setType(btn) {
  vacType = btn.dataset.t;
  btn.parentNode.querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
  updateDevPreview();
}
// typeahead picker (filters as you type, class-coloured)
let selName = "", selClass = "";
function acFilter() {
  const q = document.getElementById("vSearch").value.toLowerCase().trim();
  const list = document.getElementById("vList");
  const all = pickerList();
  if (!all.length) { list.innerHTML = '<div class="none">No member list yet — ask an officer to save the roster.</div>'; list.style.display = "block"; return; }
  const ms = (q ? all.filter(m => (m.name || "").toLowerCase().includes(q)) : all)
    .slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  list.innerHTML = ms.length
    ? ms.map(m => `<div class="opt" data-n="${esc(m.name)}" data-c="${esc(m.class || "")}" style="color:${CLASS_COLOR[m.class] || "#fff"}">${esc(m.name)}</div>`).join("")
    : '<div class="none">No match.</div>';
  list.style.display = "block";
}

// the "Vacations" webhook lives in this browser's saved hooks (Admin → Discord webhooks)
function vacWebhook() { try { const a = JSON.parse(localStorage.getItem("ratsWebhooks") || "[]"); const h = a.find(x => /vacation/i.test(x.name || "")); return (h && h.url) || ""; } catch (e) { return ""; } }
function daysBetween(s, e) { const a = new Date(s), b = new Date(e || s); return Math.round((b - a) / 86400000) + 1; }
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? (+m[3]) + " " + MON[+m[2] - 1] + " " + m[1] : (s || "—"); }

// ---- per-class flavor quips (a random one per vacation, stable so preview == posted) ----
const CLASS_QUIPS = {
  "Warrior": ["Charged off the edge of the calendar.", "Gone to find a bigger axe.", "Rage went on cooldown.", "Heroic Leap'd straight to the beach."],
  "Paladin": ["Bubble-hearthed to the beach.", "Even the Light takes a day off.", "AFK, blessing the buffet.", "Divine Shield up, raid invites bounce off."],
  "Hunter": ["Off feeding the pet… and himself.", "Misdirected all his duties to someone else.", "Gone hunting (the couch).", "Feign Death until further notice."],
  "Rogue": ["Vanished. Typical.", "Stealthed out of the raid roster.", "Pick-pocketed some PTO.", "Sapped by real life."],
  "Priest": ["Praying somewhere with better Wi-Fi.", "Out of mana for responsibilities.", "Faded — you can't see them now.", "Took a Spirit of Redemption nap."],
  "Shaman": ["Reincarnated… on a sofa.", "Ghost Wolf'd out the door.", "Totems left running, owner gone.", "Far Sight set to 'somewhere nice'."],
  "Mage": ["Blinked away from the raid.", "Conjured snacks, not attendance.", "Portal's down — can't make it back.", "Spent the week eating their own food."],
  "Warlock": ["Sold their soul for vacation days.", "Summoning stone, but make it tropical.", "The demons get PTO too.", "Soulstoned, will rez after the holiday."],
  "Druid": ["Hibernating — don't poke the bear.", "Travel Form: straight to bed.", "Rooted to the couch.", "Prowling the snack cupboard."],
  "Death Knight": ["On unholy leave.", "Risen from the grave, gone to brunch.", "Frost-bitten by the urge to rest.", "Army of the Dead can cover the raid."],
  "DK": ["On unholy leave.", "Army of the Dead can cover the raid."]
};
const GENERIC_QUIPS = ["Even rats need a nap. 🧀", "Off finding cheese.", "Scurried off for a bit. 🧀", "Gone to gnaw on something nice."];
function quipFor(v) {
  const list = CLASS_QUIPS[v.class] || GENERIC_QUIPS;
  const seed = (v.name || "") + "|" + (v.start || "");
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}
// soft, low-key card for personal time — no quip, no date range, no countdown timeline
function buildPersonalEmbed(v) {
  const hex = CLASS_COLOR[v.class] || "#9aa0a6";
  const noon = d => Math.floor(new Date(d + "T12:00:00").getTime() / 1000);
  const endD = v.end || v.start, s = noon(v.start), e = noon(endD);
  let desc = "_Taking some personal time._\n\n";
  desc += v.end && v.end !== v.start ? "🗓️ <t:" + s + ":D> → <t:" + e + ":D>" : "🗓️ <t:" + s + ":D>";
  if (v.note) desc += "\n\n📝 " + v.note;   // posts to the private officer channel
  return { author: { name: "RATS • Time off" }, title: "💤 " + v.name + " is away for a bit", color: parseInt(hex.slice(1), 16), description: desc };
}
function buildVacEmbed(v) {
  if (v.type === "personal") return buildPersonalEmbed(v);
  const hex = CLASS_COLOR[v.class] || "#43b581";
  const noon = d => Math.floor(new Date(d + "T12:00:00").getTime() / 1000);
  const endD = v.end || v.start, s = noon(v.start), e = noon(endD);
  const ret = new Date(endD + "T12:00:00"); ret.setDate(ret.getDate() + 1);
  const r = Math.floor(ret.getTime() / 1000), days = daysBetween(v.start, v.end);
  let desc = "_" + quipFor(v) + "_\n\n"
    + "🗓️ <t:" + s + ":D> → <t:" + e + ":D> · " + days + " day" + (days !== 1 ? "s" : "") + "\n"
    + "🛫 Starts <t:" + s + ":R>  ·  🛬 Back <t:" + r + ":R>";
  if (v.note) desc += "\n📝 " + v.note;
  return { author: { name: "RATS • Vacations" }, title: "🏖️ " + v.name + " will be away", color: parseInt(hex.slice(1), 16), description: desc };
}
async function postVacEmbed(url, v) { await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [buildVacEmbed(v)] }) }); }
// reminder card — sent the day BEFORE the absence starts
function buildReminderEmbed(v) {
  const hex = CLASS_COLOR[v.class] || "#43b581";
  const endD = v.end || v.start;
  const ret = new Date(endD + "T12:00:00"); ret.setDate(ret.getDate() + 1);
  const r = Math.floor(ret.getTime() / 1000);
  return { author: { name: "RATS • Vacation reminder" }, title: "🔔 " + v.name + " starts their absence tomorrow", description: "⏳ Back <t:" + r + ":R>", color: parseInt(hex.slice(1), 16) };
}
async function postReminder(url, v) { await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [buildReminderEmbed(v)] }) }); }
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); const z = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };

// ---- live preview — renders the embed like Discord, sends nothing ----
function relTime(unix) {
  const a = Math.abs(unix * 1000 - Date.now()), past = unix * 1000 < Date.now(), days = Math.round(a / 86400000);
  let t; if (days < 1) return "today"; else if (days < 14) t = days + " day" + (days !== 1 ? "s" : ""); else if (days < 60) t = Math.round(days / 7) + " weeks"; else t = Math.round(days / 30) + " months";
  return past ? t + " ago" : "in " + t;
}
function tsChip(unix, style) {
  const d = new Date(unix * 1000);
  const txt = style === "R" ? relTime(unix) : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  return `<span style="color:#00a8fc;background:rgba(0,168,252,.14);border-radius:3px;padding:0 3px">${txt}</span>`;
}
function previewDesc(raw) {
  let s = esc(raw);
  s = s.replace(/&lt;t:(\d+):([dDtTfFR])&gt;/g, (m, u, st) => tsChip(+u, st));
  s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/_(.+?)_/g, "<i>$1</i>");
  return s.replace(/\n/g, "<br>");
}
function renderEmbedCard(embed, hl) {
  const hex = "#" + (embed.color || 0).toString(16).padStart(6, "0");
  let title = esc(embed.title || "");
  if (hl && hl.name) { const safe = esc(hl.name); title = title.split(safe).join(`<span style="color:${hl.color}">${safe}</span>`); }
  return `<div style="border-left:4px solid ${hex};background:#2b2d31;border-radius:4px;padding:11px 15px;max-width:440px;font-family:'gg sans','Segoe UI',sans-serif">
    ${embed.author ? `<div style="font-size:12px;font-weight:600;color:#fff;margin-bottom:6px">${esc(embed.author.name)}</div>` : ""}
    ${embed.title ? `<div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:9px" title="Note: real Discord shows the whole title in white — the class colour only appears on the left bar">${title}</div>` : ""}
    ${embed.description ? `<div style="font-size:14px;color:#dbdee1;line-height:1.45;margin-bottom:8px">${previewDesc(embed.description)}</div>` : ""}
  </div>`;
}
function updateDevPreview() {
  const box = document.getElementById("devCard"); if (!box) return;
  const typed = document.getElementById("vSearch").value.trim();
  const picked = selName && selName.toLowerCase() === typed.toLowerCase();
  const name = picked ? selName : typed, cls = picked ? selClass : "";
  const start = document.getElementById("vStart").value, end = document.getElementById("vEnd").value, note = document.getElementById("vNote").value.trim();
  const type = vacType;
  if (!name || !start) { box.innerHTML = '<div class="empty" style="padding:2px">Pick your character and a From date to preview your card…</div>'; return; }
  if (end && end < start) { box.innerHTML = '<div class="empty" style="padding:2px;color:#ff6b6b">⚠️ "To" is before "From".</div>'; return; }
  const v = { name, class: cls, start, end, note, type };
  const hl = { name, color: CLASS_COLOR[cls] || "#fff" };
  const lbl = t => `<div style="font-size:11px;color:#6e7178;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin:0 0 5px">${t}</div>`;
  // officers see the extra "reminder · day before" card; guildies just see their away card
  let html = '<div style="display:flex;gap:22px;flex-wrap:wrap">'
    + '<div>' + (isOfficer ? lbl(type === "personal" ? "On + add" : "On + add vacation") : "") + renderEmbedCard(buildVacEmbed(v), hl) + '</div>';
  if (isOfficer && type !== "personal") html += '<div>' + lbl("Reminder · day before start") + renderEmbedCard(buildReminderEmbed(v), hl) + '</div>';
  box.innerHTML = html + '</div>';
}

// ---- officer-only auto-posting (poll + announce on guildies' behalf) ----
async function announceNew() {
  const url = vacWebhook(); if (!url) return;
  for (const v of VACS) {
    if (v.announced || !v.start) continue;
    try { await postVacEmbed(url, v); const e = Object.assign({}, v); delete e.key; e.announced = true; await RatsData.updateVacation(v.key, e); v.announced = true; }
    catch (err) { /* leave unannounced; retry next refresh */ }
  }
}
async function announceReminders() {
  const url = vacWebhook(); if (!url) return;
  const tm = tomorrowStr();
  for (const v of VACS) {
    if (v.type === "personal") continue;
    if (v.reminded || !v.start || v.start !== tm) continue;
    try { await postReminder(url, v); const e = Object.assign({}, v); delete e.key; e.reminded = true; await RatsData.updateVacation(v.key, e); v.reminded = true; }
    catch (err) { /* leave un-reminded; retry next refresh */ }
  }
}
async function purgeExpired() {
  const z = n => String(n).padStart(2, "0");
  const c = new Date(); c.setDate(c.getDate() - 30);
  const cutoff = c.getFullYear() + "-" + z(c.getMonth() + 1) + "-" + z(c.getDate());
  const stale = VACS.filter(v => { const end = v.end || v.start; return end && end < cutoff; });
  if (!stale.length) return;
  for (const v of stale) { try { await RatsData.removeVacation(v.key); } catch (e) { } }
  const dead = new Set(stale.map(v => v.key));
  VACS = VACS.filter(v => !dead.has(v.key));
}

async function loadVacs() {
  if (window.RatsData && RatsData.loadVacations) { try { const a = await RatsData.loadVacations(); return Array.isArray(a) ? a : []; } catch (e) { } }
  try { const r = await fetch(FB + "vacations.json", { cache: "no-store" }); const o = r.ok ? await r.json() : null; return o ? Object.keys(o).map(k => Object.assign({ key: k }, o[k])) : []; } catch (e) { return []; }
}
async function reload() {
  VACS = await loadVacs();
  if (isOfficer) await purgeExpired();
  render();
  if (isOfficer) { await announceNew(); await announceReminders(); }
}
async function addVac() {
  let name = selName, cls = selClass;
  const typed = document.getElementById("vSearch").value.trim();
  if (!name || name.toLowerCase() !== typed.toLowerCase()) {
    const m = pickerList().find(x => (x.name || "").toLowerCase() === typed.toLowerCase());
    if (m) { name = m.name; cls = m.class || ""; } else { msg("Pick your character from the list.", "#ff6b6b"); return; }
  }
  const start = document.getElementById("vStart").value, end = document.getElementById("vEnd").value;
  const note = document.getElementById("vNote").value.trim();
  const type = vacType;
  if (!start) { msg("Pick a From date.", "#ff6b6b"); return; }
  if (end && end < start) { msg("'To' is before 'From'.", "#ff6b6b"); return; }
  msg("⏳ Saving…", "#8a8d93");
  try {
    await RatsData.addVacation({ name, class: cls, start, end: end || "", note, type });
    document.getElementById("vSearch").value = ""; selName = ""; selClass = "";
    vacType = "vacation"; document.querySelectorAll("#typeSegs .seg").forEach(b => b.classList.toggle("active", b.dataset.t === "vacation"));
    document.getElementById("vStart").value = ""; document.getElementById("vEnd").value = ""; document.getElementById("vNote").value = "";
    if (window.RatsCal) RatsCal.sync();
    updateDevPreview();
    await reload(); msg(isOfficer ? ("✅ Added " + name + " — shared.") : "✅ Done — you're marked away. Have a good one! 🧀", "#7CFC8A");
  } catch (e) { msg("❌ " + (e && e.message ? e.message : e), "#ff6b6b"); }
}
// officer: manually re-post a single vacation's alert (doesn't touch the announced/reminded flags)
async function repostVac(key) {
  const v = VACS.find(x => x.key === key); if (!v) return;
  const url = vacWebhook();
  if (!url) { msg("❌ No 'Vacations' webhook saved (Admin → Discord webhooks).", "#ff6b6b"); return; }
  msg("⏳ Posting…", "#8a8d93");
  try { await postVacEmbed(url, v); msg("✅ Re-posted " + v.name + "'s alert to Discord.", "#7CFC8A"); }
  catch (e) { msg("❌ " + (e && e.message ? e.message : e), "#ff6b6b"); }
}
async function removeVac(key) {
  msg("⏳ Removing…", "#8a8d93");
  try { await RatsData.removeVacation(key); await reload(); msg("✅ Removed — shared.", "#7CFC8A"); }
  catch (e) { msg("❌ " + (e && e.message ? e.message : e), "#ff6b6b"); }
}

document.getElementById("vList").addEventListener("click", e => {
  const o = e.target.closest(".opt"); if (!o) return;
  selName = o.dataset.n; selClass = o.dataset.c;
  document.getElementById("vSearch").value = selName;
  document.getElementById("vList").style.display = "none";
  updateDevPreview();
});
document.addEventListener("click", e => { if (!e.target.closest("#vSearch") && !e.target.closest("#vList")) document.getElementById("vList").style.display = "none"; });

async function boot() {
  // reveal officer-only UI + retarget the back link
  if (isOfficer) {
    document.body.classList.add("officer");
    const att = document.getElementById("attLink"); if (att) att.style.display = "inline-flex";
    const cal = document.getElementById("calSection"); if (cal) cal.style.display = "block";
    const back = document.getElementById("backLink"); if (back) { back.href = "../../officer/index.html"; back.textContent = "← Back to Tools"; }
  }
  await loadPickerMembers();
  document.getElementById("previewWrap").style.display = "";
  ["vSearch", "vStart", "vEnd", "vNote"].forEach(id => document.getElementById(id).addEventListener("input", updateDevPreview));
  updateDevPreview();
  await reload();
  if (isOfficer) setInterval(reload, 60000); // officers pick up & announce new member-submitted vacations
}
boot();
