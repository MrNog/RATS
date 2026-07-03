/* RATS — Raider Profile page.
   A *view* over data already loaded: the rankings snapshot (DPS/HPS/MVP/records/fun) + the public
   members directory (picker). No per-profile network calls. Officer view (guild key) or a profile-key
   unlock reveals the private cards (Barracks from roster, attendance link).

   Cost: rankings snapshot read once/visit (TTL 30 min, cached), members once/visit. Toggles re-render. */
(function () {
  "use strict";
  // DEV: when the page is opened straight off disk (file://), skip the gate and land on this raider.
  // Set to "" to disable. Only affects file:// — the hosted site (http/https) always shows the gate.
  var DEV_DEFAULT = "okanor";

  var U = window.RatsUtils;
  var esc = U.esc,
    fmtDate = U.fmtDate,
    classColor = U.classColor;
  var fmt = function (n) {
    return Number(n || 0).toLocaleString("en-US");
  };

  // ---------- rankings snapshot (same pattern + SAMPLE fallback as rankings.html) ----------
  // While the logs API isn't live, RANKINGS_URL is "" and we render the bundled SAMPLE. Once the
  // officer Fetch writes the snapshot and RANKINGS_URL points at it, the profile goes live for free.
  var RANKINGS_URL = ""; // e.g. ".../rats/rankings.json"
  var CACHE_KEY = "ratsRankCache",
    CACHE_TTL = 30 * 60 * 1000;

  var SAMPLE = {
    guild: "RATS",
    realm: "Onyxia",
    generatedAt: "2026-06-28T20:00:00Z",
    // raid segments present in this snapshot (drives the Performance raid selector).
    raids: [
      { slug: "icc", label: "ICC" },
      { slug: "ulduar", label: "Ulduar" },
      { slug: "toc", label: "ToC" },
    ],
    raid: "icc", // the snapshot's "current" raid (initial selection)
    mvp: {
      name: "Okanor",
      class: "Paladin",
      spec: "Retribution",
      encounter: "Lord Marrowgar",
      metric: "dps",
      value: 6012,
      date: "2026-06-25",
    },
    dps: [
      // --- ICC ---
      {
        raid: "icc",
        name: "Kobee",
        class: "Rogue",
        spec: "Assassination",
        value: 6450,
        fights: 12,
        delta: 2,
        streak: 3,
      },
      { raid: "icc", name: "Magoluso", class: "Mage", spec: "Fire", value: 6210, fights: 13, delta: 1 },
      { raid: "icc", name: "Okanor", class: "Paladin", spec: "Retribution", value: 6012, fights: 14, delta: -2 },
      { raid: "icc", name: "Franzherman", class: "Warlock", spec: "Affliction", value: 5740, fights: 14, delta: 0 },
      { raid: "icc", name: "Ardil", class: "Druid", spec: "Feral", value: 5400, fights: 11, delta: 3 },
      { raid: "icc", name: "Kinven", class: "Hunter", spec: "Marksmanship", value: 5120, fights: 13, delta: -1 },
      { raid: "icc", name: "Shmurda", class: "Warrior", spec: "Fury", value: 4600, fights: 12, delta: 0 },
      // --- Ulduar ---
      { raid: "ulduar", name: "Magoluso", class: "Mage", spec: "Fire", value: 5480, fights: 8, delta: 1 },
      { raid: "ulduar", name: "Okanor", class: "Paladin", spec: "Retribution", value: 5320, fights: 8, delta: 0 },
      { raid: "ulduar", name: "Kobee", class: "Rogue", spec: "Assassination", value: 5210, fights: 7, delta: -1 },
      { raid: "ulduar", name: "Kinven", class: "Hunter", spec: "Marksmanship", value: 4780, fights: 8, delta: 2 },
      // --- ToC ---
      { raid: "toc", name: "Kobee", class: "Rogue", spec: "Assassination", value: 5010, fights: 5, delta: 0 },
      { raid: "toc", name: "Okanor", class: "Paladin", spec: "Retribution", value: 4870, fights: 5, delta: 1 },
      { raid: "toc", name: "Franzherman", class: "Warlock", spec: "Affliction", value: 4640, fights: 5, delta: -1 },
    ],
    hps: [
      // --- ICC ---
      {
        raid: "icc",
        name: "Khaddash",
        class: "Priest",
        spec: "Discipline",
        value: 5100,
        fights: 14,
        delta: 0,
        streak: 5,
      },
      { raid: "icc", name: "Tchilly", class: "Priest", spec: "Holy", value: 4720, fights: 12, delta: 1 },
      { raid: "icc", name: "Aquafresh", class: "Shaman", spec: "Restoration", value: 4480, fights: 10, delta: -1 },
      // --- Ulduar ---
      { raid: "ulduar", name: "Khaddash", class: "Priest", spec: "Discipline", value: 4600, fights: 8, delta: 0 },
      { raid: "ulduar", name: "Aquafresh", class: "Shaman", spec: "Restoration", value: 4210, fights: 7, delta: 1 },
      // --- ToC ---
      { raid: "toc", name: "Tchilly", class: "Priest", spec: "Holy", value: 4300, fights: 5, delta: 0 },
    ],
    deaths: [
      { raid: "icc", name: "Khaddash", class: "Priest", deaths: 14, fights: 14, tagline: "the floor tank" },
      { raid: "icc", name: "Kinven", class: "Hunter", deaths: 9, fights: 13, tagline: "lava enthusiast" },
      { raid: "ulduar", name: "Shmurda", class: "Warrior", deaths: 6, fights: 8, tagline: "hugged Kologarn" },
      { raid: "toc", name: "Kinven", class: "Hunter", deaths: 4, fights: 5, tagline: "worm snack" },
    ],
    improved: [
      { name: "Ardil", class: "Druid", spec: "Feral", metric: "dps", from: 3800, to: 4500, deltaPct: 18 },
      { name: "Tchilly", class: "Priest", spec: "Holy", metric: "hps", from: 3700, to: 4520, deltaPct: 22 },
    ],
    records: [
      {
        name: "Okanor",
        class: "Paladin",
        spec: "Retribution",
        encounter: "Lord Marrowgar",
        metric: "dps",
        value: 6012,
        prev: 5740,
      },
      {
        name: "Khaddash",
        class: "Priest",
        spec: "Discipline",
        encounter: "Festergut",
        metric: "hps",
        value: 5100,
        prev: 4800,
      },
    ],
    funStats: {
      biggestHit: { name: "Kobee", class: "Rogue", value: 18234, ability: "Mutilate", encounter: "Saurfang" },
      mostDamageTaken: { name: "Grunho", class: "Warrior", value: 1840000 },
      mostInterrupts: { name: "Kobee", class: "Rogue", value: 23 },
    },
    perBoss: [
      // --- ICC ---
      {
        raid: "icc",
        encounter: "Lord Marrowgar",
        metric: "dps",
        top: [
          { name: "Okanor", class: "Paladin", value: 6012, percentile: 96 },
          { name: "Magoluso", class: "Mage", value: 5800, percentile: 88 },
          { name: "Kobee", class: "Rogue", value: 5600, percentile: 72 },
        ],
      },
      {
        raid: "icc",
        encounter: "Festergut",
        metric: "dps",
        top: [
          { name: "Kobee", class: "Rogue", value: 6210, percentile: 99 },
          { name: "Okanor", class: "Paladin", value: 5990, percentile: 81 },
          { name: "Ardil", class: "Druid", value: 5400, percentile: 44 },
        ],
      },
      {
        raid: "icc",
        encounter: "Valithria Dreamwalker",
        metric: "hps",
        top: [
          { name: "Khaddash", class: "Priest", value: 8100, percentile: 100 },
          { name: "Tchilly", class: "Priest", value: 7400, percentile: 63 },
        ],
      },
      // --- Ulduar ---
      {
        raid: "ulduar",
        encounter: "Ignis the Furnace Master",
        metric: "dps",
        top: [
          { name: "Magoluso", class: "Mage", value: 5480, percentile: 90 },
          { name: "Okanor", class: "Paladin", value: 5320, percentile: 77 },
        ],
      },
      {
        raid: "ulduar",
        encounter: "Kologarn",
        metric: "dps",
        top: [
          { name: "Kobee", class: "Rogue", value: 5210, percentile: 68 },
          { name: "Kinven", class: "Hunter", value: 4780, percentile: 51 },
        ],
      },
      // --- ToC ---
      {
        raid: "toc",
        encounter: "Lord Jaraxxus",
        metric: "dps",
        top: [
          { name: "Kobee", class: "Rogue", value: 5010, percentile: 74 },
          { name: "Okanor", class: "Paladin", value: 4870, percentile: 60 },
        ],
      },
    ],
  };

  var DATA = SAMPLE; // rankings snapshot
  var MEMBERS = []; // public picker {name,class}
  var PROFILES = {}; // public alt/rank snapshot (Path B) — may be empty
  var VACATIONS = []; // who's away
  var ROSTER = null; // decrypted roster (officer/unlock only)

  // ---------- identity / unlock state ----------
  var IS_OFFICER = window.RatsData ? RatsData.isOfficer() : !!localStorage.getItem("ratsGuildKey");
  if (window.RatsData && RatsData.mountDevRole) RatsData.mountDevRole();
  function unlockedKey() {
    try {
      return localStorage.getItem("ratsProfileUnlock") || "";
    } catch (e) {
      return "";
    }
  }
  function myToon() {
    try {
      return localStorage.getItem("ratsMyToon") || "";
    } catch (e) {
      return "";
    }
  }
  var ck = RatsData.profKey;
  // is the private layer visible for THIS character? officer sees everyone; a raider sees their unlocked main.
  function canSeePrivate(name) {
    return IS_OFFICER || (!!unlockedKey() && unlockedKey() === ck(name));
  }

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
  function findRanked(list, name) {
    list = list || [];
    var k = ck(name);
    for (var i = 0; i < list.length; i++) if (ck(list[i].name) === k) return { row: list[i], rank: i + 1 };
    return null;
  }

  // ---------- performance scope (raid + size) ----------
  var SIZE = 25; // current Performance size toggle (25 / 10)
  var RAID = ""; // current raid segment (slug e.g. "icc"); "" = All / not scoped

  // The raids available in this snapshot: DATA.raids[] if the API supplies it, else derived from any
  // .raid tags on the rows. Each is { slug, label }. Empty = no raid scoping (single-raid snapshot).
  function raidList() {
    if (Array.isArray(DATA.raids) && DATA.raids.length) {
      return DATA.raids.map(function (r) {
        return typeof r === "string"
          ? { slug: r, label: raidLabel(r) }
          : { slug: r.slug || r.raid, label: r.label || raidLabel(r.slug || r.raid) };
      });
    }
    var seen = {},
      out = [];
    (DATA.dps || []).concat(DATA.hps || [], DATA.deaths || [], DATA.perBoss || []).forEach(function (r) {
      var s = r && r.raid;
      if (s && !seen[s]) {
        seen[s] = 1;
        out.push({ slug: s, label: raidLabel(s) });
      }
    });
    return out;
  }
  function raidLabel(slug) {
    var m = {
      icc: "ICC",
      ulduar: "Ulduar",
      uld: "Ulduar",
      togc: "ToGC",
      toc: "ToC",
      trial: "ToC",
      ony: "Onyxia",
      naxx: "Naxx",
      rs: "RS",
      voa: "VoA",
      eoe: "EoE",
    };
    return m[String(slug || "").toLowerCase()] || String(slug || "").toUpperCase();
  }

  // Filter a list to the selected raid (when the rows are raid-tagged and a raid is selected).
  function byRaid(list) {
    if (!RAID) return list;
    var tagged = (list || []).some(function (r) {
      return r && r.raid != null;
    });
    return tagged
      ? list.filter(function (r) {
          return r.raid === RAID;
        })
      : list;
  }
  // Filter a list by the selected size. Entries may be tagged .size (per-row) OR the API may split by
  // DATA.dps25 / DATA.dps10 etc. If nothing is size-tagged, return the list unchanged (sample fallback).
  // Raid scoping (byRaid) is applied first so the two toggles compose.
  function bySize(list, key) {
    if (DATA[key + SIZE]) return byRaid(DATA[key + SIZE] || []); // e.g. DATA.dps25
    list = byRaid(list || []);
    var tagged = list.some(function (r) {
      return r && r.size != null;
    });
    return tagged
      ? list.filter(function (r) {
          return +r.size === SIZE;
        })
      : list;
  }
  function dpsList() {
    return bySize(DATA.dps, "dps");
  }
  function hpsList() {
    return bySize(DATA.hps, "hps");
  }
  function deathsList() {
    return bySize(DATA.deaths, "deaths");
  }
  function perBossList() {
    var list = DATA["perBoss" + SIZE] ? DATA["perBoss" + SIZE] : DATA.perBoss || [];
    list = byRaid(list);
    var tagged = list.some(function (b) {
      return b && b.size != null;
    });
    return tagged
      ? list.filter(function (b) {
          return +b.size === SIZE;
        })
      : list;
  }
  function rankClass(r) {
    return r === 1 ? "g" : r === 2 ? "s" : r === 3 ? "b" : "";
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
    // fall back to any class seen in the snapshot
    var all = (DATA.dps || []).concat(DATA.hps || [], DATA.deaths || []);
    var hit = all.find(function (x) {
      return ck(x.name) === k;
    });
    return (hit && hit.class) || "";
  }
  // typeahead lives inside the login dialog (#uName / #uList)
  function acFilter() {
    var q = (document.getElementById("uName").value || "").trim().toLowerCase();
    var box = document.getElementById("uList");
    var list = MEMBERS.slice().sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    });
    if (q)
      list = list.filter(function (m) {
        return (m.name || "").toLowerCase().indexOf(q) >= 0;
      });
    list = list.slice(0, 40);
    if (!list.length) {
      box.innerHTML = '<div class="none">No rat by that name.</div>';
      box.style.display = "block";
      return;
    }
    box.innerHTML = list
      .map(function (m) {
        return (
          '<div class="opt" onclick="pickName(\'' +
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
  // ---------- officer-only header search: jump straight to any raider's profile ----------
  // Reuses the login typeahead pattern but switches the page (goToon) instead of filling the login field.
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
    list = list.slice(0, 40);
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

  // pick a raider in the dialog -> fill the field, move to the key
  function pickName(name) {
    document.getElementById("uName").value = name;
    document.getElementById("uList").style.display = "none";
    var key = document.getElementById("uKey");
    if (key) key.focus();
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#uName") && !e.target.closest("#uList")) {
      var b = document.getElementById("uList");
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
    // private: build from the decrypted roster
    if (canSeePrivate(name) && ROSTER && Array.isArray(ROSTER.roster)) {
      var R = ROSTER.roster;
      var me = R.find(function (m) {
        return ck(m.name) === k;
      });
      if (me) {
        var isAlt = function (m) {
          return m.rankIndex === 4 || /alt/i.test(m.rankName || "") || !!altMainNote(m);
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

  function placementList(name) {
    // every per-boss top where this player appears, with a bar colored by PARSE percentile.
    var k = ck(name),
      rows = [];
    perBossList().forEach(function (b) {
      var top = b.top || [],
        best = (top[0] && top[0].value) || 1;
      for (var i = 0; i < top.length; i++) {
        if (ck(top[i].name) === k) {
          // width still shows value vs boss-best; COLOR is the parse percentile (from the API).
          var e = top[i];
          var pct = Math.round((e.value / best) * 100);
          var par = e.percentile != null ? e.percentile : pct; // fall back to width if no parse yet
          rows.push(
            '<li><span class="rk ' +
              rankClass(i + 1) +
              '">#' +
              (i + 1) +
              "</span>" +
              '<span class="bn">' +
              esc(b.encounter) +
              ' <span class="pspec" style="color:var(--text-dim-2);font-size:11px">' +
              (b.metric === "hps" ? "HPS" : "DPS") +
              "</span></span>" +
              '<span class="pbar"><i style="width:' +
              pct +
              "%;background:" +
              parseColor(par) +
              '" title="' +
              Math.round(par) +
              ' parse"></i></span>' +
              '<span class="bv">' +
              fmt(e.value) +
              "</span></li>"
          );
          break;
        }
      }
    });
    return rows.length
      ? '<ul class="plist">' + rows.join("") + "</ul>"
      : '<p class="empty" style="padding:8px 2px">No per-boss placements in the latest logs.</p>';
  }

  // medal-aware stat tile: pass a rank (1/2/3) to colour the chip + accent strip
  function rankTile(lbl, val, sub, rank, col) {
    var chip = rank != null ? ' <span class="rkchip ' + rankClass(rank) + '">#' + rank + "</span>" : "";
    return (
      '<div class="tile-s' +
      (rank != null ? " accent" : "") +
      '" style="--tile-col:' +
      (col || "var(--accent)") +
      '"><div class="lbl">' +
      esc(lbl) +
      '</div><div class="v">' +
      val +
      chip +
      "</div>" +
      (sub ? '<div class="d">' + sub + "</div>" : "") +
      "</div>"
    );
  }

  // ---- HERO — full-art collapsible banner (mockup Opt 5). Art = images/profile-bg/<main>/<name>.png;
  //      falls back to a designed class-gradient banner + glyph when no art file exists.
  // Hero starts COLLAPSED and only auto-expands when a character actually has custom profile-bg art
  // (not the generic class banner / no-art fallback). Once the user toggles it by hand, we stop
  // auto-managing and respect their choice for the session.
  var HERO_COLLAPSED = true;
  var HERO_USER_SET = false; // true after a manual toggle -> auto-expand no longer overrides
  function heroHtml(name, cls, col, spec, ri, vac) {
    var youTag =
      ck(name) === ck(myToon())
        ? '<span class="youbadge">⭐ THIS IS YOU</span>'
        : unlockedKey() && unlockedKey() === ck(name)
          ? '<span class="youbadge">🔓 YOUR PAGE</span>'
          : "";

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
    // class banner (and stays collapsed). The main's art is only ever shown for the main itself.
    var bg = "../../images/profile-bg/";
    var lc = function (s) {
      return U.enc(String(s).toLowerCase());
    };
    var main = mainToonOf(name) || name; // this toon's main (itself if it has none)
    var folder = lc(main) + "/";
    var artSrc = bg + folder + lc(name) + ".png";
    // generic per-class fallback banner (kept in images/profile-bg/_class/<slug>.png); "" if class unknown.
    var clsSlug = CLASS_ICON[cls] || "";
    var classSrc = clsSlug ? bg + "_class/" + clsSlug + ".png" : "";
    // build the chain of sources to try after the first, in order, then land on CSS .noart.
    var chain = [];
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
  function identityHtml(name, col) {
    var rows = [];
    var ri = rankIconFor(name);
    var rankName = rankLabel(name);
    if (rankName)
      rows.push(railRow(ri ? ri.em : "🐀", "Guild rank", '<span class="rv col">' + esc(rankName) + "</span>"));
    if (isFang(name)) rows.push(railRow("💀", "Squad", '<span class="rv">Fang</span>'));

    var lad = ladderFor(name);
    if (lad)
      rows.push(
        railRow("📊", "Ladder", '<span class="rv">#' + lad.rank + " of " + lad.total + " " + lad.metric + "</span>")
      );

    var ten = tenureFor(name);
    if (ten) rows.push(railRow("🧀", "Tenure", '<span class="rv">' + esc(ten) + "</span>"));

    var html = '<div class="psec">' + secIcon("identity") + "Identity</div>";
    html += rows.length
      ? '<div class="card">' + rows.join("") + "</div>"
      : '<div class="card"><span class="empty" style="padding:4px 2px">No profile details yet. 🐀</span></div>';

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
    } else if (canSeePrivate(name)) {
      html +=
        '<div class="card"><span class="empty" style="padding:4px 2px">No alts on record — a lone rat. 🐀</span></div>';
    } else {
      html +=
        '<div class="card locked-card"><span class="lockmsg">🔒 The rat pack (alts) shows for officers, or unlock your own page with a profile key.</span></div>';
    }

    // Armory link
    html +=
      '<a class="btn" style="width:100%;margin-top:14px" target="_blank" rel="noopener" href="https://armory.warmane.com/character/' +
      U.enc(name) +
      '/Onyxia/summary">🔗 Armory ↗</a>';
    return html;
  }

  // ---- MIDDLE — Performance: the only numbers (tiles + per-boss card) ----
  function performanceHtml(name, col) {
    var d = findRanked(dpsList(), name),
      h = findRanked(hpsList(), name),
      dth = findRanked(deathsList(), name);

    var tiles = "";
    tiles += rankTile(
      "Top DPS",
      d ? fmt(d.row.value) : "—",
      d ? "#" + d.rank + " · " + (d.row.fights || 0) + " fights" : "not in latest logs",
      d ? d.rank : null,
      col
    );
    tiles += rankTile(
      "Top HPS",
      h ? fmt(h.row.value) : "—",
      h ? "#" + h.rank + " · " + (h.row.fights || 0) + " fights" : "off-spec",
      h ? h.rank : null,
      col
    );
    if (DATA.mvp && ck(DATA.mvp.name) === ck(name))
      tiles += rankTile(
        "Parse of the week",
        fmt(DATA.mvp.value),
        esc((DATA.mvp.metric || "dps").toUpperCase()) + " · " + esc(DATA.mvp.encounter || ""),
        null,
        col
      );
    tiles += rankTile(
      "Deaths",
      dth ? dth.row.deaths || 0 : "—",
      dth && dth.row.tagline ? '"' + esc(dth.row.tagline) + '"' : "this tier",
      null,
      col
    );

    // raid + 25/10 toggles — shared segmented control (.segs/.seg, same as rankings); both re-render
    // from already-loaded data (no re-fetch). The raid segs are built from raidList() (data-driven);
    // when the snapshot has no raid tags the row is omitted (single-raid snapshot).
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

    var html =
      '<div class="psec">' +
      secIcon("performance") +
      'Performance <span class="cnt">— ' +
      esc(perfScopeLabel()) +
      "</span>" +
      raidToggle +
      sizeToggle +
      "</div>";
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

  // ---------- Raid Vitality (a "raid HP" bar) ----------
  // ONE blended 0-100 vitality score = how healthy this raider is to the raid. It mixes performance
  // (ladder standing + trend) with reliability (attendance) WITHOUT ever printing the raw attendance
  // number — attendance only nudges the bar and shows as a soft "reliability" factor. Think of it as
  // the raider's HP: full & green = a pillar of the raid; low & red = at risk / falling off.
  //
  // seeded 0..1 pseudo-random from a string, so mock numbers are stable per raider (not flickering).
  function seed01(s, salt) {
    var h = 2166136261 >>> 0;
    s = String(s || "") + "|" + (salt || "");
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return (h >>> 8) / 0xffffff;
  }
  // MOCK attendance as a 0..1 ratio (never shown as a number). Replace with a `history` scan later.
  function attendance01(name) {
    return 0.6 + seed01(name, "att") * 0.4; // 0.6 .. 1.0
  }

  // Compute the vitality object for a raider in the current raid/size scope.
  function vitalityFor(name) {
    var lad = ladderFor(name);
    var drow = (findRanked(dpsList(), name) || {}).row || (findRanked(hpsList(), name) || {}).row || null;
    var att = attendance01(name); // 0..1 reliability (hidden as a raw number)
    var deaths = (findRanked(deathsList(), name) || {}).row || null;

    // --- performance component (0..1): ladder standing (top of the bracket = 1) ---
    var perf = lad ? 1 - (lad.rank - 1) / Math.max(1, lad.total - 1) : 0.5;
    // --- trend nudge from weekly delta (spots moved) ---
    var trend = drow && drow.delta != null ? Math.max(-1, Math.min(1, +drow.delta / 4)) : 0;
    // --- survivability penalty (dying every pull drains HP) ---
    var survPen = 0;
    if (deaths && deaths.fights) {
      var per = deaths.deaths / deaths.fights;
      if (per >= 0.6) survPen = 0.12;
    }

    // Blend: performance 55% · reliability 30% · trend ±10% · survivability penalty. Clamp 5..100.
    var hp = Math.round((perf * 0.55 + att * 0.3 + 0.15) * 100 + trend * 10 - survPen * 100);
    hp = Math.max(5, Math.min(100, hp));

    // Band -> tone + status label (rat/cheese flavored). tone drives the bar colour.
    var tone, status, blurb;
    if (hp >= 85) {
      tone = "fire";
      status = "Thriving";
      blurb = "A pillar of the raid — full cheese reserves. 🧀";
    } else if (hp >= 68) {
      tone = "ok";
      status = "Healthy";
      blurb = "Pulling weight and showing up. Solid rat.";
    } else if (hp >= 45) {
      tone = "warn";
      status = "Bruised";
      blurb = "Holding on — a little care and this rat bounces back.";
    } else {
      tone = "bad";
      status = "Critical";
      blurb = "Falling off the raid — needs attention. 🩹";
    }
    if (!lad) {
      tone = "warn";
      status = "Unproven";
      blurb = "No parses in " + perfScopeLabel() + " yet — jump in a raid!";
    }

    // Soft contributing factors — vibes, not numbers. Reliability never prints the % or count.
    var factors = [];
    factors.push({
      tone: perf >= 0.66 ? "good" : perf >= 0.34 ? "warn" : "bad",
      icon: "⚔️",
      label: "Performance",
      detail: perf >= 0.66 ? "top of the pack" : perf >= 0.34 ? "middle of the pack" : "trailing the pack",
    });
    if (drow && drow.delta != null) {
      var dv = +drow.delta;
      factors.push({
        tone: dv >= 2 ? "good" : dv <= -2 ? "bad" : "warn",
        icon: dv >= 2 ? "📈" : dv <= -2 ? "📉" : "➖",
        label: "Momentum",
        detail: dv >= 2 ? "climbing" : dv <= -2 ? "sliding" : "steady",
      });
    }
    factors.push({
      tone: att >= 0.9 ? "good" : att >= 0.75 ? "warn" : "bad",
      icon: "🛡️",
      label: "Reliability",
      detail: att >= 0.9 ? "rock-solid presence" : att >= 0.75 ? "usually around" : "often missing",
    });
    if (drow && drow.streak) factors.push({ tone: "good", icon: "🔥", label: "Streak", detail: "on a hot streak" });
    if (survPen) factors.push({ tone: "bad", icon: "💀", label: "Survivability", detail: "dying too often" });

    return { hp: hp, tone: tone, status: status, blurb: blurb, factors: factors };
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
    return (
      // section header (matches IDENTITY / PERFORMANCE so all 3 columns start on the same grid row)
      '<div class="psec">' +
      secIcon("vitality") +
      "Raid vitality" +
      '<span class="vt-status ' +
      v.tone +
      '">' +
      vitalityEmoji(v.tone) +
      " " +
      esc(v.status) +
      "</span></div>" +
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
    return tone === "fire" ? "🔥" : tone === "bad" ? "🩸" : tone === "warn" ? "⚠️" : "💚";
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
  // scope label for the Performance header — selected raid (or the snapshot's single raid) + size.
  function perfScopeLabel() {
    var slug = RAID || DATA.raid || (DATA.report && DATA.report.raid) || "";
    return (slug ? raidLabel(slug) + " " : "") + SIZE + "-man";
  }
  // pick the initial raid: the snapshot's own raid, else the first available. Called before first render.
  function defaultRaid() {
    var raids = raidList();
    if (!raids.length) return "";
    var own = DATA.raid || (DATA.report && DATA.report.raid);
    if (
      own &&
      raids.some(function (r) {
        return r.slug === own;
      })
    )
      return own;
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
      RAID = defaultRaid();
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
  // fires when the hero <img> settles on a source that loaded. Auto-expand ONLY for real custom art
  // (a per-character profile-bg image) — not the generic "_class/" banner or the no-art fallback.
  function heroArtLoaded(img) {
    if (HERO_USER_SET) return; // user already chose -> don't override
    var isRealArt = img && img.src && img.src.indexOf("/_class/") < 0;
    if (!isRealArt) return; // generic class banner: leave the hero collapsed
    HERO_COLLAPSED = false;
    var hero = img.closest(".hero");
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
    render();
  }

  // ---------- login gate (key required to enter) ----------
  // DEV BYPASS — type this as the key with any raider name to get in while no real keys are issued.
  // Remove (set to "") once the officer has generated keys for everyone.
  var DEV_BYPASS = "ratdev";

  // is the page open? officer (guild key) is always in; otherwise you must have logged in this browser.
  function isLoggedIn() {
    return IS_OFFICER || !!unlockedKey();
  }

  function showGate() {
    document.getElementById("loginOv").style.display = "flex";
    document.getElementById("uMsg").textContent = "";
    setTimeout(function () {
      var n = document.getElementById("uName");
      if (n) n.focus();
    }, 40);
  }
  function hideGate() {
    document.getElementById("loginOv").style.display = "none";
  }

  async function doLogin() {
    var name = (document.getElementById("uName").value || "").trim();
    var key = (document.getElementById("uKey").value || "").trim();
    var msg = document.getElementById("uMsg");
    if (!name || !key) {
      msg.style.color = "var(--text-dim)";
      msg.textContent = "Pick your raider and enter the key.";
      return;
    }
    msg.style.color = "var(--text-dim)";
    msg.textContent = "Checking…";

    // dev bypass: any raider name + the dev password gets you straight in
    if (DEV_BYPASS && key === DEV_BYPASS) {
      localStorage.setItem("ratsProfileUnlock", ck(name));
      localStorage.setItem("ratsMyToon", name);
      enterAs(name);
      return;
    }
    try {
      var ckOk = await RatsData.verifyProfileKey(name, key);
      if (!ckOk) {
        msg.style.color = "#ff6b6b";
        msg.textContent = "Wrong raider or key — ask an officer.";
        return;
      }
      localStorage.setItem("ratsProfileUnlock", ckOk);
      localStorage.setItem("ratsMyToon", name);
      enterAs(name);
    } catch (e) {
      msg.style.color = "#ff6b6b";
      msg.textContent = "Couldn't verify — try again.";
    }
  }

  // ---------- request a key (poll+announce: write a flag, officer page pings #okanor-logs) ----------
  var REQ_COOLDOWN = 24 * 60 * 60 * 1000; // 24h between requests, per browser
  function reqLockKey(name) {
    return "ratsKeyReqAt_" + ck(name);
  }
  function lastReqAt(name) {
    try {
      return +localStorage.getItem(reqLockKey(name)) || 0;
    } catch (e) {
      return 0;
    }
  }
  async function requestKey() {
    var name = (document.getElementById("uName").value || "").trim();
    var msg = document.getElementById("reqMsg"),
      link = document.getElementById("reqLink");
    if (!name) {
      msg.style.color = "var(--text-dim)";
      msg.textContent = "Pick your raider first.";
      return;
    }
    var since = Date.now() - lastReqAt(name);
    if (since < REQ_COOLDOWN) {
      var hrs = Math.ceil((REQ_COOLDOWN - since) / 3600000);
      msg.style.color = "var(--text-dim)";
      msg.textContent = "Already requested — try again in " + hrs + "h.";
      return;
    }
    msg.style.color = "var(--text-dim)";
    msg.textContent = "Sending…";
    try {
      await RatsData.requestProfileKey(name, memberClass(name));
      try {
        localStorage.setItem(reqLockKey(name), String(Date.now()));
      } catch (e) {}
      msg.style.color = "var(--ok)";
      msg.textContent = "✅ Request sent — an officer will DM your key soon.";
      if (link) {
        link.style.pointerEvents = "none";
        link.style.opacity = ".5";
      }
    } catch (e) {
      msg.style.color = "#ff6b6b";
      msg.textContent = "Couldn't send — try again later.";
    }
  }

  // open the page on the given raider
  function enterAs(name) {
    SELECTED = name;
    // fresh hero decision per character: start collapsed, let real art auto-expand again.
    HERO_COLLAPSED = true;
    HERO_USER_SET = false;
    hideGate();
    try {
      history.replaceState(null, "", "?c=" + encodeURIComponent(name));
    } catch (e) {}
    refreshLockUI();
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

  function doLock() {
    try {
      localStorage.removeItem("ratsProfileUnlock");
    } catch (e) {}
    SELECTED = "";
    document.getElementById("profile").style.display = "none";
    refreshLockUI();
    if (!IS_OFFICER) {
      document.getElementById("uName").value = "";
      document.getElementById("uKey").value = "";
      showGate();
    }
  }
  function refreshLockUI() {
    // a raider who logged in with a key can log out; officers stay in via the guild key (no logout here)
    document.getElementById("lockBtn").style.display = unlockedKey() && !IS_OFFICER ? "" : "none";
  }

  // ---------- boot ----------
  async function loadSnapshot() {
    if (!RANKINGS_URL) return; // SAMPLE fallback
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (c && Date.now() - c.t < CACHE_TTL && c.data) {
        DATA = c.data;
        return;
      }
    } catch (e) {}
    try {
      var r = await fetch(RANKINGS_URL, { cache: "no-store" });
      if (r.ok) {
        var j = await r.json();
        if (j) {
          DATA = j.data || j;
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: DATA }));
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  async function boot() {
    refreshLockUI();
    // DEV: land straight on a raider (no gate/picker) — either ?dev=<name>, or DEV_DEFAULT when the
    // page is opened off disk (file://). Never active on the hosted http/https site.
    var isFile = location.protocol === "file:";
    var DEV_NAME = new URLSearchParams(location.search).get("dev") || (isFile ? DEV_DEFAULT : "");
    // not logged in (no key, not officer)? show the gate right away — the picker inside it needs MEMBERS,
    // which load below, but the dialog is usable as soon as they arrive. (Skip it in dev mode.)
    if (!isLoggedIn() && !DEV_NAME) showGate();
    // parallel reads — members (picker), profiles (alts), vacations (away), snapshot. Officer/unlock also gets roster.
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
      (DATA.dps || []).concat(DATA.hps || [], DATA.deaths || []).forEach(function (p) {
        var k = ck(p.name);
        if (!seen[k]) {
          seen[k] = 1;
          list.push({ name: p.name, class: p.class || "" });
        }
      });
      MEMBERS = list;
    }

    // officers get the header "jump to raider" search (needs MEMBERS loaded); raiders don't.
    // DEV preview counts as officer context so the control is visible while testing.
    if (IS_OFFICER || DEV_NAME) {
      var ps = document.getElementById("psearch");
      if (ps) ps.style.display = "";
    }

    // DEV: land straight on ?dev=<name> (no gate) — for previewing a profile locally.
    if (DEV_NAME) {
      enterAs(DEV_NAME);
      return;
    }

    // already logged in -> open the page. Officers honor a ?c=Name deep-link and default to the first
    // raider; a key-unlocked raider always lands on their own main.
    if (isLoggedIn()) {
      var q = new URLSearchParams(location.search).get("c");
      var landing = IS_OFFICER ? q || myToon() || (MEMBERS[0] && MEMBERS[0].name) || "" : myToon() || q || "";
      if (landing) enterAs(landing);
    }
  }

  // expose the handlers the inline onclick/oninput attributes call
  window.acFilter = acFilter;
  window.pickName = pickName;
  window.doLogin = doLogin;
  window.doLock = doLock;
  window.requestKey = requestKey;
  window.toggleHero = toggleHero;
  window.heroArtLoaded = heroArtLoaded;
  window.setSize = setSize;
  window.setRaid = setRaid;
  window.goToon = goToon;
  window.psFilter = psFilter;
  window.psPick = psPick;

  boot();
})();
