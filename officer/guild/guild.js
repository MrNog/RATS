const LS = "ratsGuild";
const CLASS_COLOR = {
  "Death Knight": "#C41E3A",
  Druid: "#FF7C0A",
  Hunter: "#AAD372",
  Mage: "#3FC7EB",
  Paladin: "#F58CBA",
  Priest: "#E6E6E6",
  Rogue: "#FFF569",
  Shaman: "#0070DD",
  Warlock: "#8788EE",
  Warrior: "#C69B6D",
};

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

// ---- spec icons (Discord emote ids, same set the Comp tool uses) ----
const CDN = (id) => "https://cdn.discordapp.com/emojis/" + id + ".png?size=44";
// per WoW class: [specLabel, emoteId, ...matchWords]. First word is what we store/show.
const SPECS = {
  "Death Knight": [["Blood", "1013371105874018405", "blood", "bdk"], ["Frost", "1013371107610468445", "frost"], ["Unholy", "1013371108575162419", "unholy", "uh"]],
  Druid: [["Balance", "637564171994529798", "balance", "boomkin", "boom", "moonkin", "bala"], ["Feral", "637564172061900820", "feral", "cat", "ferals"], ["Guardian", "637564171696734209", "guardian", "bear", "tank"], ["Restoration", "637564172007112723", "resto", "restoration", "restro", "rdudu", "healer", "heal"]],
  Hunter: [["Beastmastery", "637564202021814277", "bm", "beast"], ["Marksmanship", "637564202084466708", "mm", "marks", "marksman"], ["Survival", "637564202130866186", "surv", "survival"]],
  Mage: [["Arcane", "637564231545389056", "arcane"], ["Fire", "637564231239073802", "fire"], ["Frost", "637564231469891594", "frost"]],
  Paladin: [["Holy", "637564297622454272", "holy", "holylate", "preg"], ["Protection", "637564297647489034", "prot", "protection"], ["Retribution", "637564297953673216", "ret", "retri", "retribution"]],
  Priest: [["Discipline", "637564323442720768", "disc", "disco", "discipline"], ["Holy", "637564323530539019", "holy"], ["Shadow", "637564323291725825", "shadow"]],
  Rogue: [["Assassination", "637564351707873324", "sin", "assa", "assassination", "ass"], ["Combat", "637564352333086720", "combat"], ["Subtlety", "637564352169508892", "sub", "subtlety"]],
  Shaman: [["Elemental", "637564379595931649", "ele", "elem", "elemental", "spellhance"], ["Enhancement", "637564379772223489", "enh", "enha", "enhancement"], ["Restoration", "637564379847458846", "resto", "restoration", "healer", "heal"]],
  Warlock: [["Affliction", "637564406984867861", "affli", "affliction"], ["Demonology", "637564407001513984", "demo", "demonology"], ["Destruction", "637564406682877964", "destro", "destruction"]],
  Warrior: [["Arms", "637564445031399474", "arms"], ["Fury", "637564445215948810", "fury"], ["Protection", "637564444834136065", "prot", "protection", "tank"]],
};
// list of spec labels available for a class (for the editor dropdown)
function specsFor(cls) { return (SPECS[cls] || []).map((s) => s[0]); }
// find the emote id for a stored spec label under a class
function specEmote(cls, label) {
  const row = (SPECS[cls] || []).find((s) => s[0].toLowerCase() === String(label || "").toLowerCase());
  return row ? row[1] : null;
}
// guess a spec from the free-text publicNote — the spec whose keyword appears
// EARLIEST in the note wins (so "Shadow/Disco" -> Shadow, "Frost/Blood" -> Frost).
function guessSpec(m) {
  const rows = SPECS[m.class]; if (!rows) return "";
  const note = " " + String(m.publicNote || "").toLowerCase() + " ";
  let best = "", bestPos = Infinity;
  for (const row of rows) {
    for (let i = 2; i < row.length; i++) {
      const pos = note.search(new RegExp("[^a-z]" + row[i] + "[^a-z]"));
      if (pos >= 0 && pos < bestPos) { bestPos = pos; best = row[0]; }
    }
  }
  return best;
}
// resolved spec for a member: saved override first, else guessed from the note
function specOf(m) {
  const d = load();
  const saved = d && d.specs && d.specs[m.name];
  return saved || guessSpec(m);
}
function specIconHtml(m) {
  const sp = specOf(m); if (!sp) return "";
  const id = specEmote(m.class, sp); if (!id) return "";
  return `<img class="spici" src="${CDN(id)}" alt="${esc(sp)}" title="${esc(sp)} ${esc(m.class)}" loading="lazy">`;
}
function load() {
  try {
    return JSON.parse(localStorage.getItem(LS) || "null");
  } catch (e) {
    return null;
  }
}

const collapsed = new Set(["low"]); // low-level section starts collapsed
function toggleRank(i) {
  i = String(i);
  if (collapsed.has(i)) collapsed.delete(i);
  else collapsed.add(i);
  paint();
}

// derive the main character for an alt (from "<Main> Alt" in officer/public note)
function mainOf(m) {
  const on = (m.officerNote || "").trim();
  let mm = on.match(/^(.+?)\s+alt\b/i);
  if (mm) return mm[1].trim();
  const pn = (m.publicNote || "").trim();
  if (pn) {
    const t = pn.split(/[\s,/\-(]/)[0];
    if (t && /^[A-Za-zÀ-ÿ]{2,}$/.test(t)) return t;
  }
  return null;
}
// officer-note "<Main> Alt" marks an alt even when the rank isn't "Alt" (e.g. an alt parked on Officer)
function altMainNote(m) {
  const on = ((m && m.officerNote) || "").trim();
  const mm = on.match(/^(.+?)\s+alt\b/i);
  return mm ? mm[1].trim() : null;
}
function isAlt(m) {
  return m.rankIndex === 4 || /alt/i.test(m.rankName || "") || !!altMainNote(m);
}

// ---- auto-save: push the current local roster straight to Firebase (plain, no key) ----
// Fire-and-forget: the local copy is already saved; this shares it with the other officers.
async function autoShare(note) {
  const data = load();
  if (!data || !data.roster || !window.RatsData) return;
  try {
    const res = await RatsData.saveRoster(data);
    if (res.mode === "firebase") {
      // keep the public vacation picker in sync too
      try {
        const members = data.roster
          .filter((m) => !isAlt(m) && !/pug/i.test(m.rankName || ""))
          .map((m) => ({ name: m.name, class: m.class || "" }));
        await RatsData.publishMembers(members);
      } catch (e) {}
      if (note) setMsgOk(note + " · ☁️ shared with officers");
    } else if (note) {
      setMsgOk(note + " · 💾 saved locally (download to commit)");
    }
  } catch (e) {
    const el = document.getElementById("err");
    if (el) { el.style.color = "#ff6b6b"; el.textContent = "⚠️ Saved locally but sharing failed: " + e.message; }
  }
}

// ---- Fangs (10-man squad) — stored as a list of names in data.fangs, survives re-imports ----
function normNm(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function fangList() {
  const d = load();
  return d && Array.isArray(d.fangs) ? d.fangs : [];
}
function isFang(m) {
  const s = normNm(m.name);
  return fangList().some((n) => normNm(n) === s);
}
function joinedOf(m) {
  const d = load();
  return (d && d.joined && d.joined[m.name]) || "";
}
function toggleFang(name) {
  const d = load();
  if (!d) return;
  d.fangs = Array.isArray(d.fangs) ? d.fangs : [];
  const i = d.fangs.findIndex((n) => normNm(n) === normNm(name));
  if (i >= 0) d.fangs.splice(i, 1);
  else d.fangs.push(name);
  localStorage.setItem(LS, JSON.stringify(d));
  paint();
  autoShare("💀 Fangs updated");
}

// ---- Spec — stored in data.specs { name: specLabel }, survives re-imports (like fangs/joined) ----
function setSpec(name, spec) {
  const d = load();
  if (!d) return;
  d.specs = d.specs || {};
  if (spec) d.specs[name] = spec; else delete d.specs[name];
  localStorage.setItem(LS, JSON.stringify(d));
  paint();
  autoShare("🎯 " + esc(name) + " → " + (spec || "no spec"));
}
// close any open spec picker
function closeSpecMenu() { const m = document.getElementById("specMenu"); if (m) m.remove(); }
// open a small spec picker anchored to the clicked icon
function openSpecMenu(anchor, name, cls) {
  closeSpecMenu();
  const specs = specsFor(cls);
  if (!specs.length) { setMsgOk("No specs for " + cls + "."); return; }
  const cur = specOf({ name, class: cls, publicNote: "" });
  const menu = document.createElement("div");
  menu.id = "specMenu";
  menu.className = "specmenu";
  menu.innerHTML = specs.map((s) => {
    const id = specEmote(cls, s);
    return `<button class="specopt${s === cur ? " on" : ""}" data-spec="${esc(s)}">`
      + (id ? `<img src="${CDN(id)}" alt="">` : "") + esc(s) + `</button>`;
  }).join("") + `<button class="specopt clear" data-spec="">✕ clear</button>`;
  menu.addEventListener("click", (e) => {
    const b = e.target.closest(".specopt"); if (!b) return;
    e.stopPropagation();
    setSpec(name, b.getAttribute("data-spec"));
    closeSpecMenu();
  });
  menu.style.visibility = "hidden";
  document.body.appendChild(menu);
  // measure AFTER it's in the DOM, then clamp to the viewport
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = r.left + window.scrollX;
  let top = r.bottom + window.scrollY + 4;
  if (left + mw > window.scrollX + document.documentElement.clientWidth - 8)
    left = window.scrollX + document.documentElement.clientWidth - mw - 8;
  if (left < window.scrollX + 8) left = window.scrollX + 8;
  // if it would drop below the viewport, flip above the icon
  if (r.bottom + mh + 8 > document.documentElement.clientHeight)
    top = r.top + window.scrollY - mh - 4;
  menu.style.left = left + "px";
  menu.style.top = top + "px";
  menu.style.visibility = "";
}

// ---- profile keys (Path B): which mains have a published profile-page key (hash in `profiles`) ----
let PROFILE_KEYS = {}; // { charKey: true } — populated on boot from the plain `profiles` node
function hasProfileKey(name) {
  return !!PROFILE_KEYS[RatsData.profKey(name)];
}
async function loadProfileKeys() {
  try {
    PROFILE_KEYS = (await RatsData.loadProfiles()) || {};
  } catch (e) {
    PROFILE_KEYS = {};
  }
}
// ---- profile-key modal (open from the roster 🔑) ----
let KM = { name: "", cls: "" }; // the raider the key modal is currently about
function openKeyModal(name, cls) {
  KM = { name: name, cls: cls || "" };
  const has = hasProfileKey(name);
  document.getElementById("kmName").textContent = name;
  document.getElementById("kmGen").textContent = has ? "Regenerate" : "Generate";
  document.getElementById("kmRevoke").classList.toggle("hidden", !has);
  document.getElementById("kmKey").value = "";
  document.getElementById("kmCopy").textContent = "Copy";
  document.getElementById("kmErr").textContent = "";
  document.getElementById("keyModal").style.display = "flex";
}
function closeKeyModal() {
  document.getElementById("keyModal").style.display = "none";
}

async function kmGenerate() {
  try {
    const key = await RatsData.setProfileKey(KM.name, KM.cls);
    PROFILE_KEYS[RatsData.profKey(KM.name)] = true;
    try {
      await RatsData.clearKeyRequest(KM.name);
    } catch (e) {} // resolve any pending request
    paint();
    // reveal the raw key once (never stored, only its hash)
    document.getElementById("kmKey").value = key;
    document.getElementById("kmRevoke").classList.remove("hidden");
    document.getElementById("kmGen").textContent = "Regenerate";
  } catch (e) {
    document.getElementById("kmErr").textContent = "Failed: " + e.message;
  }
}

async function kmRevoke() {
  if (!confirm("Revoke the profile key for " + KM.name + "?")) return;
  try {
    await RatsData.clearProfileKey(KM.name);
    delete PROFILE_KEYS[RatsData.profKey(KM.name)];
    paint();
    closeKeyModal();
  } catch (e) {
    document.getElementById("kmErr").textContent = "Failed: " + e.message;
  }
}

async function copyKmKey() {
  const v = document.getElementById("kmKey").value;
  if (!v) return; // nothing generated yet
  try {
    await navigator.clipboard.writeText(v);
  } catch (e) {
    const i = document.getElementById("kmKey");
    i.select();
    document.execCommand && document.execCommand("copy");
  }
  document.getElementById("kmCopy").textContent = "Copied";
  setTimeout(() => {
    const b = document.getElementById("kmCopy");
    if (b) b.textContent = "Copy";
  }, 1500);
}

// ---- profile-key REQUESTS: poll the plain node, ping #okanor-logs for new ones (poll+announce) ----
// Discord forces title/description text white — only the left bar carries color, so we color it by class.
function buildKeyReqEmbed(name, cls) {
  const hex = CLASS_COLOR[cls] || "#c0943a";
  return {
    author: { name: "RATS • Profile keys" },
    title: "🔑 " + name + " requested a profile-key",
    color: parseInt(hex.slice(1), 16),
    description:
      "**" +
      name +
      "**" +
      (cls ? " · " + cls : "") +
      " wants their Raider Profile page.\n" +
      "Generate a key in the roster (🔑) and DM it to them. 🐀🧀",
  };
}

// ---- roster-change log: post the import diff (joined / left / rank changes) to #okanor-logs ----
// Returns null when there's nothing worth posting (no joins, no leaves, no rank changes).
function buildRosterChangeEmbed(diff, importDate) {
  if (!diff) return null;
  const joined = diff.joined || [],
    left = diff.left || [],
    rankCh = diff.rankCh || [];
  if (!joined.length && !left.length && !rankCh.length) return null;
  const fields = [];
  if (joined.length) fields.push({ name: "🟢 New members (" + joined.length + ")", value: joined.join(", ") });
  if (left.length) fields.push({ name: "🔴 Left the guild (" + left.length + ")", value: left.join(", ") });
  if (rankCh.length)
    fields.push({
      name: "🔁 Rank changes (" + rankCh.length + ")",
      value: rankCh.map((c) => c.name + ": " + c.from + " → " + c.to).join("\n"),
    });
  return {
    author: { name: "RATS • Roster" },
    title: "🐀 Roster updated — " + importDate,
    color: parseInt("c0943a", 16), // guild gold
    fields: fields,
    footer: { text: "Pulled from in-game roster" },
    timestamp: new Date().toISOString(),
  };
}
async function announceKeyRequests() {
  const url = logWebhook();
  if (!url) return; // no webhook saved -> nothing to do
  let reqs;
  try {
    reqs = await RatsData.loadKeyRequests();
  } catch (e) {
    return;
  }
  for (const ckey of Object.keys(reqs || {})) {
    const r = reqs[ckey];
    if (!r || r.announced || hasProfileKey(r.name)) continue; // already pinged, or key already exists
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [buildKeyReqEmbed(r.name, r.class)] }),
      });
      await RatsData.markKeyRequestAnnounced(ckey, r);
    } catch (e) {
      /* leave un-announced; retry next poll */
    }
  }
}

let pendingImport = null;
function openModal() {
  document.getElementById("modal").style.display = "flex";
  document.getElementById("modalErr").textContent = "";
  document.getElementById("diff").innerHTML = "";
  document.getElementById("logPreview").innerHTML = "";
  document.getElementById("confirmBtn").style.display = "none";
  pendingImport = null;
  setTimeout(() => document.getElementById("jsonIn").focus(), 50);
}
function closeModal() {
  document.getElementById("modal").style.display = "none";
}

const lc = (s) => (s || "").toLowerCase();
const ymd = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

// STEP 1 — parse + show what would change (nothing saved yet)
function importRoster() {
  let data;
  try {
    data = JSON.parse(document.getElementById("jsonIn").value.trim());
  } catch (e) {
    document.getElementById("modalErr").textContent = "❌ Invalid JSON.";
    return;
  }
  if (!data.roster || !Array.isArray(data.roster)) {
    document.getElementById("modalErr").textContent = "❌ No 'roster' array found.";
    return;
  }
  document.getElementById("modalErr").textContent = "";
  pendingImport = data;
  showDiff(load(), data);
  document.getElementById("confirmBtn").style.display = "";
}

function showDiff(oldData, nw) {
  const box = document.getElementById("diff");
  if (!oldData || !Array.isArray(oldData.roster)) {
    box.innerHTML = `<p class="sub" style="margin-top:12px">First import — <b>${nw.roster.length}</b> members will be added.</p>`;
    return;
  }
  const oldR = oldData.roster,
    oldBy = {},
    newBy = {};
  oldR.forEach((m) => (oldBy[lc(m.name)] = m));
  nw.roster.forEach((m) => (newBy[lc(m.name)] = m));
  const joined = nw.roster.filter((m) => !oldBy[lc(m.name)]);
  const left = oldR.filter((m) => !newBy[lc(m.name)]);
  const rankCh = nw.roster
    .map((m) => {
      const o = oldBy[lc(m.name)];
      return o && o.rankName !== m.rankName ? { name: m.name, from: o.rankName, to: m.rankName } : null;
    })
    .filter(Boolean);
  const fangsLost = (oldData.fangs || []).filter((n) => !newBy[lc(n)]);
  const joinedLost = Object.keys(oldData.joined || {}).filter((n) => !newBy[lc(n)]);

  // stash the diff so confirmImport() can post it to #okanor-logs
  if (pendingImport)
    pendingImport._diff = {
      joined: joined.map((m) => m.name),
      left: left.map((m) => m.name),
      rankCh: rankCh.map((c) => ({ name: c.name, from: c.from, to: c.to })),
    };

  const names = (arr) =>
    arr.length ? arr.map((m) => esc(m.name || m)).join(", ") : '<span style="color:#5e6166">none</span>';
  const sect = (color, label, html) =>
    `<div style="margin-top:8px"><b style="color:${color}">${label}</b><div class="sub" style="margin:2px 0 0">${html}</div></div>`;
  const importDate = nw.exportedAt ? ymd(new Date(nw.exportedAt * 1000)) : ymd(new Date());
  let html = `<div style="background:#16181c;border:1px solid #2f3137;border-radius:8px;padding:12px;margin-top:12px;max-height:280px;overflow:auto">`;
  html += sect("#7CFC8A", `🟢 New members (${joined.length}) — join date set to ${importDate}`, names(joined));
  html += sect("#ff8a8a", `🔴 Left the guild (${left.length})`, names(left));
  html += sect(
    "#c0943a",
    `🔁 Rank changes (${rankCh.length})`,
    rankCh.length
      ? rankCh.map((c) => `${esc(c.name)}: ${esc(c.from)} → ${esc(c.to)}`).join("<br>")
      : '<span style="color:#5e6166">none</span>'
  );
  if (fangsLost.length)
    html += sect("#ff8a8a", `💀 Fangs whose toon left (will be dropped) (${fangsLost.length})`, names(fangsLost));
  if (joinedLost.length)
    html += sect(
      "#ff8a8a",
      `📅 Join dates whose toon left (will be dropped) (${joinedLost.length})`,
      names(joinedLost)
    );
  html += `</div><p class="sub" style="margin:8px 0 0">💀 Fangs &amp; join dates for everyone still here are <b>kept</b>. Nothing is saved until you confirm.</p>`;
  box.innerHTML = html;

  // show what will be posted to #okanor-logs (baseline import posts nothing)
  renderLogPreview(
    oldData && Array.isArray(oldData.roster) && oldData.roster.length ? pendingImport._diff : null,
    importDate
  );
}

// Discord-embed mock of the roster-change alert that will post to #okanor-logs.
function renderLogPreview(diff, importDate) {
  const box = document.getElementById("logPreview");
  if (!box) return;
  const embed = buildRosterChangeEmbed(diff, importDate);
  if (!embed) {
    box.innerHTML = "";
    return;
  } // baseline / no changes -> nothing posts, no preview
  const hasHook = !!logWebhook();
  const fields = embed.fields
    .map(
      (f) =>
        `<div style="margin-top:6px"><div style="color:#fff;font-weight:600;font-size:12px">${esc(f.name)}</div>` +
        `<div class="sub" style="margin:1px 0 0;white-space:pre-wrap;font-size:12px">${esc(f.value)}</div></div>`
    )
    .join("");
  box.innerHTML =
    `<p class="sub" style="margin:0 0 4px;font-size:12px">📢 <b>Posts to #okanor-logs</b>` +
    (hasHook ? "" : ` <span style="color:#ff8a8a">⚠️ no webhook</span>`) +
    `</p>` +
    `<div style="display:flex;background:#2b2d31;border-radius:4px;overflow:hidden;max-height:280px;overflow-y:auto">` +
    `<div style="width:4px;background:#c0943a;flex:none"></div>` +
    `<div style="padding:8px 10px;min-width:0">` +
    `<div class="sub" style="font-size:10px;color:#b5bac1;margin-bottom:2px">RATS • Roster</div>` +
    `<div style="color:#fff;font-weight:600;font-size:13px">${esc(embed.title)}</div>` +
    fields +
    `<div class="sub" style="font-size:10px;color:#949ba4;margin-top:6px">Pulled from in-game roster</div>` +
    `</div></div>`;
}

// STEP 2 — merge & save (keep fangs + join dates for members still present)
function confirmImport() {
  if (!pendingImport) return;
  const oldData = load() || {};
  const data = pendingImport;
  const hadOld = Array.isArray(oldData.roster) && oldData.roster.length > 0;
  const newBy = {};
  data.roster.forEach((m) => (newBy[lc(m.name)] = true));
  const oldBy = {};
  (oldData.roster || []).forEach((m) => (oldBy[lc(m.name)] = true));

  // keep Fangs for members still present
  const fangs = (oldData.fangs || []).filter((n) => newBy[lc(n)]);
  if (fangs.length) data.fangs = fangs;

  // keep join dates for members still present
  const joined = oldData.joined || {},
    keptJoined = {};
  Object.keys(joined).forEach((n) => {
    if (newBy[lc(n)]) keptJoined[n] = joined[n];
  });

  // AUTO: a member who wasn't in the previous roster is new -> their join date = this import's date
  // (first import = baseline, nobody gets a join date so existing members aren't treated as newcomers)
  let added = 0;
  const importDate = data.exportedAt ? ymd(new Date(data.exportedAt * 1000)) : ymd(new Date());
  if (hadOld) {
    data.roster.forEach((m) => {
      if (!oldBy[lc(m.name)] && !keptJoined[m.name]) {
        keptJoined[m.name] = importDate;
        added++;
      }
    });
  }
  if (Object.keys(keptJoined).length) data.joined = keptJoined;

  // keep saved specs for members still present (survives re-import, like fangs/joined)
  const specs = oldData.specs || {}, keptSpecs = {};
  Object.keys(specs).forEach((n) => { if (newBy[lc(n)]) keptSpecs[n] = specs[n]; });
  if (Object.keys(keptSpecs).length) data.specs = keptSpecs;

  data.lastImport = Date.now(); // when the roster was last pulled from in-game into the hub
  localStorage.setItem(LS, JSON.stringify(data));
  // post the who-joined / who-left / rank-changes summary to #okanor-logs (only on a real diff, not the baseline)
  const diff = pendingImport._diff;
  pendingImport = null;
  closeModal();
  boot();
  let logNote = "";
  if (hadOld) logNote = postRosterChanges(diff, importDate);
  // share the merged roster with the officers immediately — no separate 💾 Save step
  autoShare(`✅ Roster merged — 💀 Fangs kept, ${added} new member${added !== 1 ? "s" : ""} dated ${hadOld ? importDate : "(baseline)"}.${logNote}`);
}

// fire-and-forget post of the roster diff to the Logs webhook; returns a short status suffix for the toast
function postRosterChanges(diff, importDate) {
  const embed = buildRosterChangeEmbed(diff, importDate);
  if (!embed) return ""; // nothing changed worth logging
  const url = logWebhook();
  if (!url) return " (⚠️ no Logs webhook set — add one in Admin to post changes to #okanor-logs)";
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  }).catch(() => {
    /* best-effort; the merge already succeeded */
  });
  return " · 📢 posted changes to #okanor-logs";
}

function buildRankFilter(data) {
  const sel = document.getElementById("rankSel");
  const cur = sel.value;
  sel.innerHTML = '<option value="">All ranks</option>';
  (data.ranks || [])
    .slice()
    .sort((a, b) => a.rankIndex - b.rankIndex)
    .forEach((r) => {
      const o = document.createElement("option");
      o.value = r.rankIndex;
      o.textContent = r.name;
      sel.appendChild(o);
    });
  sel.value = cur;
}

// ---- last in-game import timer (counts up until the next roster import) ----
function lastImportMs() {
  const d = load();
  if (!d) return 0;
  return d.lastImport || (d.exportedAt ? d.exportedAt * 1000 : 0);
}
function fmtDur(ms) {
  let s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (d) return d + "d " + h + "h";
  if (h) return h + "h " + m + "m";
  if (m) return m + "m " + s + "s";
  return s + "s";
}
function paintLastUpd() {
  const el = document.getElementById("lastUpdN");
  if (!el) return;
  const ms = lastImportMs();
  el.textContent = ms ? fmtDur(ms) : "—";
  // nudge the officer to re-import if it's getting stale
  const days = ms ? (Date.now() - ms) / 86400000 : 0;
  el.style.color = days >= 30 ? "#ff6b6b" : days >= STALE_DAYS ? "#e0b860" : "#fff";
  renderStale();
}
setInterval(paintLastUpd, 1000);

// ---- stale-roster alert -> #okanor-logs (after STALE_DAYS without an import) ----
const STALE_DAYS = 7;
const HUB_URL = "https://mrnog.github.io/rats/officer/guild/"; // <- set to your live hub roster page
// the on-page PREVIEW is dev-only (so the admin can design it); the webhook auto-send stays live for everyone
const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:";
function staleDays() {
  const ms = lastImportMs();
  return ms ? (Date.now() - ms) / 86400000 : 0;
}
function logWebhook() {
  try {
    const a = JSON.parse(localStorage.getItem("ratsWebhooks") || "[]");
    const h = a.find((x) => /log|okanor/i.test(x.name || ""));
    return (h && h.url) || "";
  } catch (e) {
    return "";
  }
}
function buildStaleEmbed() {
  const ms = lastImportMs(),
    days = Math.floor(staleDays());
  const when = ms
    ? new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    : "never";
  return {
    author: { name: "RATS • Roster" },
    title: "⚠️ Time to refresh the roster",
    url: HUB_URL,
    color: 0xe0b860,
    fields: [
      { name: "⏳ Stale for", value: "**" + days + " day" + (days !== 1 ? "s" : "") + "**", inline: true },
      { name: "📅 Last import", value: when, inline: true },
    ],
    description: "[🔗 Open the roster importer](" + HUB_URL + ")",
    footer: { text: "Run the in-game export → import it into the hub 🐀🧀" },
  };
}
function renderEmbedCard(embed) {
  const hex = "#" + (embed.color || 0).toString(16).padStart(6, "0");
  const md = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(
        /\[(.+?)\]\((https?:[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener" style="color:#00a8fc">$1</a>'
      )
      .replace(/\n/g, "<br>");
  const fields = (embed.fields || [])
    .map(
      (f) =>
        `<div style="${f.inline ? "min-width:120px" : "flex-basis:100%"}"><div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:1px">${md(f.name)}</div><div style="font-size:14px;color:#dbdee1">${md(f.value)}</div></div>`
    )
    .join("");
  const titleHtml = embed.url
    ? `<a href="${esc(embed.url)}" target="_blank" rel="noopener" style="color:#00a8fc;text-decoration:none">${esc(embed.title)}</a>`
    : esc(embed.title);
  return `<div style="border-left:4px solid ${hex};background:#2b2d31;border-radius:4px;padding:12px 15px;max-width:460px;font-family:'gg sans','Segoe UI',sans-serif">
        ${embed.author ? `<div style="font-size:12px;font-weight:600;color:#fff;margin-bottom:7px">${esc(embed.author.name)}</div>` : ""}
        ${embed.title ? `<div style="font-size:16px;font-weight:700;margin-bottom:${fields || embed.description ? "9px" : "0"}">${titleHtml}</div>` : ""}
        ${embed.description ? `<div style="font-size:14px;color:#dbdee1;line-height:1.5;margin-bottom:${fields ? "10px" : "0"}">${md(embed.description)}</div>` : ""}
        ${fields ? `<div style="display:flex;gap:22px;flex-wrap:wrap">${fields}</div>` : ""}
        ${embed.footer ? `<div style="font-size:12px;color:#949ba4;margin-top:11px">${esc(embed.footer.text)}</div>` : ""}
      </div>`;
}
function renderStale() {
  const wrap = document.getElementById("staleWrap");
  const card = document.getElementById("staleCard");
  if (!card) return;
  // preview is dev-only (localhost/file://) — production never shows it; the webhook still auto-sends
  if (!DEV || !load()) {
    if (wrap) wrap.style.display = "none";
    return;
  }
  if (wrap) wrap.style.display = "";
  const days = Math.floor(staleDays()),
    stale = days >= STALE_DAYS;
  card.innerHTML = renderEmbedCard(buildStaleEmbed());
  const note = document.getElementById("staleNote");
  note.textContent = stale
    ? `Roster is ${days} days old — alert is due.`
    : `Preview · auto-alerts after ${STALE_DAYS} days (currently ${days}).`;
  note.style.color = stale ? "#e0b860" : "#6e7178";
  document.getElementById("staleSend").style.display = stale && logWebhook() ? "" : "none";
}
async function sendStaleAlert(manual) {
  const url = logWebhook();
  if (!url) {
    if (manual) {
      const e = document.getElementById("err");
      e.style.color = "#ff6b6b";
      e.textContent = "❌ No #okanor-logs webhook saved (Admin → Discord webhooks).";
    }
    return;
  }
  if (!manual) {
    // auto: once per stale roster — re-arms only after a fresh import resets lastImport
    if (staleDays() < STALE_DAYS) return;
    if (String(lastImportMs()) === localStorage.getItem("ratsStaleNotifiedFor")) return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [buildStaleEmbed()] }),
    });
    localStorage.setItem("ratsStaleNotifiedFor", String(lastImportMs())); // mark this roster as already alerted
    if (manual) setMsgOk("✅ Posted the stale-roster alert to #okanor-logs.");
  } catch (e) {
    if (manual) {
      const el = document.getElementById("err");
      el.style.color = "#ff6b6b";
      el.textContent = "❌ Couldn't post: " + e.message;
    }
  }
}

// toggle button backed by a hidden checkbox (keeps .checked reads working)
function toggleChk(id, btn) {
  const c = document.getElementById(id);
  c.checked = !c.checked;
  btn.classList.toggle("active", c.checked);
  paint();
}

function paint() {
  const data = load();
  if (!data) return;
  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  const rankFilter = document.getElementById("rankSel").value;
  const hideAlts = document.getElementById("hideAlts").checked;

  let roster = data.roster.slice();
  if (hideAlts) roster = roster.filter((m) => !isAlt(m));
  if (document.getElementById("fangsOnly").checked) roster = roster.filter(isFang);
  if (rankFilter !== "") roster = roster.filter((m) => String(m.rankIndex) === rankFilter);
  if (q)
    roster = roster.filter(
      (m) =>
        (m.name || "").toLowerCase().includes(q) ||
        (m.publicNote || "").toLowerCase().includes(q) ||
        (m.officerNote || "").toLowerCase().includes(q) ||
        (m.class || "").toLowerCase().includes(q)
    );

  // stats (over the full roster, not the filtered view)
  const all = data.roster;
  const alts = all.filter(isAlt).length;
  const mains = all.length - alts;
  let stats = [
    ["Members", all.length],
    ["Mains", mains],
    ["Alts", alts],
    ["💀 Fangs", all.filter(isFang).length],
  ]
    .map((s) => `<div class="stat"><div class="n">${s[1]}</div><div class="l">${s[0]}</div></div>`)
    .join("");
  // last in-game import — a live counter, refreshed every second by the interval below
  const ms = lastImportMs();
  stats += `<div class="stat" id="lastUpdCard" title="${ms ? new Date(ms).toLocaleString() : "no import recorded yet"}">
        <div class="n" id="lastUpdN" style="font-size:15px;line-height:1.4">${ms ? fmtDur(ms) : "—"}</div>
        <div class="l">since in-game update</div></div>`;
  document.getElementById("stats").innerHTML = stats;
  paintLastUpd();

  // group filtered roster by rank, in rank order (Alt rank pushed to the bottom)
  const rankKey = (r) => (/alt/i.test(r.name) ? 999 : r.rankIndex);
  const ranksOrder = (data.ranks || []).slice().sort((a, b) => rankKey(a) - rankKey(b));
  const byRank = {};
  roster.forEach((m) => {
    (byRank[m.rankIndex] = byRank[m.rankIndex] || []).push(m);
  });

  const sortMode = document.getElementById("sortSel").value;
  const sortFn =
    sortMode === "class"
      ? (a, b) => (a.class || "").localeCompare(b.class || "") || (a.name || "").localeCompare(b.name || "")
      : sortMode === "level"
        ? (a, b) => (b.level || 0) - (a.level || 0) || (a.name || "").localeCompare(b.name || "")
        : (a, b) => (a.name || "").localeCompare(b.name || "");

  // low-level toons (leveling alts/banks, < 80) go in their own section at the bottom
  const isLow = (m) => (m.level || 0) < MAX_LEVEL;
  const section = (key, label, list, color) => {
    if (!list.length) return "";
    const isC = !q && collapsed.has(key); // searching expands all sections so matches show
    const head = `<div class="rhead" style="cursor:pointer;user-select:none${color ? ";color:" + color : ""}" onclick="toggleRank('${key}')"><span style="display:inline-block;width:14px;color:#8a8d93">${isC ? "▶" : "▼"}</span> ${esc(label)} <span class="c">(${list.length})</span></div>`;
    return `<div class="rank">${head}<div class="members"${isC ? ' style="display:none"' : ""}>${list.map(memberRow).join("")}</div></div>`;
  };

  let html = "";
  ranksOrder.forEach((r) => {
    const list = (byRank[r.rankIndex] || []).filter((m) => !isLow(m)).sort(sortFn);
    html += section(String(r.rankIndex), r.name, list);
  });
  const lows = roster.filter(isLow).sort(sortFn);
  html += section("low", "⬇ Low level (< " + MAX_LEVEL + ")", lows, "#8a8d93");
  document.getElementById("roster").innerHTML = html || `<p class="sub">No members match.</p>`;
}

const MAX_LEVEL = 80;
function memberRow(m) {
  const col = CLASS_COLOR[m.class] || "#fff";
  const main = isAlt(m) ? mainOf(m) : null;
  return `<div class="m" title="${esc(m.class)} · lvl ${m.level} · ${esc(m.publicNote || "")}">
        <span class="fang${isFang(m) ? " on" : ""}" data-name="${esc(m.name)}" title="Toggle Fang (10-man squad)">💀</span>
        <span class="spic" data-name="${esc(m.name)}" data-class="${esc(m.class)}" title="Set spec">${specIconHtml(m) || '<span class="spic-none">◦</span>'}</span>
        <span class="mn" style="color:${col}">${esc(m.name)}</span>
        <span class="lv">${m.level}</span>
        ${main ? `<span class="altof">↳ ${esc(main)}</span>` : ""}
        ${joinedOf(m) ? `<span class="joined" title="Joined the guild">📅 ${esc(joinedOf(m))}</span>` : ""}
        ${isAlt(m) ? "" : `<span class="pkey${hasProfileKey(m.name) ? " on" : ""}" data-name="${esc(m.name)}" data-class="${esc(m.class || "")}" title="${hasProfileKey(m.name) ? "Profile key set — click to regenerate" : "Generate a profile-page key for this raider"}" style="margin-left:auto">🔑</span>`}
        <a class="armory" href="https://armory.warmane.com/character/${encodeURIComponent(m.name)}/Onyxia/summary" target="_blank" rel="noopener" title="Open ${esc(m.name)} on Warmane Armory" onclick="event.stopPropagation()"${isAlt(m) ? ' style="margin-left:auto"' : ""}>🔗</a>
      </div>`;
}

// Manual "💾 Save roster" — a re-share button. Everything already auto-shares on change,
// so this is just a belt-and-braces push (no password: the roster is stored plain now).
async function exportRoster() {
  const data = load();
  if (!data || !data.roster) {
    alert("Import a roster first (📥 Import roster).");
    return;
  }
  await autoShare("✅ Roster re-shared with the officers");
}
function setMsgOk(t) {
  const e = document.getElementById("err");
  if (e) {
    e.style.color = "#7CFC8A";
    e.textContent = t;
  }
}

function boot() {
  const data = load();
  if (!data) {
    document.getElementById("metaLine").textContent = "No roster imported yet — click 📥 Import roster.";
    document.getElementById("stats").innerHTML = "";
    document.getElementById("roster").innerHTML = "";
    document.getElementById("staleWrap").style.display = "none";
    return;
  }
  document.getElementById("staleWrap").style.display = "";
  const when = data.exportedAt ? new Date(data.exportedAt * 1000).toLocaleString() : "unknown";
  document.getElementById("metaLine").innerHTML =
    `<b>${esc(data.guildName || "Guild")}</b> · ${esc(data.realm || "")} · ${data.roster.length} members · exported ${esc(when)}`;
  buildRankFilter(data);
  paint();
  sendStaleAlert(false); // auto-post to #okanor-logs if it's been too long (once/day)
  announceKeyRequests(); // ping #okanor-logs for any pending profile-key requests
  setInterval(announceKeyRequests, 60000); // keep picking up new requests while the page is open
}
// click a 💀 to toggle that member as a Fang (delegated; #roster persists across repaints)
document.getElementById("roster").addEventListener("click", (e) => {
  const f = e.target.closest(".fang");
  if (f) {
    e.stopPropagation();
    toggleFang(f.getAttribute("data-name"));
    return;
  }
  const k = e.target.closest(".pkey");
  if (k) {
    e.stopPropagation();
    openKeyModal(k.getAttribute("data-name"), k.getAttribute("data-class"));
    return;
  }
  const sp = e.target.closest(".spic");
  if (sp) {
    e.stopPropagation();
    openSpecMenu(sp, sp.getAttribute("data-name"), sp.getAttribute("data-class"));
    return;
  }
});
// click anywhere else closes the spec picker
document.addEventListener("click", (e) => { if (!e.target.closest("#specMenu") && !e.target.closest(".spic")) closeSpecMenu(); });

// load the shared (possibly encrypted) roster.json + the published profile keys, then render
if (window.RatsData) {
  Promise.all([loadProfileKeys(), RatsData.loadRoster({ interactive: false })]).then(boot);
} else {
  boot();
}
