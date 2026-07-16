/* RatsLogs — shared logs-snapshot plumbing (identity + row handling), used by BOTH the rankings page
   and the raider profile. This is the part that MUST agree between the two: how a log row resolves to a
   PERSON (rename -> alt -> main), which fights count as tank (excluded from DPS), and how a raid/size/
   difficulty scope filters the raw rows. The pages differ in the LENS they apply on top:
     - rankings/ ranks players against each other (fairness blend: volume+rate, bayesian, min-fights);
     - profile/  shows one rat's RAW numbers (own best parse per boss, own average, own server percentile).
   So the ranking blend lives in rankings.js and the raw rollup lives in profile.js — only the plumbing
   below is shared, so a fix to tank-detection / the alt-map / difficulty split helps both pages at once.

   Lifted verbatim from rankings.js (markTankRows / rowsForDiff / resolveIdentity / serverPctFor / normNm)
   so behavior is identical. The only change: scope (RAID/SIZE/DIFF) is passed in via setScope() instead
   of reading rankings.js module-locals, so a second page can drive it.

   Usage:
     var L = RatsLogs(DATA);              // DATA = the rankings snapshot (data.logs[], altMap, serverPct…)
     L.setScope({ raid:"icc", size:25, diff:"nm" });
     L.logsInScope("all").forEach(function (log) {
       L.rowsForDiff(log.rows).forEach(function (r) { ... r is a boss row for one player ... });
     });
     L.resolveIdentity(row.n, row.c);     // -> { key, name, cls }  (person, not toon)
     L.serverPctFor(name);                // -> 0..1 or null (server percentile for the active scope)
*/
(function (root) {
  "use strict";

  // normalize a character name to a comparison key: lowercase, strip non-alphanumerics.
  function normNm(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // Raids whose bosses split Normal vs Heroic (the diff toggle applies only to these). Elsewhere every
  // fight is a single difficulty, so the diff filter is a no-op. Mirror of rankings.js SPLIT_DIFF_RAIDS.
  var SPLIT_DIFF_RAIDS = { toc: true, icc: true };

  // Canonical boss order per raid (from /meta/raids/{raid}/bosses — static). Used to sort killed bosses
  // by the real raid path instead of kill order. Mirror of rankings.js BOSS_ORDER.
  var BOSS_ORDER = {
    ulduar: [
      "Flame Leviathan", "Ignis the Furnace Master", "Razorscale", "XT-002 Deconstructor", "Assembly of Iron",
      "Kologarn", "Auriaya", "Hodir", "Thorim", "Freya", "Mimiron", "General Vezax", "Yogg-Saron",
      "Algalon the Observer",
    ],
    toc: ["Northrend Beasts", "Lord Jaraxxus", "Faction Champions", "Twin Val'kyr", "Anub'arak"],
    icc: [
      "Lord Marrowgar", "Lady Deathwhisper", "Gunship Battle", "Deathbringer Saurfang", "Festergut", "Rotface",
      "Professor Putricide", "Blood Prince Council", "Blood-Queen Lana'thel", "Valithria Dreamwalker",
      "Sindragosa", "The Lich King",
    ],
  };
  // Sort a list of boss names by the raid's canonical order (unknowns go last, alphabetically).
  function sortBosses(names, raidSlug) {
    var order = BOSS_ORDER[raidSlug] || [];
    var idx = {};
    order.forEach(function (b, i) { idx[b] = i; });
    return names.slice().sort(function (a, b) {
      var ia = a in idx ? idx[a] : 999,
        ib = b in idx ? idx[b] : 999;
      return ia === ib ? a.localeCompare(b) : ia - ib;
    });
  }

  // --- tank detection (see rankings.js for the full rationale) --------------------------------------
  // A tank held threat, not pumped damage, so its low "dps" must NOT drag a player's DPS average.
  //   1) unambiguous tank spec (Protection) -> always tank;
  //   2) ambiguous specs (Feral Druid, DK Blood/Frost/Unholy) -> per fight, prefer the damageTaken
  //      fingerprint when the row carries it (`dt`, in the feed since 2026-07-16): a tank eats several
  //      times the fight's median (2.7M vs ~800K in real logs), which separates bear from cat cleanly;
  //   3) rows without `dt` (older snapshots) fall back to the dps heuristic — tank when their dps that
  //      fight is far below the fight's median dps (a bear/blood tank parses a fraction of a cat/dps).
  var TANK_SPEC = { Protection: true };
  var AMBIG_TANK_SPEC = { "Feral Combat": true, Feral: true, Blood: true, Frost: true, Unholy: true };
  var TANK_DPS_FRAC = 0.55; // below this share of the fight median dps => treat an ambiguous spec as tank
  var TANK_DT_MULT = 2; // above this multiple of the fight median damageTaken => tanking that fight

  // Flag tank rows in-place (adds `_tank` bool). Idempotent — safe to call repeatedly on the same array.
  function markTankRows(rows) {
    if (!rows || !rows.length || rows._tankMarked) return rows;
    var byBoss = {};
    rows.forEach(function (r) {
      if (r.r === "HEALER") { r._tank = false; return; }
      if (TANK_SPEC[r.s]) { r._tank = true; return; } // unambiguous tank spec
      r._tank = false; // default; ambiguous rows resolved below
      (byBoss[r.b] = byBoss[r.b] || []).push(r);
    });
    // pass 1: per fight — the damageTaken fingerprint decides outright when the data exists; rows
    // without `dt` are marked low/high on dps for the majority fallback below.
    Object.keys(byBoss).forEach(function (b) {
      var pack = byBoss[b];
      var dpsVals = pack.map(function (r) { return r.d || 0; }).sort(function (a, bb) { return a - bb; });
      var mid = dpsVals.length ? dpsVals[Math.floor(dpsVals.length / 2)] : 0;
      var dtVals = pack.filter(function (r) { return r.dt != null; })
        .map(function (r) { return r.dt || 0; }).sort(function (a, bb) { return a - bb; });
      var dtMid = dtVals.length ? dtVals[Math.floor(dtVals.length / 2)] : 0;
      pack.forEach(function (r) {
        if (!AMBIG_TANK_SPEC[r.s]) { r._low = false; return; }
        if (r.dt != null && dtMid > 0 && mid > 0) {
          // fingerprint needs BOTH halves: soaked ≥2× the fight median AND dps well below the fight
          // median. Soak alone false-positives on splash-heavy fights (ToC Beasts/Anub'arak: a Frost
          // DK ate 2.6× median while pumping 5K dps — Impale target, not a tank). A real tank shows
          // high soak + low dps together (Gathlock: 5.6× soak at 2.3K dps).
          r._tank = (r.dt || 0) >= dtMid * TANK_DT_MULT && (r.d || 0) < mid * TANK_DPS_FRAC;
          r._dtDecided = true; // this fight is settled — the dps-majority fallback must not overrule it
          r._low = false;
          return;
        }
        r._low = mid > 0 && (r.d || 0) < mid * TANK_DPS_FRAC;
      });
    });
    // pass 2 (fallback for rows without `dt`): per player, tank the whole log if low on the majority
    // of their ambiguous fights.
    var tally = {}; // normName -> {ambig, low}
    rows.forEach(function (r) {
      if (!AMBIG_TANK_SPEC[r.s] || r.r === "HEALER" || r._dtDecided) return;
      var k = normNm(r.n);
      var t = tally[k] || (tally[k] = { ambig: 0, low: 0 });
      t.ambig++; if (r._low) t.low++;
    });
    rows.forEach(function (r) {
      if (r._tank || r._dtDecided) return; // already settled (Protection, or fingerprint-decided)
      if (!AMBIG_TANK_SPEC[r.s] || r.r === "HEALER") return;
      var t = tally[normNm(r.n)];
      if (t && t.ambig && t.low * 2 >= t.ambig) r._tank = true; // low on >=half their fights => tank
    });
    try { Object.defineProperty(rows, "_tankMarked", { value: true }); } catch (e) { rows._tankMarked = true; }
    return rows;
  }
  function isTankFight(r) {
    if (r._tank != null) return r._tank; // computed flag wins
    return !!TANK_SPEC[r.s];
  }

  // Healer main-specs (from the roster). If the roster says someone's MAIN spec heals, they belong in the
  // healing table even if these logs only caught them on an off-spec.
  var HEALER_SPEC = { Restoration: true, Holy: true, Discipline: true };
  // Tank main-specs. Protection is unambiguously a tank spec; the ambiguous ones (Feral/Blood/Frost/
  // Unholy) can't be told apart from DPS by mainSpec alone, so those rely on the per-fight markTankRows
  // heuristic instead (majority of fights flagged _tank -> a de-facto tank).
  var TANK_MAIN_SPEC = { Protection: true };

  // The factory: bind one snapshot, then set a raid/size/diff scope and read rows through it.
  function RatsLogs(DATA) {
    DATA = DATA || {};
    var RAID = "";   // raid slug (e.g. "icc"); "" = unscoped
    var SIZE = "25"; // "25" / "10" (string — the snapshot mixes number/string sizes)
    var DIFF = "nm"; // "nm" | "hc" — only meaningful for SPLIT_DIFF_RAIDS

    function setData(d) { DATA = d || {}; return api; }
    function setScope(s) {
      s = s || {};
      if (s.raid != null) RAID = String(s.raid);
      if (s.size != null) SIZE = String(s.size).match(/\d+/) ? String(s.size).match(/\d+/)[0] : String(s.size);
      if (s.diff != null) DIFF = s.diff === "hc" ? "hc" : "nm";
      return api;
    }
    function scope() { return { raid: RAID, size: SIZE, diff: DIFF }; }

    // roster main role for a toon (via mainSpec), or null if unknown -> fall back to fight-based detection.
    function rosterRole(name) {
      var ms = DATA.mainSpec || {};
      var sp = ms[normNm(name)];
      if (!sp) return null;
      return HEALER_SPEC[sp] ? "HEALER" : "DPS";
    }

    // set of guild-member names (normalized); null when the snapshot didn't capture a roster (show all).
    function rosterSet() {
      if (!DATA.rosterNames || !DATA.rosterNames.length) return null;
      var s = {};
      DATA.rosterNames.forEach(function (n) { s[normNm(n)] = true; });
      return s;
    }

    // apply the shared old-name -> current-name alias map so a renamed character resolves to its present
    // in-game name before alt->main folding.
    function aliasName(name) {
      var a = root.RatsData && root.RatsData.aliasFor ? root.RatsData.aliasFor(name) : null;
      return a || name;
    }

    // resolve a toon name -> the PERSON (main). rename -> current name, then alt -> main.
    // returns { key, name, cls }.
    function resolveIdentity(name, fallbackClass) {
      name = aliasName(name);
      var k = normNm(name);
      var am = DATA.altMap || {};
      var a = am[k];
      if (a && a.main) {
        return { key: normNm(a.main), name: a.main, cls: a.mainClass || fallbackClass || "" };
      }
      return { key: k, name: name, cls: fallbackClass || "" };
    }

    // dominant role of each TOON over its own fights (roster main spec wins; else majority of fights).
    // used to fuse a person's same-role toons while keeping a DPS toon and a HEALER toon separate.
    function toonRoles(logs) {
      var count = {};
      logs.forEach(function (l) {
        rowsForDiff(l.rows).forEach(function (r) {
          var k = normNm(r.n);
          var c = count[k] || (count[k] = { heal: 0, dps: 0 });
          if (r.r === "HEALER") c.heal++; else c.dps++;
        });
      });
      var role = {};
      Object.keys(count).forEach(function (k) {
        role[k] = rosterRole(k) || (count[k].heal > count[k].dps ? "HEALER" : "DPS");
      });
      return role;
    }

    // Which TOONS are tanks (normName -> true). A tank if the roster mainSpec is a tank spec (Protection),
    // OR markTankRows flagged the MAJORITY of their fights as tank (catches bear/blood tanks the roster
    // records under a DPS spec). Tank fights carry no DPS parse we can rank, so the profile treats these
    // people by PRESENCE (bosses tanked, fights held), not damage.
    function toonTanks(logs) {
      var ms = DATA.mainSpec || {};
      var tally = {}; // normName -> { tank, total }
      logs.forEach(function (l) {
        rowsForDiff(l.rows).forEach(function (r) { // markTankRows runs inside -> _tank is set
          var k = normNm(r.n);
          var t = tally[k] || (tally[k] = { tank: 0, total: 0 });
          t.total++;
          if (isTankFight(r)) t.tank++;
        });
      });
      var out = {};
      Object.keys(tally).forEach(function (k) {
        var t = tally[k];
        var rosterTank = !!TANK_MAIN_SPEC[ms[k]];
        var mostlyTank = t.total > 0 && t.tank * 2 >= t.total; // >= half their fights were tank fights
        if (rosterTank || mostlyTank) out[k] = true;
      });
      return out;
    }

    // Tank presence stats for ONE person in scope: bosses tanked (distinct), tank fights held, raid nights.
    // Also returns their off-spec DPS (avg over their NON-tank dps fights) so the profile can show "when
    // they DPS'd" without pretending that's their role. All derived from the same rows.
    function tankStatsFor(name) {
      var logs = logsInScope("all");
      var isT = toonTanks(logs);
      var k = normNm(name);
      // fold: also count alt toons of this person that are tanks? No — a profile page shows ONE toon's
      // tanking, resolved to the person only for identity. Here we match the viewed toon by name/alias.
      var bossesTanked = {}, tankFights = 0, nights = {}, offSum = 0, offN = 0, offBest = 0, offByBoss = {};
      // soak/deaths from rows carrying the per-fight extras (in the feed since 2026-07-16) — FC is a
      // PvP scramble, never tanked, so it feeds neither soak nor deaths (same rule as the tank board).
      var soaked = 0, soakN = 0, deaths = 0, soakByBoss = {};
      logs.forEach(function (l) {
        var touched = false;
        rowsForDiff(l.rows).forEach(function (r) {
          if (normNm(r.n) !== k) return;
          if (isTankFight(r)) {
            bossesTanked[r.b] = true; tankFights++; touched = true;
            if (r.dt != null && r.b !== "Faction Champions") {
              soaked += r.dt || 0; soakN++;
              deaths += r.dth || 0;
              if (!soakByBoss[r.b] || (r.dt || 0) > soakByBoss[r.b]) soakByBoss[r.b] = Math.round(r.dt || 0);
            }
          } else if (r.r !== "HEALER") {
            var v = r.d || 0; offSum += v; offN++; if (v > offBest) offBest = v;
            if (!offByBoss[r.b] || v > offByBoss[r.b]) offByBoss[r.b] = Math.round(v);
          }
        });
        if (touched) nights[l.reportId || l.date || l.reportUrl] = true;
      });
      return {
        isTank: !!isT[k],
        bossesTanked: Object.keys(bossesTanked),
        tankFights: tankFights,
        nights: Object.keys(nights).length,
        // null until re-fetched logs carry damageTaken — callers gate the soak/survival tiles on this
        soakPerFight: soakN ? Math.round(soaked / soakN) : null,
        soakFights: soakN,
        tankDeaths: soakN ? deaths : null,
        survival: soakN ? Math.round(((soakN - Math.min(deaths, soakN)) / soakN) * 100) : null,
        soakByBoss: soakByBoss,
        offSpecDps: offN ? Math.round(offSum / offN) : null,
        offSpecFights: offN,
        offSpecBest: offN ? Math.round(offBest) : null,
        offSpecByBoss: offByBoss,
      };
    }

    // filter a log's rows to the active difficulty (and flag tanks first, so the flag survives filtering).
    function rowsForDiff(rows) {
      markTankRows(rows);
      if (!SPLIT_DIFF_RAIDS[RAID]) return rows || [];
      var wantHC = DIFF === "hc";
      return (rows || []).filter(function (r) {
        return r.hm == null || !!r.hm === wantHC;
      });
    }

    // logs matching the active raid + size, within the period window ("week"/"month"/"all").
    function logsInScope(period) {
      var rObj = (DATA.raids || []).find(function (r) { return r.key === RAID; });
      var rKeys = [RAID, rObj && rObj.label].filter(Boolean).map(function (x) { return String(x).toLowerCase(); });
      return (DATA.logs || []).filter(function (l) {
        if (String(l.size).match(/\d+/) && String(l.size).match(/\d+/)[0] !== SIZE) return false;
        var raidMatch =
          rKeys.indexOf(String(l.raid).toLowerCase()) >= 0 || rKeys.indexOf(String(l.raidSlug).toLowerCase()) >= 0;
        if (!raidMatch) return false;
        return inPeriodDays(l.date, period);
      });
    }
    function inPeriodDays(dateStr, period) {
      if (period === "all" || !period) return true;
      var dt = new Date(dateStr);
      if (isNaN(dt)) return true;
      var days = (Date.now() - dt.getTime()) / 86400000;
      return days <= (period === "week" ? 7 : 31);
    }

    // server percentile (0..1) for a player in the active raid/size/diff scope, or null when unavailable.
    // serverPct[slug][size][diffKey].players[normName] = { avg, ... }  (diff split only for SPLIT raids).
    function serverPctFor(faceName) {
      var sp = DATA.serverPct || {};
      var rObj = (DATA.raids || []).find(function (r) { return r.key === RAID; });
      var slug = (rObj && rObj.key) || RAID;
      var bySize = sp[slug] && sp[slug][SIZE];
      if (!bySize) return null;
      var diffKey = SPLIT_DIFF_RAIDS[slug] ? (DIFF === "hc" ? "hc" : "nm") : null;
      var bucket = (diffKey && bySize[diffKey]) || bySize;
      if (!bucket.players) return null;
      var rec = bucket.players[normNm(faceName)];
      if (!rec || rec.avg == null) return null;
      return Math.max(0, Math.min(1, rec.avg / 100));
    }

    // ---- SHARED leaderboard blend (the fairness ranking) — lifted from rankings.js so the profile's
    // "guild standing" matches the rankings page EXACTLY. Ranks by a hybrid score: 60% total volume +
    // 40% bayesian rate (the "internal"), then 50% internal + 50% server-percentile (or internal-rank
    // when no server data). Group = main + role (same-role toons fuse). Returns rows sorted best→worst.
    var W_TOTAL = 0.6, W_RATE = 0.4;
    function aggregate(logs, wantHealer, minFights) {
      minFights = minFights || 1;
      var by = {};
      var guild = rosterSet();
      var trole = toonRoles(logs);
      var rateKey = wantHealer ? "h" : "d",
        totKey = wantHealer ? "heal" : "dmg";
      logs.forEach(function (l) {
        rowsForDiff(l.rows).forEach(function (r) {
          var tk = normNm(r.n);
          var toonIsHealer = trole[tk] === "HEALER";
          if (wantHealer !== toonIsHealer) return;
          if (toonIsHealer && r.r !== "HEALER") return;
          if (!toonIsHealer && r.r === "HEALER") return;
          if (!toonIsHealer && isTankFight(r)) return;
          var id = resolveIdentity(r.n, r.c);
          if (guild && !guild[id.key] && !guild[tk]) return;
          var gk = id.key + "|" + (toonIsHealer ? "H" : "D");
          var e = by[gk] || (by[gk] = { key: id.key, rateSum: 0, total: 0, best: 0, fights: 0, faces: {} });
          var rate = r[rateKey] || 0;
          e.rateSum += rate;
          e.total += r[totKey] || 0;
          e.fights++;
          if (rate > e.best) e.best = rate;
          var f = e.faces[tk] || (e.faces[tk] = { name: r.n, cls: r.c, spec: r.s, n: 0 });
          f.n++;
        });
      });
      var players = Object.keys(by).map(function (gk) {
        var e = by[gk];
        var face = null;
        Object.keys(e.faces).forEach(function (tk) { if (!face || e.faces[tk].n > face.n) face = e.faces[tk]; });
        e.name = face ? face.name : "?";
        e.class = face ? face.cls : "";
        e.spec = face ? face.spec : "";
        return e;
      });
      if (!players.length) return [];
      // bayesian shrink on the rate (pull low-fight means toward the global mean)
      var rateTotal = 0, nTotal = 0, counts = [];
      players.forEach(function (e) { rateTotal += e.rateSum; nTotal += e.fights; counts.push(e.fights); });
      var globalRate = rateTotal / nTotal;
      counts.sort(function (a, b) { return a - b; });
      var C = Math.max(3, counts[Math.floor(counts.length / 2)] || 3);
      var maxTotal = 0, maxRate = 0;
      players.forEach(function (e) {
        e.mean = e.rateSum / e.fights;
        e.rate = (e.fights * e.mean + C * globalRate) / (e.fights + C);
        if (e.total > maxTotal) maxTotal = e.total;
        if (e.rate > maxRate) maxRate = e.rate;
      });
      maxTotal = maxTotal || 1; maxRate = maxRate || 1;
      var kept = players.filter(function (e) { return e.fights >= minFights; });
      kept.forEach(function (e) { e.internal = W_TOTAL * (e.total / maxTotal) + W_RATE * (e.rate / maxRate); });
      var byInternal = kept.slice().sort(function (a, b) { return a.internal - b.internal; });
      var nn = byInternal.length;
      byInternal.forEach(function (e, i) { e.internalPct = nn > 1 ? i / (nn - 1) : 1; });
      return kept
        .map(function (e) {
          var srv = serverPctFor(e.name);
          var pctAxis = srv == null ? e.internalPct : srv;
          var score = 0.5 * e.internal + 0.5 * pctAxis;
          return {
            key: e.key, name: e.name, class: e.class, spec: e.spec,
            value: e.total, score: score, internal: e.internal,
            serverPct: srv == null ? null : Math.round(srv * 1000) / 10,
            rate: Math.round(e.rate), mean: Math.round(e.mean), best: Math.round(e.best), fights: e.fights,
          };
        })
        .sort(function (a, b) { return b.score - a.score; });
    }

    // Career standings for ONE person across EVERY raid/size (and diff) they parsed in — the input to a
    // scope-INDEPENDENT "is my raid spot safe?" verdict. For each scope the person appears in, returns
    // their guild-rank percentile (0..1, top of the bracket = 1), server percentile (0..1 or null),
    // fights, role (D/H), and whether they tanked it. Restores the caller's scope when done.
    // NOTE: uses the SAME identity/tank/role plumbing as the boards, so standings match the pages.
    function careerStandings(name) {
      var saved = { raid: RAID, size: SIZE, diff: DIFF };
      var key = normNm(name);
      var out = [];
      var raids = (DATA.raids || []).map(function (r) { return r.key || r.slug; });
      var sizes = ["25", "10"];
      raids.forEach(function (raid) {
        sizes.forEach(function (size) {
          // for split raids, evaluate NM and HC separately; otherwise a single (nm) pass covers it.
          var diffs = SPLIT_DIFF_RAIDS[raid] ? ["nm", "hc"] : ["nm"];
          diffs.forEach(function (diff) {
            RAID = raid; SIZE = size; DIFF = diff;
            var logs = logsInScope("all");
            if (!logs.length) return;
            var isT = toonTanks(logs);
            // Guild standing uses the SAME fairness blend as the rankings page (aggregate), so a raider's
            // profile rank matches rankings exactly. Also count THIS person's TANK fights for presence.
            var trole = toonRoles(logs);
            var myTankFights = 0;
            logs.forEach(function (l) {
              rowsForDiff(l.rows).forEach(function (r) {
                if (normNm(r.n) === key && trole[key] !== "HEALER" && isTankFight(r)) myTankFights++;
              });
            });
            [["D", false], ["H", true]].forEach(function (pair) {
              var rf = pair[0], wantHealer = pair[1];
              var board = aggregate(logs, wantHealer, 1); // ranked by the blend, best→worst
              var idx = -1;
              for (var i = 0; i < board.length; i++) if (board[i].key === key) { idx = i; break; }
              if (idx < 0) return;
              var me = board[idx];
              var srv = serverPctFor(me.name);
              // guild standing 0..1 (top of the bracket = 1). But a board of ONE isn't "#1 in the guild"
              // — there's no pack to top. With no server data either, we can't judge this scope, so it's
              // NEUTRAL (0.5), not a perfect 1.0 (which used to make a single solo fight read as elite).
              var guildPct;
              if (board.length > 1) guildPct = 1 - idx / (board.length - 1);
              else guildPct = srv != null ? 1 : 0.5; // solo board: trust server% if present, else neutral
              out.push({
                raid: raid, size: size, diff: diff, role: rf,
                fights: me.fights, boardSize: board.length, guildRank: idx + 1,
                guildPct: guildPct, serverPct: srv, tank: !!isT[key],
              });
            });
            // TANK scope entry: a tank has no DPS/HPS ladder, but tanking the front IS the contribution.
            // Emit one entry counting their tank fights, standing = 1 (doing the job), no server parse.
            if (myTankFights > 0) {
              out.push({
                raid: raid, size: size, diff: diff, role: "T",
                fights: myTankFights, boardSize: null, guildRank: null,
                guildPct: 1, serverPct: null, tank: true,
              });
            }
          });
        });
      });
      RAID = saved.raid; SIZE = saved.size; DIFF = saved.diff; // restore
      return out;
    }

    var api = {
      setData: setData,
      setScope: setScope,
      scope: scope,
      normNm: normNm,
      resolveIdentity: resolveIdentity,
      rosterRole: rosterRole,
      rosterSet: rosterSet,
      toonRoles: toonRoles,
      aggregate: aggregate,
      careerStandings: careerStandings,
      toonTanks: toonTanks,
      tankStatsFor: tankStatsFor,
      isTankFight: isTankFight,
      rowsForDiff: rowsForDiff,
      logsInScope: logsInScope,
      inPeriodDays: inPeriodDays,
      serverPctFor: serverPctFor,
      SPLIT_DIFF_RAIDS: SPLIT_DIFF_RAIDS,
      BOSS_ORDER: BOSS_ORDER,
      sortBosses: sortBosses,
    };
    return api;
  }

  // static helpers hang off the factory too (usable without a snapshot)
  RatsLogs.normNm = normNm;
  RatsLogs.markTankRows = markTankRows;
  RatsLogs.isTankFight = isTankFight;
  RatsLogs.SPLIT_DIFF_RAIDS = SPLIT_DIFF_RAIDS;
  RatsLogs.BOSS_ORDER = BOSS_ORDER;
  RatsLogs.sortBosses = sortBosses;

  root.RatsLogs = RatsLogs;
})(typeof window !== "undefined" ? window : this);
