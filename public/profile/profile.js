/* RATS — Raider Profile page.
   A *view* over data already loaded: the rankings snapshot (DPS/HPS/MVP/records/fun) + the public
   members directory (picker). No per-profile network calls. Officer view (guild key) or a profile-key
   unlock reveals the private cards (Barracks from roster, attendance link).

   Cost: rankings snapshot read once/visit (TTL 30 min, cached), members once/visit. Toggles re-render. */
(function () {
  "use strict";

  var U = window.RatsUtils;
  var esc = U.esc,
    fmtDate = U.fmtDate,
    classColor = U.classColor;
  // format a number with thousands separators. Values are DPS/HPS floats (e.g. 3150.14) — round so we
  // never render decimals on a stat number.
  var fmt = function (n) {
    return Math.round(Number(n || 0)).toLocaleString("en-US");
  };

  // ---------- rankings snapshot (the SAME node the rankings page writes) ----------
  // The officer's Fetch on rankings/ writes ONE raw snapshot to Firebase `rankings` (logs[].rows[] +
  // altMap/mainSpec/serverPct…). This page reads that same node and derives ONE rat's view from it via
  // the shared RatsLogs plumbing — no separate pipeline, no precomputed profile blob. Cache-busted by the
  // snapshot's own `t` (probe a few bytes; full download only when the officer re-fetched).
  var CACHE_KEY = "ratsRankCache"; // shared with rankings/ — same snapshot, same cache entry

  // Minimal raw-shape fallback so the page still renders off-disk before any snapshot exists. Same shape
  // as the live snapshot (logs[].rows[]), just two tiny logs. Empty serverPct/altMap is fine.
  var SAMPLE = {
    guild: "RATS",
    realm: "Onyxia",
    generatedAt: "2026-06-28T20:00:00Z",
    raids: [
      { key: "icc", label: "ICC" },
      { key: "ulduar", label: "Ulduar" },
      { key: "toc", label: "ToC" },
    ],
    rosterNames: ["Okanor", "Kobee", "Magoluso", "Khaddash"],
    mainSpec: { okanor: "Retribution", kobee: "Assassination", magoluso: "Fire", khaddash: "Discipline" },
    altMap: {},
    serverPct: {},
    logs: [
      {
        raidSlug: "icc", raid: "Icecrown Citadel", size: 25, date: "2026-06-25T20:00:00Z",
        reportUrl: "https://wow-logs.co.in/0",
        rows: [
          { n: "Okanor", c: "Paladin", s: "Retribution", r: "DPS", b: "Lord Marrowgar", d: 6012, h: 0, dmg: 1800000, heal: 0, hm: false },
          { n: "Kobee", c: "Rogue", s: "Assassination", r: "DPS", b: "Lord Marrowgar", d: 6450, h: 0, dmg: 1930000, heal: 0, hm: false },
          { n: "Magoluso", c: "Mage", s: "Fire", r: "DPS", b: "Lord Marrowgar", d: 6210, h: 0, dmg: 1860000, heal: 0, hm: false },
          { n: "Khaddash", c: "Priest", s: "Discipline", r: "HEALER", b: "Lord Marrowgar", d: 0, h: 5100, dmg: 0, heal: 1520000, hm: false },
          { n: "Kobee", c: "Rogue", s: "Assassination", r: "DPS", b: "Festergut", d: 6300, h: 0, dmg: 1900000, heal: 0, hm: false },
          { n: "Okanor", c: "Paladin", s: "Retribution", r: "DPS", b: "Festergut", d: 5990, h: 0, dmg: 1790000, heal: 0, hm: false },
        ],
      },
    ],
  };

  var DATA = SAMPLE; // rankings snapshot (raw)
  var L = window.RatsLogs ? window.RatsLogs(DATA) : null; // shared logs plumbing bound to the snapshot
  var MEMBERS = []; // public picker {name,class}
  var PROFILES = {}; // public alt/rank snapshot (Path B) — may be empty
  var VACATIONS = []; // who's away
  var ROSTER = null; // decrypted roster (officer/unlock only)

  // ---------- identity state ----------
  // IS_OFFICER only unlocks the richer *private* roster (extra alt links + tenure) — it is NOT a gate;
  // the page is free for all. Everyone else sees the world-readable PROFILES snapshot.
  var IS_OFFICER = window.RatsData ? RatsData.isOfficer() : !!localStorage.getItem("ratsGuildKey");
  if (window.RatsData && RatsData.mountDevRole) RatsData.mountDevRole();
  function myToon() {
    try {
      return localStorage.getItem("ratsMyToon") || "";
    } catch (e) {
      return "";
    }
  }
  // remember (or forget) which raider is "me" — the page auto-lands here on every future visit.
  function setMyToon(name) {
    try {
      if (name) localStorage.setItem("ratsMyToon", name);
      else localStorage.removeItem("ratsMyToon");
    } catch (e) {}
  }
  var ck = RatsData.profKey;
  // Profile page is FREE FOR ALL — no login gate, no officer/profile-key layer. The private layer
  // (alts, rank, fang) renders for everyone straight from the world-readable PROFILES snapshot; the
  // encrypted roster (tenure) simply falls back to "—" for keyless visitors.

  // ---------- helpers ----------
  function cdot(cls) {
    return '<span class="cdot" style="background:' + classColor(cls) + '"></span>';
  }
  // WoW class icon (Wowhead CDN) — falls back to a colored dot if the class is unknown/offline.
  var CLASS_ICON = {
    "Death Knight": "deathknight",
    DK: "deathknight",
    Druid: "druid",
    Hunter: "hunter",
    Mage: "mage",
    Paladin: "paladin",
    Priest: "priest",
    Rogue: "rogue",
    Shaman: "shaman",
    Warlock: "warlock",
    Warrior: "warrior",
  };
  function cicon(cls) {
    var t = CLASS_ICON[cls];
    if (!t) return cdot(cls);
    // icon over a class-colored square, so if the CDN image fails the swatch still shows underneath.
    return (
      '<span class="cicon" style="background:' +
      classColor(cls) +
      '"><img src="https://wow.zamimg.com/images/wow/icons/large/classicon_' +
      t +
      '.jpg" alt="" onerror="this.style.display=\'none\'"></span>'
    );
  }
  // bare class-icon <img> (for the no-art hero glyph); "" if the class is unknown.
  function classIconTag(cls) {
    var t = CLASS_ICON[cls];
    if (!t) return "";
    return (
      '<img class="clsico" src="https://wow.zamimg.com/images/wow/icons/large/classicon_' +
      t +
      '.jpg" alt="" onerror="this.style.display=\'none\'">'
    );
  }
  // section-header line icons (Feather style, inherit currentColor from .psec). All distinct.
  var SEC_ICONS = {
    identity: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    pack: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20v-.8a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v.8"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.9"/><path d="M18.5 14.4a5 5 0 0 1 3 4.6v.8"/>',
    performance: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
    boss: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    // heart with a heartbeat line through it — reads as HP / health for the Raid Vitality panel
    vitality:
      '<path d="M20.8 5.6a5 5 0 0 0-8.8-1.6 5 5 0 0 0-8.8 1.6c-1 3 1.4 6 4.4 8.6L12 20l4.4-5.8"/><path d="M3.5 12H8l1.5-3 2 5L15 11l1.2 1H21"/>',
    // medal — awards / honours section
    honours:
      '<circle cx="12" cy="9" r="6"/><path d="M9 14.5 7 22l5-3 5 3-2-7.5"/>',
  };
  function secIcon(key) {
    var body = SEC_ICONS[key];
    if (!body) return "";
    return (
      '<svg class="sicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      body +
      "</svg>"
    );
  }
  function nameHtml(name, cls) {
    return '<span style="color:' + classColor(cls) + ';font-weight:800">' + esc(name) + "</span>";
  }
  // parse tier from a percentile-ish 0-100 number (used if the snapshot ever carries parses)
  function parseTier(p) {
    return p >= 95 ? "orange" : p >= 75 ? "purple" : p >= 50 ? "blue" : p >= 25 ? "green" : "grey";
  }

  // find a player's row in a list (dps/hps/deaths/improved) + their 1-based rank
  // find a person's row in a derived board (dpsBoard/hpsBoard) + their 1-based rank.
  function findRanked(list, name) {
    list = list || [];
    var k = ck(name);
    for (var i = 0; i < list.length; i++) if (ck(list[i].name) === k) return { row: list[i], rank: i + 1 };
    return null;
  }

  // ---------- performance scope (raid + size + difficulty) ----------
  var SIZE = 25; // current Performance size toggle (25 / 10)
  var RAID = ""; // current raid segment (slug e.g. "icc"); "" = All / not scoped
  var DIFF = "nm"; // Normal/Heroic within a split raid (toc/icc). Boards are computed per-diff.

  // The raids present in this snapshot — always DATA.raids[] (the officer Fetch fills it). Each { slug, label }.
  function raidList() {
    return (DATA.raids || []).map(function (r) {
      return { slug: r.key || r.slug, label: r.label || raidLabel(r.key || r.slug) };
    });
  }
  function raidLabel(slug) {
    var m = {
      icc: "ICC", ulduar: "Ulduar", uld: "Ulduar", togc: "ToGC", toc: "ToC", trial: "ToC",
      ony: "Onyxia", naxx: "Naxx", rs: "RS", voa: "VoA", eoe: "EoE",
    };
    return m[String(slug || "").toLowerCase()] || String(slug || "").toUpperCase();
  }

  // ---------- RAW derivation (the profile's own lens) --------------------------------------------------
  // Unlike rankings/ (which BLENDS players against each other for a fair standing), the profile shows a
  // rat's own RAW numbers: average DPS/HPS across their kills, their BEST parse per boss, and — where the
  // snapshot carries it — their server percentile per boss. We fold rows to the PERSON (main) and to the
  // toon's dominant role via the shared RatsLogs plumbing, so a person's DPS toons fuse and their healer
  // toon stays a separate line — exactly like rankings, because it uses the same resolveIdentity/toonRoles.
  //
  // Memoized per (raid|size|diff|snapshot-t) so toggles are cheap and every widget reads one computation.
  var _deriveCache = null,
    _deriveKey = "";
  function derive() {
    if (!L) return { people: {}, boards: { dps: [], hps: [] }, boss: {} };
    L.setData(DATA).setScope({ raid: RAID, size: SIZE, diff: DIFF });
    var key = RAID + "|" + SIZE + "|" + DIFF + "|" + (DATA.generatedAt || "");
    if (_deriveCache && _deriveKey === key) return _deriveCache;

    var logs = L.logsInScope("all");
    var guild = L.rosterSet();
    var trole = L.toonRoles(logs); // per-toon dominant role
    var people = {}; // personKey|role -> aggregate (own numbers only — no cross-role mixing)

    logs.forEach(function (l) {
      L.rowsForDiff(l.rows).forEach(function (r) {
        var tk = L.normNm(r.n);
        var isHealer = trole[tk] === "HEALER";
        if (isHealer && r.r !== "HEALER") return; // ignore this healer's odd dps fight
        if (!isHealer && r.r === "HEALER") return; // ignore a dps toon's odd heal fight
        if (!isHealer && L.isTankFight(r)) return; // tank fights never count toward DPS
        var id = L.resolveIdentity(r.n, r.c);
        if (guild && !guild[id.key] && !guild[tk]) return; // guildies only

        var gk = id.key + "|" + (isHealer ? "H" : "D");
        var rate = isHealer ? r.h || 0 : r.d || 0;
        var e =
          people[gk] ||
          (people[gk] = {
            key: id.key, name: id.name, cls: id.cls || r.c, spec: r.s || "",
            role: isHealer ? "H" : "D", metric: isHealer ? "hps" : "dps",
            raidSlug: l.raidSlug || "", sum: 0, fights: 0, best: 0, byBoss: {},
          });
        e.sum += rate;
        e.fights++;
        if (rate > e.best) e.best = rate;
        if (!e.cls) e.cls = r.c;
        // per-boss BEST for THIS person, in their OWN metric (drives placements + best parse).
        // rate is a FLOAT (e.g. 3150.14 hps) — round on store so every consumer shows a clean integer.
        var bb = e.byBoss[r.b];
        if (!bb || rate > bb.value) e.byBoss[r.b] = { value: Math.round(rate), spec: r.s || "" };
      });
    });

    // finalize per-person: average + server percentile (their OWN, once per person).
    Object.keys(people).forEach(function (gk) {
      var e = people[gk];
      e.avg = e.fights ? e.sum / e.fights : 0;
      var srv = L.serverPctFor(e.name); // 0..1 or null
      e.serverPct = srv == null ? null : Math.round(srv * 100);
    });

    // sorted DPS / HPS boards (raw average, descending) — findRanked() reads these for standings
    function board(roleFlag, metric) {
      var rows = Object.keys(people)
        .map(function (gk) { return people[gk]; })
        .filter(function (e) { return e.role === roleFlag && e.fights > 0; })
        .map(function (e) {
          // value = the rat's RAW average (their real number, as the user asked). rank/order come from
          // the shared fairness blend below so the profile's #N MATCHES the rankings page.
          return { name: e.name, class: e.cls, spec: e.spec, value: Math.round(e.avg), best: Math.round(e.best), fights: e.fights, metric: metric, serverPct: e.serverPct };
        });
      // order by the SAME blend as rankings/ (aggregate), not raw average — so ranks agree with the page.
      var blend = L.aggregate(logs, roleFlag === "H", 1); // best→worst by hybrid score
      var rankOf = {};
      blend.forEach(function (b, i) { rankOf[b.key] = i; });
      rows.sort(function (a, b) {
        var ra = rankOf[ck(a.name)], rb = rankOf[ck(b.name)];
        if (ra == null) ra = 1e9;
        if (rb == null) rb = 1e9;
        return ra - rb || b.value - a.value;
      });
      return rows;
    }

    _deriveCache = { people: people, boards: { dps: board("D", "dps"), hps: board("H", "hps") } };
    _deriveKey = key;
    return _deriveCache;
  }

  function dpsList() { return derive().boards.dps; }
  function hpsList() { return derive().boards.hps; }
  // person aggregate (for byBoss/records), main+role folded. Prefers DPS line, else HPS.
  function personAgg(name) {
    var p = derive().people,
      k = ck(name);
    return p[k + "|D"] || p[k + "|H"] || null;
  }
  // the rat's single best parse in scope: highest per-boss value across their DPS/HPS lines.
  function bestParseOf(name) {
    var k = ck(name),
      p = derive().people,
      best = null;
    ["D", "H"].forEach(function (rf) {
      var e = p[k + "|" + rf];
      if (!e) return;
      Object.keys(e.byBoss).forEach(function (bn) {
        var v = e.byBoss[bn].value;
        if (!best || v > best.value) best = { value: Math.round(v), encounter: bn, metric: e.metric };
      });
    });
    return best;
  }
  function rankClass(r) {
    return r === 1 ? "g" : r === 2 ? "s" : r === 3 ? "b" : "";
  }

  // ---------- tank awareness ----------
  // The API has NO tanking metric (damageTaken/threat/deaths are null), so a tank can't be ranked on DPS
  // or mitigation. We detect tanks and give them a PRESENCE profile (bosses tanked / fights held) instead
  // of forcing them onto a meaningless DPS ladder. tankStats memoized per (name|scope) like derive().
  var _tankCache = {}, _tankKey = "";
  function tankStats(name) {
    if (!L) return { isTank: false };
    L.setData(DATA).setScope({ raid: RAID, size: SIZE, diff: DIFF });
    var key = RAID + "|" + SIZE + "|" + DIFF + "|" + (DATA.generatedAt || "");
    if (_tankKey !== key) { _tankCache = {}; _tankKey = key; }
    var k = ck(name);
    if (!(k in _tankCache)) _tankCache[k] = L.tankStatsFor(name);
    return _tankCache[k];
  }
  // isTank is a CAREER fact, not a per-scope one: a main tank stays "a tank" on every raid tab, even a
  // raid where he didn't tank this week. True if he tanks in ANY scope (careerStandings role "T"). The
  // per-scope tankStats then handles "no tank fights in THIS scope" (shows an empty-but-correct tank card).
  var _isTankCache = {}, _isTankKey = "";
  function isTank(name) {
    if (!L) return false;
    var snapKey = DATA.generatedAt || "";
    if (_isTankKey !== snapKey) { _isTankCache = {}; _isTankKey = snapKey; }
    var k = ck(name);
    if (!(k in _isTankCache)) {
      var st = L.careerStandings(name);
      _isTankCache[k] = st.some(function (x) { return x.role === "T"; });
    }
    return _isTankCache[k];
  }

  // ---------- picker ----------
  var SELECTED = "";
  function memberClass(name) {
    var k = ck(name),
      m = MEMBERS.find(function (x) {
        return ck(x.name) === k;
      });
    if (m && m.class) return m.class;
    var p = PROFILES[k];
    if (p && p.class) return p.class;
    // alts have no direct MEMBERS/PROFILES entry — their class lives in the pack (roster OR profiles.alts).
    // barracksFor already resolves both modes, so reuse it and read this toon's class from the pack.
    var pack = barracksFor(name);
    if (pack && pack.toons.length) {
      var t = pack.toons.find(function (x) {
        return ck(x.name) === k;
      });
      if (t && t.class) return t.class;
    }
    // fall back to any class seen in the derived boards
    var all = dpsList().concat(hpsList());
    var hit = all.find(function (x) {
      return ck(x.name) === k;
    });
    return (hit && hit.class) || "";
  }
  // ---------- header search: jump straight to any raider's profile ----------
  function psFilter() {
    var inp = document.getElementById("pSearchInput");
    var box = document.getElementById("pSearchList");
    if (!inp || !box) return;
    var q = ck(inp.value); // normalized: lowercased a-z0-9
    var list = MEMBERS.slice().sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    });
    if (q)
      list = list.filter(function (m) {
        return ck(m.name).indexOf(q) >= 0;
      });
    if (!list.length) {
      box.innerHTML = '<div class="none">No rat by that name.</div>';
      box.style.display = "block";
      return;
    }
    box.innerHTML = list
      .map(function (m) {
        return (
          '<div class="opt" onclick="psPick(\'' +
          esc(m.name).replace(/'/g, "\\'") +
          "')\">" +
          cdot(m.class) +
          '<span style="color:' +
          classColor(m.class) +
          '">' +
          esc(m.name) +
          "</span></div>"
        );
      })
      .join("");
    box.style.display = "block";
  }
  function psPick(name) {
    var inp = document.getElementById("pSearchInput"),
      box = document.getElementById("pSearchList");
    if (inp) inp.value = "";
    if (box) box.style.display = "none";
    goToon(name); // switches the whole page + scrolls to top
  }
  // close the dropdown on outside click
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#psearch")) {
      var b = document.getElementById("pSearchList");
      if (b) b.style.display = "none";
    }
  });

  // ---------- barracks (alts↔main) ----------
  // Public source: PROFILES[charKey] = { name, class, rank, fang, mainOf, alts:[{name,class}] } (officer-published).
  // Private source (officer/unlock): the decrypted roster's alt→main notes.
  // pack ordering: main first, then highest level, then name.
  function byMainThenLevel(a, b) {
    return b.main - a.main || (+b.level || 0) - (+a.level || 0) || (a.name || "").localeCompare(b.name || "");
  }
  function altMainNote(m) {
    var on = ((m && m.officerNote) || "").trim();
    var mm = on.match(/^(.+?)\s+alt\b/i);
    return mm ? mm[1].trim() : null;
  }
  // Explicit "<Main> Alt" in the PUBLIC note — the ONLY publicNote form that marks an alt. The note is
  // mostly spec/profession text, so this must require the literal "alt" keyword (a lenient first-word
  // parse would misclassify ~60 members). Used for the isAlt GATE; rosterMainOf then resolves the name.
  function altMainPublicNote(m) {
    var mm = ((m && m.publicNote) || "").trim().match(/^(.+?)\s+alt\b/i);
    return mm ? mm[1].trim() : null;
  }
  function rosterMainOf(m) {
    var on = (m.officerNote || "").trim(),
      mm = on.match(/^(.+?)\s+alt\b/i);
    if (mm) return mm[1].trim();
    var pn = (m.publicNote || "").trim();
    if (pn) {
      var t = pn.split(/[\s,/\-(]/)[0];
      if (t && /^[A-Za-zÀ-ÿ]{2,}$/.test(t)) return t;
    }
    return null;
  }
  // returns { main:{name,class}, toons:[{name,class,level,main:bool}] } for the selected name
  function barracksFor(name) {
    var k = ck(name);
    // private: build from the decrypted roster (officers only — the encrypted node needs the guild key)
    if (ROSTER && Array.isArray(ROSTER.roster)) {
      var R = ROSTER.roster;
      var me = R.find(function (m) {
        return ck(m.name) === k;
      });
      if (me) {
        // An alt's main link may live in the PUBLIC note on a non-alt rank (e.g. Shackaa: publicNote
        // "Shockaa Alt", rankIndex 5). Gate ONLY on the explicit "<Main> Alt" form (altMainPublicNote),
        // NOT rosterMainOf — its lenient first-word parse would misread spec notes as alt links.
        var isAlt = function (m) {
          return (
            m.rankIndex === 4 || /alt/i.test(m.rankName || "") || !!altMainNote(m) || !!altMainPublicNote(m)
          );
        };
        var mainName = isAlt(me) ? rosterMainOf(me) || me.name : me.name;
        var mk = ck(mainName);
        var pack = R.filter(function (m) {
          if (ck(m.name) === mk) return true;
          return isAlt(m) && ck(rosterMainOf(m) || "") === mk;
        });
        if (pack.length > 1) {
          return {
            toons: pack
              .map(function (m) {
                return { name: m.name, class: m.class, level: m.level, main: ck(m.name) === mk };
              })
              .sort(byMainThenLevel),
          };
        }
      }
    }
    // public: the safe profiles snapshot
    var p = PROFILES[k];
    if (p) {
      var mk2 = p.mainOf ? ck(p.mainOf) : k;
      var src = p.mainOf ? PROFILES[mk2] : p;
      if (src && Array.isArray(src.alts) && src.alts.length) {
        var toons = [{ name: src.name, class: src.class, level: src.level, main: true }].concat(
          src.alts.map(function (a) {
            return { name: a.name, class: a.class, level: a.level, main: false };
          })
        );
        return { toons: toons.sort(byMainThenLevel) };
      }
    }
    return null;
  }

  // the main toon's name for any character (itself if it IS the main); "" if unknown.
  function mainToonOf(name) {
    var pack = barracksFor(name);
    if (pack && pack.toons.length) {
      var m = pack.toons.find(function (t) {
        return t.main;
      });
      if (m) return m.name;
    }
    return "";
  }

  // ---------- rat title (seeded, stable per name) ----------
  var QUIPS = [
    "scurries fastest in the dark",
    "always first to the cheese",
    "never misses a swing",
    "gnaws through any wall",
    "the rat the boss fears",
    "small paws, big numbers",
    "lives in the vents, dies in the fire",
    "loots first, asks later",
    "fearless in the sewer",
    "the guild's sharpest fang",
    "born in a wipe, raised on loot",
    "quiet rat, loud parse",
  ];
  function seededQuip(name) {
    var h = 0,
      s = String(name || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return QUIPS[h % QUIPS.length];
  }

  function rankIconFor(name) {
    // highest wins: 👑 GM > ⭐ Officer > 💀 Fang. From PROFILES (public) or roster (private).
    var k = ck(name),
      p = PROFILES[k];
    var rank = p && p.rank,
      fang = p && p.fang;
    if (!rank && ROSTER && Array.isArray(ROSTER.roster)) {
      var m = ROSTER.roster.find(function (x) {
        return ck(x.name) === k;
      });
      if (m) {
        rank = m.rankName || "";
        var fl = (ROSTER.fangs || []).map(function (n) {
          return ck(n);
        });
        fang = fl.indexOf(k) >= 0;
      }
    }
    // RATS ranks: 👑 Guild Master · ⭐ Officer ("Warchief Rat") · 💀 Fang ("Warchief's Fangs").
    if (/guild\s*master|^gm$/i.test(rank || "")) return { em: "👑", t: "Guild Master" };
    if (/officer|warchief\s+rat/i.test(rank || "")) return { em: "⭐", t: "Officer" };
    if (fang || /fang/i.test(rank || "")) return { em: "💀", t: "Warchief's Fang" };
    return null;
  }

  function vacFor(name) {
    var k = ck(name),
      today = U.todayStr();
    return VACATIONS.find(function (v) {
      if (ck(v.name) !== k) return false;
      var s = v.start,
        e = v.end || v.start;
      return s && s <= today && today <= e;
    });
  }

  // NOTE: badges (a coin/tier system) are PARKED — not rendered yet. The right column of the grid is
  // intentionally left empty for a future decision.

  // ---------- render ----------
  // WoW parse (percentile) colors — grey / green / blue / purple / orange / gold-legendary.
  function parseColor(p) {
    p = +p || 0;
    if (p >= 100) return "#e5cc80"; // legendary gold
    if (p >= 99) return "#e268a8"; // pink (astounding)
    if (p >= 95) return "#ff8000"; // orange (epic)
    if (p >= 75) return "#a335ee"; // purple (rare)
    if (p >= 50) return "#0070dd"; // blue (uncommon)
    if (p >= 25) return "#1eff00"; // green (common)
    return "#9d9d9d"; // grey
  }
  // metric-type color for a stat number — HPS is green (healing), DPS is gold/yellow (damage). Matches
  // the rankings page (healing rate #6bd18a; damage read as the medal-gold #f6c452).
  var METRIC_COL = { hps: "#6bd18a", dps: "#f6c452" };
  function metricTint(valStr, metric) {
    var c = METRIC_COL[metric] || "var(--text)";
    return '<span style="color:' + c + '">' + valStr + "</span>";
  }
  // SOLID (filled) icons for the stat tiles — chunky glyphs that read clearly at small size (the old
  // thin-stroke outlines looked like empty squares in the chip). Fill = currentColor -> tinted by the
  // tile accent. DPS = sword, HEALER = medical cross, TANK = shield. (no watermark)
  // reused as the faded bottom-right watermark.
  var TILE_IC = {
    // sword: blade from top-right to lower-left with a crossguard + pommel — reads as "damage".
    sword: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.7 3.3a1 1 0 0 0-1-.25l-3.2 1a1 1 0 0 0-.44.26L8.6 11.99l-1.3-1.3a1 1 0 0 0-1.42 1.42l.7.7-1.9 1.9-1.4-.35a1 1 0 0 0-.95 1.64l1.9 1.9-1.24 1.24a1 1 0 1 0 1.42 1.42L6.65 20.3l1.9 1.9a1 1 0 0 0 1.64-.95l-.35-1.4 1.9-1.9.7.7a1 1 0 0 0 1.42-1.42l-1.3-1.3 7.42-7.44a1 1 0 0 0 .26-.44l1-3.2a1 1 0 0 0-.25-1.02Z"/></svg>',
    // medical cross (plus) in a rounded square — the universal "healer" symbol.
    cross: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 3a1 1 0 0 0-1 1v5H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h5v5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-5h5a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-5V4a1 1 0 0 0-1-1h-4Z"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2 15 8.7l7.1.8a1 1 0 0 1 .56 1.74l-5.28 4.78 1.45 6.98a1 1 0 0 1-1.48 1.08L12 20.4l-6.3 3.66a1 1 0 0 1-1.48-1.08l1.45-6.98L.4 11.24a1 1 0 0 1 .56-1.74L8 8.7l3-6.5a1 1 0 0 1 1.82 0Z"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 7h-3.1a15 15 0 0 0-1.2-4.1A8 8 0 0 1 18.9 9ZM12 4.2c.8 1.1 1.4 2.7 1.7 4.8h-3.4c.3-2.1.9-3.7 1.7-4.8ZM4.6 15A8 8 0 0 1 4 12c0-1 .2-2 .6-3h3.5a20 20 0 0 0 0 6H4.6Zm.5 2h3.1a15 15 0 0 0 1.2 4.1A8 8 0 0 1 5.1 17ZM8.1 9H4.9a8 8 0 0 1 4.4-4.1A15 15 0 0 0 8.1 9Zm3.9 10.8c-.8-1.1-1.4-2.7-1.7-4.8h3.4c-.3 2.1-.9 3.7-1.7 4.8Zm.3-6.8h-3.6a18 18 0 0 1 0-6h3.6a18 18 0 0 1 0 6Zm1.9 8.1a15 15 0 0 0 1.2-4.1h3.1a8 8 0 0 1-4.3 4.1Zm1.5-6.1a20 20 0 0 0 0-6h3.5c.4 1 .6 2 .6 3s-.2 2-.6 3h-3.5Z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.8 4 4.5V11c0 5.2 3.4 8.9 8 11 4.6-2.1 8-5.8 8-11V4.5l-8-2.7Z"/></svg>',
    swords: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.7 3.3a1 1 0 0 0-1-.25l-3.2 1a1 1 0 0 0-.44.26L4.7 15.6l-1.9-.4a1 1 0 0 0-.95 1.64l1.9 1.9-1.24 1.24a1 1 0 1 0 1.42 1.42L6.15 20.2l1.9 1.9a1 1 0 0 0 1.64-.95l-.4-1.9L20.7 7.9a1 1 0 0 0 .26-.44l1-3.2a1 1 0 0 0-.26-.96ZM3.3 3.3a1 1 0 0 1 1-.25l3.2 1a1 1 0 0 1 .44.26l4 4-2.83 2.83-4-4a1 1 0 0 1-.26-.44l-1-3.2a1 1 0 0 1 .45-.2Zm11 12.57 2.06-2.06 1.94 1.94 1.9-.4a1 1 0 0 1 .95 1.64l-1.9 1.9 1.24 1.24a1 1 0 1 1-1.42 1.42l-1.24-1.24-1.9 1.9a1 1 0 0 1-1.64-.95l.4-1.9-1.94-1.94Z"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v2H3V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1ZM3 10h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10Zm5 3H6v2h2v-2Zm4 0h-2v2h2v-2Zm4 0h-2v2h2v-2Z"/></svg>',
  };

  function placementList(name) {
    // THIS rat's own best parse per boss, in their OWN metric (a healer sees HPS, not DPS). Bars are
    // relative to the rat's own best in scope (so the biggest bar = their strongest boss), and colored
    // by their SERVER percentile — the honest "how good is this parse" signal. No cross-player rank here.
    var agg = personAgg(name);
    if (!agg || !agg.byBoss || !Object.keys(agg.byBoss).length)
      return '<p class="empty" style="padding:8px 2px">No per-boss parses in this scope.</p>';

    var metricLbl = agg.metric === "hps" ? "HPS" : "DPS";
    var srvPct = agg.serverPct; // this rat's server percentile in scope (or null)
    var bossNames = L ? L.sortBosses(Object.keys(agg.byBoss), agg.raidSlug || RAID) : Object.keys(agg.byBoss);
    var myBest = 1;
    bossNames.forEach(function (bn) { if (agg.byBoss[bn].value > myBest) myBest = agg.byBoss[bn].value; });

    var rows = bossNames.map(function (bn) {
      var v = agg.byBoss[bn].value;
      var width = Math.max(4, Math.round((v / myBest) * 100)); // vs the rat's own best (min sliver)
      var barCol = srvPct != null ? parseColor(srvPct) : "var(--col)";
      var srvTip = srvPct != null ? Math.round(srvPct) + " server parse" : "no server parse";
      return (
        '<li><span class="bn">' +
        esc(bn) +
        ' <span class="pspec">' + metricLbl + "</span></span>" +
        '<span class="pbar"><i style="width:' + width + "%;background:" + barCol + '" title="' + srvTip + '"></i></span>' +
        '<span class="bv">' + fmt(v) + "</span></li>"
      );
    });
    return '<ul class="plist">' + rows.join("") + "</ul>";
  }

  // medal-aware stat tile: pass a rank (1/2/3) to colour the chip + accent strip. Optional iconSvg gives
  // it the icon-chip + class-washed look (same family as the tank tiles).
  function rankTile(lbl, val, sub, rank, col, iconSvg) {
    var chip = rank != null ? ' <span class="rkchip ' + rankClass(rank) + '">#' + rank + "</span>" : "";
    var ic = iconSvg ? '<span class="tt-ic">' + iconSvg + "</span>" : "";
    // empty tile (no data): value is a bare em-dash -> mute it so it doesn't read as a stark white bar.
    var isEmpty = val === "—" || val == null || val === "";
    return (
      '<div class="tile-s' +
      (iconSvg ? " tile-t" : "") +
      (rank != null ? " accent" : "") +
      (isEmpty ? " empty-tile" : "") +
      '" style="--tile-col:' +
      (col || "var(--accent)") +
      '">' +
      ic +
      '<div class="lbl">' +
      esc(lbl) +
      "</div>" +
      // empty tile: no big value at all (a lone "—" at 26px reads as a stray white line). The sub-text
      // ("no DPS parses in scope") carries the meaning instead.
      (isEmpty ? "" : '<div class="v">' + val + chip + "</div>") +
      (sub ? '<div class="d">' + sub + "</div>" : "") +
      "</div>"
    );
  }

  // ---- HERO — full-art collapsible banner (mockup Opt 5). Art = images/profile-bg/<main>/<name>.png;
  //      falls back to a designed class-gradient banner + glyph when no art file exists.
  // Hero starts EXPANDED for everyone — custom art, generic class banner or the no-art fallback all
  // show open. Once the user toggles it by hand we respect their choice for the session.
  var HERO_COLLAPSED = false;
  var HERO_USER_SET = false; // true after a manual toggle -> auto-expand no longer overrides
  function heroHtml(name, cls, col, spec, ri, vac) {
    // FREE FOR ALL — no login, so no "this is you" ownership badge.
    var youTag = "";

    // vacation pill: away now -> "Away until"; else the next upcoming vacation -> "Next vacation"
    var pill = "";
    if (vac) pill = '<span class="hpill away">🏖️ Away until ' + esc(fmtDate(vac.end || vac.start)) + "</span>";
    else {
      var nx = nextVacFor(name);
      if (nx) pill = '<span class="hpill next">📅 Next vacation ' + esc(fmtDate(nx.start)) + "</span>";
    }

    // art cascade: images are grouped per main -> images/profile-bg/<main>/<name>.png.
    //   <main>/<name>.png (THIS toon only)  ->  generic class banner (_class/<slug>.png)  ->  CSS no-art.
    // Each 404 steps to the next src; the final 404 flips the hero to .noart (CSS gradient + glyph).
    // An alt with no art of its own does NOT inherit the main's art — it falls straight to the plain
    // class banner. The main's art is only ever shown for the main itself.
    var bg = "../../images/profile-bg/";
    var lc = function (s) {
      return U.enc(String(s).toLowerCase());
    };
    var main = mainToonOf(name) || name; // this toon's main (itself if it has none)
    var artSrc = bg + lc(main) + "/" + lc(name) + ".png";
    // The folder is the PLAYER, which we can only guess at via the roster's main — and that guess has
    // been wrong (folder "kobe" vs main "Kobee"; a toon whose roster main is an alt-named DK). So also
    // try <name>/<name>.png: a toon's art living in a folder named after ITSELF. Costs one 404 at worst.
    var selfSrc = bg + lc(name) + "/" + lc(name) + ".png";
    // generic per-class fallback banner (kept in images/profile-bg/_class/<slug>.png); "" if class unknown.
    var clsSlug = CLASS_ICON[cls] || "";
    var classSrc = clsSlug ? bg + "_class/" + clsSlug + ".png" : "";
    // build the chain of sources to try after the first, in order, then land on CSS .noart.
    var chain = [];
    if (selfSrc !== artSrc) chain.push(selfSrc); // same-named folder (main resolved to the wrong name)
    if (classSrc) chain.push(classSrc); // the plain class banner (no main-art inheritance for alts)
    // stepper: pop the next candidate off data-chain; when empty, mark the hero .noart.
    var artOnErr =
      "var c=(this.dataset.chain||'').split('|').filter(Boolean);" +
      "if(c.length){this.dataset.chain=c.slice(1).join('|');this.src=c[0];}" +
      "else{this.closest('.hero').classList.add('noart');}";
    var chainAttr = chain.length ? ' data-chain="' + chain.join("|") + '"' : "";

    // class icon for the no-art glyph (falls back to the rat emoji if the class is unknown)
    var iconTag = classIconTag(cls);
    var glyph = iconTag || "🐀";
    // big faded class icon behind the banner (only shows in .noart) for depth
    var ghost = iconTag ? '<span class="heroghost">' + iconTag + "</span>" : "";

    return (
      '<div class="hero' +
      (HERO_COLLAPSED ? " collapsed" : "") +
      '" id="hero" style="--col:' +
      col +
      '">' +
      youTag +
      '<img class="heroart" src="' +
      artSrc +
      '"' +
      chainAttr +
      ' alt="" onerror="' +
      artOnErr +
      '" onload="heroArtLoaded(this)">' +
      ghost +
      '<span class="heroglow"></span>' +
      '<span class="heroglyph">' +
      glyph +
      "</span>" +
      '<button class="htoggle" type="button" onclick="toggleHero()" title="Expand / collapse banner" aria-label="Toggle banner">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>' +
      "</button>" +
      '<div class="hbody">' +
      '<div class="hname" style="color:' +
      col +
      '">' +
      esc(name) +
      (ri ? ' <span class="hrank" title="' + esc(ri.t) + '">' + ri.em + "</span>" : "") +
      "</div>" +
      '<div class="hmeta">' +
      esc(cls || "—") +
      (spec ? " · " + esc(spec) : "") +
      "</div>" +
      '<div class="hquip">"' +
      esc(seededQuip(name)) +
      '"</div>' +
      (pill ? '<div class="hpills">' + pill + "</div>" : "") +
      "</div>" +
      "</div>"
    );
  }

  // ---- LEFT rail — Identity (each fact once) + The Pack (alts) + Armory ----
  // Guild rank / Squad / Tenure are PERSON-level facts — they belong to the MAIN, so viewing an alt shows
  // the same identity as the main (an alt isn't a separate person). Ladder is per-TOON (this toon's own
  // parse standing in the current scope). Rows always render (with a "—" when absent) so the card keeps a
  // steady height whether you're on a decked main or a bare alt.
  var DASH = '<span class="rv" style="color:var(--text-faint)">—</span>';
  function identityHtml(name, col) {
    var main = mainToonOf(name) || name; // person-level facts come from the main
    var rows = [];
    var ri = rankIconFor(main);
    var rankName = rankLabel(main);
    rows.push(railRow(ri ? ri.em : "🐀", "Guild rank", rankName ? '<span class="rv col">' + esc(rankName) + "</span>" : DASH));
    rows.push(railRow("💀", "Squad", isFang(main) ? '<span class="rv">Fang</span>' : DASH));

    var lad = ladderFor(name); // this TOON's own standing in scope
    rows.push(
      railRow("📊", "Ladder", lad ? '<span class="rv">#' + lad.rank + " of " + lad.total + " " + lad.metric + "</span>" : DASH)
    );

    var ten = tenureFor(main);
    if (ten) rows.push(railRow("🧀", "Tenure", '<span class="rv">' + esc(ten) + "</span>"));

    var html = '<div class="psec">' + secIcon("identity") + "Identity</div>";
    html += rows.length
      ? '<div class="card idcard">' + rows.join("") + "</div>"
      : '<div class="card idcard"><span class="empty" style="padding:4px 2px">No profile details yet. 🐀</span></div>';

    // The Pack (alts)
    html += '<div class="psec mt">' + secIcon("pack") + 'The Pack <span class="cnt">— alts</span></div>';
    var pack = barracksFor(name);
    if (pack && pack.toons.length > 1) {
      html +=
        '<div class="card"><div class="barracks">' +
        pack.toons
          .map(function (t) {
            var isCurrent = ck(t.name) === ck(name); // the toon this page is already showing
            return (
              '<div class="toon' +
              (t.main ? " main" : "") +
              (isCurrent ? " current" : "") +
              '" style="--col:' +
              classColor(t.class) +
              '"' +
              (isCurrent
                ? ""
                : ' role="button" tabindex="0" onclick="goToon(\'' + esc(t.name).replace(/'/g, "\\'") + "')\"") +
              ">" +
              cicon(t.class) +
              '<span class="tl"><span style="color:' +
              classColor(t.class) +
              '">' +
              esc(t.name) +
              "</span><small>" +
              esc(t.class || "") +
              (t.level ? " " + t.level : "") +
              (t.main ? " · main" : isCurrent ? " · viewing" : "") +
              "</small></span></div>"
            );
          })
          .join("") +
        "</div></div>";
    } else {
      html +=
        '<div class="card"><span class="empty" style="padding:4px 2px">No alts on record — a lone rat. 🐀</span></div>';
    }

    // Armory link
    html +=
      '<a class="btn" style="width:100%;margin-top:14px" target="_blank" rel="noopener" href="https://armory.warmane.com/character/' +
      U.enc(name) +
      '/Onyxia/summary">🔗 Armory ↗</a>';
    return html;
  }
  // ---- Raids-with-the-guild count: distinct raid NIGHTS (lockouts) this person attended, any role,
  // across every raid/size. Alts fuse into the main via resolveIdentity so one person = one tally. ----
  function raidNights(name) {
    if (!L || !DATA.logs) return 0;
    var meKey = ck(name);
    var nights = {};
    (DATA.logs || []).forEach(function (l) {
      var rows = l.rows || [];
      var present = rows.some(function (r) {
        var id = L.resolveIdentity(r.n, r.c);
        return (id && id.key === meKey) || L.normNm(r.n) === L.normNm(name);
      });
      if (present) nights[l.date || l.reportId || l.reportUrl] = 1;
    });
    return Object.keys(nights).length;
  }
  // progression tiers for the raid-night badge (Pokémon-style: fills toward the next ring)
  var RAID_TIERS = [10, 20, 50, 100];
  // returns { count, tier, next, pct, maxed } — tier = highest reached (0 if none), next = target ring.
  // The ring fills from ZERO to `next` (so 10 of 20 = 50% full), never empty when you already have raids.
  function raidProgress(name) {
    var count = raidNights(name);
    var top = RAID_TIERS[RAID_TIERS.length - 1];
    var tier = 0,
      next = RAID_TIERS[0];
    for (var i = 0; i < RAID_TIERS.length; i++) {
      if (count >= RAID_TIERS[i]) {
        tier = RAID_TIERS[i];
        next = RAID_TIERS[i + 1] || RAID_TIERS[i]; // maxed → next stays at the top tier
      }
    }
    var maxed = count >= top;
    var pct = maxed ? 1 : Math.min(1, count / next); // fill from 0 → next target
    return { count: count, tier: tier, next: next, pct: pct, maxed: maxed };
  }
  // ---- Honours: the guild superlatives this raider currently HOLDS (The Medic, On a streak, …) ----
  // Computed live from the logs by the SHARED award module (assets/js/fun-awards.js) — the very same
  // logic the rankings' Fun & Shame grid uses, so a badge here always matches the card there. Positive
  // awards only (no shame on your own profile). Nothing is stored; it recomputes each render.
  function deriveBadges(name) {
    if (!window.RatsFun || !DATA || !DATA.logs) return [];
    try {
      return window.RatsFun(DATA).forRaider(name) || [];
    } catch (e) {
      return [];
    }
  }
  // Honours panel — derived badges; lives in the RIGHT column under Raid Vitality.
  // Pokémon-style progress ring: SVG circle that fills toward the next raid-night tier, big count
  // in the middle, "of NEXT" underneath. Maxed (100+) shows a full gold ring.
  function progressRingHtml(p) {
    var R = 34,
      C = 2 * Math.PI * R,
      off = C * (1 - p.pct);
    var label = p.maxed ? "raids" : "of " + p.next;
    return (
      '<div class="ring">' +
      '<svg viewBox="0 0 80 80" class="ring-svg" aria-hidden="true">' +
      '<circle class="ring-bg" cx="40" cy="40" r="' + R + '"></circle>' +
      '<circle class="ring-fg" cx="40" cy="40" r="' + R + '" ' +
      'stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"></circle>' +
      "</svg>" +
      '<div class="ring-in"><span class="ring-n">' + p.count + "</span>" +
      '<span class="ring-l">' + label + "</span></div>" +
      "</div>"
    );
  }
  function honoursHtml(name) {
    var p = raidProgress(name);
    var badges = deriveBadges(name);
    var total = badges.length + (p.count > 0 ? 1 : 0);
    var html = '<div class="psec mt">' + secIcon("honours") + "Honours" +
      (total ? ' <span class="cnt">— ' + total + "</span>" : "") + "</div>";
    if (!total) {
      return html + '<div class="card"><span class="empty" style="padding:4px 2px">No honours yet — get in the logs! 🐀</span></div>';
    }
    html += '<div class="card honcard">';
    // raid-nights progression ring (the headline honour)
    if (p.count > 0) {
      html +=
        '<div class="ringrow">' +
        progressRingHtml(p) +
        '<div class="ringtxt"><div class="ringttl">Raids with the guild</div>' +
        '<div class="ringsub">' +
        (p.maxed
          ? "<b>100+</b> raid nights — legend of the sewers 🧀"
          : "<b>" + p.count + "</b> nights raided · <b>" + (p.next - p.count) + "</b> to " + p.next) +
        "</div></div></div>";
    }
    // guild superlatives this raider holds (from the shared Fun & Shame logic)
    if (badges.length) {
      html +=
        '<div class="honours">' +
        badges
          .map(function (a) {
            return (
              '<div class="hon">' +
              '<span class="hon-emoji">' + esc(a.emoji || "🏅") + "</span>" +
              '<span class="hon-body"><span class="hon-title">' + esc(a.title || "") +
              (a.scope ? ' <span class="hon-scope">' + esc(a.scope) + "</span>" : "") + "</span>" +
              (a.sub ? '<span class="hon-note">' + a.sub + "</span>" : "") +
              "</span></div>"
            );
          })
          .join("") +
        "</div>";
    }
    return html + "</div>";
  }

  // raid / size / difficulty toggles for the Performance header (shared by DPS/healer and tank views).
  function scopeToggles() {
    var raids = raidList();
    var raidToggle = "";
    if (raids.length > 1) {
      raidToggle =
        '<div class="segs raidtog">' +
        raids
          .map(function (r) {
            return (
              '<button type="button" class="seg' +
              (RAID === r.slug ? " active" : "") +
              '" onclick="setRaid(\'' +
              esc(r.slug) +
              "')\">" +
              esc(r.label) +
              "</button>"
            );
          })
          .join("") +
        "</div>";
    }
    var sizeToggle =
      '<div class="segs sizetog">' +
      '<button type="button" class="seg' +
      (SIZE === 25 ? " active" : "") +
      '" onclick="setSize(25)">25-man</button>' +
      '<button type="button" class="seg' +
      (SIZE === 10 ? " active" : "") +
      '" onclick="setSize(10)">10-man</button>' +
      "</div>";
    var diffToggle = "";
    if (RAID && L && L.SPLIT_DIFF_RAIDS[RAID]) {
      diffToggle =
        '<div class="segs difftog">' +
        '<button type="button" class="seg' +
        (DIFF === "nm" ? " active" : "") +
        '" onclick="setDiff(\'nm\')">Normal</button>' +
        '<button type="button" class="seg' +
        (DIFF === "hc" ? " active" : "") +
        '" onclick="setDiff(\'hc\')">Heroic</button>' +
        "</div>";
    }
    return raidToggle + sizeToggle + diffToggle;
  }
  function perfHeader() {
    // scope label ("ToC 25-man") is intentionally omitted here — the raid/size/diff toggles beside the
    // title already show it, so repeating it is redundant (and crowds the header at narrow widths).
    return (
      '<div class="psec">' +
      secIcon("performance") +
      "Performance" +
      scopeToggles() +
      "</div>"
    );
  }

  // Clean "no parses in this scope" state for the Performance column — a centered card, not empty tiles.
  // If this toon HAS logs in other raids, name them so the user knows where to look.
  function emptyPerfCard(name) {
    // which raids/sizes does this toon actually have parses in? (career standings across all scopes)
    var seen = {}, hints = [];
    if (L) {
      L.careerStandings(name).forEach(function (x) {
        var lbl = raidLabel(x.raid) + " " + x.size;
        if (!seen[lbl]) { seen[lbl] = 1; hints.push(lbl); }
      });
    }
    var hint = hints.length
      ? "This rat has logs in <b class=\"gold\">" + hints.slice(0, 4).map(esc).join("</b>, <b class=\"gold\">") + "</b> — switch the raid or size above."
      : "No logged parses yet on this character. Jump in a raid to fill this in! 🐀";
    return (
      '<div class="card emptyperf">' +
      '<div class="ep-ic">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>' +
      "</div>" +
      '<div class="ep-title">No parses in ' + esc(perfScopeLabel()) + "</div>" +
      '<div class="ep-sub">' + hint + "</div>" +
      "</div>"
    );
  }

  // ---- MIDDLE — Performance: the only numbers (tiles + per-boss card) ----
  // Tanks get a PRESENCE view (bosses tanked / fights held); everyone else gets the raw DPS/HPS view.
  function performanceHtml(name, col) {
    if (isTank(name)) return tankPerformanceHtml(name, col);

    var d = findRanked(dpsList(), name),
      h = findRanked(hpsList(), name),
      agg = personAgg(name);

    // NO data for this toon in the selected raid/size/diff → one clean empty-state card instead of three
    // sad "no parses" tiles + an empty per-boss list (which reads as broken). Common when viewing an alt
    // on a raid they don't run. Points the user to switch scope or check their main.
    if (!d && !h && !bestParseOf(name)) {
      return perfHeader() + emptyPerfCard(name);
    }

    // this rat's server percentile in scope — drives the parse-tier COLOR on the SERVER tile.
    var srvPct = agg && agg.serverPct != null ? agg.serverPct : null;

    var tiles = "";
    // Tiles show this rat's OWN raw numbers with an icon + class-washed look. Numbers colored by METRIC
    // TYPE (matching rankings): HPS = green (healing), DPS = gold/yellow (damage). See metricTint.
    tiles += rankTile(
      "Avg DPS",
      d ? metricTint(fmt(d.row.value), "dps") : "—",
      d ? "#" + d.rank + " · " + (d.row.fights || 0) + " fights" : "no DPS parses in scope",
      d ? d.rank : null,
      col, TILE_IC.sword
    );
    tiles += rankTile(
      "Avg HPS",
      h ? metricTint(fmt(h.row.value), "hps") : "—",
      h ? "#" + h.rank + " · " + (h.row.fights || 0) + " fights" : "off-spec / no heals",
      h ? h.rank : null,
      col, TILE_IC.cross
    );
    // Best parse — the rat's single highest DPS/HPS on any boss in scope, colored by its metric.
    var best = bestParseOf(name);
    tiles += rankTile(
      "Best parse",
      best ? metricTint(fmt(best.value), best.metric) : "—",
      best ? esc(best.metric.toUpperCase()) + " · " + esc(best.encounter) : "no kills in scope",
      null,
      col, TILE_IC.star
    );
    // Server percentile — how this rat parses vs the whole server (only when the snapshot carries it).
    if (srvPct != null) {
      tiles += rankTile(
        "Server parse",
        '<span style="color:' + parseColor(srvPct) + '">' + srvPct + "%</span>",
        "vs the whole server",
        null,
        col, TILE_IC.globe
      );
    }

    var html = perfHeader();
    html += '<div class="tiles">' + tiles + "</div>";

    html +=
      '<div class="card" style="margin-top:20px"><div class="cardhd"><span class="ht">' +
      secIcon("boss") +
      "Per-boss placements</span></div>" +
      '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span class="hsmall">Boss</span><span class="hsmall">Best</span></div>' +
      placementList(name) +
      "</div>";
    return html;
  }

  // ---- Performance (TANK) — presence, not parse. The API has no mitigation/threat metric, so we show
  //      what a tank actually did: bosses tanked, fights held, raid nights. Their off-spec DPS (the few
  //      fights they weren't tanking) is shown as a secondary tile so it's visible but never their rank.
  function tankPerformanceHtml(name, col) {
    var t = tankStats(name);
    var tiles = "";
    tiles += rankTile("Bosses tanked", t.bossesTanked.length || "—", t.bossesTanked.length ? "held the front" : "none in scope", null, col, TILE_IC.shield);
    tiles += rankTile("Fights held", t.tankFights || "—", t.tankFights ? "as main tank" : "no tank fights", null, col, TILE_IC.swords);
    tiles += rankTile("Raid nights", t.nights || "—", t.nights ? "anchoring the raid" : "not seen in scope", null, col, TILE_IC.calendar);
    // off-spec DPS: only when they actually stepped out of tank spec — labeled so it's clearly secondary.
    if (t.offSpecDps != null)
      tiles += rankTile("Off-spec DPS", metricTint(fmt(t.offSpecDps), "dps"), t.offSpecFights + (t.offSpecFights === 1 ? " fight" : " fights") + " on DPS", null, col, TILE_IC.sword);

    var html = perfHeader();
    html += '<div class="tiles">' + tiles + "</div>";

    // per-boss card: bosses TANKED (canonical order), each with a shield marker + their off-spec dps on
    // that boss if they also DPS'd it. No damage bar/rank — tanking isn't a damage race.
    var order = L ? L.sortBosses(t.bossesTanked, RAID) : t.bossesTanked;
    var rows = order
      .map(function (bn) {
        var off = t.offSpecByBoss[bn];
        return (
          '<li><span class="bn">' +
          esc(bn) +
          ' <span class="pspec">🛡 TANKED</span></span>' +
          '<span class="tankspacer"></span>' +
          '<span class="bv">' +
          (off ? '<span style="color:var(--text-dim-2);font-weight:700">' + fmt(off) + " dps</span>" : "—") +
          "</span></li>"
        );
      })
      .join("");
    var listHtml = rows
      ? '<ul class="plist plist-tank">' + rows + "</ul>"
      : '<p class="empty" style="padding:8px 2px">No boss tanked in this scope.</p>';

    html +=
      '<div class="card" style="margin-top:20px"><div class="cardhd"><span class="ht">' +
      secIcon("boss") +
      "Bosses tanked</span></div>" +
      '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span class="hsmall">Boss</span><span class="hsmall">Off-spec</span></div>' +
      listHtml +
      "</div>";
    return html;
  }

  // ---- rail helpers ----
  function railRow(icon, label, valHtml) {
    return (
      '<div class="railrow"><span class="rk">' +
      icon +
      '</span><span class="rl">' +
      esc(label) +
      "</span>" +
      valHtml +
      "</div>"
    );
  }
  // rank name: private roster rankName, else the public profiles snapshot rank
  function rankLabel(name) {
    var k = ck(name),
      p = PROFILES[k];
    if (p && p.rank) return p.rank;
    if (ROSTER && Array.isArray(ROSTER.roster)) {
      var m = ROSTER.roster.find(function (x) {
        return ck(x.name) === k;
      });
      if (m && m.rankName) return m.rankName;
    }
    return "";
  }
  function isFang(name) {
    var k = ck(name),
      p = PROFILES[k];
    if (p && p.fang) return true;
    if (ROSTER && Array.isArray(ROSTER.fangs)) return ROSTER.fangs.map(ck).indexOf(k) >= 0;
    return false;
  }
  // ladder placement: best of DPS / HPS standing from the snapshot
  function ladderFor(name) {
    var dl = dpsList(),
      hl = hpsList();
    var d = findRanked(dl, name),
      h = findRanked(hl, name);
    if (d) return { rank: d.rank, total: dl.length, metric: "DPS" };
    if (h) return { rank: h.rank, total: hl.length, metric: "HPS" };
    return null;
  }

  // ---------- Raid Vitality — "is my raid spot safe?" (SCOPE-INDEPENDENT) ----------
  // This is a GENERAL verdict for the raider, NOT tied to the raid/size toggles above. It answers "is my
  // place in the raid at risk — should I start improving?" by looking at ALL their content at once:
  //   • SKILL (70%) — fight-WEIGHTED average of their per-scope standing across every raid/size they play.
  //     Weighting by fights makes it a CONSISTENCY measure: strong in the content they actually raid beats
  //     one lucky #1 in off-content. Each scope's standing = server% 0.6 + guild-standing 0.4 (server is
  //     the objective signal). Tanks contribute via guild standing only (no parse metric exists).
  //   • PRESENCE (30%) — total fights across all content vs a healthy baseline (shows-up factor).
  // Memoized per (name|snapshot) — it doesn't change with the toggles, so it's computed once per rat.
  var _vitCache = {}, _vitKey = "";
  function vitalityFor(name) {
    if (!L) return noDataVitality("No log data yet.");
    var snapKey = DATA.generatedAt || "";
    if (_vitKey !== snapKey) { _vitCache = {}; _vitKey = snapKey; }
    var ck2 = ck(name);
    if (ck2 in _vitCache) return _vitCache[ck2];

    var allScopes = L.careerStandings(name); // every raid/size this rat played in (incl. tank entries)
    var isTankRaider = allScopes.some(function (x) { return x.role === "T"; });
    // For a TANK raider, judge them on TANKING (role "T") — their few off-spec DPS fights are not their
    // job and must not drag the verdict. For everyone else, use their DPS/HPS scopes.
    var scopes = isTankRaider ? allScopes.filter(function (x) { return x.role === "T"; }) : allScopes;
    var totalFights = scopes.reduce(function (s, x) { return s + x.fights; }, 0);
    if (!scopes.length || !totalFights) {
      return (_vitCache[ck2] = noDataVitality("No parses on record yet — raid a few nights and check back!"));
    }
    // LOW-SAMPLE GATE: a spot can't be "certified" off a handful of fights. Under ~12 boss-fights across
    // ALL content (≈ one full raid night) there just isn't enough to judge — show Unproven, not a verdict.
    // This stops a lone/off-content parse (e.g. 1 fight, alone on the board) from reading as "Secure".
    var MIN_CERTIFY = 12;
    if (totalFights < MIN_CERTIFY) {
      return (_vitCache[ck2] = noDataVitality(
        "Only " + totalFights + (totalFights === 1 ? " fight" : " fights") + " on record — raid a bit more to lock in a read."
      ));
    }

    // --- SKILL: fight-weighted mean of per-scope standing (consistency, not peak) ---
    var wSum = 0, skill = 0, bestSrv = null, bestGuild = null, bestScopeLabel = "";
    scopes.forEach(function (x) {
      // per-scope standing 0..1: server% (objective) 60% + guild standing 40%. Tank scopes have no parse
      // metric -> standing is guildPct (=1, holding the front is the job).
      var stand = x.serverPct != null ? x.serverPct * 0.6 + x.guildPct * 0.4 : x.guildPct;
      skill += stand * x.fights;
      wSum += x.fights;
      if (x.serverPct != null && (bestSrv == null || x.serverPct > bestSrv)) bestSrv = x.serverPct;
      if (bestGuild == null || x.guildPct > bestGuild) {
        bestGuild = x.guildPct;
        bestScopeLabel = raidLabel(x.raid) + " " + x.size + (x.tank ? " (tank)" : "");
      }
    });
    skill = wSum ? skill / wSum : 0; // 0..1

    // --- PRESENCE: total fights vs a "healthy" baseline (~24 boss-fights ≈ a couple full clears) ---
    var PRESENCE_FULL = 24;
    var presence = Math.min(1, totalFights / PRESENCE_FULL); // 0..1

    // blend 70/30, map to 5..100
    var score = skill * 0.7 + presence * 0.3;
    var hp = Math.max(5, Math.min(100, Math.round(score * 95 + 5)));

    // Band -> tone + status + blurb. This is career-wide, so the language is about SPOT SECURITY.
    var tone, status, blurb;
    if (hp >= 82) {
      tone = "fire"; status = "Thriving";
      blurb = "Your spot is rock-solid — a pillar of the raid. Keep it up. 🧀";
    } else if (hp >= 62) {
      tone = "ok"; status = "Secure";
      blurb = "You're pulling your weight across the content you raid. Comfortable spot.";
    } else if (hp >= 42) {
      tone = "warn"; status = "Watch";
      blurb = "Middle of the pack — a little more consistency locks your spot in.";
    } else {
      tone = "bad"; status = "At risk";
      blurb = "Your spot could be on the line — time to sharpen up and show up more. 🩹";
    }

    // factors = the honest inputs behind the verdict.
    var factors = [];
    factors.push({
      tone: skill >= 0.66 ? "good" : skill >= 0.4 ? "warn" : "bad",
      icon: isTankRaider ? "🛡️" : "⚔️",
      label: "Performance",
      detail: skill >= 0.66 ? "strong & consistent" : skill >= 0.4 ? "middle of the pack" : "room to grow",
    });
    if (bestSrv != null) {
      var sp = Math.round(bestSrv * 100);
      factors.push({
        tone: sp >= 75 ? "good" : sp >= 50 ? "warn" : "bad",
        icon: "🌐",
        label: "Best server parse",
        detail: sp + "% (" + esc(bestScopeLabel || "") + ")",
      });
    }
    factors.push({
      tone: presence >= 0.75 ? "good" : presence >= 0.4 ? "warn" : "bad",
      icon: "📅",
      label: "Presence",
      detail: totalFights + " fights across all content",
    });

    return (_vitCache[ck2] = { hp: hp, tone: tone, status: status, blurb: blurb, factors: factors });
  }
  // explicit "no data" vitality: NO bar, NO fake number — an honest empty state. hp:null tells the
  // renderer to draw the unknown card instead of a half-filled HP bar (which used to read as a real 53).
  function noDataVitality(blurb) {
    return { hp: null, tone: "unknown", status: "Unproven", blurb: blurb, factors: [] };
  }
  function vitalityHtml(name) {
    var v = vitalityFor(name);
    var chips = v.factors
      .map(function (s) {
        return (
          '<span class="vfac ' +
          s.tone +
          '"><span class="vf-i">' +
          s.icon +
          "</span>" +
          esc(s.label) +
          " <small>" +
          esc(s.detail) +
          "</small></span>"
        );
      })
      .join("");
    var header =
      '<div class="psec">' +
      secIcon("vitality") +
      "Raid vitality" +
      '<span class="vt-status ' +
      v.tone +
      '">' +
      vitalityEmoji(v.tone) +
      " " +
      esc(v.status) +
      "</span></div>";

    // hp === null → honest UNKNOWN state: no bar, no fake number (was the misleading flat "53 / 100 HP").
    if (v.hp == null) {
      return (
        header +
        '<div class="card vitality unknown">' +
        '<div class="hpbar unknown"><span class="hplabel">Not enough data yet</span></div>' +
        '<div class="vt-blurb">' +
        esc(v.blurb) +
        "</div></div>"
      );
    }

    return (
      header +
      '<div class="card vitality ' +
      v.tone +
      '">' +
      '<div class="hpbar"><div class="hpfill" style="width:' +
      v.hp +
      '%"></div>' +
      '<span class="hplabel">' +
      v.hp +
      " / 100 HP</span></div>" +
      '<div class="vt-blurb">' +
      esc(v.blurb) +
      "</div>" +
      (chips ? '<div class="vfacs">' + chips + "</div>" : "") +
      "</div>"
    );
  }
  function vitalityEmoji(tone) {
    return tone === "fire" ? "🔥" : tone === "bad" ? "🩸" : tone === "warn" ? "⚠️" : tone === "unknown" ? "❔" : "💚";
  }
  // tenure "1y 4m" from the roster join date (private/officer only)
  function tenureFor(name) {
    if (!(ROSTER && ROSTER.joined)) return "";
    var raw = ROSTER.joined[name];
    if (!raw) {
      // case-insensitive fallback
      var k = ck(name);
      Object.keys(ROSTER.joined).forEach(function (n) {
        if (ck(n) === k) raw = ROSTER.joined[n];
      });
    }
    if (!raw) return "";
    var m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(raw)) || null;
    var then = m ? new Date(+m[3], +m[2] - 1, +m[1]) : new Date(raw);
    if (isNaN(then)) return "";
    var months = Math.max(0, Math.round((Date.now() - then) / (30.44 * 864e5)));
    var y = Math.floor(months / 12),
      mo = months % 12;
    return (y ? y + "y " : "") + mo + "m";
  }
  // scope label for the Performance header — selected raid + size (+ HC when a split raid is on Heroic).
  function perfScopeLabel() {
    var slug = RAID || defaultRaid();
    var hc = slug && L && L.SPLIT_DIFF_RAIDS[slug] && DIFF === "hc" ? " HC" : "";
    return (slug ? raidLabel(slug) + " " : "") + SIZE + "-man" + hc;
  }
  // pick the initial raid: the raid of the most recent log in the snapshot, else the first listed.
  // pick the initial raid for a raider: the raid where THIS raider has the most fights (so a tank lands on
  // the raid they actually tank, not an empty tab). Falls back to the newest log's raid, then the first.
  function defaultRaid(name) {
    var raids = raidList();
    if (!raids.length) return "";
    if (name && L) {
      var byRaid = {};
      L.careerStandings(name).forEach(function (x) {
        byRaid[x.raid] = (byRaid[x.raid] || 0) + x.fights;
      });
      var bestRaid = "", bestF = 0;
      Object.keys(byRaid).forEach(function (rs) {
        if (byRaid[rs] > bestF && raids.some(function (r) { return r.slug === rs; })) { bestF = byRaid[rs]; bestRaid = rs; }
      });
      if (bestRaid) return bestRaid;
    }
    var newest = null;
    (DATA.logs || []).forEach(function (l) {
      if (!newest || new Date(l.date) > new Date(newest.date)) newest = l;
    });
    var own = newest && newest.raidSlug;
    if (own && raids.some(function (r) { return r.slug === own; })) return own;
    return raids[0].slug;
  }
  // next upcoming vacation (not currently active) for the away/next pill
  function nextVacFor(name) {
    var k = ck(name),
      today = U.todayStr(),
      best = null;
    (VACATIONS || []).forEach(function (v) {
      if (ck(v.name) !== k || !v.start || v.start <= today) return;
      if (!best || v.start < best.start) best = v;
    });
    return best;
  }

  function render() {
    var name = SELECTED;
    var prof = document.getElementById("profile");
    if (!name) {
      prof.style.display = "none";
      return;
    }
    prof.style.display = "";

    // pin the raid scope to a valid segment: unset on first render, or stale after a snapshot swap.
    var raids = raidList();
    if (
      raids.length &&
      !raids.some(function (r) {
        return r.slug === RAID;
      })
    )
      RAID = defaultRaid(name);
    if (!raids.length) RAID = "";

    var cls = memberClass(name),
      col = classColor(cls);
    // whole profile re-themes to the selected toon's class colour: --col drives themed accents and
    // --accent is overridden so every var(--accent) inside #profile follows the class too. The page
    // header (outside #profile) keeps the guild gold.
    prof.style.setProperty("--col", col);
    prof.style.setProperty("--accent", col);
    var d = findRanked(dpsList(), name),
      h = findRanked(hpsList(), name);
    var spec = (d && d.row.spec) || (h && h.row.spec) || (PROFILES[ck(name)] && PROFILES[ck(name)].spec) || "";
    var ri = rankIconFor(name);
    var vac = vacFor(name);

    // hero banner on top, then the 3-column body (right column = Raid Vitality panel)
    prof.innerHTML =
      heroHtml(name, cls, col, spec, ri, vac) +
      '<div class="pgrid" style="--col:' +
      col +
      '">' +
      '<div class="rail">' +
      identityHtml(name, col) +
      "</div>" +
      '<div class="main">' +
      performanceHtml(name, col) +
      "</div>" +
      '<div class="side">' +
      vitalityHtml(name) +
      honoursHtml(name) +
      "</div>" +
      "</div>";
  }

  // hero collapse toggle (exposed for the inline onclick)
  function toggleHero() {
    HERO_USER_SET = true; // from here on, respect the user's choice (no more auto-expand)
    HERO_COLLAPSED = !HERO_COLLAPSED;
    var hero = document.getElementById("hero");
    if (hero) hero.classList.toggle("collapsed", HERO_COLLAPSED);
  }
  // fires when the hero <img> settles on a source that loaded. The hero is open by default, so this
  // only has to re-open it if a late-loading source lands while the user hasn't touched the toggle.
  function heroArtLoaded(img) {
    if (HERO_USER_SET) return; // user already chose -> don't override
    HERO_COLLAPSED = false;
    var hero = img && img.closest(".hero");
    if (hero) hero.classList.remove("collapsed");
  }

  // 25/10 size toggle — re-render from already-loaded data (no re-fetch).
  function setSize(sz) {
    sz = +sz;
    if (sz === SIZE) return;
    SIZE = sz;
    render();
  }
  function setRaid(slug) {
    slug = String(slug || "");
    if (slug === RAID) return;
    RAID = slug;
    DIFF = "nm"; // fresh raid -> back to Normal (a non-split raid must not stay stuck on Heroic)
    render();
  }
  function setDiff(diff) {
    diff = diff === "hc" ? "hc" : "nm";
    if (diff === DIFF) return;
    DIFF = diff;
    render();
  }

  // First-run "who are you" screen — shown when no raider is targeted (no ?c= deep-link and no saved
  // main). The raider picked here is SAVED as this device's main and the page auto-opens on it every
  // future visit, so it's a search + Select, then a Yes/No confirm before we commit.
  var WC_PICK = ""; // the exact raider name currently chosen in the welcome search (empty = none)
  function showWelcome() {
    SELECTED = "";
    WC_PICK = "";
    headerSearch(false); // welcome has its own search; keep the header one hidden here
    var prof = document.getElementById("profile");
    if (!prof) return;
    try {
      history.replaceState(null, "", location.pathname);
    } catch (e) {}
    prof.innerHTML =
      '<div class="welcome">' +
      '<div class="wc-mark">🐀</div>' +
      "<h2>Who are you?</h2>" +
      '<p class="wc-sub">Search for <b>your own main</b> and press Select. This device will remember it and ' +
      "open your profile automatically from now on, so choose carefully — <b>you won't be able to change it after.</b></p>" +
      '<div class="wc-pick">' +
      '<div class="wc-field">' +
      '<input type="text" id="wcSearch" placeholder="Search your character…" autocomplete="off" ' +
      'spellcheck="false" oninput="wcFilter()" onfocus="wcFilter()" />' +
      '<div id="wcList" class="ac" style="display:none"></div>' +
      "</div>" +
      '<button type="button" id="wcSelect" disabled onclick="wcConfirm()">Select</button>' +
      "</div>" +
      '<p class="wc-hint">Just browsing? Use the <b>Jump to raider</b> search up top instead.</p>' +
      "</div>";
    prof.style.display = "";
    try {
      window.scrollTo(0, 0);
    } catch (e) {}
  }
  // welcome search: filter the mains, click sets WC_PICK + fills the field, enables Select.
  function wcFilter() {
    var inp = document.getElementById("wcSearch"),
      box = document.getElementById("wcList");
    if (!inp || !box) return;
    // typing anything other than the exact chosen name clears the pick (must re-select from the list)
    if (WC_PICK && ck(inp.value) !== ck(WC_PICK)) setWcPick("");
    var q = ck(inp.value);
    var list = MEMBERS.slice().sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    });
    if (q)
      list = list.filter(function (m) {
        return ck(m.name).indexOf(q) >= 0;
      });
    if (!list.length) {
      box.innerHTML = '<div class="none">No rat by that name.</div>';
      box.style.display = "block";
      return;
    }
    box.innerHTML = list
      .map(function (m) {
        return (
          '<div class="opt" onclick="wcPick(\'' +
          esc(m.name).replace(/'/g, "\\'") +
          "')\">" +
          cdot(m.class) +
          '<span style="color:' +
          classColor(m.class) +
          '">' +
          esc(m.name) +
          "</span></div>"
        );
      })
      .join("");
    box.style.display = "block";
  }
  function setWcPick(name) {
    WC_PICK = name || "";
    var btn = document.getElementById("wcSelect");
    if (btn) btn.disabled = !WC_PICK;
  }
  function wcPick(name) {
    var inp = document.getElementById("wcSearch"),
      box = document.getElementById("wcList");
    if (inp) inp.value = name;
    if (box) box.style.display = "none";
    setWcPick(name);
  }
  // Select pressed -> open the Yes/No confirm modal for the chosen main.
  function wcConfirm() {
    if (WC_PICK) openMyToonModal(WC_PICK);
  }
  // close the welcome dropdown on outside click
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".wc-field")) {
      var b = document.getElementById("wcList");
      if (b) b.style.display = "none";
    }
  });

  // ---- "set as my main" confirm modal (site-styled Yes / No) ----
  function openMyToonModal(name) {
    closeMyToonModal();
    var wrap = document.createElement("div");
    wrap.id = "myToonModal";
    wrap.onclick = function (e) {
      if (e.target === wrap) closeMyToonModal();
    };
    wrap.innerHTML =
      '<div class="mt-box">' +
      '<h3>Set <span class="mt-name">' + esc(name) + "</span> as your main?</h3>" +
      '<p>This device will always open on this raider from now on. ' +
      "<b>This can't be undone.</b> Only confirm if this is really your character.</p>" +
      '<div class="mt-btns">' +
      '<button type="button" class="dark" onclick="closeMyToonModal()">No</button>' +
      '<button type="button" onclick="confirmMyToon()">Yes, that\'s me</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(wrap);
  }
  function closeMyToonModal() {
    var m = document.getElementById("myToonModal");
    if (m) m.parentNode.removeChild(m);
  }
  function confirmMyToon() {
    var name = WC_PICK;
    closeMyToonModal();
    if (!name) return;
    setMyToon(name);
    enterAs(name);
  }

  // show/hide the header "jump to raider" search (hidden on the welcome, shown on a raider)
  function headerSearch(show) {
    var ps = document.getElementById("psearch");
    if (ps) ps.style.display = show ? "" : "none";
  }

  function enterAs(name) {
    headerSearch(true);
    SELECTED = name;
    // land each raider on THEIR main content (raid where they have the most fights), not the last-viewed
    // tab — so a tank opens on the raid they tank, a healer on where they heal most. DIFF back to Normal.
    RAID = defaultRaid(name);
    DIFF = "nm";
    // fresh hero decision per character: start collapsed, let real art auto-expand again.
    HERO_COLLAPSED = true;
    HERO_USER_SET = false;
    try {
      history.replaceState(null, "", "?c=" + encodeURIComponent(name));
    } catch (e) {}
    render();
  }

  // click an alt in The Pack -> switch the whole page to that toon (its own stats/identity/banner).
  function goToon(name) {
    if (!name || ck(name) === ck(SELECTED)) return;
    enterAs(name);
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      window.scrollTo(0, 0);
    }
  }

  // ---------- boot ----------
  // Read the SAME `rankings` snapshot the rankings page writes/reads, via RatsData + the shared cache key.
  // Cache-busted by the snapshot's own `t`: a cheap version probe skips the full download unless the
  // officer re-fetched. On success DATA becomes the raw snapshot and L (the shared plumbing) is rebound.
  function useSnapshot(data) {
    if (!data) return;
    DATA = data;
    if (L) L.setData(DATA);
    else if (window.RatsLogs) L = window.RatsLogs(DATA);
    _deriveCache = null;
    _deriveKey = "";
  }
  async function loadSnapshot() {
    if (!(window.RatsData && RatsData.loadRankings)) return; // offline / off-disk -> SAMPLE fallback
    var cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    } catch (e) {}
    // reuse cache unless Firebase has a newer snapshot
    if (cached && cached.data) {
      try {
        if (RatsData.loadRankingsVersion) {
          var ver = await RatsData.loadRankingsVersion();
          if (ver != null && ver === cached.t) {
            useSnapshot(cached.data);
            return;
          }
        } else {
          useSnapshot(cached.data);
          return;
        }
      } catch (e) {
        useSnapshot(cached.data);
        return;
      }
    }
    try {
      var snap = await RatsData.loadRankings();
      if (snap && snap.data) {
        useSnapshot(snap.data);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ t: snap.t, data: DATA }));
        } catch (e) {}
      }
    } catch (e) {}
  }

  async function boot() {
    // FREE FOR ALL — no gate. The page opens straight onto a raider. ?c=<name> deep-links;
    // otherwise land on your own toon (if logged in) or the first member.
    // parallel reads — members (picker/search), profiles (alts), vacations (away), snapshot. Officer also gets roster.
    var jobs = [
      RatsData.loadMembers().then(function (m) {
        MEMBERS = m || [];
      }),
      RatsData.loadProfiles().then(function (p) {
        PROFILES = p || {};
      }),
      RatsData.loadVacations()
        .then(function (v) {
          VACATIONS = v || [];
        })
        .catch(function () {
          VACATIONS = []; // non-critical here — don't fail the whole profile load on a blip
        }),
      loadSnapshot(),
    ];
    if (IS_OFFICER)
      jobs.push(
        RatsData.loadRoster({ interactive: false }).then(function (r) {
          ROSTER = r;
        })
      );
    await Promise.all(jobs);

    // if members is empty, seed the picker from the snapshot so the page still works on sample data
    if (!MEMBERS.length) {
      var seen = {},
        list = [];
      dpsList().concat(hpsList()).forEach(function (p) {
        var k = ck(p.name);
        if (!seen[k]) {
          seen[k] = 1;
          list.push({ name: p.name, class: p.class || "" });
        }
      });
      MEMBERS = list;
    }

    // land on a raider ONLY when we know who: ?c=<name> deep-link, or your own logged-in toon.
    // With neither, show the welcome screen. The header "jump to raider" search only appears once
    // you're on a raider (enterAs) — it stays hidden on the welcome, which has its own search.
    var q = new URLSearchParams(location.search).get("c");
    var landing = q || myToon() || "";
    if (landing) enterAs(landing);
    else showWelcome();
  }

  // expose the handlers the inline onclick/oninput attributes call
  window.toggleHero = toggleHero;
  window.heroArtLoaded = heroArtLoaded;
  window.setSize = setSize;
  window.setRaid = setRaid;
  window.setDiff = setDiff;
  window.goToon = goToon;
  window.psFilter = psFilter;
  window.psPick = psPick;
  window.wcFilter = wcFilter;
  window.wcPick = wcPick;
  window.wcConfirm = wcConfirm;
  window.openMyToonModal = openMyToonModal;
  window.closeMyToonModal = closeMyToonModal;
  window.confirmMyToon = confirmMyToon;

  boot();
})();
