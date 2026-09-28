/* RATS — attendance by the guild's rules, shared by the Attendance page and loot prio.

   The rules are picked IN GAME (Okanvil → Attendance → Rules) and arrive with the
   Okanvil export (history.attRules). Nothing here names a raid: which raids are
   mandatory depends on the guild and the patch (Naxx in the first tier, ICC in the
   last). No rules imported yet = nothing is mandatory.

     must  — raids a main has to do in OUR lockout each week ("ICC25", "ToGC10"…).
             all = false: one of them in our ID is enough; true: every one of them.
     extra — raids that count as extra effort (information only).

   Three outcomes for a main who is not in our run(s) that week:
     absent    — no raid that week, as far as we know. Only lowers attendance %.
     elsewhere — their MAIN is saved to another ID of a mandatory raid. Proof: an
                 Okanvil letter with a different ID, or an officer marking it. On the
                 list, bottom of every loot ladder until they come to a main run again.
     excused   — an officer cleared it (in game or here), or a vacation.

   Letters: every Okanvil reports once per lockout which raid ID its character is
   saved to (history.letters). They also name our ID when no run was recorded (the
   ID most guildies report), prove presence for someone who joined after the roster
   snapshot, and show extra-raid effort.

   window.RatsAtt.compute(opts)  -> { chains, rows, listed }
   window.RatsAtt.tenMan(opts)   -> { weeks, rows, loggers }
*/
(function (w) {
  "use strict";

  // First lockout week the "saved elsewhere" rule applies to. Attendance % reads the
  // whole history (every raid saved from Comp counts); only the list and the loot-prio
  // penalty start here, so nobody is punished for a rule that did not exist yet.
  var SINCE = "2026-09-16";
  var MIN_VOTES = 3; // letters that must agree before their ID is "ours"
  // GM's rule: pugging a mandatory raid on the main without a valid excuse costs a lot.
  // They stay on the list (bottom of every loot ladder) until they have come to this
  // many of our main-run lockouts SINCE the offence; a new offence starts it again.
  var REDEEM = 3;
  var TEN_WEEKS = 4;

  // The raids a rule can name — the addon's catalogue, plus ToGC: its heroic has its
  // OWN lockout (ICC and RS heroic share the normal one). `short` is the letter's z.
  var RULE_RAIDS = [
    { short: "ICC", name: "Icecrown Citadel" },
    { short: "RS", name: "The Ruby Sanctum" },
    { short: "ToC", name: "Trial of the Crusader" },
    { short: "ToGC", name: "Trial of the Grand Crusader" },
    { short: "Ulduar", name: "Ulduar" },
    { short: "Naxx", name: "Naxxramas" },
    { short: "OS", name: "The Obsidian Sanctum" },
    { short: "EoE", name: "The Eye of Eternity" },
    { short: "VoA", name: "Vault of Archavon" },
    { short: "Ony", name: "Onyxia's Lair" },
  ];
  var SHORTS = {};
  RULE_RAIDS.forEach(function (r) { SHORTS[r.short] = r; });

  // "Naxx25" -> { short: "Naxx", size: 25 } (null for anything else)
  function parseRef(ref) {
    var m = /^(.+?)(10|25)$/.exec(String(ref || ""));
    return m && SHORTS[m[1]] ? { short: m[1], size: Number(m[2]) } : null;
  }
  function refLabel(ref) {
    var p = parseRef(ref);
    return p ? p.short + " " + p.size : String(ref);
  }

  function rulesOf(opts) {
    var r = (opts && opts.rules) || {};
    var clean = function (l) { return (Array.isArray(l) ? l : []).filter(parseRef); };
    return { must: clean(r.must), extra: clean(r.extra), all: !!r.all, t: r.t || 0, by: r.by || "" };
  }
  function mustLabel(rules) {
    if (!rules.must.length) return "";
    return rules.must.map(refLabel).join(rules.all ? " + " : " or ");
  }
  function extraLabel(rules) {
    return rules.extra.map(refLabel).join(", ");
  }

  function normName(s) {
    return (s || "")
      .toLowerCase()
      .replace(/\[.*?\]/g, "")
      .replace(/\(.*?\)/g, "")
      .split(/[\/|,]/)[0]
      .replace(/[^a-z0-9]/g, "")
      .trim();
  }
  function ymd(d) {
    var z = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }
  // the Wednesday reset on or before a YYYY-MM-DD date (or a Date)
  function lockoutStart(dateStr) {
    var d;
    if (dateStr instanceof Date) d = new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate());
    else {
      var p = String(dateStr || "").split("-").map(Number);
      if (p.length !== 3) return dateStr;
      d = new Date(p[0], p[1] - 1, p[2]);
    }
    d.setDate(d.getDate() - ((d.getDay() - 3 + 7) % 7));
    return ymd(d);
  }
  function raidSize(r) {
    if (r.size === 10 || r.size === 25) return r.size;
    var n = (r.groups || []).reduce(function (a, g) { return a + (g.members || []).length; }, 0);
    return n > 10 ? 25 : 10;
  }
  // a saved raid's rule raid: "ICC25", "ToGC10"… from its free-text description
  function refOfRaid(r) {
    var desc = String(r.desc || "");
    var key = (w.RatsData && RatsData.raidKeyOf && RatsData.raidKeyOf(desc)) || null;
    if (!key && /obsidian|sarth|\bos\b/i.test(desc)) key = "OS";
    if (key === "ToC" && /\bhm\b|heroic|togc|grand/i.test(desc)) key = "ToGC";
    return key && SHORTS[key] ? key + raidSize(r) : null;
  }
  function usable(r) {
    return !!r.date && !r.optional && !r.test;
  }
  // Firebase keys can't hold . # $ / [ ]
  function safeKey(s) {
    return String(s).replace(/[.#$\/\[\]]/g, "_");
  }
  function weekKey(wed) {
    return "wk|" + wed;
  }
  function excuseId(k, name) {
    return safeKey(k + "|" + normName(name));
  }
  function letterKey(l) {
    return safeKey(normName(l.n) + "|" + l.z + l.size + "|" + l.week);
  }
  // an officer's "Our ID = mine" for one raid: keyed "week|ref"; older ones by the week alone (ICC 25)
  function ourIdKey(wed, ref) {
    return safeKey(wed + "|" + ref);
  }
  function lockoutOpen(wed, today) {
    var d = new Date(wed + "T00:00:00");
    d.setDate(d.getDate() + 7);
    return (today || new Date()) < d;
  }

  // ---- roster: alt -> main (same rule as the History and Comp pages) ----
  function rosterIndex(list, aliasFor) {
    var by = {};
    (list || []).forEach(function (m) { if (m && m.name) by[normName(m.name)] = m; });
    function altMainNote(m) {
      var mm = ((m && m.officerNote) || "").trim().match(/^(.+?)\s+alt\b/i);
      return mm ? mm[1].trim() : null;
    }
    function isAlt(m) {
      return !!m && (m.rankIndex === 4 || /alt/i.test(m.rankName || "") || !!altMainNote(m));
    }
    function mainOf(m) {
      var on = altMainNote(m);
      if (on) return on;
      var pn = ((m && m.publicNote) || "").trim();
      if (pn) {
        var t = pn.split(/[\s,/\-(]/)[0];
        if (/^[A-Za-zÀ-ÿ]{2,}$/.test(t)) return t;
      }
      return null;
    }
    function member(name) {
      var n = normName(name);
      var alias = aliasFor ? aliasFor(name) : null;
      if (alias) n = normName(alias);
      return by[n] || null;
    }
    function resolveMain(name) {
      var m = member(name);
      if (!m) return name;
      if (isAlt(m)) {
        var mn = mainOf(m);
        if (mn) return mn;
      }
      return m.name;
    }
    // is this toon the main itself (not one of its alts)?
    function onMain(name) {
      return resolveMain(name).toLowerCase() === String(name).toLowerCase();
    }
    return { list: list || [], member: member, isAlt: isAlt, resolveMain: resolveMain, onMain: onMain };
  }

  function onVacation(vac, name, date) {
    var n = normName(name);
    return (vac || []).some(function (v) {
      return v.start && normName(v.name) === n && date >= v.start && date <= (v.end || v.start);
    });
  }

  function lettersOf(opts) {
    var l = opts.letters || {};
    return Array.isArray(l) ? l : Object.keys(l).map(function (k) { return l[k]; });
  }

  // The mains expected in the ID: above the bottom rank, plus bottom-rank mains who
  // have already raided a main run with us. Level 80, no pugs.
  function poolOf(R, raided) {
    return R.list.filter(function (m) {
      if (!m || !m.name || R.isAlt(m) || /pug/i.test(m.rankName || "")) return false;
      if ((m.level || 80) < 80) return false;
      return !/sewer/i.test(m.rankName || "") || raided.has(m.name.toLowerCase());
    });
  }

  // look a week's officer mark up under the new key, then the pre-rules one
  function markFor(map, wed, name) {
    return map[excuseId(weekKey(wed), name)] || map[excuseId("icc25|" + wed, name)] || null;
  }

  // opts: { raids, roster (list), joined {}, vac [], excuses {}, elsewhere {}, letters {},
  //         ourIds {}, rules {must, extra, all}, filter(r)?, today? }
  function compute(opts) {
    var rules = rulesOf(opts);
    var R = rosterIndex(opts.roster, w.RatsData && RatsData.aliasFor);
    var empty = { chains: [], rows: [], listed: {}, rules: rules };
    if (!rules.must.length) return empty;
    var joined = opts.joined || {};
    var excuses = opts.excuses || {};
    var marked = opts.elsewhere || {};
    var letters = lettersOf(opts);
    var setIds = opts.ourIds || {};
    var joinOf = function (name) {
      var n = normName(name);
      for (var k in joined) if (normName(k) === n) return joined[k];
      return "";
    };
    var isMust = {};
    rules.must.forEach(function (ref) { isMust[ref] = true; });

    // weeks: every recorded run of a mandatory raid, the weeks an officer set an ID
    // for, and weeks where enough letters agree on one
    var runs = {}; // wed -> ref -> [raids]
    var weeks = {};
    (opts.raids || []).forEach(function (r) {
      var ref = refOfRaid(r);
      if (!ref || !isMust[ref] || !usable(r)) return;
      if (opts.filter && !opts.filter(r)) return;
      var wed = lockoutStart(r.date);
      weeks[wed] = true;
      var byRef = (runs[wed] = runs[wed] || {});
      (byRef[ref] = byRef[ref] || []).push(r);
    });
    var votes = {}; // wed -> ref -> id -> n
    letters.forEach(function (l) {
      var ref = l.z + l.size;
      if (!isMust[ref] || !l.week || l.week < SINCE) return;
      var wk = (votes[l.week] = votes[l.week] || {});
      var v = (wk[ref] = wk[ref] || {});
      v[l.id] = (v[l.id] || 0) + 1;
    });
    Object.keys(setIds).forEach(function (key) {
      var wed = key.split("|")[0];
      if (wed < SINCE || (opts.filter && !opts.filter({ date: wed }))) return;
      weeks[wed] = true;
    });
    Object.keys(votes).forEach(function (wed) {
      if (opts.filter && !opts.filter({ date: wed })) return;
      Object.keys(votes[wed]).forEach(function (ref) {
        var best = Math.max.apply(null, Object.keys(votes[wed][ref]).map(function (id) { return votes[wed][ref][id]; }));
        if (best >= MIN_VOTES) weeks[wed] = true;
      });
    });

    var chains = Object.keys(weeks).map(function (wed) {
      var vac = new Set(), nightsAll = [];
      var raids = rules.must.map(function (ref) {
        var nights = ((runs[wed] || {})[ref] || []).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        var present = new Set();
        nights.forEach(function (r) {
          nightsAll.push(r);
          (r.groups || []).forEach(function (g) {
            (g.members || []).forEach(function (m) { present.add(R.resolveMain(m.name).toLowerCase()); });
          });
          (r.noshows || []).forEach(function (m) {
            if (m.vacation) vac.add(R.resolveMain(m.name).toLowerCase());
          });
        });
        // our ID: the recorded run's, else the officer's, else the one most letters agree on
        var ours = (nights.find(function (r) { return r.lockoutId; }) || {}).lockoutId || null;
        var source = ours ? "run" : null;
        var set = setIds[ourIdKey(wed, ref)] || (ref === "ICC25" ? setIds[wed] : null);
        if (!ours && set && set.id) { ours = set.id; source = "officer"; }
        var v = votes[wed] && votes[wed][ref];
        if (!ours && v) {
          var bestId = null, bestN = 0;
          Object.keys(v).forEach(function (id) { if (v[id] > bestN) { bestId = id; bestN = v[id]; } });
          if (bestN >= MIN_VOTES) { ours = Number(bestId); source = "letters"; }
        }
        // letters: our ID = present (any toon of theirs); another ID = elsewhere (the main only)
        var saved = {};
        letters.forEach(function (l) {
          if (l.week !== wed || l.z + l.size !== ref) return;
          var main = R.resolveMain(l.n).toLowerCase();
          if (ours && String(l.id) === String(ours)) present.add(main);
          else if (ours && R.onMain(l.n)) saved[main] = l.id;
        });
        return { ref: ref, nights: nights, ours: ours, source: source, present: present, saved: saved };
      });
      // combined by the rule: in with us once they are in enough of the mandatory raids
      var hits = {}, present = new Set(), saved = {};
      raids.forEach(function (x) { x.present.forEach(function (k) { hits[k] = (hits[k] || 0) + 1; }); });
      var need = rules.all ? raids.length : 1;
      Object.keys(hits).forEach(function (k) { if (hits[k] >= need) present.add(k); });
      raids.forEach(function (x) {
        Object.keys(x.saved).forEach(function (k) {
          if (!present.has(k) && !x.present.has(k) && !saved[k]) saved[k] = { id: x.saved[k], ref: x.ref };
        });
      });
      nightsAll.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      return {
        k: weekKey(wed), wed: wed, open: lockoutOpen(wed, opts.today), label: mustLabel(rules),
        raids: raids, nights: nightsAll, first: nightsAll.length ? nightsAll[0].date : wed,
        present: present, hits: hits, saved: saved, vac: vac,
        ours: (raids.find(function (x) { return x.ours; }) || {}).ours || null,
      };
    }).sort(function (a, b) { return a.wed < b.wed ? 1 : -1; });

    var raided = new Set();
    chains.forEach(function (c) { c.present.forEach(function (k) { raided.add(k); }); });
    var pool = poolOf(R, raided);

    var rows = [], listed = {};
    pool.forEach(function (m) {
      var key = m.name.toLowerCase(), joinD = joinOf(m.name);
      var marks = [];
      chains.forEach(function (c) {               // newest first
        if (joinD && c.wed < lockoutStart(joinD)) return; // joined after this ID started
        if (c.present.has(key)) { marks.push({ c: c, st: "in" }); return; }
        var mk = markFor(marked, c.wed, m.name);
        var ruled = c.wed >= SINCE; // before the rule existed, a miss is only a miss
        var proof = !ruled ? null
          : c.saved[key] ? { id: c.saved[key].id, ref: c.saved[key].ref, by: "letter" }
            : mk ? { id: mk.id || null, by: "officer", reason: mk.reason || "" } : null;
        var st;
        if (c.vac.has(key) || c.nights.some(function (r) { return onVacation(opts.vac, m.name, r.date); })) st = "vac";
        else if (markFor(excuses, c.wed, m.name)) st = "excused";
        else if (proof) st = "elsewhere";         // locked elsewhere: can't come night 2 either
        else if (c.open) st = "open";
        else st = "absent";
        marks.push({ c: c, st: st, proof: proof });
      });
      // on the list until they have come to REDEEM of our lockouts since the last offence
      var last = -1;
      for (var i = 0; i < marks.length && last < 0; i++) if (marks[i].st === "elsewhere") last = i;
      var since = last < 0 ? 0 : marks.slice(0, last).filter(function (x) { return x.st === "in"; }).length;
      if (last >= 0 && since < REDEEM) listed[key] = { chain: marks[last].c, left: REDEEM - since };
      if (!marks.length) return;
      var came = marks.filter(function (x) { return x.st === "in"; }).length;
      var counted = marks.filter(function (x) { return x.st === "in" || x.st === "elsewhere" || x.st === "absent"; }).length;
      rows.push({
        name: m.name, cls: m["class"] || "",
        rankIndex: m.rankIndex != null ? m.rankIndex : 99, rankName: m.rankName || "",
        marks: marks, came: came, pct: counted ? Math.round((100 * came) / counted) : null,
        elsewhere: marks.filter(function (x) { return x.st === "elsewhere"; }).length,
        absent: marks.filter(function (x) { return x.st === "absent"; }).length,
        open: marks.some(function (x) { return x.st === "open"; }),
        listed: !!listed[key], redeemLeft: listed[key] ? listed[key].left : 0,
      });
    });
    rows.sort(function (a, b) {
      return (b.listed - a.listed) || (b.elsewhere - a.elsewhere) || (b.absent - a.absent) ||
        (b.open - a.open) || (a.rankIndex - b.rankIndex) || a.name.localeCompare(b.name);
    });
    return { chains: chains, rows: rows, listed: listed, rules: rules };
  }

  // ---- extra-raid effort (information only) ----
  // Per main, the last TEN_WEEKS lockout weeks: with us in the mandatory raid(s)? any
  // extra raid on the MAIN (Okanvil letter, guild or pug; or a saved raid played on the
  // main)? Alts don't count. "ours only" = 2+ weeks with us and no extra raid at all.
  // opts: compute()'s opts + { exempt {} }
  function tenMan(opts) {
    var rules = rulesOf(opts);
    var R = rosterIndex(opts.roster, w.RatsData && RatsData.aliasFor);
    var today = opts.today || new Date();
    var weeks = [];
    for (var i = 0; i < TEN_WEEKS; i++) weeks.push(lockoutStart(new Date(today.getTime() - i * 7 * 86400000)));
    if (!rules.extra.length) return { weeks: weeks, rows: [], loggers: {}, rules: rules };
    var isExtra = {};
    rules.extra.forEach(function (ref) { isExtra[ref] = true; });
    var main = compute(Object.assign({}, opts, { filter: null }));
    var byWeek = {};
    main.chains.forEach(function (c) { byWeek[c.wed] = c; });
    var extra = {}, heard = {};
    lettersOf(opts).forEach(function (l) {
      var m = R.resolveMain(l.n).toLowerCase();
      heard[m] = true;
      if (isExtra[l.z + l.size] && R.onMain(l.n)) ((extra[l.week] = extra[l.week] || {})[m] = l.z + l.size);
    });
    (opts.raids || []).forEach(function (r) {
      var ref = refOfRaid(r);
      if (!r.date || !ref || !isExtra[ref]) return;
      var wed = lockoutStart(r.date);
      (r.groups || []).forEach(function (g) {
        (g.members || []).forEach(function (mm) {
          if (R.onMain(mm.name)) (extra[wed] = extra[wed] || {})[R.resolveMain(mm.name).toLowerCase()] = ref;
        });
      });
    });
    var raided = new Set();
    main.chains.forEach(function (c) { c.present.forEach(function (k) { raided.add(k); }); });
    var exempt = opts.exempt || {};
    var loggers = {};
    var rows = poolOf(R, raided).map(function (m) {
      var k = m.name.toLowerCase();
      var w25 = 0, w10 = 0;
      var cells = weeks.map(function (wk) {
        var c = byWeek[wk];
        var ours = !!(c && c.present.has(k)), ex = (extra[wk] && extra[wk][k]) || null;
        if (ours) w25++;
        if (ex) w10++;
        return { week: wk, ours: ours, extra: ex };
      });
      var ex = exempt[safeKey(normName(m.name))] || null;
      var addon = !!heard[k];
      // without Okanvil a pug is invisible, so "ours only" is only a suspicion
      var verdict = ex ? "exempt"
        : w10 > 0 ? "effort"
          : w25 >= 2 ? (addon ? "only25" : "only25?")
            : "little";
      if (verdict === "only25") loggers[k] = { weeks25: w25 };
      return {
        name: m.name, cls: m["class"] || "", rankIndex: m.rankIndex != null ? m.rankIndex : 99,
        rankName: m.rankName || "", cells: cells, w25: w25, w10: w10, verdict: verdict, exempt: ex, addon: addon,
      };
    });
    var order = { only25: 0, "only25?": 1, little: 2, effort: 3, exempt: 4 };
    rows.sort(function (a, b) {
      return (order[a.verdict] - order[b.verdict]) || (a.rankIndex - b.rankIndex) || a.name.localeCompare(b.name);
    });
    return { weeks: weeks, rows: rows, loggers: loggers, rules: rules };
  }

  w.RatsAtt = {
    compute: compute, tenMan: tenMan, excuseId: excuseId, weekKey: weekKey, letterKey: letterKey,
    ourIdKey: ourIdKey, safeKey: safeKey, lockoutStart: lockoutStart, normName: normName,
    parseRef: parseRef, refLabel: refLabel, refOfRaid: refOfRaid, rulesOf: rulesOf,
    mustLabel: mustLabel, extraLabel: extraLabel, RULE_RAIDS: RULE_RAIDS,
    SINCE: SINCE, TEN_WEEKS: TEN_WEEKS, REDEEM: REDEEM,
  };
})(window);
