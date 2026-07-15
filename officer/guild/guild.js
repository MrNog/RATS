const LS = "ratsGuild";
const MAX_LEVEL = 80;
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
const lc = (s) => (s || "").toLowerCase();
const ymd = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

function load() {
  try {
    return JSON.parse(localStorage.getItem(LS) || "null");
  } catch (e) {
    return null;
  }
}
function save(d) {
  localStorage.setItem(LS, JSON.stringify(d));
}
function setMsg(t, bad) {
  const e = document.getElementById("err");
  if (!e) return;
  e.style.color = bad ? "#ff6b6b" : "#7CFC8A";
  e.textContent = t;
}

// ---- spec icons (Discord emote ids, same set the Comp tool uses) ----
const CDN = (id) => "https://cdn.discordapp.com/emojis/" + id + ".png?size=44";
// per WoW class: [specLabel, emoteId, ...matchWords]. First word is what we store/show.
const SPECS = {
  "Death Knight": [
    ["Blood", "1013371105874018405", "blood", "bdk"],
    ["Frost", "1013371107610468445", "frost"],
    ["Unholy", "1013371108575162419", "unholy", "uh"],
  ],
  Druid: [
    ["Balance", "637564171994529798", "balance", "boomkin", "boom", "moonkin", "bala"],
    ["Feral", "637564172061900820", "feral", "cat", "ferals"],
    ["Guardian", "637564171696734209", "guardian", "bear", "tank"],
    ["Restoration", "637564172007112723", "resto", "restoration", "restro", "rdudu", "healer", "heal"],
  ],
  Hunter: [
    ["Beastmastery", "637564202021814277", "bm", "beast"],
    ["Marksmanship", "637564202084466708", "mm", "marks", "marksman"],
    ["Survival", "637564202130866186", "surv", "survival"],
  ],
  Mage: [
    ["Arcane", "637564231545389056", "arcane"],
    ["Fire", "637564231239073802", "fire"],
    ["Frost", "637564231469891594", "frost"],
  ],
  Paladin: [
    ["Holy", "637564297622454272", "holy", "holylate", "preg"],
    ["Protection", "637564297647489034", "prot", "protection"],
    ["Retribution", "637564297953673216", "ret", "retri", "retribution"],
  ],
  Priest: [
    ["Discipline", "637564323442720768", "disc", "disco", "discipline"],
    ["Holy", "637564323530539019", "holy"],
    ["Shadow", "637564323291725825", "shadow"],
  ],
  Rogue: [
    ["Assassination", "637564351707873324", "sin", "assa", "assassination", "ass"],
    ["Combat", "637564352333086720", "combat"],
    ["Subtlety", "637564352169508892", "sub", "subtlety"],
  ],
  Shaman: [
    ["Elemental", "637564379595931649", "ele", "elem", "elemental", "spellhance"],
    ["Enhancement", "637564379772223489", "enh", "enha", "enhancement"],
    ["Restoration", "637564379847458846", "resto", "restoration", "healer", "heal"],
  ],
  Warlock: [
    ["Affliction", "637564406984867861", "affli", "affliction"],
    ["Demonology", "637564407001513984", "demo", "demonology"],
    ["Destruction", "637564406682877964", "destro", "destruction"],
  ],
  Warrior: [
    ["Arms", "637564445031399474", "arms"],
    ["Fury", "637564445215948810", "fury"],
    ["Protection", "637564444834136065", "prot", "protection", "tank"],
  ],
};
function specsFor(cls) {
  return (SPECS[cls] || []).map((s) => s[0]);
}
function specEmote(cls, label) {
  const row = (SPECS[cls] || []).find((s) => s[0].toLowerCase() === String(label || "").toLowerCase());
  return row ? row[1] : null;
}
// guess a spec from the free-text publicNote - the spec whose keyword appears
// EARLIEST in the note wins (so "Shadow/Disco" -> Shadow, "Frost/Blood" -> Frost).
function guessSpec(m) {
  const rows = SPECS[m.class];
  if (!rows) return "";
  const note = " " + String(m.publicNote || "").toLowerCase() + " ";
  let best = "",
    bestPos = Infinity;
  for (const row of rows) {
    for (let i = 2; i < row.length; i++) {
      const pos = note.search(new RegExp("[^a-z]" + row[i] + "[^a-z]"));
      if (pos >= 0 && pos < bestPos) {
        bestPos = pos;
        best = row[0];
      }
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
  const sp = specOf(m);
  const id = sp && specEmote(m.class, sp);
  if (!id) return '<span class="spic-none">&#9702;</span>';
  return `<img class="spici" src="${CDN(id)}" alt="${esc(sp)}" title="${esc(sp)} ${esc(m.class)}" loading="lazy">`;
}

// ---- alts / fangs / join dates ----
// officer-note "<Main> Alt" marks an alt even when the rank isn't "Alt" (e.g. an alt parked on Officer)
// "<Main> Alt" in the officer note — the explicit, unambiguous alt marker.
function altMainNote(m) {
  const mm = ((m && m.officerNote) || "").trim().match(/^(.+?)\s+alt\b/i);
  return mm ? mm[1].trim() : null;
}
// Explicit "<Main> Alt" in the PUBLIC note — some alts are marked here instead, on a non-alt rank (e.g.
// Shackaa: publicNote "Shockaa Alt", rankIndex 5). MUST require the literal "alt" keyword: the public note
// is mostly spec/profession text ("Fury/Arms", "Resto JC", "Shadow"), so a lenient first-word parse would
// misread ~60 members as alts of their spec. Only the "<name> alt" form is an alt marker here.
function altMainPublicNote(m) {
  const mm = ((m && m.publicNote) || "").trim().match(/^(.+?)\s+alt\b/i);
  return mm ? mm[1].trim() : null;
}
function isAlt(m) {
  return (
    m.rankIndex === 4 ||
    /alt/i.test(m.rankName || "") ||
    !!altMainNote(m) ||
    !!altMainPublicNote(m) // explicit "<Main> Alt" in the public note (non-alt rank)
  );
}
// derive the main character for an alt. Only called once isAlt() is true, so the lenient first-word
// fallback here is safe — it just extracts the main name from a note we already know marks an alt.
function mainOf(m) {
  const explicit = altMainNote(m) || altMainPublicNote(m);
  if (explicit) return explicit;
  const pn = (m.publicNote || "").trim();
  if (pn) {
    const t = pn.split(/[\s,/\-(]/)[0];
    if (t && /^[A-Za-zÀ-ÿ]{2,}$/.test(t)) return t;
  }
  return null;
}
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
function toggleFang(name) {
  const d = load();
  if (!d) return;
  d.fangs = Array.isArray(d.fangs) ? d.fangs : [];
  const i = d.fangs.findIndex((n) => normNm(n) === normNm(name));
  if (i >= 0) d.fangs.splice(i, 1);
  else d.fangs.push(name);
  save(d);
  paint();
  autoShare("&#128128; Fangs updated");
}
// Spec override - stored in data.specs { name: specLabel }, survives re-imports (like fangs/joined)
function setSpec(name, spec) {
  const d = load();
  if (!d) return;
  d.specs = d.specs || {};
  if (spec) d.specs[name] = spec;
  else delete d.specs[name];
  save(d);
  paint();
  autoShare(esc(name) + " -> " + (spec || "no spec"));
}

// ---- auto-save: push the current local roster straight to Firebase ----
// Fire-and-forget: the local copy is already saved; this shares it with the other officers
// and republishes the public name+class picker (profile search / vacation picker).
function mainsForPicker(roster) {
  return roster
    .filter((m) => !isAlt(m) && !/pug/i.test(m.rankName || ""))
    .map((m) => ({ name: m.name, class: m.class || "" }));
}
// World-readable alt/rank snapshot for the public profile page (barracksFor's public path). Without this
// the `profiles` node stays empty and every raider with alts shows "lone rat" to non-officers — the alt
// links only lived in the ENCRYPTED roster, which the public page can't read. Keyed by profKey. A main
// carries its resolved alts[]; an alt carries mainOf so a visit to the alt redirects to the pack.
function profilesForPublish(roster) {
  const key = (n) => (window.RatsData ? RatsData.profKey(n) : normNm(n));
  const map = {};
  // index mains by key so we can attach alts, and resolve each alt's main
  roster.forEach((m) => {
    if (/pug/i.test(m.rankName || "")) return; // pugs aren't raiders — keep them off profiles
    map[key(m.name)] = {
      name: m.name,
      class: m.class || "",
      level: m.level || null,
      rank: m.rankName || "",
      fang: isFang(m),
    };
  });
  roster.forEach((m) => {
    if (!isAlt(m)) return;
    const main = mainOf(m);
    if (!main) return;
    const ak = key(m.name), mk = key(main);
    if (map[ak]) map[ak].mainOf = main; // alt → its main
    if (map[mk]) {
      (map[mk].alts = map[mk].alts || []).push({ name: m.name, class: m.class || "", level: m.level || null });
    }
  });
  return map;
}
async function autoShare(note) {
  const data = load();
  if (!data || !data.roster || !window.RatsData) return;
  try {
    const res = await RatsData.saveRoster(data);
    if (res.mode === "firebase") {
      try {
        await RatsData.publishMembers(mainsForPicker(data.roster));
      } catch (e) {}
      try {
        await RatsData.publishProfiles(profilesForPublish(data.roster));
      } catch (e) {}
      if (note) setMsg(note + " - shared with officers");
    } else if (note) {
      setMsg(note + " - saved locally");
    }
  } catch (e) {
    setMsg("Saved locally but sharing failed: " + e.message, true);
  }
}

// ---- import ----
let pendingImport = null;
function openModal() {
  document.getElementById("modal").style.display = "flex";
  document.getElementById("modalErr").textContent = "";
  document.getElementById("diff").innerHTML = "";
  document.getElementById("confirmBtn").style.display = "none";
  pendingImport = null;
  setTimeout(() => document.getElementById("jsonIn").focus(), 50);
}
function closeModal() {
  document.getElementById("modal").style.display = "none";
}

// STEP 1 - parse + show what would change (nothing saved yet)
function importRoster() {
  let data;
  try {
    data = JSON.parse(document.getElementById("jsonIn").value.trim());
  } catch (e) {
    document.getElementById("modalErr").textContent = "Invalid JSON.";
    return;
  }
  if (!data.roster || !Array.isArray(data.roster)) {
    document.getElementById("modalErr").textContent = "No 'roster' array found.";
    return;
  }
  document.getElementById("modalErr").textContent = "";
  pendingImport = data;
  showDiff(load(), data);
  document.getElementById("confirmBtn").style.display = "";
}

function showDiff(oldData, nw) {
  const box = document.getElementById("diff");
  if (!oldData || !Array.isArray(oldData.roster) || !oldData.roster.length) {
    box.innerHTML = `<p class="sub">First import - <b>${nw.roster.length}</b> members will be added.</p>`;
    return;
  }
  const oldBy = {},
    newBy = {};
  oldData.roster.forEach((m) => (oldBy[lc(m.name)] = m));
  nw.roster.forEach((m) => (newBy[lc(m.name)] = m));
  const joined = nw.roster.filter((m) => !oldBy[lc(m.name)]).map((m) => m.name);
  const left = oldData.roster.filter((m) => !newBy[lc(m.name)]).map((m) => m.name);
  const rankCh = nw.roster
    .map((m) => {
      const o = oldBy[lc(m.name)];
      return o && o.rankName !== m.rankName ? { name: m.name, from: o.rankName, to: m.rankName } : null;
    })
    .filter(Boolean);

  // stash the diff so confirmImport() can post it to #okanor-logs
  pendingImport._diff = { joined, left, rankCh };

  const importDate = nw.exportedAt ? ymd(new Date(nw.exportedAt * 1000)) : ymd(new Date());
  const names = (arr) => (arr.length ? arr.map(esc).join(", ") : '<span class="none">none</span>');
  const grp = (color, label, html) =>
    `<div class="grp"><b style="color:${color}">${label}</b><div class="list">${html}</div></div>`;
  box.innerHTML =
    `<div class="diff">` +
    grp("#7CFC8A", `New members (${joined.length}) - joined ${importDate}`, names(joined)) +
    grp("#ff8a8a", `Left the guild (${left.length})`, names(left)) +
    grp(
      "var(--accent)",
      `Rank changes (${rankCh.length})`,
      rankCh.length
        ? rankCh.map((c) => `${esc(c.name)}: ${esc(c.from)} &rarr; ${esc(c.to)}`).join("<br>")
        : '<span class="none">none</span>'
    ) +
    `</div><p class="sub">Fangs, specs &amp; join dates are kept. Nothing is saved until you confirm.</p>`;
}

// STEP 2 - merge & save (keep fangs, specs + join dates for members still present)
function confirmImport() {
  if (!pendingImport) return;
  const oldData = load() || {};
  const data = pendingImport;
  const hadOld = Array.isArray(oldData.roster) && oldData.roster.length > 0;
  const newBy = {},
    oldBy = {};
  data.roster.forEach((m) => (newBy[lc(m.name)] = true));
  (oldData.roster || []).forEach((m) => (oldBy[lc(m.name)] = true));

  const fangs = (oldData.fangs || []).filter((n) => newBy[lc(n)]);
  if (fangs.length) data.fangs = fangs;

  const keptSpecs = {};
  Object.keys(oldData.specs || {}).forEach((n) => {
    if (newBy[lc(n)]) keptSpecs[n] = oldData.specs[n];
  });
  if (Object.keys(keptSpecs).length) data.specs = keptSpecs;

  const keptJoined = {};
  Object.keys(oldData.joined || {}).forEach((n) => {
    if (newBy[lc(n)]) keptJoined[n] = oldData.joined[n];
  });
  // AUTO: a member who wasn't in the previous roster is new -> join date = this import's date
  // (first import = baseline, nobody gets a join date so existing members aren't treated as newcomers)
  const importDate = data.exportedAt ? ymd(new Date(data.exportedAt * 1000)) : ymd(new Date());
  let added = 0;
  if (hadOld) {
    data.roster.forEach((m) => {
      if (!oldBy[lc(m.name)] && !keptJoined[m.name]) {
        keptJoined[m.name] = importDate;
        added++;
      }
    });
  }
  if (Object.keys(keptJoined).length) data.joined = keptJoined;

  data.lastImport = Date.now(); // when the roster was last pulled from in-game into the hub
  save(data);
  const diff = pendingImport._diff;
  pendingImport = null;
  closeModal();
  boot();
  if (hadOld) postRosterChanges(diff, importDate);
  autoShare(`Roster merged - ${added} new member${added !== 1 ? "s" : ""}`);
}

// ---- Discord: roster-change log + stale-roster nag (both auto, no UI) ----
function logWebhook() {
  try {
    const a = JSON.parse(localStorage.getItem("ratsWebhooks") || "[]");
    const h = a.find((x) => /log|okanor/i.test(x.name || ""));
    return (h && h.url) || "";
  } catch (e) {
    return "";
  }
}
function postEmbed(embed) {
  const url = logWebhook();
  if (!url || !embed) return false;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  }).catch(() => {
    /* best-effort */
  });
  return true;
}
// who joined / who left / rank changes, posted to #okanor-logs after a real (non-baseline) import
function postRosterChanges(diff, importDate) {
  if (!diff) return;
  const fields = [];
  if (diff.joined.length)
    fields.push({ name: "🟢 New members (" + diff.joined.length + ")", value: diff.joined.join(", ") });
  if (diff.left.length)
    fields.push({ name: "🔴 Left the guild (" + diff.left.length + ")", value: diff.left.join(", ") });
  if (diff.rankCh.length)
    fields.push({
      name: "🔁 Rank changes (" + diff.rankCh.length + ")",
      value: diff.rankCh.map((c) => c.name + ": " + c.from + " -> " + c.to).join("\n"),
    });
  if (!fields.length) return;
  postEmbed({
    author: { name: "RATS - Roster" },
    title: "🐀 Roster updated - " + importDate,
    color: 0xc0943a,
    fields: fields,
    footer: { text: "Pulled from in-game roster" },
    timestamp: new Date().toISOString(),
  });
}

const STALE_DAYS = 7;
const HUB_URL = "https://mrnog.github.io/rats/officer/guild/";
function lastImportMs() {
  const d = load();
  if (!d) return 0;
  return d.lastImport || (d.exportedAt ? d.exportedAt * 1000 : 0);
}
function staleDays() {
  const ms = lastImportMs();
  return ms ? (Date.now() - ms) / 86400000 : 0;
}
// auto-nag once per stale roster - re-arms only after a fresh import resets lastImport
function sendStaleAlert() {
  const ms = lastImportMs();
  if (staleDays() < STALE_DAYS) return;
  if (String(ms) === localStorage.getItem("ratsStaleNotifiedFor")) return;
  const days = Math.floor(staleDays());
  const when = ms ? new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "never";
  const sent = postEmbed({
    author: { name: "RATS - Roster" },
    title: "⚠️ Time to refresh the roster",
    url: HUB_URL,
    color: 0xe0b860,
    fields: [
      { name: "⏳ Stale for", value: "**" + days + " day" + (days !== 1 ? "s" : "") + "**", inline: true },
      { name: "📅 Last import", value: when, inline: true },
    ],
    description: "[Open the roster importer](" + HUB_URL + ")",
    footer: { text: "Run the in-game export, then import it into the hub" },
  });
  if (sent) localStorage.setItem("ratsStaleNotifiedFor", String(ms));
}

// ---- render ----
const collapsed = new Set(["low"]); // low-level section starts collapsed
function toggleRank(i) {
  i = String(i);
  if (collapsed.has(i)) collapsed.delete(i);
  else collapsed.add(i);
  paint();
}
// toggle button backed by a hidden checkbox (keeps .checked reads working)
function toggleChk(id, btn) {
  const c = document.getElementById(id);
  c.checked = !c.checked;
  btn.classList.toggle("active", c.checked);
  paint();
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
function fmtStale(ms) {
  if (!ms) return "never";
  const d = Math.floor((Date.now() - ms) / 86400000);
  if (d >= 1) return d + (d === 1 ? " day" : " days") + " ago";
  const h = Math.floor((Date.now() - ms) / 3600000);
  return h >= 1 ? h + "h ago" : "just now";
}

function memberRow(m) {
  const col = CLASS_COLOR[m.class] || "#fff";
  const main = isAlt(m) ? mainOf(m) : null;
  const joined = (load().joined || {})[m.name] || "";
  const tip = [esc(m.class), "lvl " + m.level, joined ? "joined " + esc(joined) : "", esc(m.publicNote || "")]
    .filter(Boolean)
    .join(" - ");
  return `<div class="m" title="${tip}">
        <span class="fang${isFang(m) ? " on" : ""}" data-name="${esc(m.name)}" title="Toggle Fang (10-man squad)">&#128128;</span>
        <span class="spic" data-name="${esc(m.name)}" data-class="${esc(m.class)}" title="Set spec">${specIconHtml(m)}</span>
        <span class="mn" style="color:${col}">${esc(m.name)}</span>
        <span class="lv">${m.level}</span>
        ${main ? `<span class="altof">&rarr; ${esc(main)}</span>` : ""}
        <a class="armory" href="https://armory.warmane.com/character/${encodeURIComponent(m.name)}/Onyxia/summary" target="_blank" rel="noopener" title="Warmane Armory">&#128279;</a>
      </div>`;
}

function paint() {
  const data = load();
  if (!data) return;
  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  const rankFilter = document.getElementById("rankSel").value;

  let roster = data.roster.slice();
  if (document.getElementById("hideAlts").checked) roster = roster.filter((m) => !isAlt(m));
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

  // stats are over the FULL roster, not the filtered view
  const all = data.roster;
  const alts = all.filter(isAlt).length;
  const cards = [
    ["Members", all.length],
    ["Mains", all.length - alts],
    ["Alts", alts],
    ["💀 Fangs", all.filter(isFang).length],
    ["Last import", fmtStale(lastImportMs())],
  ];
  document.getElementById("stats").innerHTML = cards
    .map(
      (c, i) =>
        `<div class="stat"><div class="n"${i === 4 ? ' style="font-size:15px;line-height:1.35"' : ""}>${c[1]}</div><div class="l">${c[0]}</div></div>`
    )
    .join("");

  // group by rank, in rank order (Alt rank pushed to the bottom, low-level toons to their own section)
  const rankKey = (r) => (/alt/i.test(r.name) ? 999 : r.rankIndex);
  const ranksOrder = (data.ranks || []).slice().sort((a, b) => rankKey(a) - rankKey(b));
  const byRank = {};
  roster.forEach((m) => (byRank[m.rankIndex] = byRank[m.rankIndex] || []).push(m));
  const byName = (a, b) => (a.class || "").localeCompare(b.class || "") || (a.name || "").localeCompare(b.name || "");
  const isLow = (m) => (m.level || 0) < MAX_LEVEL;

  const section = (key, label, list, low) => {
    if (!list.length) return "";
    const isC = !q && collapsed.has(key); // searching expands all sections so matches show
    return `<div class="rank">
        <div class="rhead${low ? " low" : ""}" onclick="toggleRank('${key}')">
          <span class="caret">${isC ? "&#9654;" : "&#9660;"}</span> ${esc(label)} <span class="c">(${list.length})</span>
        </div>
        <div class="members"${isC ? ' style="display:none"' : ""}>${list.map(memberRow).join("")}</div>
      </div>`;
  };

  let html = "";
  ranksOrder.forEach((r) => {
    html += section(String(r.rankIndex), r.name, (byRank[r.rankIndex] || []).filter((m) => !isLow(m)).sort(byName));
  });
  html += section("low", "Low level (< " + MAX_LEVEL + ")", roster.filter(isLow).sort(byName), true);
  document.getElementById("roster").innerHTML = html || `<p class="sub">No members match.</p>`;
}

function boot() {
  const data = load();
  if (!data) {
    document.getElementById("metaLine").textContent = "No roster imported yet - click Import roster.";
    document.getElementById("stats").innerHTML = "";
    document.getElementById("roster").innerHTML = "";
    return;
  }
  const when = data.exportedAt ? new Date(data.exportedAt * 1000).toLocaleDateString() : "unknown";
  document.getElementById("metaLine").innerHTML =
    `<b>${esc(data.guildName || "Guild")}</b> &middot; ${esc(data.realm || "")} &middot; ${data.roster.length} members &middot; exported ${esc(when)}`;
  buildRankFilter(data);
  paint();
  sendStaleAlert(); // auto-post to #okanor-logs if the roster has gone stale
}

// click a fang to toggle, a spec icon to pick (delegated; #roster persists across repaints)
document.getElementById("roster").addEventListener("click", (e) => {
  const f = e.target.closest(".fang");
  if (f) {
    e.stopPropagation();
    toggleFang(f.getAttribute("data-name"));
    return;
  }
  const sp = e.target.closest(".spic");
  if (sp) {
    e.stopPropagation();
    openSpecMenu(sp, sp.getAttribute("data-name"), sp.getAttribute("data-class"));
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#specMenu") && !e.target.closest(".spic")) closeSpecMenu();
});

function closeSpecMenu() {
  const m = document.getElementById("specMenu");
  if (m) m.remove();
}
// small spec picker anchored to the clicked icon, clamped to the viewport
function openSpecMenu(anchor, name, cls) {
  closeSpecMenu();
  const specs = specsFor(cls);
  if (!specs.length) return;
  const cur = specOf({ name, class: cls, publicNote: "" });
  const menu = document.createElement("div");
  menu.id = "specMenu";
  menu.className = "specmenu";
  menu.innerHTML =
    specs
      .map((s) => {
        const id = specEmote(cls, s);
        return (
          `<button class="specopt${s === cur ? " on" : ""}" data-spec="${esc(s)}">` +
          (id ? `<img src="${CDN(id)}" alt="">` : "") +
          esc(s) +
          `</button>`
        );
      })
      .join("") + `<button class="specopt clear" data-spec="">clear</button>`;
  menu.addEventListener("click", (e) => {
    const b = e.target.closest(".specopt");
    if (!b) return;
    e.stopPropagation();
    setSpec(name, b.getAttribute("data-spec"));
    closeSpecMenu();
  });
  menu.style.visibility = "hidden";
  document.body.appendChild(menu);
  // measure AFTER it's in the DOM, then clamp
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth,
    mh = menu.offsetHeight;
  let left = Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - mw - 8);
  left = Math.max(left, window.scrollX + 8);
  const top =
    r.bottom + mh + 8 > document.documentElement.clientHeight
      ? r.top + window.scrollY - mh - 4
      : r.bottom + window.scrollY + 4;
  menu.style.left = left + "px";
  menu.style.top = top + "px";
  menu.style.visibility = "";
}

// load the shared roster, then render
if (window.RatsData) {
  RatsData.loadRoster({ interactive: false }).then(boot);
} else {
  boot();
}
