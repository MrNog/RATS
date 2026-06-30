// Set your Discord invite here (e.g. "https://discord.gg/xxxxxx"); the button hides until it's set.
const DISCORD_URL = "https://discord.gg/v7Unzr7tUZ";
(function () {
  var a = document.getElementById("discord");
  if (DISCORD_URL) { a.href = DISCORD_URL; } else { a.style.display = "none"; }
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
(function loadChangelog() {
  var FB = "https://rats-tools-default-rtdb.europe-west1.firebasedatabase.app/rats/changelog.json";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var fmtDate = function (s) { s = String(s == null ? "" : s).trim(); var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (m) return (+m[3]) + " " + MON[+m[2] - 1] + " " + m[1]; m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s); if (m) return (+m[1]) + " " + MON[+m[2] - 1] + " " + m[3]; return s; };
  fetch(FB, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (o) {
    if (!o) return;
    var list = Object.keys(o).map(function (k) { return o[k]; }).filter(function (e) { return e && e.items && e.pub })
      .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (!list.length) return;
    document.getElementById("clogEntries").innerHTML = list.map(function (e) {
      return '<div class="cl-entry"><div class="cl-date">' + esc(fmtDate(e.date)) + (e.ver ? " · " + esc(e.ver) : "") + '</div><ul>'
        + (e.items || []).map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + '</ul></div>';
    }).join("");
    // unseen badge: how many entries are newer than the last time this person opened it
    clogNewestTs = list.reduce(function (m, e) { return Math.max(m, e.ts || 0); }, 0);
    var seen = clogSeen();
    var unseen = list.filter(function (e) { return (e.ts || 0) > seen; }).length;
    if (unseen > 0) { var b = document.getElementById("clogBadge"); b.textContent = unseen; b.style.display = ""; }
  }).catch(function () { });
})();
