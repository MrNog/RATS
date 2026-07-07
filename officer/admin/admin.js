const AKEY = "ratsAdminKey";
const WH_RE = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/\S+/;

// Fixed webhook slots - names are canonical, tools match them by regex
const HOOKS = [
  { name: "RatRoster", match: /ratroster|roster|raid|comp/i, desc: "Comp tool + History" },
  { name: "Logs", match: /log|okanor/i, desc: "Changelog, guild alerts, addon notifier" },
  { name: "Vacations", match: /vacation/i, desc: "Vacation cards" },
  { name: "LoreMaster", match: /loremaster|lore|story/i, desc: "Lore posts" },
];

function dl(name, obj) {
  const a = document.createElement("a");
  a.download = name;
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: "application/json" }));
  a.click();
}
function msg(t, c) {
  const e = document.getElementById("msg");
  e.style.color = c || "#7CFC8A";
  e.textContent = t;
}

function loadHooks() {
  try {
    const a = JSON.parse(localStorage.getItem("ratsWebhooks") || "null");
    if (Array.isArray(a)) return a;
  } catch (e) {}
  const w = localStorage.getItem("ratsWebhook");
  return w ? [{ name: "RatRoster", url: w }] : [];
}

function renderHooks() {
  const saved = loadHooks();
  const list = document.getElementById("hookList");
  list.innerHTML = "";
  HOOKS.forEach(function (h, i) {
    const existing =
      saved.find(function (s) {
        return h.match.test(s.name || "");
      }) || {};
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
    if (!WH_RE.test(url)) {
      msg(name + ": invalid Discord webhook URL.", "#ff6b6b");
      return;
    }
    out.push({ name: name, url: url });
  }
  localStorage.setItem("ratsWebhooks", JSON.stringify(out));
  const roster =
    out.find(function (h) {
      return /ratroster|roster|raid|comp/i.test(h.name);
    }) || out[0];
  if (roster) localStorage.setItem("ratsWebhook", roster.url);
  else localStorage.removeItem("ratsWebhook");
  msg("Saved " + out.length + " active webhook" + (out.length !== 1 ? "s" : "") + ".");
}

async function testHook(btn) {
  const url = (btn.closest(".hookRow").querySelector(".hUrl").value || "").trim();
  if (!WH_RE.test(url)) {
    msg("Enter a valid webhook URL in that row first.", "#ff6b6b");
    return;
  }
  msg("Sending test...", "#8a8d93");
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "RATS admin - webhook test OK!" }),
    });
    msg(r.ok ? "Test sent to Discord!" : "Discord rejected it (HTTP " + r.status + ").", r.ok ? "#7CFC8A" : "#ff6b6b");
  } catch (e) {
    msg("Blocked (CORS / file://). Works on the hosted https site.", "#ff6b6b");
  }
}

function renderStatus() {
  const el = document.getElementById("statusRow");
  if (!el) return;
  const hasKey = !!(localStorage.getItem("ratsGuildKey") || "");
  const hasApi = !!(localStorage.getItem("ratsLogsApiKey") || "");
  const hooks = loadHooks().filter((h) => (h.url || "").trim()).length;
  const consoleLocked = !!window.__adminLocked;
  const pill = (on, onTxt, offTxt) =>
    '<span class="statPill ' + (on ? "ok" : "off") + '">' + (on ? onTxt : offTxt) + "</span>";
  el.innerHTML =
    pill(consoleLocked, "&#128274; Console locked", "&#128275; Console open") +
    pill(hasKey, "&#128273; Guild key set", "&#128273; No guild key") +
    pill(hasApi, "&#128273; API key set", "&#128273; No API key") +
    pill(hooks > 0, "&#128227; " + hooks + " webhook" + (hooks !== 1 ? "s" : ""), "&#128227; No webhooks");
}

function showConsole() {
  document.getElementById("console").style.display = "";
  const k = localStorage.getItem("ratsGuildKey") || "";
  if (k) document.getElementById("guildKey").value = k;
  renderHooks();
  renderStatus();
  prefillApiKey();
  refreshApiUsage();
}

// Prefill the API-key field from the shared (encrypted) store — localStorage first, Firebase once.
async function prefillApiKey() {
  const el = document.getElementById("logsApiKey");
  if (!el) return;
  try {
    const k = await RatsData.loadApiKey();
    if (k) el.value = k;
  } catch (e) {}
}

// Paint the usage box. `note` overrides the default line (used for the live per-minute figure).
function showApiUsage(used, cap, month, note) {
  cap = cap || 15000;
  const pct = used != null ? Math.min(100, Math.round((used / cap) * 1000) / 10) : 0;
  document.getElementById("auCount").textContent = used != null ? used.toLocaleString() : "—";
  document.getElementById("auCap").textContent = "/ " + cap.toLocaleString();
  const bar = document.getElementById("auBar");
  bar.style.width = pct + "%";
  bar.style.background = pct >= 90 ? "#e05656" : pct >= 70 ? "#d6a12a" : "var(--accent)";
  document.getElementById("auNote").textContent =
    note || ("Our count" + (month ? " (" + month + ")" : "") + " — every Rankings Fetch adds to it. Resets monthly.");
}

// Auto-load on open: read ONLY the Firebase counter (no API call, no cost).
async function refreshApiUsage() {
  if (!document.getElementById("apiUsage") || !RatsData.loadApiUsage) return;
  try {
    const u = await RatsData.loadApiUsage();
    showApiUsage(u.count || 0, 15000, u.month);
  } catch (e) {
    document.getElementById("auNote").textContent = "";
  }
}

// Live check (button): our monthly count + the API's per-minute header. Costs 1 call (and counts it).
async function checkApiUsage() {
  const note = document.getElementById("auNote");
  if (!RatsData.checkApiUsage) return;
  note.textContent = "Checking…";
  let u;
  try {
    u = await RatsData.checkApiUsage();
  } catch (e) {
    refreshApiUsage();
    msg("Couldn't check usage: " + (e && e.message ? e.message : e), "#ff6b6b");
    return;
  }
  const extra =
    u.minuteRemaining != null && u.minuteLimit != null
      ? " · " + u.minuteRemaining + "/" + u.minuteLimit + " this minute (live)"
      : "";
  showApiUsage(
    u.monthlyUsed,
    u.monthlyLimit,
    u.month,
    "Our count (" + u.month + ")" + extra + " — server's monthly header is unreliable."
  );
}

async function saveLogsApiKey() {
  const el = document.getElementById("logsApiKey");
  const k = (el.value || "").trim();
  if (!k) { msg("Paste the wl_live_ key first.", "#ff6b6b"); return; }
  if (!/^wl_(live|test)_/.test(k)) { msg("That doesn't look like a wl_live_/wl_test_ key.", "#ff6b6b"); return; }
  try {
    await RatsData.saveApiKey(k);
    msg("API key saved (encrypted, shared with all officers).");
    renderStatus();
  } catch (e) {
    msg("Couldn't save: " + (e && e.message ? e.message : e), "#ff6b6b");
  }
}

async function testLogsApiKey() {
  const k = (document.getElementById("logsApiKey").value || "").trim();
  if (!k) { msg("Paste a key to test.", "#ff6b6b"); return; }
  msg("Testing key against the API...", "#8a8d93");
  try {
    const r = await fetch("https://api.wow-logs.co.in/api/v1/health", {
      headers: { Authorization: "Bearer " + k }, cache: "no-store",
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j && j.ok) {
      const l = j.data.limits || {};
      msg("Key OK — tier " + j.data.tier + " (" + l.rpmLimit + "/min, " + l.monthlyLimit + "/month).");
    } else {
      msg("Rejected: " + ((j && j.error && j.error.message) || ("HTTP " + r.status)) + ".", "#ff6b6b");
    }
  } catch (e) {
    msg("Blocked (CORS / file://). Works on the hosted https site.", "#ff6b6b");
  }
}

function forgetLogsApiKey() {
  if (!confirm("Forget the API key cached in THIS browser? The shared encrypted copy in Firebase stays.")) return;
  RatsData.clearApiKey();
  document.getElementById("logsApiKey").value = "";
  renderStatus();
  msg("API key cleared from this browser (Firebase copy untouched).");
}

// --- reset controls (this browser only; never touches committed json or Firebase) ---
function forgetGuildKey() {
  if (!confirm("Forget the guild key stored in THIS browser? You'll need to re-enter it to use officer tools.")) return;
  localStorage.removeItem("ratsGuildKey");
  document.getElementById("guildKey").value = "";
  renderStatus();
  msg("Guild key cleared from this browser.");
}
function clearAllHooks() {
  if (!confirm("Clear all webhook URLs saved in this browser?")) return;
  localStorage.removeItem("ratsWebhooks");
  localStorage.removeItem("ratsWebhook");
  renderHooks();
  renderStatus();
  msg("All webhooks cleared from this browser.");
}
function adminLogout() {
  if (!confirm("Log out of the admin console in this browser?")) return;
  localStorage.removeItem(AKEY);
  location.reload();
}

function lockOverlay(blob) {
  const ov = document.createElement("div");
  ov.style.cssText =
    "position:fixed;inset:0;z-index:999;background:#0f1012;display:flex;align-items:center;justify-content:center";
  const card = document.createElement("div");
  card.style.cssText =
    "background:#202225;border:1px solid #2f3137;border-radius:10px;padding:24px;max-width:340px;width:90%;text-align:center";
  card.innerHTML =
    '<div style="font-size:38px;line-height:1">&#128295;&#128274;</div>' +
    '<div style="color:#fff;font-weight:800;font-size:17px;margin:8px 0 4px">Admin only</div>' +
    '<div style="color:#8a8d93;font-size:13px;margin-bottom:12px">Enter the admin password.</div>' +
    '<input id="ap" type="password" placeholder="Admin password" style="width:100%;background:#0f1012;color:#fff;border:1px solid #333;border-radius:6px;padding:0 10px;height:36px;font-size:13px;text-align:center;color-scheme:dark">' +
    '<div id="ae" style="color:#ff6b6b;font-size:12px;min-height:16px;margin:8px 0"></div>' +
    '<button id="ab" style="width:100%;background:#c0943a;color:#1b1d21;border:0;border-radius:6px;height:36px;font-weight:700;cursor:pointer;font-size:13px">Unlock</button>';
  ov.appendChild(card);
  document.body.appendChild(ov);
  const ip = card.querySelector("#ap"),
    ae = card.querySelector("#ae"),
    ab = card.querySelector("#ab");
  setTimeout(function () {
    ip.focus();
  }, 50);
  async function go() {
    const p = ip.value;
    if (!p) return;
    ab.disabled = true;
    ae.style.color = "#8a8d93";
    ae.textContent = "Checking...";
    try {
      await RatsData.decrypt(blob, p);
      localStorage.setItem(AKEY, p);
      ov.remove();
      showConsole();
    } catch (e) {
      ae.style.color = "#ff6b6b";
      ae.textContent = "Wrong password.";
      ab.disabled = false;
      ip.select();
    }
  }
  ab.onclick = go;
  ip.onkeydown = function (e) {
    if (e.key === "Enter") go();
  };
}

async function init() {
  let blob = null;
  try {
    const r = await fetch("admin.json", { cache: "no-store" });
    if (r.ok) blob = await r.json();
  } catch (e) {}
  window.__adminLocked = !!(blob && (blob.enc || blob.ct));
  if (!blob || !(blob.enc || blob.ct)) {
    document.getElementById("banner").textContent =
      "First-time setup - no admin password yet. Set one below and commit admin.json to lock this console.";
    showConsole();
    return;
  }
  const pass = localStorage.getItem(AKEY) || "";
  if (pass) {
    try {
      await RatsData.decrypt(blob, pass);
      showConsole();
      return;
    } catch (e) {
      localStorage.removeItem(AKEY);
    }
  }
  lockOverlay(blob);
}

async function armLock() {
  const k = document.getElementById("guildKey").value.trim();
  if (!k) {
    msg("Enter a guild key first.", "#ff6b6b");
    return;
  }
  localStorage.setItem("ratsGuildKey", k);
  dl("gate.json", await RatsData.encrypt({ gate: true }, k));
  msg("gate.json downloaded - commit it to arm the lock. Share the key in the officer channel.");
}

async function doBackup() {
  msg("Preparing backup...", "#8a8d93");
  try {
    const files = await RatsData.backup();
    msg(
      files.length ? "Downloaded " + files.join(" + ") + " - commit them via Fork." : "Nothing to back up yet.",
      files.length ? "#7CFC8A" : "#8a8d93"
    );
  } catch (e) {
    msg("Backup failed: " + (e && e.message ? e.message : e), "#ff6b6b");
  }
}

async function setAdmin() {
  const p = document.getElementById("adminPass").value.trim();
  if (!p) {
    msg("Enter an admin password.", "#ff6b6b");
    return;
  }
  localStorage.setItem(AKEY, p);
  dl("admin.json", await RatsData.encrypt({ admin: true }, p));
  msg("admin.json downloaded - commit it to lock this console with that password.");
}

init();
