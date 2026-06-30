/* RATS shared dark calendar — replaces the native (unstyleable) date picker app-wide.
   Enhances every <input type="date"> into a themed button + popup calendar, keeping the
   original input as the value holder so existing JS (reads of .value, input/change
   listeners) keeps working. Dynamically-added inputs: call RatsCal.enhanceAll() after render;
   programmatic .value changes: call RatsCal.sync() to refresh the button labels.

   Per-input options (attributes):
     data-cal-format="weekday"   -> "WED — JUN 26"   (default -> "26 Jun 2026")
     data-cal-placeholder="…"    -> empty-state button text (default "Pick a date")
*/
(function () {
  if (window.RatsCal) return;
  var ACCENT = "#c0943a";
  var WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  var MO_UP = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  var MO_CAP = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MO_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var WD_SH = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  var pad = function (n) { return String(n).padStart(2, "0"); };
  function parse(v) { var p = (v || "").split("-").map(Number); return p.length === 3 ? { y: p[0], m: p[1] - 1, d: p[2] } : null; }
  function label(v, fmt) {
    var p = parse(v); if (!p) return null;
    if (fmt === "weekday") { var dt = new Date(p.y, p.m, p.d); return WD[dt.getDay()] + " — " + MO_UP[p.m] + " " + p.d; }
    return p.d + " " + MO_CAP[p.m] + " " + p.y;
  }

  function injectCSS() {
    if (document.getElementById("rcal-css")) return;
    var s = document.createElement("style"); s.id = "rcal-css";
    s.textContent =
      ".rcal-wrap{position:relative;display:inline-flex}" +
      ".rcal-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:#0f1012;color:#fff;border:1px solid #333;border-radius:8px;height:30px;padding:0 22px;font-size:13px;font-weight:800;letter-spacing:.4px;cursor:pointer;font-family:inherit}" +
      ".rcal-btn:hover{border-color:" + ACCENT + "}" +
      ".rcal-btn.empty{color:#9aa0a6;font-weight:700;letter-spacing:normal}" +
      ".rcal{position:absolute;top:calc(100% + 4px);left:0;z-index:60;width:252px;background:#1b1d21;border:1px solid #34373d;border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.5);padding:12px;user-select:none}" +
      ".rcal-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}" +
      ".rcal-m{color:#fff;font-weight:800;font-size:14px}" +
      ".rcal-nav{display:flex;gap:4px}" +
      ".rcal-nav button{background:#202225;border:1px solid #2f3137;color:#9aa0a6;width:26px;height:26px;border-radius:6px;cursor:pointer;padding:0;font-size:16px;line-height:1;display:inline-flex;align-items:center;justify-content:center;font-family:inherit}" +
      ".rcal-nav button:hover{color:#fff;border-color:" + ACCENT + "}" +
      ".rcal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}" +
      ".rwd{color:#6b7077;font-size:11px;font-weight:700;text-align:center;padding:4px 0}" +
      ".rday{height:30px;border:0;background:transparent;color:#cfd2d6;border-radius:6px;cursor:pointer;font-size:12.5px;font-weight:600;padding:0;display:inline-flex;align-items:center;justify-content:center;font-family:inherit}" +
      ".rday:hover{background:#2a2c31;color:#fff}" +
      ".rday.out{color:#4a4d52;cursor:default}" +
      ".rday.out:hover{background:transparent;color:#4a4d52}" +
      ".rday.today{box-shadow:inset 0 0 0 1px #4a4d55}" +
      ".rday.sel{background:" + ACCENT + ";color:#1b1d21;font-weight:800}" +
      ".rcal-ft{display:flex;justify-content:space-between;margin-top:8px}" +
      ".rcal-ft button{background:none;border:0;color:" + ACCENT + ";font-size:12px;font-weight:700;cursor:pointer;padding:4px 2px;font-family:inherit}" +
      ".rcal-ft button:hover{filter:brightness(1.15);text-decoration:underline}";
    document.head.appendChild(s);
  }

  var openPop = null;
  function closeAll() { if (openPop) { openPop.style.display = "none"; openPop = null; } }

  function enhance(input) {
    if (!input || input.dataset.rcal) return;
    input.dataset.rcal = "1";
    injectCSS();
    var fmt = input.getAttribute("data-cal-format") || "";
    var ph = input.getAttribute("data-cal-placeholder") || "Pick a date";

    var wrap = document.createElement("span"); wrap.className = "rcal-wrap";
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "rcal-btn";
    if (input.title) btn.title = input.title;
    var pop = document.createElement("div"); pop.className = "rcal"; pop.style.display = "none";
    input.parentNode.insertBefore(wrap, input);
    input.style.display = "none";
    wrap.appendChild(btn); wrap.appendChild(input); wrap.appendChild(pop);

    var vy, vm;
    function setLabel() { var l = label(input.value, fmt); btn.textContent = l || ph; btn.classList.toggle("empty", !l); }
    function render() {
      var sel = parse(input.value), t = new Date();
      var first = new Date(vy, vm, 1).getDay(), dim = new Date(vy, vm + 1, 0).getDate();
      var cells = "";
      for (var i = 0; i < first; i++) cells += '<button type="button" class="rday out" disabled></button>';
      for (var d = 1; d <= dim; d++) {
        var iso = vy + "-" + pad(vm + 1) + "-" + pad(d);
        var isSel = sel && sel.y === vy && sel.m === vm && sel.d === d;
        var isToday = t.getFullYear() === vy && t.getMonth() === vm && t.getDate() === d;
        cells += '<button type="button" class="rday' + (isSel ? " sel" : "") + (isToday ? " today" : "") + '" data-iso="' + iso + '">' + d + '</button>';
      }
      pop.innerHTML =
        '<div class="rcal-hd"><span class="rcal-m">' + MO_FULL[vm] + ' ' + vy + '</span>' +
        '<span class="rcal-nav"><button type="button" data-shift="-1" title="Previous month">‹</button>' +
        '<button type="button" data-shift="1" title="Next month">›</button></span></div>' +
        '<div class="rcal-grid">' + WD_SH.map(function (w) { return '<span class="rwd">' + w + '</span>'; }).join("") + cells + '</div>' +
        '<div class="rcal-ft"><button type="button" data-act="clear">Clear</button><button type="button" data-act="today">Today</button></div>';
    }
    function open() {
      var cur = parse(input.value) || (function () { var d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();
      vy = cur.y; vm = cur.m; render(); closeAll(); pop.style.display = "block"; openPop = pop;
    }
    function commit(iso) {
      input.value = iso;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      setLabel(); closeAll();
    }
    btn.addEventListener("click", function (e) { e.stopPropagation(); if (pop.style.display === "none") open(); else closeAll(); });
    pop.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("button") : e.target;
      if (!t) return;
      e.preventDefault(); e.stopPropagation();
      if (t.dataset.shift) { vm += +t.dataset.shift; if (vm < 0) { vm = 11; vy--; } else if (vm > 11) { vm = 0; vy++; } render(); return; }
      if (t.dataset.iso) { commit(t.dataset.iso); return; }
      if (t.dataset.act === "today") { var n = new Date(); commit(n.getFullYear() + "-" + pad(n.getMonth() + 1) + "-" + pad(n.getDate())); return; }
      if (t.dataset.act === "clear") { commit(""); return; }
    });
    input._rcalSync = setLabel;
    setLabel();
  }

  function enhanceAll(root) { (root || document).querySelectorAll('input[type=date]').forEach(enhance); }
  function sync() { document.querySelectorAll('input[type=date]').forEach(function (i) { if (i._rcalSync) i._rcalSync(); }); }

  document.addEventListener("click", function (e) { if (openPop && !openPop.parentNode.contains(e.target)) closeAll(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(); });
  if (document.readyState !== "loading") enhanceAll(); else document.addEventListener("DOMContentLoaded", function () { enhanceAll(); });

  window.RatsCal = { enhance: enhance, enhanceAll: enhanceAll, sync: sync, close: closeAll };
})();
