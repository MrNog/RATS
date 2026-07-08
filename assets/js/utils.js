/* RATS — shared JS helpers for NEW pages. window.RatsUtils.
   Existing pages keep their own copies; reach for this when building something new
   so a fix lands in one place. Load before your page script:
     <script src="../assets/js/utils.js"></script>   (depth varies: ../ or ../../)
     <script src="pagename.js"></script>
   No build step — plain globals, same as the rest of the app. */
(function (w) {
  // Firebase Realtime DB (unauthenticated REST). Per CLAUDE.md cost rules: read only
  // the node you need, cache with a TTL, never re-fetch on toggle/filter.
  var FB = "https://rats-tools-default-rtdb.europe-west1.firebasedatabase.app/rats/";

  // WotLK class colors — color the NAME by class, don't add a Class column.
  var CLASS_COLOR = {
    "Death Knight": "#C41E3A", "DK": "#C41E3A", "Druid": "#FF7C0A", "Hunter": "#AAD372",
    "Mage": "#3FC7EB", "Paladin": "#F58CBA", "Priest": "#E6E6E6", "Rogue": "#FFF569",
    "Shaman": "#0070DD", "Warlock": "#8788EE", "Warrior": "#C69B6D"
  };

  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function enc(s) { return encodeURI(String(s == null ? "" : s)); } // URL-safe path (spaces in filenames)

  // project-wide date format: "26 Jul 2026" (accepts ISO 2026-07-26 or DD-MM-YYYY 26-07-2026)
  function fmtDate(s) {
    s = String(s == null ? "" : s).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (m) return (+m[3]) + " " + MON[+m[2] - 1] + " " + m[1];
    m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s); if (m) return (+m[1]) + " " + MON[+m[2] - 1] + " " + m[3];
    return s;
  }
  function todayStr() { var d = new Date(), z = function (n) { return String(n).padStart(2, "0"); }; return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); }
  // WoW class TOKENS (from the addon's UnitClass export: "DEATHKNIGHT", "DRUID"...)
  // mapped to the CLASS_COLOR keys. The addon ships uppercase, no-space tokens while
  // CLASS_COLOR is keyed by display names ("Death Knight", "Druid") -- without this
  // every addon-exported name rendered white. Case-insensitive, space-insensitive.
  var CLASS_TOKEN = {
    DEATHKNIGHT: "Death Knight", DRUID: "Druid", HUNTER: "Hunter", MAGE: "Mage",
    PALADIN: "Paladin", PRIEST: "Priest", ROGUE: "Rogue", SHAMAN: "Shaman",
    WARLOCK: "Warlock", WARRIOR: "Warrior"
  };
  function classColor(cls) {
    if (!cls) return "#fff";
    if (CLASS_COLOR[cls]) return CLASS_COLOR[cls];          // exact ("Death Knight", "DK")
    var tok = String(cls).toUpperCase().replace(/[\s_-]/g, ""); // "Death Knight" -> "DEATHKNIGHT"
    var name = CLASS_TOKEN[tok];
    return (name && CLASS_COLOR[name]) || "#fff";
  }

  // Shared progress-bar colour scale, in discrete 10% bands. Low % = reddish (just started, long way
  // to go), high % = green (almost done). Used by any bar that shows progression over time
  // (vacations "day x/N", rankings progress, etc.) so the whole app reads bars the same way.
  var PROGRESS_STEPS = [
    "#e05252", // 0-10%   just started
    "#e06b4a", // 10-20%
    "#e2864a", // 20-30%
    "#e6a244", // 30-40%
    "#e6c044", // 40-50%
    "#d9d24a", // 50-60%
    "#b8ce50", // 60-70%
    "#93c95c", // 70-80%
    "#6cc063", // 80-90%
    "#43b581"  // 90-100% almost done
  ];
  function progressColor(p) {
    p = Math.max(0, Math.min(100, +p || 0));
    var i = Math.min(9, Math.floor(p / 10) - (p >= 100 ? 1 : 0));
    return PROGRESS_STEPS[Math.max(0, i)];
  }

  async function fbGet(node) { try { var r = await fetch(FB + node + ".json", { cache: "no-store" }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
  async function fbPost(node, obj) { var r = await fetch(FB + node + ".json", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) }); if (!r.ok) throw new Error("HTTP " + r.status); return (await r.json()).name; }
  async function fbDelete(node) { var r = await fetch(FB + node + ".json", { method: "DELETE" }); if (!r.ok) throw new Error("HTTP " + r.status); }

  w.RatsUtils = {
    FB: FB, CLASS_COLOR: CLASS_COLOR, PROGRESS_STEPS: PROGRESS_STEPS,
    esc: esc, enc: enc, fmtDate: fmtDate, todayStr: todayStr, classColor: classColor,
    progressColor: progressColor,
    fbGet: fbGet, fbPost: fbPost, fbDelete: fbDelete
  };
})(window);
