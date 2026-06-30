const AKEY = "ratsAdminKey";
const WH_RE = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/\S+/;

// Fixed webhook slots - names are canonical, tools match them by regex
const HOOKS = [
  { name: "RatRoster",  match: /ratroster|roster|raid|comp/i, desc: "Comp tool + History" },
  { name: "Logs",       match: /log|okanor/i,                 desc: "Changelog, guild alerts, addon notifier" },
  { name: "Vacations",  match: /vacation/i,                   desc: "Vacation cards" },
  { name: "LoreMaster", match: /loremaster|lore|story/i,      desc: "Lore posts" }
];

function dl(name, obj) {
  const a = document.createElement("a");
  a.download = name;
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: "application/json" }));
  a.click();
}
function msg(t, c) { const e = document.getElementById("msg"); e.style.color = c || "#7CFC8A"; e.textContent = t; }

function loadHooks() {
  try { const a = JSON.parse(localStorage.getItem("ratsWebhooks") || "null"); if (Array.isArray(a)) return a; } catch (e) {}
  const w = localStorage.getItem("ratsWebhook");
  return w ? [{ name: "RatRoster", url: w }] : [];
}

function renderHooks() {
  const saved = loadHooks();
  const list = document.getElementById("hookList");
  list.innerHTML = "";
  HOOKS.forEach(function(h, i) {
    const existing = saved.find(function(s) { return h.match.test(s.name || ""); }) || {};
    const row = document.createElement("div");
    row.className = "hookRow";
    row.dataset.hname = h.name;
    row.innerHTML =
      '<div class="hlbl"><strong></strong><span></span></div>' +
      '<input class="hUrl" type="password" placeholder="https://discord.com/api/webhooks/...">' +
      '<button type="button" class="dark icon-btn" title="show/hide" onclick="var u=this.previousElementSibling;u.type=u.type===\'password\'?\'text\':\'password\'">&#128065;</button>' +
      '<button type="button" class="dark" onclick="testHook(this)">Test</button>';
    row.querySelector("strong").textContent = h.name;
    row.querySelector("span").textContent = h.desc;
    row.querySelector(".hUrl").value = existing.url || "";
    list.appendChild(row);
  });
}

function saveHooks() {
  const rows = document.querySelectorAll("#hookList .hookRow");
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = r.dataset.hname;
    const url = r.querySelector(".hUrl").value.trim();
    if (!url) continue;
    if (!WH_RE.test(url)) { msg(name + ": invalid Discord webhook URL.", "#ff6b6b"); return; }
    out.push({ name: name, url: url });
  }
  localStorage.setItem("ratsWebhooks", JSON.stringify(out));
  const roster = out.find(function(h) { return /ratroster|roster|raid|comp/i.test(h.name); }) || out[0];
  if (roster) localStorage.setItem("ratsWebhook", roster.url); else localStorage.removeItem("ratsWebhook");
  msg("Saved " + out.length + " active webhook" + (out.length !== 1 ? "s" : "") + ".");
}

async function testHook(btn) {
  const url = (btn.closest(".hookRow").querySelector(".hUrl").value || "").trim();
  if (!WH_RE.test(url)) { msg("Enter a valid webhook URL in that row first.", "#ff6b6b"); return; }
  msg("Sending test...", "#8a8d93");
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "RATS admin - webhook test OK!" }) });
    msg(r.ok ? "Test sent to Discord!" : "Discord rejected it (HTTP " + r.status + ").", r.ok ? "#7CFC8A" : "#ff6b6b");
  } catch (e) { msg("Blocked (CORS / file://). Works on the hosted https site.", "#ff6b6b"); }
}

function showConsole() {
  document.getElementById("console").style.display = "";
  const k = localStorage.getItem("ratsGuildKey") || "";
  if (k) document.getElementById("guildKey").value = k;
  renderHooks();
}

function lockOverlay(blob) {
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:999;background:#0f1012;display:flex;align-items:center;justify-content:center";
  const card = document.createElement("div");
  card.style.cssText = "background:#202225;border:1px solid #2f3137;border-radius:10px;padding:24px;max-width:340px;width:90%;text-align:center";
  card.innerHTML =
    '<div style="font-size:38px;line-height:1">&#128295;&#128274;</div>' +
    '<div style="color:#fff;font-weight:800;font-size:17px;margin:8px 0 4px">Admin only</div>' +
    '<div style="color:#8a8d93;font-size:13px;margin-bottom:12px">Enter the admin password.</div>' +
    '<input id="ap" type="password" placeholder="Admin password" style="width:100%;background:#0f1012;color:#fff;border:1px solid #333;border-radius:6px;padding:0 10px;height:36px;font-size:13px;text-align:center;color-scheme:dark">' +
    '<div id="ae" style="color:#ff6b6b;font-size:12px;min-height:16px;margin:8px 0"></div>' +
    '<button id="ab" style="width:100%;background:#c0943a;color:#1b1d21;border:0;border-radius:6px;height:36px;font-weight:700;cursor:pointer;font-size:13px">Unlock</button>';
  ov.appendChild(card);
  document.body.appendChild(ov);
  const ip = card.querySelector("#ap"), ae = card.querySelector("#ae"), ab = card.querySelector("#ab");
  setTimeout(function() { ip.focus(); }, 50);
  async function go() {
    const p = ip.value; if (!p) return;
    ab.disabled = true; ae.style.color = "#8a8d93"; ae.textContent = "Checking...";
    try { await RatsData.decrypt(blob, p); localStorage.setItem(AKEY, p); ov.remove(); showConsole(); }
    catch (e) { ae.style.color = "#ff6b6b"; ae.textContent = "Wrong password."; ab.disabled = false; ip.select(); }
  }
  ab.onclick = go;
  ip.onkeydown = function(e) { if (e.key === "Enter") go(); };
}

async function init() {
  let blob = null;
  try { const r = await fetch("admin.json", { cache: "no-store" }); if (r.ok) blob = await r.json(); } catch (e) {}
  if (!blob || !(blob.enc || blob.ct)) {
    document.getElementById("banner").textContent = "First-time setup - no admin password yet. Set one below and commit admin.json to lock this console.";
    showConsole(); return;
  }
  const pass = localStorage.getItem(AKEY) || "";
  if (pass) {
    try { await RatsData.decrypt(blob, pass); showConsole(); return; } catch (e) { localStorage.removeItem(AKEY); }
  }
  lockOverlay(blob);
}

async function armLock() {
  const k = document.getElementById("guildKey").value.trim();
  if (!k) { msg("Enter a guild key first.", "#ff6b6b"); return; }
  localStorage.setItem("ratsGuildKey", k);
  dl("gate.json", await RatsData.encrypt({ gate: true }, k));
  msg("gate.json downloaded - commit it to arm the lock. Share the key in the officer channel.");
}

async function doBackup() {
  msg("Preparing backup...", "#8a8d93");
  try {
    const files = await RatsData.backup();
    msg(files.length ? "Downloaded " + files.join(" + ") + " - commit them via Fork." : "Nothing to back up yet.", files.length ? "#7CFC8A" : "#8a8d93");
  } catch (e) { msg("Backup failed: " + (e && e.message ? e.message : e), "#ff6b6b"); }
}

async function setAdmin() {
  const p = document.getElementById("adminPass").value.trim();
  if (!p) { msg("Enter an admin password.", "#ff6b6b"); return; }
  localStorage.setItem(AKEY, p);
  dl("admin.json", await RatsData.encrypt({ admin: true }, p));
  msg("admin.json downloaded - commit it to lock this console with that password.");
}

init();
