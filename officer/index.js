if (window.RatsData) RatsData.gate();
function toggleClog() {
  document.getElementById("clog").classList.toggle("open");
  document.getElementById("clogOv").classList.toggle("open");
}
document.addEventListener("keydown", function (e) { if (e.key === "Escape") { document.getElementById("clog").classList.remove("open"); document.getElementById("clogOv").classList.remove("open"); } });

// officer view: load ALL dev-log entries from Firebase (public + officer-only); falls back to static blocks
(function loadChangelog() {
  var FB = "https://rats-tools-default-rtdb.europe-west1.firebasedatabase.app/rats/changelog.json";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var fmtDate = function (s) { s = String(s == null ? "" : s).trim(); var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (m) return (+m[3]) + " " + MON[+m[2] - 1] + " " + m[1]; m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s); if (m) return (+m[1]) + " " + MON[+m[2] - 1] + " " + m[3]; return s; };
  fetch(FB, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (o) {
    if (!o) return;
    var list = Object.keys(o).map(function (k) { return o[k]; }).filter(function (e) { return e && e.items; })
      .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (!list.length) return;
    document.getElementById("clogEntries").innerHTML = list.map(function (e) {
      return '<div class="cl-entry"><div class="cl-date">' + esc(fmtDate(e.date)) + (e.ver ? " · " + esc(e.ver) : "")
        + (e.pub ? ' 🌐' : '') + '</div><ul>'
        + (e.items || []).map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + '</ul></div>';
    }).join("");
  }).catch(function () { });
})();
