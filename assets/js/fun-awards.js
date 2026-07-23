/* RATS — Fun & Shame superlatives (SHARED).
   The single source of truth for the guild awards ("The Baker", "The Medic", "On a streak", …).
   Both the rankings page (grid of cards) and the profile page (a raider's own honours) call this,
   so the award logic lives in ONE place — change it here and both pages follow.

   Depends on: RatsLogs (assets/js/logs-core.js) for the identity/role/tank/aggregate plumbing, so the
   maths matches the leaderboards exactly. Optional: window.RATS_QUIPS (funquips.js) for the quip pools.

   Honours come in four flavours, so a quiet raider still fills their profile panel instead of being
   shut out by whoever tops every meter:
     1. COMPETITIVE  — one winner per raid/size (The Baker, On strike, …). The rankings grid shows these.
     2. PODIUM       — 2nd/3rd place on the volume awards (`rank` 2|3). Profile-only.
     3. SPECIALITY   — top of your own lane: The Wall (tanks), Best <Class>. One holder per class/role. Profile-only.
     4. PERSONAL     — earned against a threshold, not against people: raid clears, boss-count milestones.

   API — RatsFun(DATA):
     .compute({ raid, size, diff, period })  -> { awards:[A], shame:[A], podium:[A], speciality:[A] }
        A = { emoji, title, winner, winnerKey, cls, sub, shame, rank? }   (winnerKey = normalized name)
        The rankings grid reads `awards` only. `podium` (runner-ups) and `speciality` (Best <Class> /
        The Wall) are profile-only — forRaider folds them back in so nobody loses a badge.
     .forRaider(name, opts)  -> [A]  every positive honour THIS person holds, no shame. Folds in the
        speciality/personal/clear badges and caps at opts.cap (default 5), rarest first.
     .personalFor(name) / .progressFor(name) -> the milestone / raid-clear badges on their own
     .AWARD_HUE                              -> title -> accent colour (for the rankings cards)
*/
(function (root) {
  // per-award accent hue (rankings cards); falls back to gold.
  var AWARD_HUE = {
    "The Baker": "#3fa7ff",
    "The Medic": "#57d977",
    "One-trick pony": "#c88bff",
    "Mr. Reliable": "#5bd6c8",
    "The Wildcard": "#ffb03a",
    Overachiever: "#7ee081",
    "Lone wolf": "#9aa7ff",
    "On strike": "#ffd23f",
    "On a streak": "#ff9d3f",
    "Perfect attendance": "#ffd23f",
    "The Wall": "#8fa6c4",
    "Kick Master": "#ff6b6b",
    "Drunkest Rat": "#e0a94e",
    "Immortal Wall": "#8fa6c4",
  };
  // "Best <Class>" cards are hued by the class itself (set at render time), and the profile-only
  // honours (clears, milestones, podium places) fall back to gold — no entry needed here.

  var SPLIT_DIFF_RAIDS = { toc: true, icc: true };

  // ---- small formatters (kept local so this module is self-contained) ----
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }
  function fmt(n) {
    return Number(n || 0).toLocaleString("en-US");
  }
  function fmtBig(n) {
    n = Number(n || 0);
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return Math.round(n / 1e3) + "K";
    return String(Math.round(n));
  }
  var BOSS_SHORT = {
    "Flame Leviathan": "FL", "Ignis the Furnace Master": "Ignis", Razorscale: "Razor",
    "XT-002 Deconstructor": "XT-002", "Assembly of Iron": "IC", Kologarn: "Kolo",
    Auriaya: "Auriaya", Hodir: "Hodir", Thorim: "Thorim", Freya: "Freya", Mimiron: "Mim",
    "General Vezax": "Vezax", "Yogg-Saron": "Yogg", "Algalon the Observer": "Algalon",
    "Northrend Beasts": "Beasts", "Lord Jaraxxus": "Jarax", "Faction Champions": "FC",
    "Twin Val'kyr": "Twins", "Anub'arak": "Anub",
    "Lord Marrowgar": "Marrow", "Lady Deathwhisper": "LDW", "Gunship Battle": "Gunship",
    "Deathbringer Saurfang": "DBS", Festergut: "Fester", Rotface: "Rot",
    "Professor Putricide": "Putri", "Blood Prince Council": "BPC", "Blood-Queen Lana'thel": "BQL",
    "Valithria Dreamwalker": "Valithria", Sindragosa: "Sindra", "The Lich King": "LK",
  };
  function shortBoss(b) {
    return BOSS_SHORT[b] || b;
  }
  // WoW lockout week starts Wednesday (UTC) — the same grouping the rankings uses.
  function lockoutStart(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return String(iso);
    var back = (d.getUTCDay() - 3 + 7) % 7;
    var s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
    return s.toISOString().slice(0, 10);
  }
  // stable pick from a quip pool, seeded by a string (same subject -> same line, no flicker)
  function pickLine(pool, seed) {
    var s = 0,
      str = String(seed || "");
    for (var i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) | 0;
    return pool[Math.abs(s) % pool.length];
  }

  function RatsFun(DATA) {
    if (!root.RatsLogs) throw new Error("RatsFun needs RatsLogs (logs-core.js) loaded first.");
    var L = root.RatsLogs(DATA);
    var Q = root.RATS_QUIPS || {};
    var QUIPS = { ghost: Q.ghost || ["where'd you go? 👻"] };
    var normNm = L.normNm;

    // keep only the fights matching the active difficulty on split raids (ToC/ICC) — same as rankings.
    function filterByDiff(logs, raid, diff) {
      if (!SPLIT_DIFF_RAIDS[raid]) return logs;
      var wantHC = diff === "hc";
      return logs
        .map(function (l) {
          if (!(l.bfights && l.bfights.length)) return l; // legacy — leave as-is
          var bf = l.bfights.filter(function (f) {
            return !!f.hm === wantHC;
          });
          if (!bf.length) return null;
          return {
            reportId: l.reportId, reportUrl: l.reportUrl, raid: l.raid, raidSlug: l.raidSlug,
            size: l.size, date: l.date, uploadedAt: l.uploadedAt, fangs: l.fangs,
            bfights: bf,
            bosses: bf.filter(function (f) { return f.kill; }).map(function (f) { return f.bn; }),
            kills: bf.filter(function (f) { return f.kill; }).length,
            wipes: bf.filter(function (f) { return !f.kill; }).length,
            rows: l.rows || [],
          };
        })
        .filter(Boolean);
    }

    // who has led the boards for the most consecutive lockouts (the 👑 crown streak)
    function computeStreaks(raid, size) {
      var rObj = (DATA.raids || []).filter(function (r) { return r.key === raid; })[0];
      var rKeys = [raid, rObj && rObj.label].filter(Boolean).map(function (x) {
        return String(x).toLowerCase();
      });
      var scoped = (DATA.logs || []).filter(function (l) {
        if (String(l.size) !== size) return false;
        return rKeys.indexOf(String(l.raid).toLowerCase()) >= 0 || rKeys.indexOf(String(l.raidSlug).toLowerCase()) >= 0;
      });
      var groups = {};
      scoped.forEach(function (l) {
        var k = lockoutStart(l.date);
        (groups[k] = groups[k] || []).push(l);
      });
      var keys = Object.keys(groups).sort(); // oldest → newest
      if (keys.length < 1) return { dps: 0, hps: 0 };
      var leadDps = [],
        leadHps = [];
      keys.forEach(function (k) {
        var d = L.aggregate(groups[k], false, 1); // any parse counts within one lockout
        var h = L.aggregate(groups[k], true, 1);
        leadDps.push(d[0] ? normNm(d[0].name) : null);
        leadHps.push(h[0] ? normNm(h[0].name) : null);
      });
      function trail(arr) {
        var last = arr[arr.length - 1];
        if (!last) return { name: null, count: 0 };
        var n = 0;
        for (var i = arr.length - 1; i >= 0; i--) {
          if (arr[i] === last) n++;
          else break;
        }
        return { name: last, count: n };
      }
      return { dps: trail(leadDps), hps: trail(leadHps) };
    }

    // ---- the award computation. Returns { awards:[A], shame:[A] } (data, never HTML). ----
    // deaths/damageTaken/interrupts/pots ship per fight (API, 2026-07-16) — those boards gate on
    // non-null rows, so they appear only once re-fetched logs carry the fields (see WOWLOGS_API.md).
    function compute(opts) {
      opts = opts || {};
      var raid = opts.raid,
        size = opts.size || "25",
        diff = opts.diff || "nm",
        period = opts.period || "all";
      L.setData(DATA).setScope({ raid: raid, size: size, diff: diff });
      var logs = filterByDiff(L.logsInScope(period), raid, diff);

      var A = function (emoji, title, name, cls, sub, shame) {
        return {
          emoji: emoji, title: title, winner: name, winnerKey: normNm(name),
          cls: cls || "", sub: sub, shame: !!shame,
        };
      };

      // how many distinct raid nights (lockouts) are in scope — "perfect attendance" is only meaningful
      // across MULTIPLE raids (in a single-raid week, everyone who came was in "every" kill — trivial).
      var lockSet = {};
      logs.forEach(function (l) { lockSet[lockoutStart(l.date)] = 1; });
      var lockCount = Object.keys(lockSet).length;
      var guild = L.rosterSet();
      var isGuildie = function (n) {
        if (!guild) return true;
        var id = L.resolveIdentity(n, "");
        return guild[id.key] || guild[normNm(n)];
      };

      // gather per-PERSON DPS parses (kills only, guildies, non-tank) and the guild totals.
      var perPerson = {}, perHealer = {}, presence = {}, bossBest = {};
      var raidTotalDmg = 0, raidTotalHeal = 0;
      function faceOf(map, id, r) {
        var e = map[id.key] || (map[id.key] = { fights: 0, dpsList: [], sumDmg: 0, sumHeal: 0, byBoss: {}, faces: {} });
        var fc = e.faces[normNm(r.n)] || (e.faces[normNm(r.n)] = { name: r.n, cls: r.c, spec: r.s, n: 0 });
        fc.n++;
        return e;
      }
      logs.forEach(function (l) {
        L.rowsForDiff(l.rows).forEach(function (r) {
          if (!isGuildie(r.n)) return;
          var tk = normNm(r.n);
          var id = L.resolveIdentity(r.n, r.c);
          // presence = attended this kill in ANY role (a raider who TANKED still counts as present)
          var pr = presence[id.key] || (presence[id.key] = { kills: 0, name: r.n, cls: r.c });
          pr.kills++;
          // Role is decided PER FIGHT (r.r), not by the toon's dominant/roster role. Using the roster
          // main-spec meant a dps-spec player who HEALED a night had those fights counted as dps with
          // ~0 damage: Tchilly (main-spec Shadow) healed a whole ToC 10 and was handed the "Last one
          // standing" shame award for "avg 37 DPS". Same rule as the leaderboard, so they agree.
          if (r.r === "HEALER") {
            raidTotalHeal += r.heal || 0;
            var h = faceOf(perHealer, id, r);
            h.sumHeal += r.heal || 0;
            return;
          }
          if (L.isTankFight(r)) return; // tanks out of the DPS awards
          raidTotalDmg += r.dmg || 0;
          var e = faceOf(perPerson, id, r);
          e.fights++;
          e.sumDmg += r.dmg || 0;
          e.dpsList.push(r.d || 0);
          if (!e.byBoss[r.b] || (r.d || 0) > e.byBoss[r.b]) e.byBoss[r.b] = r.d || 0;
          if ((r.d || 0) > (bossBest[r.b] || 0)) bossBest[r.b] = r.d || 0;
        });
      });
      // resolve each person's "face" toon (the one with most fights on that role)
      function resolveFaces(map) {
        return Object.keys(map).map(function (k) {
          var e = map[k], face = null;
          Object.keys(e.faces).forEach(function (t) {
            if (!face || e.faces[t].n > face.n) face = e.faces[t];
          });
          e.key = k;
          e.name = face.name;
          e.cls = face.cls;
          e.spec = face.spec;
          return e;
        });
      }
      var toons = resolveFaces(perPerson);
      var healers = resolveFaces(perHealer);
      var maxFights = toons.reduce(function (m, t) { return Math.max(m, t.fights); }, 0);

      var awards = [];
      // podium runners-up: the rankings grid only ever shows the winner, but a profile can also show
      // "🥈 2nd" / "🥉 3rd" — three people get a badge instead of one. Marked with rank so the rankings
      // page can keep rendering rank-1 only (it filters on `a.rank > 1`).
      var podium = [];
      var P = function (emoji, title, e, cls, sub, rank) {
        var c = A(emoji, title, e, cls, sub);
        c.rank = rank;
        return c;
      };
      var MEDAL = { 2: "🥈", 3: "🥉" };
      var ORD = { 2: "2nd", 3: "3rd" };

      // 🌊 The Baker — highest share of the guild's total damage (carries the raid). Top 3 → podium.
      if (raidTotalDmg > 0 && toons.length) {
        var byDamage = toons.slice().sort(function (a, b) { return b.sumDmg - a.sumDmg; });
        var baker = byDamage[0];
        var share = Math.round((baker.sumDmg / raidTotalDmg) * 1000) / 10;
        awards.push(A("🌊", "The Baker", baker.name, baker.cls,
          "<b>" + share + "%</b> of all guild damage · " + fmtBig(baker.sumDmg)));
        byDamage.slice(1, 3).forEach(function (t, i) {
          var r = i + 2;
          var sh = Math.round((t.sumDmg / raidTotalDmg) * 1000) / 10;
          podium.push(P(MEDAL[r], "The Baker", t.name, t.cls,
            ORD[r] + " biggest damage share · <b>" + sh + "%</b> · " + fmtBig(t.sumDmg), r));
        });
      }

      // 💚 The Medic — healer with the biggest share of total guild healing. Top 3 → podium.
      if (raidTotalHeal > 0 && healers.length) {
        var byHeal = healers.slice().sort(function (a, b) { return b.sumHeal - a.sumHeal; });
        var medic = byHeal[0];
        var hshare = Math.round((medic.sumHeal / raidTotalHeal) * 1000) / 10;
        awards.push(A("💚", "The Medic", medic.name, medic.cls,
          "<b>" + hshare + "%</b> of all guild healing · " + fmtBig(medic.sumHeal)));
        byHeal.slice(1, 3).forEach(function (t, i) {
          var r = i + 2;
          var sh = Math.round((t.sumHeal / raidTotalHeal) * 1000) / 10;
          podium.push(P(MEDAL[r], "The Medic", t.name, t.cls,
            ORD[r] + " biggest healing share · <b>" + sh + "%</b> · " + fmtBig(t.sumHeal), r));
        });
      }

      // 🎯 Mr. Reliable — steady AND GOOD. Low variance only impresses above the guild average, so we
      // consider players at/above the mean, then pick the steadiest (lowest coefficient of variation).
      var withSpread = toons.filter(function (t) { return t.fights >= 3; }).map(function (t) {
        var mean = t.dpsList.reduce(function (a, b) { return a + b; }, 0) / t.fights;
        var varc = t.dpsList.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / t.fights;
        return { t: t, cv: mean > 0 ? Math.sqrt(varc) / mean : 1, mean: mean };
      });
      var guildAvgDps = withSpread.length
        ? withSpread.reduce(function (a, b) { return a + b.mean; }, 0) / withSpread.length
        : 0;
      var goodSteady = withSpread.filter(function (x) { return x.mean >= guildAvgDps; });
      if (goodSteady.length) {
        var steady = goodSteady.slice().sort(function (a, b) { return a.cv - b.cv; })[0];
        awards.push(A("🎯", "Mr. Reliable", steady.t.name, steady.t.cls,
          "high &amp; steady · <b>" + fmt(Math.round(steady.mean)) + "</b> DPS every raid, no off nights"));
      }
      if (withSpread.length) {
        // 🎲 Wildcard — highest variance (roulette)
        var wild = withSpread.slice().sort(function (a, b) { return b.cv - a.cv; })[0];
        if (!goodSteady.length || wild.t !== goodSteady.slice().sort(function (a, b) { return a.cv - b.cv; })[0].t)
          awards.push(A("🎲", "The Wildcard", wild.t.name, wild.t.cls,
            "hot-or-cold — biggest swings raid to raid"));
      }

      // 🎸 One-trick pony — biggest gap between a player's best boss and their own average (≥3 kills so
      // it's a real pattern, not one lucky parse).
      var tricks = toons.filter(function (t) { return t.fights >= 3; }).map(function (t) {
        var mean = t.dpsList.reduce(function (a, b) { return a + b; }, 0) / t.fights;
        var bestBoss = "", bestV = 0;
        Object.keys(t.byBoss).forEach(function (b) {
          if (t.byBoss[b] > bestV) { bestV = t.byBoss[b]; bestBoss = b; }
        });
        return { t: t, ratio: mean > 0 ? bestV / mean : 1, boss: bestBoss };
      });
      if (tricks.length) {
        var trick = tricks.slice().sort(function (a, b) { return b.ratio - a.ratio; })[0];
        if (trick.ratio >= 1.4)
          awards.push(A("🎸", "One-trick pony", trick.t.name, trick.t.cls,
            "a god on <b>" + esc(shortBoss(trick.boss)) + "</b>, mortal elsewhere"));
      }

      // 📈 Overachiever — beats the guild median-best on the MOST bosses (good everywhere).
      var bossMed = {};
      Object.keys(bossBest).forEach(function (b) {
        var vals = toons.map(function (t) { return t.byBoss[b] || 0; })
          .filter(function (x) { return x > 0; })
          .sort(function (a, c) { return a - c; });
        bossMed[b] = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
      });
      if (toons.length > 2) {
        var over = toons.map(function (t) {
          var n = 0;
          Object.keys(t.byBoss).forEach(function (b) { if (t.byBoss[b] >= (bossMed[b] || 0)) n++; });
          return { t: t, n: n, cov: Object.keys(t.byBoss).length };
        }).filter(function (x) { return x.cov >= 3; })
          .sort(function (a, b) { return b.n / b.cov - a.n / a.cov || b.n - a.n; })[0];
        if (over && over.n >= 3)
          awards.push(A("📈", "Overachiever", over.t.name, over.t.cls,
            "above par on <b>" + over.n + "</b> of " + over.cov + " bosses"));
      }

      // 🐺 Lone wolf — most total damage carried (volume × presence), the workhorse. Skips the Baker
      // (same person, different angle) and takes the runner-up instead.
      if (toons.length) {
        var byDmg = toons.slice().sort(function (a, b) { return b.sumDmg - a.sumDmg; });
        var wolf = byDmg[0];
        var bakerName = raidTotalDmg > 0 ? byDmg[0].name : null;
        var wolfPick = wolf.name === bakerName && toons.length > 1 ? byDmg[1] : wolf;
        awards.push(A("🐺", "Lone wolf", wolfPick.name, wolfPick.cls,
          "<b>" + fmtBig(wolfPick.sumDmg) + "</b> damage over <b>" + wolfPick.fights + "</b> kills"));
      }

      // ⚡ On strike — tops the meters on the MOST bosses (holds #1 everywhere).
      if (toons.length > 2 && Object.keys(bossBest).length) {
        var strike = toons.map(function (t) {
          var n = 0;
          Object.keys(t.byBoss).forEach(function (b) { if (t.byBoss[b] >= (bossBest[b] || 0)) n++; });
          return { t: t, n: n };
        }).sort(function (a, b) { return b.n - a.n; })[0];
        if (strike && strike.n >= 2)
          awards.push(A("⚡", "On strike", strike.t.name, strike.t.cls,
            "#1 on <b>" + strike.n + "</b> boss" + (strike.n !== 1 ? "es" : "") + " — untouchable at the top"));
      }

      // 🏅 On a streak — topped the board multiple lockouts IN A ROW (the persistent 👑 crown).
      var streaks = computeStreaks(raid, size);
      [{ s: streaks.dps, unit: "DPS" }, { s: streaks.hps, unit: "healing" }].forEach(function (o) {
        if (o.s && o.s.name && o.s.count >= 2) {
          var face = null;
          toons.concat(healers).forEach(function (t) {
            if (normNm(t.name) === o.s.name) face = t;
          });
          var nm = face ? face.name : o.s.name;
          var cl = face ? face.cls : "";
          awards.push(A("🏅", "On a streak", nm, cl,
            "held <b>#1 " + o.unit + "</b> for <b>" + o.s.count + "</b> raids straight"));
        }
      });

      // ---- SPECIALITY: top of your own lane, not of the whole guild. A hunter is never going to
      // out-damage the raid's best mage, but they can be the best hunter — so these open a podium per
      // class and per role, and a lot more people end up holding something. ----
      //
      // These are PROFILE-ONLY: they go in their own `speciality` bucket, NOT in `awards`. The public
      // Fun & shame grid reads `awards` and would otherwise be swamped with a "Best <Class>" card for
      // every class — that per-class breakdown belongs on a player's own profile, not the guild wall.
      // The profile page folds `speciality` back in (forRaider), so nobody loses a badge.
      var speciality = [];
      var S = function (emoji, title, e, cls, sub) { speciality.push(A(emoji, title, e, cls, sub)); };

      // 🛡️ The Wall — the tank in the most tanked fights (tanks are invisible in every DPS award).
      var tankTally = {};
      logs.forEach(function (l) {
        L.rowsForDiff(l.rows).forEach(function (r) {
          if (!isGuildie(r.n) || !L.isTankFight(r)) return;
          var id = L.resolveIdentity(r.n, r.c);
          var e = tankTally[id.key] || (tankTally[id.key] = { n: 0, name: r.n, cls: r.c, bosses: {} });
          e.n++;
          e.bosses[r.b] = 1;
        });
      });
      var tanks = Object.keys(tankTally).map(function (k) { return tankTally[k]; });
      if (tanks.length) {
        var wall = tanks.slice().sort(function (a, b) { return b.n - a.n; })[0];
        if (wall.n >= 3)
          S("🛡️", "The Wall", wall.name, wall.cls,
            "held the boss on <b>" + Object.keys(wall.bosses).length + "</b> fights — <b>" + wall.n + "</b> tanked kills");
      }

      // 🥇 Best <Class> — top average DPS (or HPS for healers) WITHIN each class. One per class, so
      // every class in the raid produces a holder.
      function classChamps(list, valueOf, label, emoji, minFights, fmtVal) {
        fmtVal = fmtVal || function (v) { return fmt(Math.round(v)); };
        var byCls = {};
        list.forEach(function (t) {
          // healers never increment `fights` (only DPS rows do) — so gate them on having any value.
          if (!t.cls || t.fights < (minFights || 0) || !valueOf(t)) return;
          (byCls[t.cls] = byCls[t.cls] || []).push(t);
        });
        Object.keys(byCls).forEach(function (cls) {
          var peers = byCls[cls];
          if (peers.length < 2) return; // a solo class isn't a contest — no badge
          var best = peers.slice().sort(function (a, b) { return valueOf(b) - valueOf(a); })[0];
          S(emoji, "Best " + cls, best.name, cls,
            "top " + label + " of <b>" + peers.length + "</b> " + esc(cls) + "s · <b>" +
            fmtVal(valueOf(best)) + "</b>");
        });
      }
      classChamps(toons, function (t) {
        return t.fights ? t.dpsList.reduce(function (a, b) { return a + b; }, 0) / t.fights : 0;
      }, "DPS", "🥇", 2, fmt);
      classChamps(healers, function (t) {
        return t.sumHeal;
      }, "healing", "🥇", 0, fmtBig);

      // 👑 Perfect attendance — in EVERY kill of the scope (any role), across ≥2 raid nights.
      var presAward = Object.keys(presence).map(function (k) { return presence[k]; });
      var maxPres = presAward.reduce(function (m, p) { return Math.max(m, p.kills); }, 0);
      if (maxPres > 1 && lockCount >= 2) {
        var present = presAward.filter(function (p) { return p.kills === maxPres; });
        if (present.length === 1) {
          awards.push(A("👑", "Perfect attendance", present[0].name, present[0].cls,
            "in all <b>" + maxPres + "</b> kills — never missed"));
        } else if (present.length > 1) {
          // several — one summary card for the whole crew (no class colour on a count)
          awards.push(A("👑", "Perfect attendance", present.length + " raiders", "",
            "never missed a kill · <b>" + maxPres + "/" + maxPres + "</b> each 🧀"));
        }
      }

      // ---- per-fight extras (deaths / damageTaken / interrupts / pots) — the API ships these since
      // 2026-07-16, so rows saved before then carry null. Every board here GATES on non-null rows and
      // simply stays hidden until real data flows in (never render a zero board).
      var xtr = {}; // key -> { deaths, dt, ints, pots, prepots, nRows, maxDt, name, cls }
      var xtrRows = 0; // rows that actually carry the new fields
      logs.forEach(function (l) {
        L.rowsForDiff(l.rows).forEach(function (r) {
          if (!isGuildie(r.n)) return;
          if (r.dth == null && r.dt == null && r.int == null && r.pots == null) return;
          xtrRows++;
          var id = L.resolveIdentity(r.n, r.c);
          var e = xtr[id.key] || (xtr[id.key] = {
            deaths: 0, dt: 0, ints: 0, pots: 0, prepots: 0, nRows: 0, dpsRows: 0, dpsDt: 0,
            tankRows: 0, tankDeaths: 0, tankDthRows: 0, tankDt: 0,
            name: r.n, cls: r.c, tankish: false,
          });
          e.nRows++;
          e.deaths += r.dth || 0;
          e.dt += r.dt || 0;
          e.ints += r.int || 0;
          e.pots += r.pots || 0;
          if (r.prepot) e.prepots++;
          if (L.isTankFight(r)) {
            e.tankish = true; // tanked at least one fight — out of the squishy award
            // Faction Champions has no boss to tank (PvP scramble) — it neither counts as a tanked
            // fight nor can a death there cost the Immortal Wall.
            if (r.b !== "Faction Champions") {
              e.tankRows++;
              e.tankDeaths += r.dth || 0;
              // Deaths are only KNOWN on rows where the API actually reported them. `dth` is null on
              // most rows (the field shipped late), and `null || 0` reads as "died 0 times" -- which
              // is how a tank who wiped on heroic still collected the deathless Immortal Wall. Count
              // the rows we can vouch for, so the award can demand real evidence instead of silence.
              if (r.dth != null) e.tankDthRows++;
              e.tankDt += r.dt || 0;
            }
          } else if (r.r !== "HEALER") { e.dpsRows++; e.dpsDt += r.dt || 0; }
        });
      });
      var xtras = Object.keys(xtr).map(function (k) { return xtr[k]; });

      // 🗡️ Kick Master — most interrupts across the scope (a real skill signal, not a meter).
      if (xtrRows) {
        var kick = xtras.slice().sort(function (a, b) { return b.ints - a.ints; })[0];
        if (kick && kick.ints >= 5)
          awards.push(A("🗡️", "Kick Master", kick.name, kick.cls,
            "<b>" + kick.ints + "</b> interrupts — nothing gets a cast off 🤫"));
      }

      // 🧱 Immortal Wall — the tank who held the most fights WITHOUT ever dying. Deathless is the
      // whole point: a runner-up with more fights but a death doesn't beat a clean sheet.
      //
      // "Deathless" must be PROVEN, not assumed from missing data. `dth` is null on most rows (the
      // API shipped deaths late), and summing with `|| 0` made an unreported death look like a clean
      // sheet -- a tank who wiped repeatedly on heroic still collected the badge. So we require a
      // real sample of rows where deaths were actually reported (tankDthRows), and count the clean
      // sheet only across those. No death data at all -> no award, rather than a false one.
      if (xtrRows) {
        var immortal = xtras
          .filter(function (e) {
            return e.tankDthRows >= 3 && e.tankDeaths === 0;
          })
          .sort(function (a, b) { return b.tankDthRows - a.tankDthRows || b.tankDt - a.tankDt; })[0];
        if (immortal)
          awards.push(A("🧱", "Immortal Wall", immortal.name, immortal.cls,
            "tanked <b>" + immortal.tankDthRows + "</b> fights · soaked <b>" + fmtBig(immortal.tankDt) +
            "</b> damage · died <b>0</b> times — unbreakable 🐀"));
      }

      // 🍺 Drunkest Rat — most combat pots (potionsUsed excludes flasks/food by API design — exactly
      // the "pots, not flasks" rule). GATED until wow-logs actually populates the counts: our logs
      // currently return all-zero consumables (dev fixing) — the card appears the first raid it works.
      if (xtrRows) {
        var drunk = xtras.slice().sort(function (a, b) { return b.pots - a.pots; })[0];
        if (drunk && drunk.pots >= 3)
          awards.push(A("🍺", "Drunkest Rat", drunk.name, drunk.cls,
            "chugged <b>" + drunk.pots + "</b> combat pots" +
            (drunk.prepots ? " · pre-potted <b>" + drunk.prepots + "</b>×" : "") + " — hic! 🧀"));
      }

      // ---- SHAME (playful, rat voice). One person can hold only ONE shame card. ----
      // Limited to signals we CAN trust — attendance and a consistently low AVERAGE. Plus, since the
      // API ships `deaths`/`damageTaken` (2026-07-16), the floor-hugger and squishy cards below.
      var shame = [];
      var shamed = {};
      function addShame(name, card) {
        var k = normNm(name);
        if (shamed[k]) return; // already shamed elsewhere — don't pile on
        shamed[k] = true;
        shame.push(card);
      }

      // 💀 Floor inspector — most deaths across the scope's kills. Needs a clear lead (≥3 deaths)
      // so one unlucky night doesn't brand anyone. Gated on real data (rows carry `dth` non-null).
      if (xtrRows && xtras.length > 2) {
        var dead = xtras.slice().sort(function (a, b) { return b.deaths - a.deaths; })[0];
        if (dead && dead.deaths >= 3)
          addShame(dead.name, A("💀", "Floor inspector", dead.name, dead.cls,
            "died <b>" + dead.deaths + "</b> times — the floor is not lava, stop testing it", true));
      }

      // 🩸 Squishiest rat — the DPS who ate the most damage per fight. Tank-suspects are excluded:
      // the API has no TANK role, so anyone flagged tanking a fight (isTankFight) sits this one out —
      // eating hits is their job. Uses per-fight average so attendance doesn't decide it.
      if (xtrRows && xtras.length > 2) {
        var squishies = xtras
          .filter(function (e) { return !e.tankish && e.dpsRows >= 3; })
          .map(function (e) { return { e: e, avg: e.dpsDt / e.dpsRows }; })
          .sort(function (a, b) { return b.avg - a.avg; });
        for (var qi = 0; qi < squishies.length; qi++) {
          if (shamed[normNm(squishies[qi].e.name)]) continue;
          var sq = squishies[qi];
          addShame(sq.e.name, A("🩸", "Squishiest rat", sq.e.name, sq.e.cls,
            "ate <b>" + fmtBig(Math.round(sq.avg)) + "</b> damage per fight — the fire is not a buff", true));
          break;
        }
      }

      // 💤 Raid ghost — fewest kills attended (any role), and well below the pack (< 60% of max).
      var pres = Object.keys(presence).map(function (k) { return presence[k]; });
      var maxPresence = pres.reduce(function (m, p) { return Math.max(m, p.kills); }, 0);
      if (maxPresence > 1 && pres.length > 2) {
        var ghost = pres.slice().sort(function (a, b) { return a.kills - b.kills; })[0];
        if (ghost.kills < maxPresence * 0.6)
          addShame(ghost.name, A("💤", "Raid ghost", ghost.name, ghost.cls,
            "only <b>" + ghost.kills + "</b>/" + maxPresence + " kills — " +
            esc(pickLine(QUIPS.ghost, ghost.name)), true));
      }

      // 🪑 Last one standing — a DPS REGULAR with the lowest AVERAGE dps (part-time tanks excluded).
      // (🍺 is reserved for the Drunkest Rat consumables award.)
      var dpsRegulars = toons.filter(function (t) {
        if (t.fights < Math.max(3, Math.ceil(maxFights / 2))) return false; // must be a regular
        var totalKills = presence[t.key] ? presence[t.key].kills : t.fights;
        return t.fights >= totalKills * 0.7; // played DPS in ≥70% of their kills
      });
      if (dpsRegulars.length > 2) {
        var ranked = dpsRegulars
          .map(function (t) {
            return { t: t, avg: t.dpsList.reduce(function (a, b) { return a + b; }, 0) / t.fights };
          })
          .sort(function (a, b) { return a.avg - b.avg; });
        for (var si = 0; si < ranked.length; si++) {
          if (shamed[normNm(ranked[si].t.name)]) continue;
          var sl = ranked[si];
          addShame(sl.t.name, A("🪑", "Last one standing", sl.t.name, sl.t.cls,
            "last on the ranks · avg <b>" + fmt(Math.round(sl.avg)) +
            "</b> DPS — time to shape up, rat 🐀📈", true));
          break;
        }
      }

      // 🧊 Ice cold — below the guild median on the MOST bosses (consistently cold, not one bad parse).
      if (toons.length > 2) {
        var cold = toons
          .map(function (t) {
            var below = 0, cov = Object.keys(t.byBoss).length;
            Object.keys(t.byBoss).forEach(function (b) {
              if (t.byBoss[b] < (bossMed[b] || 0)) below++;
            });
            return { t: t, below: below, cov: cov, ratio: cov ? below / cov : 0 };
          })
          .filter(function (x) { return x.cov >= 3 && !shamed[normNm(x.t.name)]; })
          .sort(function (a, b) { return b.ratio - a.ratio || b.below - a.below; })[0];
        if (cold && cold.below >= 3)
          addShame(cold.t.name, A("🧊", "Ice cold", cold.t.name, cold.t.cls,
            "below par on <b>" + cold.below + "</b> of " + cold.cov + " bosses — time to warm up 🔥", true));
      }

      return { awards: awards, shame: shame, podium: podium, speciality: speciality };
    }

    // ---- PERSONAL MILESTONES — earned alone, against a threshold, not against the guild. Nobody is
    // beaten when you earn one, so a quiet raider still fills their Honours panel. Computed over ALL
    // this person's rows (every raid/size), folding alts into the main.
    var MILESTONES = [
      { n: 10, emoji: "🐀", title: "Sewer-tested", sub: "<b>10</b> bosses down with the guild" },
      { n: 25, emoji: "🧀", title: "Cheese earner", sub: "<b>25</b> bosses down with the guild" },
      { n: 50, emoji: "⚔️", title: "Veteran of the pack", sub: "<b>50</b> bosses down with the guild" },
      { n: 100, emoji: "🏰", title: "Pillar of the guild", sub: "<b>100</b> bosses down with the guild" },
    ];
    function personalFor(name) {
      var meKey = L.resolveIdentity(name, "").key || normNm(name);
      var out = [];
      var kills = 0, bestDps = 0, bestHps = 0, bossSet = {}, raidSet = {}, hmKills = 0;
      (DATA.logs || []).forEach(function (l) {
        (l.rows || []).forEach(function (r) {
          if ((L.resolveIdentity(r.n, r.c).key || normNm(r.n)) !== meKey) return;
          kills++;
          if ((r.d || 0) > bestDps) bestDps = r.d || 0;
          if ((r.heal || 0) > bestHps) bestHps = r.heal || 0;
          if (r.b) bossSet[r.b] = 1;
          if (r.hm) hmKills++;
          if (l.raidSlug || l.raid) raidSet[String(l.raidSlug || l.raid).toLowerCase()] = 1;
        });
      });
      if (!kills) return out;

      // boss-count milestone — the highest tier reached (not every tier below it)
      var reached = MILESTONES.filter(function (m) { return kills >= m.n; }).pop();
      if (reached) out.push({ emoji: reached.emoji, title: reached.title, sub: reached.sub, scope: "All raids" });

      // 🗺️ Well travelled — killed bosses across 2+ different raid instances
      var nRaids = Object.keys(raidSet).length;
      if (nRaids >= 2)
        out.push({ emoji: "🗺️", title: "Well travelled", scope: "All raids",
          sub: "cleared bosses in <b>" + nRaids + "</b> different raids" });

      // 🔨 Hard-mode rat — has hard-mode kills to their name
      if (hmKills >= 3)
        out.push({ emoji: "🔨", title: "Hard-mode rat", scope: "All raids",
          sub: "<b>" + hmKills + "</b> hard-mode kills — the guild takes the hard road" });

      // 🎖️ Boss slayer — distinct bosses seen (breadth, not repetition)
      var nBosses = Object.keys(bossSet).length;
      if (nBosses >= 8)
        out.push({ emoji: "🎖️", title: "Boss slayer", scope: "All raids",
          sub: "<b>" + nBosses + "</b> different bosses slain" });

      return out;
    }

    // ---- RAID PROGRESSION — collective. Everyone in the kill gets it, so a whole roster can hold the
    // same badge. "Cleared X" = present for every boss the guild has killed in that raid.
    function progressFor(name) {
      var meKey = L.resolveIdentity(name, "").key || normNm(name);
      var out = [];
      (DATA.raids || []).forEach(function (rObj) {
        var raid = rObj.key || rObj.slug;
        ["25", "10"].forEach(function (size) {
          L.setData(DATA).setScope({ raid: raid, size: size, diff: "nm" });
          var logs = L.logsInScope("all");
          if (!logs.length) return;
          var guildBosses = {}, mine = {};
          logs.forEach(function (l) {
            (l.bosses || []).forEach(function (b) { guildBosses[b] = 1; });
            (l.rows || []).forEach(function (r) {
              if ((L.resolveIdentity(r.n, r.c).key || normNm(r.n)) !== meKey) return;
              if (r.b) mine[r.b] = 1;
            });
          });
          var total = Object.keys(guildBosses).length;
          if (total < 3) return; // too little killed to call it a clear
          var got = Object.keys(guildBosses).filter(function (b) { return mine[b]; }).length;
          if (got < total) return; // wasn't there for every boss the guild downed
          out.push({
            emoji: "🏆", title: "Cleared " + ((rObj && rObj.label) || raid),
            scope: ((rObj && rObj.label) || raid) + " " + size,
            sub: "present for all <b>" + total + "</b> bosses the guild has downed",
          });
        });
      });
      return out;
    }

    // Every POSITIVE award this person currently holds, across every raid/size they played. Alt toons
    // fold into the main, so a person's awards show on any of their toons' profiles.
    // Returns [{ emoji, title, sub, scope }] — scope = "Ulduar 25" etc, for the badge subline.
    function forRaider(name, opts) {
      opts = opts || {};
      var meKey = L.resolveIdentity(name, "").key || normNm(name);
      var raids = (DATA.raids || []).map(function (r) { return r.key || r.slug; });
      var sizes = opts.sizes || ["25", "10"];
      var out = [];
      var seen = {};
      raids.forEach(function (raid) {
        sizes.forEach(function (size) {
          var diffs = SPLIT_DIFF_RAIDS[raid] ? ["nm", "hc"] : ["nm"];
          diffs.forEach(function (diff) {
            var res;
            try {
              res = compute({ raid: raid, size: size, diff: diff, period: opts.period || "all" });
            } catch (e) {
              return;
            }
            // wins first, then the podium runner-ups, then the speciality "Best <Class>"/tank badges
            // (public grid hides those, but the profile is exactly where they belong) — `seen` keeps
            // only the first card per title, so a 1st place always beats a 2nd on the same title.
            res.awards.concat(res.podium || [], res.speciality || []).forEach(function (a) {
              // the winner is stored by their FACE toon name — resolve to the person before matching
              var wKey = L.resolveIdentity(a.winner, a.cls).key || a.winnerKey;
              if (wKey !== meKey) return;
              if (seen[a.title]) return; // one card per award title (keep the first/biggest scope)
              seen[a.title] = 1;
              var rObj = (DATA.raids || []).filter(function (r) { return (r.key || r.slug) === raid; })[0];
              var lbl = (rObj && rObj.label) || raid;
              out.push({
                emoji: a.emoji, title: a.title, sub: a.sub, rank: a.rank || 1,
                scope: lbl + " " + size + (SPLIT_DIFF_RAIDS[raid] && diff === "hc" ? " HC" : ""),
              });
            });
          });
        });
      });

      // fold in the non-competitive honours, then cap. Order = rarity: an outright win first, then a
      // podium place, then a raid clear, then a personal milestone (which everyone eventually earns).
      // The cap keeps a stacked raider's panel from dwarfing everyone else's.
      var CAP = opts.cap || 5;
      var extras = [];
      try { extras = progressFor(name).concat(personalFor(name)); } catch (e) { extras = []; }
      var wins = out.filter(function (a) { return (a.rank || 1) === 1; });
      var seconds = out.filter(function (a) { return (a.rank || 1) > 1; });
      return wins.concat(seconds, extras).slice(0, CAP);
    }

    return {
      compute: compute, forRaider: forRaider,
      personalFor: personalFor, progressFor: progressFor,
      AWARD_HUE: AWARD_HUE,
    };
  }

  RatsFun.AWARD_HUE = AWARD_HUE;
  root.RatsFun = RatsFun;
})(typeof window !== "undefined" ? window : this);
