/* RATS — Attendance (officer). Who raids in our ID, by the rules picked in game.

   Read at a glance: three columns, Top / Middle / Bottom, raiders and mains only
   (alts count for their main and are never listed). The logic lives in
   assets/js/attendance.js (RatsAtt), shared with loot prio, so both read the same
   list. This file draws it, saves the officers' marks and imports the Okanvil
   export. History is read ONCE on load; every tab, filter and search re-renders
   from memory (Firebase reads cost). */
"use strict";

const CLASS_COLOR = {
  "Death Knight": "#C41E3A", DK: "#C41E3A", Druid: "#FF7C0A", Hunter: "#AAD372", Mage: "#3FC7EB",
  Paladin: "#F58CBA", Priest: "#FFFFFF", Rogue: "#FFF468", Shaman: "#0070DD", Warlock: "#8788EE", Warrior: "#C69B6D",
};
// rank tag colours, by the tag ("Warchief Rat" -> WR); anything else is dim
const RANK_COLOR = { KR: "#b37fe0", WF: "#c0392b", WR: "#e05a5a", RR: "#e0a060", SR: "#8a8d93" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHOW = 12; // names per column before "Show all"

const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
function msg(t, c) {
  const e = $("msg");
  e.style.color = c || "";
  e.textContent = t || "";
}
function shortDate(s) {
  const d = new Date(s + "T00:00:00");
  return isNaN(d) ? s : d.getDate() + " " + MONTHS[d.getMonth()];
}
function empty(text) {
  return `<div class="empty">${text}</div>`;
}
function rankTag(rankName) {
  const ab = String(rankName || "").replace(/'s\b/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return ab ? `<span class="rk" style="color:${RANK_COLOR[ab] || "var(--text-faint)"}">${esc(ab)}</span>` : "";
}
function nameHtml(r) {
  return `<span class="nm" style="color:${CLASS_COLOR[r.cls] || "#ddd"}">${esc(r.name)}</span>`;
}

let HIST = null;
let VAC = [];
// per-browser view choices (never the data)
const UI = { view: "board", period: "8", who: "raiders", size: "all", q: "", open: {}, editing: null, raid: null };
try {
  const s = JSON.parse(localStorage.getItem("ratsAttUi") || "{}");
  if (/^(board|week|extra|raids)$/.test(s.view || "")) UI.view = s.view;
  if (/^(4|8|all)$/.test(s.period || "")) UI.period = s.period;
  if (/^(raiders|all)$/.test(s.who || "")) UI.who = s.who;
  if (/^(all|25|10)$/.test(s.size || "")) UI.size = s.size;
} catch (e) {}
function saveUi() {
  try {
    localStorage.setItem("ratsAttUi", JSON.stringify({ view: UI.view, period: UI.period, who: UI.who, size: UI.size }));
  } catch (e) {}
}

function guildData() {
  try {
    return JSON.parse(localStorage.getItem("ratsGuild") || "null") || {};
  } catch (e) {
    return {};
  }
}
function attOpts(extra) {
  const g = guildData();
  return Object.assign({
    raids: HIST.raids || [], roster: g.roster || [], joined: g.joined || {}, vac: VAC,
    excuses: HIST.excuses || {}, elsewhere: HIST.elsewhere || {}, letters: HIST.letters || {},
    ourIds: HIST.ourIds || {}, rules: HIST.attRules || null, exempt: HIST.exempt10 || {},
  }, extra || {});
}
// the period picked: raids from the lockout week N-1 weeks back
function periodFilter() {
  if (UI.period === "all") return null;
  const n = Number(UI.period);
  const cut = RatsAtt.lockoutStart(new Date(Date.now() - (n - 1) * 7 * 86400000));
  return (r) => r.date >= cut;
}
function whoOk(r) {
  return UI.who === "all" || !/sewer/i.test(r.rankName || "");
}
function searchOk(r) {
  const q = UI.q.toLowerCase().trim();
  return !q || r.name.toLowerCase().includes(q);
}

// ---------------------------------------------------------------- header
function renderRules(rules) {
  if (!rules.must.length && !rules.extra.length) {
    $("rules").innerHTML = "No rules yet. Pick them in game (<b>Okanvil → Attendance → Rules</b>), then import.";
    return;
  }
  const parts = [];
  if (rules.must.length) parts.push(`Mandatory <b>${esc(RatsAtt.mustLabel(rules))}</b>`);
  if (rules.extra.length) parts.push(`Extra <b>${esc(RatsAtt.extraLabel(rules))}</b>`);
  parts.push("raiders and mains only, alts count for their main");
  $("rules").innerHTML = parts.join('<span class="sep">·</span>');
}

// ---------------------------------------------------------------- three columns
// cols: [{ key, title, range, tone, items: [{ r, right, sub, tags, bar }] }]
function columns(cols) {
  return `<div class="board">${cols.map((c) => {
    const open = !!UI.open[c.key];
    const shown = open ? c.items : c.items.slice(0, SHOW);
    const li = shown.map((it, i) => `
      <li><span class="pos">${i + 1}</span>
        <span class="who">${rankTag(it.r.rankName)}${nameHtml(it.r)}${it.tags || ""}<span class="runs">${it.sub || ""}</span></span>
        <span class="val">${it.right}</span>
        <span class="bar"><i style="width:${Math.max(it.bar || 0, 3)}%"></i></span>${it.after || ""}</li>`).join("");
    const more = c.items.length > SHOW
      ? `<button class="btn more" type="button" data-more="${c.key}">${open ? "Show less" : "Show all " + c.items.length}</button>` : "";
    return `<div class="col ${c.tone}">
        <h2>${c.title} <span class="rng">${c.range}</span><span class="c">${c.items.length}</span></h2>
        ${c.items.length ? `<ol>${li}</ol>${more}` : `<p class="none">${c.none || "Nobody."}</p>`}
      </div>`;
  }).join("")}</div>`;
}

// ---------------------------------------------------------------- board
function weekStrip(att) {
  const wed = RatsAtt.lockoutStart(new Date());
  const c = att.chains.find((x) => x.wed === wed);
  if (!c) return "";
  const b = { in: [], elsewhere: [], open: [] };
  att.rows.forEach((r) => {
    const m = r.marks.find((x) => x.c === c);
    if (m && b[m.st] && whoOk(r)) b[m.st].push(r);
  });
  const names = b.elsewhere.map(nameHtml).join(", ");
  return `<div class="strip">
      <span class="k">This week</span>
      <span class="it"><b class="gold">${b.in.length}</b> with us</span>
      <span class="it"><b class="bad">${b.elsewhere.length}</b> saved elsewhere${names ? ": " + names : ""}</span>
      <span class="it"><b class="mid">${b.open.length}</b> not in yet</span>
    </div>`;
}

function renderBoard() {
  const el = $("vboard");
  const att = RatsAtt.compute(attOpts({ filter: periodFilter() }));
  renderRules(att.rules);
  if (!att.rules.must.length) {
    el.innerHTML = empty("Nothing is mandatory yet.");
    return;
  }
  // the list is about the whole history, whatever period is on screen
  const listed = UI.period === "all" ? att.listed : RatsAtt.compute(attOpts()).listed;
  const rows = att.rows.filter((r) => r.pct != null && whoOk(r) && searchOk(r));
  const byPct = (a, b) => b.pct - a.pct || a.rankIndex - b.rankIndex || a.name.localeCompare(b.name);
  const nWeeks = att.chains.length;
  const item = (r) => {
    const now = r.marks[0] || {};
    const pen = listed[r.name.toLowerCase()];
    const tags = (pen ? '<i class="tag miss" title="Pugged a mandatory raid without an excuse: bottom of every loot list until ' + pen.left + ' more of our main runs">missed ID · ' + pen.left + ' to go</i>' : "") +
      (now.st === "vac" ? '<i class="tag vac">vacation</i>' : "") +
      (r.marks.length < nWeeks ? '<i class="tag new" title="Joined during this period">new</i>' : "");
    const counted = r.marks.filter((x) => /^(in|elsewhere|absent)$/.test(x.st)).length;
    return { r, right: r.pct + "%", sub: r.came + "/" + counted, tags, bar: r.pct };
  };
  const top = rows.filter((r) => r.pct >= 80).sort(byPct).map(item);
  const mid = rows.filter((r) => r.pct >= 50 && r.pct < 80).sort(byPct).map(item);
  const bot = rows.filter((r) => r.pct < 50).sort((a, b) => a.pct - b.pct || a.rankIndex - b.rankIndex || a.name.localeCompare(b.name)).map(item);
  el.innerHTML = weekStrip(att) + columns([
    { key: "top", title: "Top", range: "80–100%", tone: "top", items: top },
    { key: "mid", title: "Middle", range: "50–79%", tone: "midc", items: mid },
    { key: "bot", title: "Bottom", range: "under 50%", tone: "bot", items: bot },
  ]);
}

// ---------------------------------------------------------------- this week
const SRC = { run: "recorded run", officer: "set by an officer", letters: "raiders' letters" };

function excuseEditor(wed, name) {
  const e = UI.editing;
  if (!e || e.wed !== wed || e.name !== name) return "";
  return `<div class="edit">
      <input type="text" id="exReason" placeholder="Why (e.g. cleared before the pug, real life)">
      <button type="button" data-act="saveEx">Save</button>
      <button type="button" class="btn" data-act="cancel">Cancel</button>
    </div>`;
}

function renderWeek() {
  const el = $("vweek");
  const att = RatsAtt.compute(attOpts());
  renderRules(att.rules);
  if (!att.rules.must.length) {
    el.innerHTML = empty("Nothing is mandatory yet.");
    return;
  }
  const wed = RatsAtt.lockoutStart(new Date());
  const c = att.chains.find((x) => x.wed === wed);
  if (!c) {
    el.innerHTML = empty(`No run and no letters for the week of ${shortDate(wed)} yet.`);
    return;
  }
  const b = { in: [], elsewhere: [], open: [], excused: [], vac: [] };
  att.rows.forEach((r) => {
    const m = r.marks.find((x) => x.c === c);
    if (m && b[m.st] && whoOk(r) && searchOk(r)) b[m.st].push({ r, m });
  });
  const stat = (n, label, tone) => `<div class="stat ${tone}"><b>${n}</b><span>${label}</span></div>`;
  const ids = c.raids.map((x) => `${esc(RatsAtt.refLabel(x.ref))} <b>${x.ours ? esc(x.ours) : "no ID yet"}</b>` +
    (x.ours ? ` <span class="dim">${SRC[x.source] || ""}</span>` : "")).join('<span class="sep">·</span>');

  let html = `<div class="stats">
      ${stat(b.in.length, "with us", "in")}
      ${stat(b.elsewhere.length, "saved elsewhere", "miss")}
      ${stat(b.open.length, "not in yet", "open")}
      ${stat(b.excused.length + b.vac.length, "excused", "ok")}
    </div>
    <p class="ids">Week of ${shortDate(wed)}<span class="sep">·</span>${ids}</p>`;

  html += `<h2 class="hsec">Saved elsewhere</h2>`;
  if (!b.elsewhere.length && !b.excused.length) html += empty("Nobody, as far as the letters say.");
  else {
    html += '<div class="list">';
    b.elsewhere.forEach(({ r, m }) => {
      const p = m.proof || {};
      const how = p.by === "letter"
        ? `${esc(RatsAtt.refLabel(p.ref))} ID <b class="bad">${esc(p.id)}</b> <span class="dim">· Okanvil</span>`
        : `<span class="dim">marked by an officer${p.reason ? ": " + esc(p.reason) : ""}</span>`;
      html += `<div class="li"><div class="line">${rankTag(r.rankName)}${nameHtml(r)}<span class="what">${how}</span>
          <button type="button" class="btn sm" data-act="excuse" data-wed="${c.wed}" data-n="${esc(r.name)}">Excuse</button></div>
          ${excuseEditor(c.wed, r.name)}</div>`;
    });
    b.excused.forEach(({ r }) => {
      const e = HIST.excuses[RatsAtt.excuseId(RatsAtt.weekKey(c.wed), r.name)] ||
        HIST.excuses[RatsAtt.excuseId("icc25|" + c.wed, r.name)] || {};
      html += `<div class="li done"><div class="line">${rankTag(r.rankName)}${nameHtml(r)}<span class="what ok">✓ excused` +
        `${e.reason ? ' <span class="dim">· ' + esc(e.reason) + "</span>" : ""}</span>
          <button type="button" class="btn sm" data-act="unexcuse" data-wed="${c.wed}" data-n="${esc(r.name)}">Undo</button></div></div>`;
    });
    html += "</div>";
  }
  if (b.open.length) {
    html += `<h2 class="hsec">Not in yet <span class="cnt">can still come before the reset</span></h2>
      <p class="names">${b.open.map(({ r }) => nameHtml(r)).join('<span class="sep">·</span>')}</p>`;
  }
  el.innerHTML = html;
  const inp = $("exReason");
  if (inp) inp.focus();
}

// ---------------------------------------------------------------- extra raids
// Same three columns, by weeks with an extra raid on the main. Bottom = raid loggers:
// they come to our main run and do nothing else (information only, officers decide).
function renderExtra() {
  const el = $("vextra");
  const t = RatsAtt.tenMan(attOpts());
  renderRules(t.rules);
  if (!t.rules.extra.length) {
    el.innerHTML = empty("No extra raids chosen yet.");
    return;
  }
  const W = RatsAtt.TEN_WEEKS;
  const rows = t.rows.filter((r) => whoOk(r) && searchOk(r) && r.verdict !== "little");
  const item = (r) => {
    const raids = [...new Set(r.cells.map((c) => c.extra).filter(Boolean))].map(RatsAtt.refLabel).join(", ");
    return {
      r, right: r.w10 + "/" + W, sub: raids, bar: (100 * r.w10) / W,
      tags: r.verdict === "only25?" ? '<i class="tag vac" title="No Okanvil: only guild runs could be checked">no addon</i>' : "",
      after: /^only25/.test(r.verdict)
        ? `<button type="button" class="btn xs" data-act="exempt" data-n="${esc(r.name)}" title="Already geared: extra raids give them nothing">Exempt</button>` : "",
    };
  };
  const by = (a, b) => b.w10 - a.w10 || b.w25 - a.w25 || a.rankIndex - b.rankIndex || a.name.localeCompare(b.name);
  const most = rows.filter((r) => r.verdict === "effort" && r.w10 >= 2).sort(by).map(item);
  const some = rows.filter((r) => r.verdict === "effort" && r.w10 < 2).sort(by).map(item);
  const loggers = rows.filter((r) => /^only25/.test(r.verdict)).sort(by).map(item);
  const exempt = rows.filter((r) => r.verdict === "exempt");
  el.innerHTML = columns([
    { key: "xmost", title: "Most effort", range: `2+ of ${W} weeks`, tone: "top", items: most },
    { key: "xsome", title: "Some", range: `1 of ${W} weeks`, tone: "midc", items: some },
    { key: "xlog", title: "Loggers", range: "ours only", tone: "bot", items: loggers, none: "No raid loggers. 🧀" },
  ]) + (exempt.length
    ? `<p class="foot">Exempt: ${exempt.map((r) => nameHtml(r) +
      ` <button type="button" class="btn xs" data-act="unexempt" data-n="${esc(r.name)}">Undo</button>`).join('<span class="sep">·</span>')}</p>`
    : "");
}

// ---------------------------------------------------------------- raids (the old History log)
// One line per night, grouped by lockout week. The switch is Counts / Optional (an
// optional raid is log-only and counts for nobody); ⋯ holds the rest.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function raidRef(r) {
  return r.id || r.date;
}
function findRaid(ref) {
  return (HIST.raids || []).find((x) => x.id === ref) || (HIST.raids || []).find((x) => !x.id && x.date === ref);
}
function raidSizeOf(r) {
  if (r.size === 10 || r.size === 25) return r.size;
  const n = (r.groups || []).reduce((a, g) => a + (g.members || []).length, 0);
  return n > 10 ? 25 : 10;
}
function playersOf(r) {
  return (r.groups || []).reduce((a, g) => a.concat(g.members || []), []);
}
function raidName(r) {
  const ref = RatsAtt.refOfRaid(r);
  return ref ? RatsAtt.refLabel(ref) : (r.desc || "Raid") + " " + raidSizeOf(r);
}
function dayLabel(s) {
  const d = new Date(s + "T00:00:00");
  return isNaN(d) ? s : DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()];
}

function renderRaids() {
  const el = $("vraids");
  renderRules(RatsAtt.rulesOf({ rules: HIST.attRules }));
  const q = UI.q.toLowerCase().trim();
  const raids = (HIST.raids || []).filter((r) => {
    if (!r.date || r.test) return false;
    if (UI.size !== "all" && String(raidSizeOf(r)) !== UI.size) return false;
    if (!q) return true;
    return (raidName(r) + " " + (r.title || "") + " " + (r.desc || "")).toLowerCase().includes(q) ||
      playersOf(r).some((p) => String(p.name || "").toLowerCase().includes(q));
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (!raids.length) {
    el.innerHTML = empty(q ? "No raid matches." : "No raids saved yet.");
    return;
  }
  // nights of one lockout: the 2nd night of the same raid + ID says so
  const firstNight = {};
  raids.slice().reverse().forEach((r) => {
    const k = RatsAtt.lockoutStart(r.date) + "|" + raidName(r) + "|" + (r.lockoutId || "");
    firstNight[k] = firstNight[k] || r;
  });
  let html = '<div class="rlog">', week = null;
  raids.forEach((r) => {
    const wk = RatsAtt.lockoutStart(r.date);
    if (wk !== week) {
      week = wk;
      html += `<h3 class="rwk">Week of ${shortDate(wk)}</h3>`;
    }
    const ref = raidRef(r), n = playersOf(r).length;
    const k = wk + "|" + raidName(r) + "|" + (r.lockoutId || "");
    const meta = [n + " players"];
    if (r.lockoutId) meta.push("ID " + esc(r.lockoutId));
    if (r.lockoutId && firstNight[k] !== r) meta.push("night 2");
    if (r.source === "okanvil") meta.push("Okanvil");
    if (r.title && r.title !== r.date) meta.push(esc(r.title));
    const hc = /\bhm\b|heroic|hard\s*mode/i.test(r.desc || "") && !/^ToGC/.test(raidName(r)) ? '<i class="hc">HC</i>' : "";
    html += `<div class="raid${r.optional ? " off" : ""}">
        <span class="d">${dayLabel(r.date)}</span>
        <span class="rn">${esc(raidName(r))}${hc}</span>
        <span class="rm">${meta.join(" · ")}</span>
        <button type="button" class="sw${r.optional ? "" : " on"}" data-ract="optional" data-ref="${esc(ref)}"
          aria-pressed="${!r.optional}" title="${r.optional ? "Optional: log only, counts for nobody" : "Counts for attendance"}">
          <i></i>${r.optional ? "Optional" : "Counts"}</button>
        <button type="button" class="kebab" data-ref="${esc(ref)}" aria-label="Actions">⋯</button>
      </div>`;
    if (UI.raid && UI.raid.ref === ref && UI.raid.mode === "rename") {
      html += `<div class="redit">
          <input type="text" id="rTitle" value="${esc(r.title || r.date)}" placeholder="Title">
          <input type="text" id="rDesc" value="${esc(r.desc || "")}" placeholder="Raid (ICC, ToC HM…)">
          <button type="button" data-ract="saveRename" data-ref="${esc(ref)}">Save</button>
          <button type="button" class="btn" data-ract="cancel">Cancel</button>
        </div>`;
    } else if (UI.raid && UI.raid.ref === ref && UI.raid.mode === "players") {
      html += `<div class="rplayers">${(r.groups || []).filter((g) => (g.members || []).length).map((g) =>
        `<div class="grp"><b>${esc(g.name || "Group")}</b>${g.members.map((m) =>
          `<span style="color:${CLASS_COLOR[m.className] || "#ddd"}">${esc(m.name)}` +
          `${m.specName ? ` <i>${esc(m.specName)}</i>` : ""}</span>`).join("")}</div>`).join("")}` +
        ((r.noshows || []).length ? `<div class="grp ns"><b>No-shows</b>${r.noshows.map((m) =>
          `<span>${esc(m.name)}${m.vacation ? " 🏖" : ""}</span>`).join("")}</div>` : "") + "</div>";
    }
  });
  el.innerHTML = html + "</div>";
  const t = $("rTitle");
  if (t) t.focus();
}

// save the whole history after a change to one raid (a fresh copy first, so a raid
// saved from Comp meanwhile is kept)
async function saveRaidChange(ref, change, okText) {
  const pass = window.RatsData && RatsData.getPass();
  if (!pass) {
    msg("Locked — open the tools from the index and enter the guild key first.", "#ff6b6b");
    return;
  }
  msg("Saving…", "#8a8d93");
  try {
    const fresh = await RatsData.loadHistory({ interactive: false });
    if (fresh && Array.isArray(fresh.raids)) HIST = fresh;
    const r = findRaid(ref);
    if (!r) throw new Error("that raid is gone");
    change(r);
    UI.raid = null;
    await RatsData.saveHistory(HIST, pass);
    render();
    msg(okText);
  } catch (e) {
    msg("Save failed: " + e.message, "#ff6b6b");
  }
}

// the Comp tool's import format (slots), from a saved raid
function compJSON(r) {
  const groups = r.groups || [];
  const slots = [];
  groups.forEach((g, gi) => (g.members || []).forEach((m, si) => slots.push({
    name: m.name, className: m.className, specName: m.specName, specEmoteId: m.specEmoteId, classEmoteId: m.classEmoteId,
    color: CLASS_COLOR[m.className] || "#ffffff", groupNumber: gi + 1, slotNumber: si + 1,
  })));
  return {
    title: r.title || r.date, date: r.date, desc: r.desc || "",
    groupCount: Math.max(5, groups.length),
    groups: groups.map((g, gi) => ({ name: g.name || "Group " + (gi + 1), position: gi + 1 })),
    slots,
    noshows: (r.noshows || []).map((m) => ({
      name: m.name, className: m.className, specName: m.specName, specEmoteId: m.specEmoteId, classEmoteId: m.classEmoteId,
      color: CLASS_COLOR[m.className] || "#ffffff", vacation: !!m.vacation,
    })),
  };
}
// open the Comp tool with this raid loaded; Save there overwrites it (same id)
function editInComp(r) {
  const key = RatsData.raidKeyOf(r.desc) || "ICC";
  try {
    localStorage.setItem("ratsCompEdit", JSON.stringify({
      id: r.id || null, json: JSON.stringify(compJSON(r)), date: r.date, size: String(raidSizeOf(r)),
      raid: key, diff: /\bhm\b|heroic|hard/i.test(r.desc || "") ? "HM" : "", optional: !!r.optional,
    }));
  } catch (e) {
    msg("Couldn't open the editor (storage blocked).", "#ff6b6b");
    return;
  }
  location.href = "../comp/index.html";
}
function exportRaid(r) {
  const a = document.createElement("a");
  a.download = "raid-" + r.date + ".json";
  a.href = URL.createObjectURL(new Blob([JSON.stringify(compJSON(r), null, 2)], { type: "application/json" }));
  a.click();
  msg("Exported raid-" + r.date + ".json — the Raid Comp tool's Import reloads it.");
}
// the same embed the Comp tool posts, through the webhook set in Admin
function postRaidToDiscord(r) {
  const url = (localStorage.getItem("ratsWebhook") || "").trim();
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/\S+/.test(url)) {
    msg("No Discord webhook set — add it in the Admin console.", "#ff6b6b");
    return;
  }
  const heal = /Holy|Discipline|Restoration/i, tank = /Protection|Guardian|_Tank/i;
  const emo = (m) => {
    const id = m.specEmoteId || specEmote(m) || m.classEmoteId;
    const nm = ((m.specName || m.className || "spec").replace(/[^A-Za-z0-9_]/g, "") || "spec").slice(0, 32);
    return id ? `<:${nm}:${id}> ` : "";
  };
  let tanks = 0, heals = 0, dps = 0, total = 0;
  const fields = (r.groups || []).filter((g) => (g.members || []).length).map((g) => {
    g.members.forEach((m) => {
      total++;
      if (tank.test(m.specName || "")) tanks++;
      else if (heal.test(m.specName || "")) heals++;
      else dps++;
    });
    return { name: g.name, value: g.members.map((m) => emo(m) + "**" + m.name + "**").join("\n") || "—", inline: true };
  });
  const ns = r.noshows || [];
  if (ns.length) fields.push({
    name: "❌ No-shows (" + ns.length + ")",
    value: ns.map((m) => emo(m) + "**" + m.name + "**" + (m.vacation ? " 🏖️" : "")).join("\n"), inline: true,
  });
  while (fields.length % 3 !== 0) fields.push({ name: "​", value: "​", inline: true });
  const embed = {
    author: { name: "RATS • Raid Roster" }, title: "🐀 " + (r.title || r.date), color: 0xc0943a, fields,
    footer: { text: total + " raiders   •   " + tanks + " Tank · " + heals + " Healer · " + dps + " DPS   •   FOR THE RATS 🧀" },
    timestamp: new Date((r.date || "") + "T20:00:00").toISOString(),
  };
  if (r.desc) embed.description = r.desc;
  msg("Posting to Discord…", "#8a8d93");
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [embed] }) })
    .then((rr) => msg(rr.ok ? "Posted to Discord." : "Discord rejected it (HTTP " + rr.status + ").", rr.ok ? "" : "#ff6b6b"))
    .catch(() => msg("Post blocked — open the tools through a local server, not file://.", "#ff6b6b"));
}

function openRaidMenu(btn) {
  const m = $("rmenu");
  if (!m.hidden && m.dataset.ref === btn.dataset.ref) {
    m.hidden = true;
    return;
  }
  // placed in page coordinates, so it lives on <body>, clear of any positioned parent
  if (m.parentElement !== document.body) document.body.appendChild(m);
  m.dataset.ref = btn.dataset.ref;
  const b = btn.getBoundingClientRect();
  m.hidden = false;
  m.style.top = window.scrollY + b.bottom + 4 + "px";
  m.style.left = Math.max(8, window.scrollX + b.right - m.offsetWidth) + "px";
}
function raidAction(act, ref) {
  const r = findRaid(ref);
  $("rmenu").hidden = true;
  if (act === "cancel") {
    UI.raid = null;
    render();
    return;
  }
  if (!r) return;
  if (act === "optional") {
    const on = !r.optional;
    saveRaidChange(ref, (x) => (x.optional = on), on ? "Marked optional: log only." : "Counts for attendance again.");
  } else if (act === "players" || act === "rename") {
    UI.raid = UI.raid && UI.raid.ref === ref && UI.raid.mode === act ? null : { ref, mode: act };
    render();
  } else if (act === "saveRename") {
    const title = ($("rTitle").value || "").trim(), desc = ($("rDesc").value || "").trim();
    saveRaidChange(ref, (x) => { x.title = title || x.date; x.desc = desc; }, "Raid renamed.");
  } else if (act === "comp") editInComp(r);
  else if (act === "export") exportRaid(r);
  else if (act === "discord") postRaidToDiscord(r);
  else if (act === "delete") {
    if (!confirm('Delete "' + (r.title || r.date) + '" (' + raidName(r) + ") for everyone?")) return;
    const pass = window.RatsData && RatsData.getPass();
    if (!pass) {
      msg("Locked — open the tools from the index and enter the guild key first.", "#ff6b6b");
      return;
    }
    msg("Deleting…", "#8a8d93");
    RatsData.loadHistory({ interactive: false }).then((fresh) => {
      if (fresh && Array.isArray(fresh.raids)) HIST = fresh;
      const x = findRaid(ref);
      HIST.raids = HIST.raids.filter((y) => y !== x); // this raid only: a same-day sibling stays
      return RatsData.saveHistory(HIST, pass);
    }).then(() => {
      render();
      msg("Raid deleted.");
    }).catch((e) => msg("Delete failed: " + e.message, "#ff6b6b"));
  }
}

// ---------------------------------------------------------------- render
function paintControls() {
  document.querySelectorAll(".atab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.v === UI.view)));
  document.querySelectorAll(".atab").forEach((b) => b.classList.toggle("active", b.dataset.v === UI.view));
  document.querySelectorAll("#ctl .sg button").forEach((b) => {
    const seg = b.parentElement.dataset.seg;
    b.setAttribute("aria-pressed", String(UI[seg] === b.dataset.val));
  });
  // each control lists the views it belongs to (the period only means something on the board)
  document.querySelectorAll("#ctl [data-for]").forEach((e) => (e.hidden = !e.dataset.for.split(" ").includes(UI.view)));
  $("q").placeholder = UI.view === "raids" ? "Find a raid or player" : "Find a raider";
  ["board", "week", "extra", "raids"].forEach((v) => ($("v" + v).hidden = v !== UI.view));
  $("rmenu").hidden = true;
}
function render() {
  if (!HIST) return;
  paintControls();
  if (UI.view === "board") renderBoard();
  else if (UI.view === "week") renderWeek();
  else if (UI.view === "extra") renderExtra();
  else renderRaids();
}

// ---------------------------------------------------------------- saving marks
// Saved onto a FRESH copy of history, so a raid saved from Comp meanwhile isn't lost.
// value null = remove.
async function saveHistField(kind, id, value, okText) {
  const pass = window.RatsData && RatsData.getPass();
  if (!pass) {
    msg("Locked — open the tools from the index and enter the guild key first.", "#ff6b6b");
    return;
  }
  msg("Saving…", "#8a8d93");
  try {
    const fresh = await RatsData.loadHistory({ interactive: false });
    if (fresh && Array.isArray(fresh.raids)) HIST = fresh;
    HIST[kind] = HIST[kind] || {};
    if (value == null) delete HIST[kind][id];
    else HIST[kind][id] = value;
    UI.editing = null;
    await RatsData.saveHistory(HIST, pass);
    render();
    msg(okText);
  } catch (e) {
    msg("Save failed: " + e.message, "#ff6b6b");
  }
}

document.addEventListener("click", (ev) => {
  const t = ev.target.closest("button");
  if (!t || !t.classList.contains("kebab")) {
    if (!ev.target.closest("#rmenu")) $("rmenu").hidden = true;
  }
  if (!t) return;
  if (t.classList.contains("kebab")) {
    openRaidMenu(t);
    return;
  }
  if (t.dataset.ract) {
    raidAction(t.dataset.ract, t.dataset.ref || $("rmenu").dataset.ref);
    return;
  }
  if (t.classList.contains("atab")) {
    UI.view = t.dataset.v;
    UI.editing = null;
    UI.raid = null;
    saveUi();
    render();
    return;
  }
  const seg = t.parentElement && t.parentElement.dataset.seg;
  if (seg) {
    UI[seg] = t.dataset.val;
    saveUi();
    render();
    return;
  }
  if (t.dataset.more) {
    UI.open[t.dataset.more] = !UI.open[t.dataset.more];
    render();
    return;
  }
  const act = t.dataset.act, n = t.dataset.n, wed = t.dataset.wed;
  if (act === "excuse") {
    UI.editing = { wed, name: n };
    render();
  } else if (act === "cancel") {
    UI.editing = null;
    render();
  } else if (act === "saveEx" && UI.editing) {
    const e = UI.editing;
    saveHistField("excuses", RatsAtt.excuseId(RatsAtt.weekKey(e.wed), e.name),
      { reason: ($("exReason").value || "").trim(), ts: Date.now() }, e.name + " excused.");
  } else if (act === "unexcuse") {
    const id = HIST.excuses[RatsAtt.excuseId(RatsAtt.weekKey(wed), n)] ? RatsAtt.excuseId(RatsAtt.weekKey(wed), n)
      : RatsAtt.excuseId("icc25|" + wed, n);
    saveHistField("excuses", id, null, n + "'s excuse removed.");
  } else if (act === "exempt" || act === "unexempt") {
    saveHistField("exempt10", RatsAtt.safeKey(RatsAtt.normName(n)), act === "exempt" ? { ts: Date.now() } : null,
      act === "exempt" ? n + " exempt." : n + " no longer exempt.");
  }
});
document.addEventListener("keydown", (ev) => {
  if (ev.target.id === "rTitle" || ev.target.id === "rDesc") {
    if (ev.key === "Enter") document.querySelector('[data-ract="saveRename"]').click();
    if (ev.key === "Escape") document.querySelector('.redit [data-ract="cancel"]').click();
    return;
  }
  if (ev.key === "Escape") $("rmenu").hidden = true;
  if (ev.target.id !== "exReason") return;
  if (ev.key === "Enter") document.querySelector('[data-act="saveEx"]').click();
  if (ev.key === "Escape") document.querySelector('[data-act="cancel"]').click();
});
$("q").addEventListener("input", (ev) => {
  UI.q = ev.target.value;
  render();
});

// ---------------------------------------------------------------- import
const TOKEN_CLASS = { DEATHKNIGHT: "Death Knight" };
let IMPORT = null;

function parseExport(text) {
  const t = (text || "").trim();
  if (!t.startsWith("OKV1:ATT:")) return null;
  const data = JSON.parse(t.slice(9));
  const week = (s) => /^\d{4}-\d\d-\d\d$/.test(s || "");
  const nights = [];
  (data.runs || []).forEach((run) =>
    (run.nights || []).forEach((n) => nights.push({
      date: n.date, lockoutId: run.lockoutId || null, zone: run.zone || "",
      size: run.size === 10 ? 10 : 25, heroic: run.difficulty === 3 || run.difficulty === 4, test: !!run.test,
      players: (n.players || []).map((p) => {
        const className = TOKEN_CLASS[p.c] || (p.c ? p.c.charAt(0) + p.c.slice(1).toLowerCase() : "");
        return { name: p.n, className, specName: siteSpec(className, p.s), group: Number(p.g) || 0 };
      }),
    })));
  return {
    nights,
    letters: (data.letters || []).filter((l) => l && l.n && RatsAtt.parseRef(l.z + l.size) && l.id && week(l.week)),
    ours: (data.ours || []).filter((o) => o && o.id && week(o.week)),
    clears: (data.clears || []).filter((c) => c && c.n && week(c.week)),
    rules: data.rules && Array.isArray(data.rules.must) ? data.rules : null,
  };
}
// Okanvil's talent-tree names -> the site's spec labels (assets/js/data.js SPECS)
const SPEC_ALIAS = { "Beast Mastery": "Beastmastery", "Feral (Bear)": "Guardian", "Feral (Cat)": "Feral" };
function siteSpec(className, spec) {
  const s = SPEC_ALIAS[spec] || spec || "";
  const rows = (window.RatsData && RatsData.SPECS && RatsData.SPECS[className]) || [];
  const hit = rows.find((x) => x[0].toLowerCase() === s.toLowerCase());
  return hit ? hit[0] : s;
}
// a spec's Discord emote, from the site's spec list
function specEmote(m) {
  const rows = (window.RatsData && RatsData.SPECS && RatsData.SPECS[m.className]) || [];
  const hit = rows.find((x) => x[0].toLowerCase() === String(m.specName || "").toLowerCase());
  return hit ? hit[1] : null;
}
// the night's groups as the raid had them (Okanvil's group numbers), else by fives
function groupsOf(players) {
  const groups = [];
  players.forEach((p, i) => {
    const gi = p.group > 0 ? p.group - 1 : Math.floor(i / 5);
    if (!groups[gi]) groups[gi] = { name: "Group " + (gi + 1), members: [] };
    groups[gi].members.push({ name: p.name, className: p.className, specName: p.specName || "" });
  });
  return groups.filter(Boolean);
}
// the saved raid's description: the raid's short name, "ToC HM" for ToGC
function importDesc(n) {
  const raid = RatsAtt.RULE_RAIDS.find((r) => r.name.toLowerCase() === n.zone.toLowerCase());
  const short = raid ? raid.short : n.zone;
  return short === "ToC" && n.heroic ? "ToC HM" : short;
}
function importAction(n, raids) {
  if (n.test) return { kind: "test" };
  const dupe = raids.find((r) => n.lockoutId && r.lockoutId === n.lockoutId && r.date === n.date);
  if (dupe) {
    // imported before the specs had arrived: this copy brings them
    const had = playersOf(dupe).filter((m) => m.specName).length;
    const now = n.players.filter((p) => p.specName).length;
    return dupe.source === "okanvil" && now > had ? { kind: "specs", raid: dupe } : { kind: "dup" };
  }
  const ref = RatsAtt.refOfRaid({ desc: importDesc(n), size: n.size });
  const same = raids.find((r) => r.date === n.date && !r.lockoutId && RatsAtt.refOfRaid(r) === ref);
  return same ? { kind: "attach", raid: same } : { kind: "new" };
}
function ourKey(o) {
  return RatsAtt.ourIdKey(o.week, o.raid || "ICC25");
}

function previewImport() {
  const out = $("impSum"), save = $("impSave");
  save.disabled = true;
  IMPORT = null;
  const txt = $("impIn").value;
  if (!txt.trim()) {
    out.textContent = "";
    return;
  }
  let p;
  try {
    p = parseExport(txt);
  } catch (e) {
    out.innerHTML = '<span class="bad">That line is cut off — copy it again.</span>';
    return;
  }
  if (!p) {
    out.innerHTML = '<span class="bad">Not an Okanvil attendance export.</span>';
    return;
  }
  const raids = HIST.raids || [];
  const nNew = p.nights.filter((n) => /new|attach|specs/.test(importAction(n, raids).kind)).length;
  const have = HIST.letters || {};
  const lNew = p.letters.filter((l) => !have[RatsAtt.letterKey(l)] || String(have[RatsAtt.letterKey(l)].id) !== String(l.id)).length;
  const oNew = p.ours.filter((o) => !(HIST.ourIds || {})[ourKey(o)] || String(HIST.ourIds[ourKey(o)].id) !== String(o.id)).length;
  const rulesNew = !!(p.rules && (p.rules.t || 0) > ((HIST.attRules || {}).t || 0));
  const bits = [`<b>${nNew}</b> new night${nNew !== 1 ? "s" : ""}`, `<b>${lNew}</b> new letter${lNew !== 1 ? "s" : ""}`];
  if (oNew) bits.push(`<b>${oNew}</b> week ID${oNew !== 1 ? "s" : ""}`);
  if (p.clears.length) bits.push(`<b>${p.clears.length}</b> clearance${p.clears.length !== 1 ? "s" : ""}`);
  if (rulesNew) bits.push("new rules: <b>" + esc(RatsAtt.mustLabel(RatsAtt.rulesOf({ rules: p.rules })) || "nothing mandatory") + "</b>");
  const changes = nNew + lNew + oNew + p.clears.length + (rulesNew ? 1 : 0);
  out.innerHTML = changes ? bits.join('<span class="sep">·</span>') : '<span class="dim">Nothing new — all of it is already saved.</span>';
  IMPORT = p;
  save.disabled = !changes;
}

async function saveImport() {
  if (!IMPORT) return;
  const pass = window.RatsData && RatsData.getPass();
  if (!pass) {
    msg("Locked — open the tools from the index and enter the guild key first.", "#ff6b6b");
    return;
  }
  $("impSave").disabled = true;
  msg("Saving…", "#8a8d93");
  try {
    const fresh = await RatsData.loadHistory({ interactive: false });
    if (fresh && Array.isArray(fresh.raids)) HIST = fresh;
    HIST.raids = HIST.raids || [];
    let added = 0;
    IMPORT.nights.forEach((n) => {
      const act = importAction(n, HIST.raids);
      if (act.kind === "attach") {
        act.raid.lockoutId = n.lockoutId;
        added++;
      } else if (act.kind === "specs") {
        act.raid.groups = groupsOf(n.players);
        added++;
      } else if (act.kind === "new") {
        const groups = groupsOf(n.players);
        HIST.raids.push({
          id: crypto.randomUUID(), date: n.date, title: n.date, desc: importDesc(n), size: n.size,
          groups, noshows: [], lockoutId: n.lockoutId, source: "okanvil",
        });
        added++;
      }
    });
    // an officer's in-game Clear = an excuse here; an Undo removes only what Okanvil added
    HIST.excuses = HIST.excuses || {};
    IMPORT.clears.forEach((c) => {
      const id = RatsAtt.excuseId(RatsAtt.weekKey(c.week), c.n);
      if (c.on) HIST.excuses[id] = { reason: c.reason || "cleared in game", by: c.by || "", src: "okanvil", ts: Date.now() };
      else if (HIST.excuses[id] && HIST.excuses[id].src === "okanvil") delete HIST.excuses[id];
    });
    HIST.ourIds = HIST.ourIds || {};
    IMPORT.ours.forEach((o) => (HIST.ourIds[ourKey(o)] = { id: o.id, by: o.by || "" }));
    HIST.letters = HIST.letters || {};
    let letters = 0;
    IMPORT.letters.forEach((l) => {
      const key = RatsAtt.letterKey(l);
      if (!HIST.letters[key] || String(HIST.letters[key].id) !== String(l.id)) letters++;
      HIST.letters[key] = { n: l.n, z: l.z, size: l.size, id: l.id, week: l.week };
    });
    // the newest rules win, whoever exported them
    if (IMPORT.rules && (IMPORT.rules.t || 0) > ((HIST.attRules || {}).t || 0)) {
      const r = RatsAtt.rulesOf({ rules: IMPORT.rules });
      HIST.attRules = { must: r.must, extra: r.extra, all: r.all, t: r.t, by: r.by };
    }
    HIST.raids.sort((a, b) => (a.date < b.date ? 1 : -1));
    await RatsData.saveHistory(HIST, pass);
    closeImport();
    render();
    msg(`Imported: ${added} night${added !== 1 ? "s" : ""}, ${letters} letter${letters !== 1 ? "s" : ""}.`);
  } catch (e) {
    $("impSave").disabled = false;
    msg("Import failed: " + e.message, "#ff6b6b");
  }
}
function openImport() {
  $("impIn").value = "";
  previewImport();
  $("impDlg").showModal();
  $("impIn").focus();
}
function closeImport() {
  IMPORT = null;
  $("impDlg").close();
}
$("impBtn").addEventListener("click", openImport);
$("impCancel").addEventListener("click", closeImport);
$("impSave").addEventListener("click", saveImport);
$("impIn").addEventListener("input", previewImport);

// ---------------------------------------------------------------- boot
async function boot() {
  try {
    if (window.RatsData) await RatsData.loadRoster({ interactive: false });
  } catch (e) {}
  try {
    HIST = (window.RatsData ? await RatsData.loadHistory({ interactive: false }) : null) || null;
  } catch (e) {
    HIST = null;
  }
  if (!HIST || !Array.isArray(HIST.raids)) {
    $("rules").textContent = "Locked — open the officer tools and enter the guild key.";
    HIST = null;
    return;
  }
  try {
    VAC = window.RatsData ? await RatsData.loadVacations() : [];
  } catch (e) {
    VAC = [];
  }
  render();
}
boot();
