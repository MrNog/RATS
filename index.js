// Set your Discord invite here (e.g. "https://discord.gg/xxxxxx"); the button hides until it's set.
const DISCORD_URL = "https://discord.gg/v7Unzr7tUZ";

// ---- FEATURE FLAGS ----------------------------------------------------------------------------
// One switch per not-yet-public feature. Set true to ship it to everyone; false = hidden on the live
// site but still visible in a dev context (a "?dev" URL flag, file://, or localhost) so you can test.
// Each key matches a hub card's data-feature attribute in index.html.
const FEATURES = {
  profile:  false,  // Raider Profile — officer/dev only until profile keys are handed out
  rankings: false,  // Rankings & Hall of Fame — waiting on the wow-logs API
  loot:     false,  // Loot History — dev only until the Okanvil export + officer sign-off
};
(function () {
  var a = document.getElementById("discord");
  if (DISCORD_URL) { a.href = DISCORD_URL; } else { a.style.display = "none"; }
})();

// Reveal flagged hub cards. A card with [data-feature="x"] shows when:
//   - FEATURES.x is true (shipped to everyone), OR
//   - you're in DEV (running locally: file:// or localhost) AND toggled it on in the dev panel.
// Dev is deliberately LOCAL-ONLY — no URL trigger — so a public visitor can never unhide anything.
// The dev panel (⚙, only rendered in dev) lets you flip each feature without editing this file;
// your choices persist in localStorage.ratsDevFlags. Default in dev: on (so you see everything).
var IS_DEV = location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

function devFlags() {
  try { return JSON.parse(localStorage.getItem("ratsDevFlags") || "{}") || {}; } catch (e) { return {}; }
}
function setDevFlag(key, on) {
  var f = devFlags(); f[key] = on;
  try { localStorage.setItem("ratsDevFlags", JSON.stringify(f)); } catch (e) {}
}
// is this feature visible for the current viewer?
function featureOn(key) {
  if (FEATURES[key]) return true;            // shipped to everyone
  if (!IS_DEV) return false;                 // hidden for the public
  var f = devFlags();                        // dev: honor the toggle (default on)
  return f[key] !== false;
}
function applyFeatureFlags() {
  var cards = document.querySelectorAll("[data-feature]");
  for (var i = 0; i < cards.length; i++) {
    var key = cards[i].getAttribute("data-feature");
    cards[i].hidden = !featureOn(key);
  }
}
applyFeatureFlags();

// ---- dev toggle panel (only in dev) ----
(function devPanel() {
  if (!IS_DEV) return;
  var keys = [].map.call(document.querySelectorAll("[data-feature]"), function (c) { return c.getAttribute("data-feature"); });
  // de-dupe while keeping order
  keys = keys.filter(function (k, i) { return keys.indexOf(k) === i; });
  if (!keys.length) return;

  var box = document.createElement("div");
  box.id = "devPanel";
  box.innerHTML =
    '<div class="dp-hd">⚙ Dev — feature flags <span class="dp-tag">local only</span></div>' +
    keys.map(function (k) {
      var on = featureOn(k);
      return '<label class="dp-row"><input type="checkbox" data-flag="' + k + '"' + (on ? " checked" : "") + '> ' + k + "</label>";
    }).join("") +
    '<div class="dp-note">Visible only on localhost. Toggles persist in this browser.</div>';
  document.body.appendChild(box);

  box.addEventListener("change", function (e) {
    var cb = e.target.closest("input[data-flag]");
    if (!cb) return;
    setDevFlag(cb.getAttribute("data-flag"), cb.checked);
    applyFeatureFlags();
  });
})();
var clogNewestTs = 0;   // newest entry timestamp seen this load
function clogSeen() { try { return parseInt(localStorage.getItem("ratsClogSeen") || "0", 10) || 0; } catch (e) { return 0; } }
function toggleClog() {
  var open = !document.getElementById("clog").classList.contains("open");
  document.getElementById("clog").classList.toggle("open");
  document.getElementById("clogOv").classList.toggle("open");
  if (open) {   // opened -> mark everything seen, hide the badge
    try { localStorage.setItem("ratsClogSeen", String(clogNewestTs)); } catch (e) { }
    document.getElementById("clogBadge").style.display = "none";
  }
}
document.addEventListener("keydown", function (e) { if (e.key === "Escape") { document.getElementById("clog").classList.remove("open"); document.getElementById("clogOv").classList.remove("open"); } });

// public changelog — only entries the admin flagged as "major" (pub) show here;
// detailed/officer entries live in the tools changelog + #okanor-logs. Falls back to the static blocks.
// Cached in localStorage (TTL 30 min): renders instantly from cache, only hits Firebase when stale.
// Changelog changes rarely (officer posts), so this cuts a read on nearly every hub visit.
(function loadChangelog() {
  var FB = "https://rats-tools-default-rtdb.europe-west1.firebasedatabase.app/rats/changelog.json";
  var CACHE_KEY = "ratsClogCache", CACHE_TTL = 30 * 60 * 1000;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var fmtDate = function (s) { s = String(s == null ? "" : s).trim(); var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (m) return (+m[3]) + " " + MON[+m[2] - 1] + " " + m[1]; m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s); if (m) return (+m[1]) + " " + MON[+m[2] - 1] + " " + m[3]; return s; };
  function render(o) {
    if (!o) return false;
    var list = Object.keys(o).map(function (k) { return o[k]; }).filter(function (e) { return e && e.items && e.pub })
      .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (!list.length) return false;
    document.getElementById("clogEntries").innerHTML = list.map(function (e) {
      return '<div class="cl-entry"><div class="cl-date">' + esc(fmtDate(e.date)) + (e.ver ? " · " + esc(e.ver) : "") + '</div><ul>'
        + (e.items || []).map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + '</ul></div>';
    }).join("");
    // unseen badge: how many entries are newer than the last time this person opened it
    clogNewestTs = list.reduce(function (m, e) { return Math.max(m, e.ts || 0); }, 0);
    var seen = clogSeen();
    var unseen = list.filter(function (e) { return (e.ts || 0) > seen; }).length;
    var b = document.getElementById("clogBadge");
    if (unseen > 0) { b.textContent = unseen; b.style.display = ""; } else { b.style.display = "none"; }
    return true;
  }
  // 1) render immediately from a fresh cache (no network)
  try {
    var c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (c && Date.now() - c.t < CACHE_TTL && render(c.data)) return;
  } catch (e) {}
  // 2) else fetch, render, and refresh the cache
  fetch(FB, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (o) {
    if (render(o)) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: o })); } catch (e) {} }
  }).catch(function () { });
})();
