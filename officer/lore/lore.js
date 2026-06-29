const WH_RE = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/\S+/;
let loreFiles = [];

function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function msg(t, c) { const e = document.getElementById("msg"); e.style.color = c || "#7CFC8A"; e.textContent = t || ""; }

// Discord webhooks DON'T convert :shortcodes: — we must turn them into real emoji before sending.
const EMOJI = {
  crossed_swords: "⚔️", bow_and_arrow: "🏹", shield: "🛡️", dagger: "🗡️", axe: "🪓", hammer: "🔨", "hammer_and_pick": "⚒️", wrench: "🔧", gear: "⚙️",
  skull: "💀", skull_and_crossbones: "☠️", crown: "👑", trophy: "🏆", medal: "🏅", military_medal: "🎖️", first_place: "🥇", second_place: "🥈", third_place: "🥉",
  fire: "🔥", boom: "💥", zap: "⚡", star: "⭐", star2: "🌟", sparkles: "✨", dizzy: "💫", comet: "☄️", snowflake: "❄️", dragon: "🐉",
  gem: "💎", ring: "💍", moneybag: "💰", dollar: "💵", "100": "💯", muscle: "💪", dart: "🎯", game_die: "🎲", video_game: "🎮",
  heart: "❤️", broken_heart: "💔", green_heart: "💚", blue_heart: "💙", purple_heart: "💜", yellow_heart: "💛", orange_heart: "🧡", black_heart: "🖤", white_heart: "🤍",
  sparkling_heart: "💖", two_hearts: "💕", heartpulse: "💗",
  rat: "🐀", mouse: "🐭", cheese: "🧀", beer: "🍺", beers: "🍻", tada: "🎉", confetti_ball: "🎊", partying_face: "🥳",
  sob: "😭", joy: "😂", sunglasses: "😎", smiling_imp: "😈", imp: "👿", ghost: "👻", eyes: "👀", rage: "😡", angry: "😠", triumph: "😤", sweat_drops: "💦",
  point_right: "👉", point_left: "👈", point_up: "👆", point_down: "👇", ok_hand: "👌", thumbsup: "👍", "+1": "👍", thumbsdown: "👎", "-1": "👎",
  clap: "👏", pray: "🙏", raised_hands: "🙌", wave: "👋", fist: "👊", punch: "👊",
  hourglass: "⌛", hourglass_flowing_sand: "⏳", alarm_clock: "⏰", lock: "🔒", unlock: "🔓", key: "🔑", scroll: "📜", crossed_flags: "🎌", checkered_flag: "🏁",
  heavy_check_mark: "✔️", white_check_mark: "✅", x: "❌", warning: "⚠️", exclamation: "❗", question: "❓", rotating_light: "🚨", no_entry: "⛔", no_entry_sign: "🚫",
  sun: "☀️", sunny: "☀️", full_moon: "🌕", crescent_moon: "🌙", new_moon: "🌑", milky_way: "🌌", rainbow: "🌈"
};
// convert :name: -> emoji (skips custom emoji like <:name:123> which is followed by digits)
function emojify(s) { return String(s).replace(/:([a-z0-9_+\-]{2,}):(?!\d)/g, (m, n) => EMOJI[n] || m); }

function loadHooks() {
  try { const a = JSON.parse(localStorage.getItem("ratsWebhooks") || "null"); if (Array.isArray(a)) return a; } catch (e) {}
  const w = localStorage.getItem("ratsWebhook");
  return w ? [{ name: "Raid Roster", url: w }] : [];
}
function populateHooks() {
  const sel = document.getElementById("hookSel"), hooks = loadHooks();
  if (!hooks.length) { sel.innerHTML = '<option value="">— no webhooks set (add in Admin) —</option>'; return; }
  sel.innerHTML = hooks.map((h, i) => `<option value="${i}">${esc(h.name)}</option>`).join("");
  // default: a lore/story-named hook, else remembered, else first
  const remembered = localStorage.getItem("ratsLoreHook") || "";
  let idx = hooks.findIndex(h => /lore|stor|tale|chronicle|legend/i.test(h.name));
  if (idx < 0) idx = hooks.findIndex(h => h.name === remembered);
  sel.value = String(idx < 0 ? 0 : idx);
  sel.onchange = () => { const h = hooks[+sel.value]; if (h) localStorage.setItem("ratsLoreHook", h.name); };
}
function selectedHook() { const hooks = loadHooks(); const i = +document.getElementById("hookSel").value; return hooks[i] || null; }

// very light Discord-ish markdown preview
function renderPreview() {
  const raw = document.getElementById("body").value;
  document.getElementById("count").textContent = raw.length + " / 2000";
  let h = emojify(esc(raw))
    .replace(/^### (.*)$/gm, '<h3 style="font-size:15px">$1</h3>')
    .replace(/^## (.*)$/gm, '<h3 style="font-size:17px">$1</h3>')
    .replace(/^# (.*)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+?)\*/g, '$1<em>$2</em>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/&lt;@&amp;?(\d+)&gt;/g, '<span style="color:#c9b6f7;background:#3c3a5e;border-radius:3px;padding:0 3px">@mention</span>'); // show pings as chips
  document.getElementById("preview").innerHTML = h || '<span style="color:#8a8d93">Nothing yet…</span>';
}

// ---- mention book (reusable Discord pings) ----
function loadMentions() { try { const a = JSON.parse(localStorage.getItem("ratsMentions") || "null"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function saveMentions(a) { localStorage.setItem("ratsMentions", JSON.stringify(a)); }
function mentionToken(m) { return m.role ? "<@&" + m.id + ">" : "<@" + m.id + ">"; }
function populateMentions() {
  const sel = document.getElementById("mentionSel"), list = loadMentions();
  sel.innerHTML = list.length ? list.map((m, i) => `<option value="${i}">${esc(m.label)}${m.role ? " (role)" : ""}</option>`).join("")
    : '<option value="">— no saved mentions (＋ Manage) —</option>';
  const box = document.getElementById("mList");
  box.innerHTML = list.length ? list.map((m, i) =>
    `<div style="display:flex;align-items:center;gap:8px;padding:3px 0"><span style="flex:1">${esc(m.label)} <span style="color:#6e7178;font-size:11px">${m.role ? "role" : "user"} · ${esc(m.id)}</span></span>
     <button class="alt" style="padding:4px 9px" onclick="removeMention(${i})">✕</button></div>`).join("") : '<div class="sub" style="margin:0">No saved mentions yet.</div>';
}
function addMention() {
  const label = document.getElementById("mLabel").value.trim();
  const id = document.getElementById("mId").value.trim();
  const role = document.getElementById("mType").value === "role";
  if (!label || !/^\d{5,}$/.test(id)) { msg("❌ Enter a label and a numeric Discord ID.", "#ff6b6b"); return; }
  const list = loadMentions(); list.push({ label, id, role }); saveMentions(list);
  document.getElementById("mLabel").value = ""; document.getElementById("mId").value = "";
  populateMentions(); msg("✅ Saved mention “" + label + "”.");
}
function removeMention(i) { const list = loadMentions(); list.splice(i, 1); saveMentions(list); populateMentions(); }
function toggleMentionMgr() { const e = document.getElementById("mentionMgr"); e.style.display = e.style.display === "none" ? "" : "none"; }
function insertMention() {
  const list = loadMentions(), i = +document.getElementById("mentionSel").value;
  const m = list[i]; if (!m) { msg("❌ No saved mention selected. Use ＋ Manage to add one.", "#ff6b6b"); return; }
  const ta = document.getElementById("body"), tok = mentionToken(m) + " ";
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + tok + ta.value.slice(e);
  ta.focus(); ta.selectionStart = ta.selectionEnd = s + tok.length;
  renderPreview();
}

function renderThumbs() {
  const box = document.getElementById("thumbs");
  box.innerHTML = loreFiles.map((f, i) =>
    `<div class="thumb"><img src="${URL.createObjectURL(f)}" alt=""><button onclick="removeFile(${i})" title="remove">✕</button></div>`
  ).join("");
}
function addFiles(fl) {
  for (const f of fl) { if (loreFiles.length >= 10) break; if (f.type.startsWith("image/")) loreFiles.push(f); }
  document.getElementById("files").value = "";
  renderThumbs();
}
function removeFile(i) { loreFiles.splice(i, 1); renderThumbs(); }

function insertExample() {
  document.getElementById("body").value =
    "# :crossed_swords: **A New Era Begins** :crossed_swords:\n\n"
    + "After countless battles on the frontlines, **The Dark Knight** has finally fallen.\n\n"
    + "Standing victorious above the battlefield, **The Bulwark of Light** claimed his place as the new shield of the Rats.\n\n"
    + "But legends never truly die...\n\n"
    + "From the ashes of his fallen armor, a hero has been reborn — bow in hand, clad in his beloved kilt.\n\n"
    + ":bow_and_arrow: **A new Hunter has entered the raid.**\n\n"
    + "May the enemies of Rats fear what comes next.";
  renderPreview();
}

// allow @everyone/@here toggle button (backed by a hidden checkbox)
function toggleEveryone(btn) { const c = document.getElementById("pingEveryone"); c.checked = !c.checked; btn.classList.toggle("active", c.checked); }

// User/Role segmented toggle (backed by a hidden input so .value reads still work)
function setMType(b) { document.getElementById("mType").value = b.dataset.v; document.querySelectorAll("#mTypeSegs .seg").forEach(s => s.classList.toggle("active", s === b)); }

async function postLore() {
  const hook = selectedHook();
  if (!hook || !WH_RE.test(hook.url)) { msg("❌ No valid webhook selected. Add one in the Admin console (named like “Lore”).", "#ff6b6b"); return; }
  const raw = document.getElementById("body").value.trim();
  if (!raw && !loreFiles.length) { msg("❌ Write a story or add at least one image.", "#ff6b6b"); return; }
  const content = emojify(raw); // shortcodes -> real emoji so Discord shows them
  if (content.length > 2000) { msg("❌ Discord limit is 2000 characters (you have " + content.length + ").", "#ff6b6b"); return; }

  // allow user & role pings; @everyone/@here only if the box is ticked
  const parse = ["users", "roles"];
  if (document.getElementById("pingEveryone").checked) parse.push("everyone");

  const fd = new FormData();
  fd.append("payload_json", JSON.stringify({ content: content, allowed_mentions: { parse: parse } }));
  loreFiles.forEach((f, i) => fd.append("files[" + i + "]", f, f.name));

  msg("⏳ Posting…", "#9aa0a6");
  try {
    const r = await fetch(hook.url, { method: "POST", body: fd }); // no Content-Type — browser sets multipart boundary
    if (r.ok) {
      msg("✅ Posted to “" + hook.name + "”! 📜");
      loreFiles = []; renderThumbs();
    } else {
      msg("❌ Discord rejected it (HTTP " + r.status + "). Check the webhook / file sizes (8MB each).", "#ff6b6b");
    }
  } catch (e) { msg("❌ Post blocked (CORS / file://). Works on the hosted https site.", "#ff6b6b"); }
}

populateHooks();
populateMentions();
renderPreview();
