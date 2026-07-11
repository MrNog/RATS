/* RATS — Rankings & Hall of Fame. Public, logs-fed.
   Officer's gold Fetch (guild-key-gated) pulls the wow-logs API, computes, writes ONE `rankings`
   snapshot to Firebase. Visitors read that snapshot once per visit (TTL 30 min) and filter client-side
   — raid/size/period toggles never hit the network. Full spec in .claude/rules/rankings.md. */
(function () {
  "use strict";

  // Empty-state flavour — one fixed rat/cheese line shown whenever a filter has no logs yet.
  var RAT_JOKE = "Squeak. That's the sound of an empty leaderboard. Bring us logs! 🐀";
  function emptyRatHtml(title) {
    return (
      '<div class="emptyrat-in">' +
      '<div class="emptyrat-emoji">🧀</div>' +
      '<div class="emptyrat-title">' + esc(title) + "</div>" +
      '<div class="emptyrat-joke">' + esc(RAT_JOKE) + "</div>" +
      "</div>"
    );
  }

  var U = window.RatsUtils;
  var CLASS_COLOR = U.CLASS_COLOR,
    esc = U.esc,
    classColor = U.classColor;
  var fmt = function (n) {
    return Number(n || 0).toLocaleString("en-US");
  };
  // Short boss tags (sigla-style) so long names never truncate in tight columns (e.g. Records).
  var BOSS_SHORT = {
    // Ulduar
    "Flame Leviathan": "FL", "Ignis the Furnace Master": "Ignis", "Razorscale": "Razor",
    "XT-002 Deconstructor": "XT-002", "Assembly of Iron": "IC", "Kologarn": "Kolo",
    "Auriaya": "Auriaya", "Hodir": "Hodir", "Thorim": "Thorim", "Freya": "Freya", "Mimiron": "Mim",
    "General Vezax": "Vezax", "Yogg-Saron": "Yogg", "Algalon the Observer": "Algalon",
    // ToC
    "Northrend Beasts": "Beasts", "Lord Jaraxxus": "Jarax", "Faction Champions": "FC",
    "Twin Val'kyr": "Twins", "Anub'arak": "Anub",
    // ICC
    "Lord Marrowgar": "Marrow", "Lady Deathwhisper": "LDW", "Gunship Battle": "Gunship",
    "Deathbringer Saurfang": "DBS", "Festergut": "Fester", "Rotface": "Rot",
    "Professor Putricide": "Putri", "Blood Prince Council": "BPC", "Blood-Queen Lana'thel": "BQL",
    "Valithria Dreamwalker": "Valithria", "Sindragosa": "Sindra", "The Lich King": "LK",
  };
  function shortBoss(b) {
    return BOSS_SHORT[b] || b;
  }

  // Compact big numbers for totals: 21_737_114 → "21.7M", 9_000_000 → "9.0M", 843_000 → "843K".
  var fmtBig = function (n) {
    n = Number(n || 0);
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return Math.round(n / 1e3) + "K";
    return String(Math.round(n));
  };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var fmtDate = function (s) {
    if (!s) return "";
    var d = new Date(s);
    return isNaN(d) ? String(s) : d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear();
  };

  // Raids where Normal and Heroic are SEPARATE lockouts/runs (whole-instance difficulty), so Guild
  // Progress splits them via a Normal|Heroic toggle. Ulduar is NOT here: there hard mode is per-boss
  // within one lockout (towers/elders/firefighter), so it stays mixed with ✦HC/NM badges per boss.
  var SPLIT_DIFF_RAIDS = { toc: true, icc: true };

  // Canonical boss order per raid (from /meta/raids/{raid}/bosses, fetched once — static, never changes).
  // Used to sort killed bosses by the real raid path instead of kill order. Add ToC/ICC when needed.
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
    order.forEach(function (b, i) {
      idx[b] = i;
    });
    return names.slice().sort(function (a, b) {
      var ia = a in idx ? idx[a] : 999,
        ib = b in idx ? idx[b] : 999;
      return ia === ib ? a.localeCompare(b) : ia - ib;
    });
  }

  // WoW Wed→Wed lockout: anchor the week start on Wednesday (UTC). Two logs of the same reset
  // (e.g. a 25m split into #20922 + #20925) share a lockout key and merge into one accordion group.
  function lockoutStart(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return String(iso);
    var back = (d.getUTCDay() - 3 + 7) % 7; // days since last Wednesday
    var s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
    return s.toISOString().slice(0, 10);
  }

  // ---- time helpers (week-over-week comparison) ----
  var toSec = function (t) {
    if (t == null || t === "") return null;
    var p = String(t).split(":").map(Number);
    if (p.some(isNaN)) return null;
    return p.reduce(function (a, b) {
      return a * 60 + b;
    }, 0);
  };
  var fmtDur = function (s) {
    s = Math.abs(Math.round(s));
    var h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      ss = s % 60;
    return h ? h + "h " + m + "m" : m ? m + "m " + ss + "s" : ss + "s";
  };
  // delta vs previous; lowerIsBetter true for time/wipes. green(better)/red(worse)
  function cmp(cur, prev, lowerIsBetter, fmtFn, words) {
    if (cur == null || prev == null) return '<span class="d flat">—</span>';
    var d = cur - prev;
    if (d === 0) return '<span class="d flat">— same</span>';
    var better = lowerIsBetter ? d < 0 : d > 0;
    var arrow = (lowerIsBetter ? d < 0 : d > 0) ? "▼" : "▲";
    var w = words ? " " + (better ? words[0] : words[1]) : "";
    return '<span class="d ' + (better ? "good" : "bad") + '">' + arrow + " " + fmtFn(Math.abs(d)) + w + "</span>";
  }

  // ⬇⬇ The shape we ask the logs dev for — the page renders exactly this JSON (fallback while API is off). ⬇⬇
  // Empty shell — no mock data. The Logs tab is fed live by the officer Fetch (→ Firebase snapshot);
  // the other tabs (Leaderboards / Guild progress / Fun & shame) render empty until they're built.
  // `raids` drives the raid segment selector; keep the guild's progression order: Ulduar → ToC → ICC.
  var SAMPLE = {
    guild: "RATS",
    realm: "Onyxia",
    period: "all",
    generatedAt: null,
    raids: [
      { key: "ulduar", label: "Ulduar" },
      { key: "toc", label: "ToC" },
      { key: "icc", label: "ICC" },
    ],
    mvp: null,
    dps: [],
    hps: [],
    deaths: [],
    improved: [],
    bottom: [],
    funStats: {},
    progress: {},
    perBoss: [],
    records: [],
    wipes: [],
    awards: [],
    logs: [],
  };

  var DATA = SAMPLE;

  // Logs tab: group the already-filtered logs by lockout, merge multi-log runs, draw an accordion.
  function renderLogs(logs, raidLabel) {
    var el = document.getElementById("logs");
    if (!el) return;
    if (!logs.length) {
      el.innerHTML =
        '<div class="card" style="color:#6e7178">No ' + esc(raidLabel) + " " + SIZE + "-man logs in this period.</div>";
      return;
    }
    // group by lockout
    var groups = {};
    logs.forEach(function (l) {
      var k = lockoutStart(l.date);
      (groups[k] = groups[k] || { lock: k, logs: [] }).logs.push(l);
    });
    var keys = Object.keys(groups).sort().reverse();

    el.innerHTML = keys
      .map(function (k, gi) {
        var g = groups[k];
        g.logs.sort(function (a, b) {
          return new Date(a.date) - new Date(b.date);
        });
        // merge: union of bosses killed + best fangs count across the run
        var union = {},
          fangs = 0;
        g.logs.forEach(function (l) {
          (l.bosses || []).forEach(function (b) {
            union[b] = true;
          });
          if ((l.fangs || 0) > fangs) fangs = l.fangs;
        });
        var bossCount = Object.keys(union).length;
        var merged = g.logs.length > 1;
        var fangBadge =
          fangs >= 5
            ? ' <span class="lfangs" title="' + fangs + " Warchief's Fangs in this run\">💀 Fangs night</span>"
            : "";
        var mergedBadge = merged ? ' <span class="lmerge" title="Same lockout run">🔗 ' + g.logs.length + " logs</span>" : "";

        var rows = g.logs
          .map(function (l) {
            var del = IS_OFFICER
              ? '<button class="logdel" title="Delete this log from the DB (a later Fetch can re-pull it)" ' +
                'onclick="excludeLog(\'' +
                esc(l.reportId) +
                "')\">🗑</button>"
              : "";
            return (
              '<div class="logrowwrap">' +
              '<a class="logrow" href="' +
              esc(l.reportUrl) +
              '" target="_blank" rel="noopener">' +
              '<span class="lid">#' +
              esc(l.reportId) +
              "</span>" +
              '<span class="ldate">' +
              esc(fmtDate(l.date)) +
              "</span>" +
              '<span class="lkw"><b>' +
              (l.kills || 0) +
              "</b> kills · " +
              (l.wipes || 0) +
              " wipes</span>" +
              '<span class="lbosses">' +
              esc(sortBosses(l.bosses || [], l.raidSlug).join(", ") || "—") +
              "</span>" +
              '<span class="lgo">↗</span></a>' +
              del +
              "</div>"
            );
          })
          .join("");

        // merged summary line (only when >1 log) — bosses in canonical raid order
        var summary = merged
          ? '<div class="logsum">🏆 ' +
            bossCount +
            " unique bosses this run: " +
            esc(sortBosses(Object.keys(union), g.logs[0].raidSlug).join(", ")) +
            "</div>"
          : "";

        return (
          '<div class="lockgrp' +
          (gi === 0 ? " open" : "") +
          '">' +
          '<button class="lockhd" type="button" onclick="this.parentNode.classList.toggle(\'open\')">' +
          '<span class="lcaret">▶</span>' +
          '<span class="lraid">' +
          esc(g.logs[0].raid || raidLabel) +
          "</span>" +
          '<span class="llock">Lockout ' +
          esc(fmtDate(g.lock)) +
          "</span>" +
          mergedBadge +
          fangBadge +
          '<span class="lmeta">' +
          bossCount +
          " bosses · " +
          g.logs.length +
          " log" +
          (g.logs.length !== 1 ? "s" : "") +
          "</span></button>" +
          '<div class="lockbody">' +
          summary +
          rows +
          "</div></div>"
        );
      })
      .join("");
  }

  // Group a raid's scoped logs into WoW lockouts (Wed→Wed), newest first, each with merged bfights.
  function lockoutsOf(logs) {
    var groups = {};
    logs.forEach(function (l) {
      var k = lockoutStart(l.date);
      var g = groups[k] || (groups[k] = { lock: k, date: l.date, bfights: [], wipes: 0, killed: {} });
      if (new Date(l.date) < new Date(g.date)) g.date = l.date; // earliest fight date of the lockout
      if (l.bfights && l.bfights.length) {
        l.bfights.forEach(function (f) {
          g.bfights.push(f);
          if (f.kill) g.killed[f.bn] = true;
          else g.wipes++;
        });
      } else {
        // legacy log (no per-boss fights): fold in the killed list + the per-log wipe count
        (l.bosses || []).forEach(function (bn) {
          g.killed[bn] = true;
        });
        g.wipes += l.wipes || 0;
      }
    });
    return Object.keys(groups)
      .sort()
      .reverse()
      .map(function (k) {
        return groups[k];
      });
  }

  // Per-lockout aggregate from its merged bfights: guild DPS, boss time (Σ kill durations),
  // full-clear span (first pull → last kill end), wipes, bosses cleared, hard-mode count.
  function lockoutStats(g) {
    var bt = 0,
      firstT = null,
      lastEnd = null,
      hm = 0,
      dmg = null; // Σ boss damage — filled from rows[] below (bfights carry no per-player damage)
    (g.bfights || []).forEach(function (f) {
      var st = f.t ? new Date(f.t).getTime() : null;
      if (st != null) {
        if (firstT == null || st < firstT) firstT = st;
        var en = st + (f.dur || 0) * 1000;
        if (lastEnd == null || en > lastEnd) lastEnd = en;
      }
      if (f.kill) {
        if (f.dur != null) bt += f.dur;
        if (f.hm) hm++;
      }
    });
    // guild damage over the lockout's kills (rows[] = per player per kill)
    (g.logs || []).forEach(function (l) {
      (l.rows || []).forEach(function (r) {
        if (dmg == null) dmg = 0;
        dmg += r.dmg || 0;
      });
    });
    var span = firstT != null && lastEnd != null ? Math.round((lastEnd - firstT) / 1000) : null;
    return {
      date: g.date,
      bosses: Object.keys(g.killed).length,
      wipes: g.wipes,
      bossTime: bt || null,
      span: span,
      hm: hm,
      gdps: dmg != null && bt ? Math.round(dmg / bt) : null,
    };
  }

  // Guild progress — the original grid + verdict + per-boss table, fed by REAL data now:
  //  · verdict banner + stat grid (Guild DPS, Boss time, Wipes, Bosses, Hard modes) with ▲/▼ vs baseline
  //  · per-boss table: best kill (record) · vs baseline · wipes · HC/NM badge · ⭐ new kill
  // CUR is always this week's raid; Week/Month/All picks the BASELINE it's compared to (last / month avg /
  // all-time avg) for BOTH the grid and the per-boss "vs" column.
  // For ToC/ICC: return a copy of the logs keeping only fights of the chosen difficulty (Normal/Heroic),
  // with bosses/wipes recomputed. For Ulduar (not split): return the logs unchanged. Legacy logs with no
  // bfights pass through (can't be split — they predate per-fight difficulty).
  function filterByDiff(logs) {
    if (!SPLIT_DIFF_RAIDS[RAID]) return logs;
    var wantHC = PROGDIFF === "hc";
    return logs
      .map(function (l) {
        if (!(l.bfights && l.bfights.length)) return l; // legacy — leave as-is
        var bf = l.bfights.filter(function (f) {
          return !!f.hm === wantHC; // f.hm is /_HC$/ on the fight's difficulty
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

  // Pick a stable line from a pool, seeded by a string (so the same player+boss always gets the same
  // quip — it won't flicker on re-render, but different subjects get different lines).
  function pickLine(pool, seed) {
    var s = 0,
      str = String(seed || "");
    for (var i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) | 0;
    return pool[Math.abs(s) % pool.length];
  }
  // Quip pools live in the editable funquips.js (window.RATS_QUIPS). A tiny built-in fallback keeps the
  // page working if that file fails to load — but funquips.js is the one to EDIT. (The `bossDeath` /
  // `scenic` pools in funquips.js are unused for now — they're for the Cliff Diver / Scenic route cards
  // we'll restore once the API exposes `deaths`; see docs/WOWLOGS_API.md.)
  var Q = window.RATS_QUIPS || {};
  var QUIPS = {
    ghost: Q.ghost || ["where'd you go? 👻"],
  };

  // ---- Fun & Shame: superlatives from the damage/healing/duration/wipe data we actually have --------
  // (deaths & damageTaken are null in the API — see docs §dev note — so no "most deaths"/"squishy" here).
  // A "fun card" = emoji + title + a class-coloured name + a subline. Empty categories are skipped.
  // Award accent hues — each award title gets its own vivid colour for the emoji glow + top border, so
  // the grid reads like colourful trading cards. Keyed by title; falls back to gold.
  var AWARD_HUE = {
    "The Baker": "#3fa7ff",
    "The Medic": "#57d977",
    "One-trick pony": "#c88bff",
    "Overachiever": "#ffb03f",
    "Mr. Reliable": "#3fd9c8",
    "The Wildcard": "#ff5db1",
    "Lone wolf": "#8a93ff",
    "On strike": "#ff7a3f",
    "On a streak": "#ff9d3f",
    "Perfect attendance": "#ffd23f",
  };
  function funCard(emoji, title, name, cls, sub, shame) {
    var col = classColor(cls);
    var hue = shame ? "#c05656" : AWARD_HUE[title] || "var(--accent)";
    return (
      '<div class="funcard' + (shame ? " shame" : "") + '" style="--fc-hue:' + hue + '">' +
      '<div class="fc-top"><span class="fc-emoji">' + emoji + "</span>" +
      '<span class="fc-title">' + esc(title) + "</span></div>" +
      '<div class="fc-name" style="color:' + col + '">' + esc(name) + "</div>" +
      '<div class="fc-sub">' + sub + "</div></div>"
    );
  }
  function renderFunShame() {
    var awEl = document.getElementById("funAwards");
    if (!awEl) return;
    var logs = filterByDiff(logsInScope(PERIOD));
    // how many distinct raid nights (lockouts) are in scope — "perfect attendance" is only meaningful
    // across MULTIPLE raids (in a single-raid Week, everyone who came was in "every" kill — trivial).
    var lockSet = {};
    logs.forEach(function (l) { lockSet[lockoutStart(l.date)] = 1; });
    var lockCount = Object.keys(lockSet).length;
    var guild = rosterSet();
    var isGuildie = function (n) {
      if (!guild) return true;
      var id = resolveIdentity(n, "");
      return guild[id.key] || guild[normNm(n)];
    };
    var trole = toonRoles(logs);

    // ---- gather per-toon DPS parses (kills only, guildies, non-tank), and totals ----
    // Aggregate by PERSON (alt→main), not by toon — so Foougg's reroll toons count as one raider (fixes
    // "1/27 kills"). A person's DPS toons fuse; their healer toon is excluded above. The displayed name/
    // class = the "face" toon (the one that played the most DPS fights for that person).
    var perPerson = {}; // DPS people, keyed by main: {fights,dpsList,sumDmg,byBoss:{boss:bestDps},faces}
    var perHealer = {}; // HEALER people, keyed by main: {sumHeal,faces}
    var presence = {}; // main → {kills, name, cls} — EVERY kill a person is in (any role: tank/dps/heal)
    var bossBest = {}; // boss → the guild's best DPS on it (for the Overachiever "above par" count)
    var raidTotalDmg = 0,
      raidTotalHeal = 0;
    function faceOf(map, id, r) {
      var e = map[id.key] || (map[id.key] = { fights: 0, dpsList: [], sumDmg: 0, sumHeal: 0, byBoss: {}, faces: {} });
      var fc = e.faces[normNm(r.n)] || (e.faces[normNm(r.n)] = { name: r.n, cls: r.c, spec: r.s, n: 0 });
      fc.n++;
      return e;
    }
    logs.forEach(function (l) {
      rowsForDiff(l.rows).forEach(function (r) {
        if (!isGuildie(r.n)) return;
        var tk = normNm(r.n);
        var id = resolveIdentity(r.n, r.c);
        // presence = attended this kill in ANY role (so a raider who TANKED a boss still counts as
        // present — Rellik tanking half the run must NOT read as "missed those kills").
        var pr = presence[id.key] || (presence[id.key] = { kills: 0, name: r.n, cls: r.c });
        pr.kills++;
        if (trole[tk] === "HEALER") {
          raidTotalHeal += r.heal || 0;
          var h = faceOf(perHealer, id, r);
          h.sumHeal += r.heal || 0;
          return;
        }
        if (isTankFight(r)) return; // tanks out of the DPS awards
        raidTotalDmg += r.dmg || 0;
        var e = faceOf(perPerson, id, r);
        e.fights++;
        e.sumDmg += r.dmg || 0;
        e.dpsList.push(r.d || 0);
        if (!e.byBoss[r.b] || (r.d || 0) > e.byBoss[r.b]) e.byBoss[r.b] = r.d || 0;
        if ((r.d || 0) > (bossBest[r.b] || 0)) bossBest[r.b] = r.d || 0;
      });
    });
    // resolve each person's face toon (most fights on that role) → name/cls/spec on the card
    function resolveFaces(map) {
      return Object.keys(map).map(function (k) {
        var e = map[k],
          face = null;
        Object.keys(e.faces).forEach(function (t) {
          if (!face || e.faces[t].n > face.n) face = e.faces[t];
        });
        e.key = k; // main key — lets us cross-reference the presence map (any-role kill count)
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

    // 🌊 The Baker — highest share of the guild's total damage (carries the raid)
    if (raidTotalDmg > 0 && toons.length) {
      var baker = toons.slice().sort(function (a, b) { return b.sumDmg - a.sumDmg; })[0];
      var share = Math.round((baker.sumDmg / raidTotalDmg) * 1000) / 10;
      awards.push(funCard("🌊", "The Baker", baker.name, baker.cls,
        "<b>" + share + "%</b> of all guild damage · " + fmtBig(baker.sumDmg)));
    }

    // 💚 The Medic — healer with the biggest share of total guild healing
    if (raidTotalHeal > 0 && healers.length) {
      var medic = healers.slice().sort(function (a, b) { return b.sumHeal - a.sumHeal; })[0];
      var hshare = Math.round((medic.sumHeal / raidTotalHeal) * 1000) / 10;
      awards.push(funCard("💚", "The Medic", medic.name, medic.cls,
        "<b>" + hshare + "%</b> of all guild healing · " + fmtBig(medic.sumHeal)));
    }

    // (King of <boss> removed — it duplicated the One-trick pony when the top parse was the same person.)

    // 🎯 Mr. Reliable — steady AND GOOD (5k-5k-5k, not 1k-1k-1k). Low variance is only impressive above
    // the guild average — a flat mediocre line is not an achievement. So: only consider players whose
    // average is >= the guild DPS average, then pick the steadiest (lowest coefficient of variation).
    var withSpread = toons.filter(function (t) { return t.fights >= 3; }).map(function (t) {
      var mean = t.dpsList.reduce(function (a, b) { return a + b; }, 0) / t.fights;
      var varc = t.dpsList.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / t.fights;
      return { t: t, cv: mean > 0 ? Math.sqrt(varc) / mean : 1, mean: mean };
    });
    var guildAvgDps = withSpread.length
      ? withSpread.reduce(function (a, b) { return a + b.mean; }, 0) / withSpread.length
      : 0;
    // reliable pool = the good half (>= guild average); wildcard pool = everyone (any level can be swingy)
    var goodSteady = withSpread.filter(function (x) { return x.mean >= guildAvgDps; });
    if (goodSteady.length) {
      var steady = goodSteady.slice().sort(function (a, b) { return a.cv - b.cv; })[0];
      awards.push(funCard("🎯", "Mr. Reliable", steady.t.name, steady.t.cls,
        "high &amp; steady · <b>" + fmt(Math.round(steady.mean)) + "</b> DPS every raid, no off nights"));
    }
    if (withSpread.length) {
      // 🎲 Wildcard — highest variance (roulette)
      var wild = withSpread.slice().sort(function (a, b) { return b.cv - a.cv; })[0];
      if (!goodSteady.length || wild.t !== goodSteady.slice().sort(function (a, b) { return a.cv - b.cv; })[0].t)
        awards.push(funCard("🎲", "The Wildcard", wild.t.name, wild.t.cls,
          "hot-or-cold — biggest swings raid to raid"));
    }

    // 🎸 One-trick pony — biggest gap between a player's best boss and their own average (shines on one
    // fight, mortal on the rest). Needs ≥3 kills so it's a real pattern, not a single lucky parse.
    var tricks = toons.filter(function (t) { return t.fights >= 3; }).map(function (t) {
      var mean = t.dpsList.reduce(function (a, b) { return a + b; }, 0) / t.fights;
      var bestBoss = "",
        bestV = 0;
      Object.keys(t.byBoss).forEach(function (b) {
        if (t.byBoss[b] > bestV) { bestV = t.byBoss[b]; bestBoss = b; }
      });
      return { t: t, ratio: mean > 0 ? bestV / mean : 1, boss: bestBoss };
    });
    if (tricks.length) {
      var trick = tricks.slice().sort(function (a, b) { return b.ratio - a.ratio; })[0];
      if (trick.ratio >= 1.4)
        awards.push(funCard("🎸", "One-trick pony", trick.t.name, trick.t.cls,
          "a god on <b>" + esc(shortBoss(trick.boss)) + "</b>, mortal elsewhere"));
    }

    // 📈 Overachiever — above the guild's best-on-that-boss average in the MOST bosses (good everywhere).
    // We score each person by how many bosses their best beats the guild-median-best on that boss.
    var bossMed = {}; // boss → median of all players' best DPS on it
    Object.keys(bossBest).forEach(function (b) {
      var vals = toons.map(function (t) { return t.byBoss[b] || 0; }).filter(function (x) { return x > 0; }).sort(function (a, c) { return a - c; });
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
        awards.push(funCard("📈", "Overachiever", over.t.name, over.t.cls,
          "above par on <b>" + over.n + "</b> of " + over.cov + " bosses"));
    }

    // 🐺 Lone wolf — most total damage carried across the scope (volume × presence), the workhorse.
    if (toons.length) {
      var wolf = toons.slice().sort(function (a, b) { return b.sumDmg - a.sumDmg; })[0];
      // avoid duplicating the Baker card if it's the same person (Baker = % share, Wolf = raw volume)
      var bakerName = raidTotalDmg > 0 && toons.length ? toons.slice().sort(function (a, b) { return b.sumDmg - a.sumDmg; })[0].name : null;
      // second-highest if the top is already the Baker
      var wolfPick = wolf.name === bakerName && toons.length > 1
        ? toons.slice().sort(function (a, b) { return b.sumDmg - a.sumDmg; })[1]
        : wolf;
      awards.push(funCard("🐺", "Lone wolf", wolfPick.name, wolfPick.cls,
        "<b>" + fmtBig(wolfPick.sumDmg) + "</b> damage over <b>" + wolfPick.fights + "</b> kills"));
    }

    // ⚡ On strike — tops the meters on the MOST bosses (holds #1 everywhere). "No way to take you from
    // the top." Counts how many bosses each person's best is the guild's best on that boss.
    if (toons.length > 2 && Object.keys(bossBest).length) {
      var strike = toons
        .map(function (t) {
          var n = 0;
          Object.keys(t.byBoss).forEach(function (b) {
            if (t.byBoss[b] >= (bossBest[b] || 0)) n++;
          });
          return { t: t, n: n };
        })
        .sort(function (a, b) { return b.n - a.n; })[0];
      if (strike && strike.n >= 2)
        awards.push(funCard("⚡", "On strike", strike.t.name, strike.t.cls,
          "#1 on <b>" + strike.n + "</b> boss" + (strike.n !== 1 ? "es" : "") + " — untouchable at the top"));
    }

    // 🔥 On a streak — the same player has topped the board multiple lockouts IN A ROW (the persistent
    // 👑 crown from the Leaderboards). Rewards holding #1 raid after raid, not just one good night.
    var streaks = computeStreaks();
    [
      { s: streaks.dps, unit: "DPS" },
      { s: streaks.hps, unit: "healing" },
    ].forEach(function (o) {
      if (o.s && o.s.name && o.s.count >= 2) {
        // find the display name + class for this normalized name (from any role's face toons)
        var face = null;
        toons.concat(healers).forEach(function (t) {
          if (normNm(t.name) === o.s.name) face = t;
        });
        var nm = face ? face.name : o.s.name;
        var cl = face ? face.cls : "";
        awards.push(funCard("🏅", "On a streak", nm, cl,
          "held <b>#1 " + o.unit + "</b> for <b>" + o.s.count + "</b> raids straight"));
      }
    });

    // 👑 Perfect attendance — was in EVERY kill of the scope (any role counts, so a tank qualifies too)
    // only across ≥2 raid nights — perfect attendance in a single raid is just "showed up", not a feat.
    var presAward = Object.keys(presence).map(function (k) { return presence[k]; });
    var maxPres = presAward.reduce(function (m, p) { return Math.max(m, p.kills); }, 0);
    if (maxPres > 1 && lockCount >= 2) {
      var present = presAward.filter(function (p) { return p.kills === maxPres; });
      if (present.length === 1) {
        // one lone perfect raider — name them
        awards.push(funCard("👑", "Perfect attendance", present[0].name, present[0].cls,
          "in all <b>" + maxPres + "</b> kills — never missed"));
      } else if (present.length > 1) {
        // several — one summary card celebrating the whole crew (no class colour on a count)
        awards.push(funCard("👑", "Perfect attendance", present.length + " raiders", "",
          "never missed a kill · <b>" + maxPres + "/" + maxPres + "</b> each 🧀"));
      }
    }

    // ---- SHAME (rat voice, playful). One person can hold only ONE shame card. ----
    // NOTE: no "lowest single parse" cards (Cliff Diver / Scenic route were removed) — a low parse can be
    // a mid-fight DEATH, not lack of skill (e.g. Shmurda 913 on Auriaya = he died), and the API gives us
    // NO `deaths` field to tell them apart. So shame is limited to signals we CAN trust: attendance
    // (presence, any role) and a consistently low AVERAGE across many kills. Restore the single-parse
    // cards only if the dev exposes `deaths` (see docs §dev note).
    var shame = [];
    var shamed = {};
    function addShame(name, html) {
      var k = normNm(name);
      if (shamed[k]) return; // already shamed elsewhere — don't pile on
      shamed[k] = true;
      shame.push(html);
    }

    // 💤 Ghost — fewest kills attended, using TOTAL presence (any role) so a tank/off-spec night doesn't
    // read as absence. Only shame someone well below the pack (< 60% of max).
    var pres = Object.keys(presence).map(function (k) { return presence[k]; });
    var maxPresence = pres.reduce(function (m, p) { return Math.max(m, p.kills); }, 0);
    if (maxPresence > 1 && pres.length > 2) {
      var ghost = pres.slice().sort(function (a, b) { return a.kills - b.kills; })[0];
      if (ghost.kills < maxPresence * 0.6)
        addShame(ghost.name, funCard("💤", "Raid ghost", ghost.name, ghost.cls,
          "only <b>" + ghost.kills + "</b>/" + maxPresence + " kills — " +
          esc(pickLine(QUIPS.ghost, ghost.name)), true));
    }

    // 🍺 Last one standing — a DPS REGULAR with the lowest AVERAGE dps (excludes tanks via presence ratio).
    var dpsRegulars = toons.filter(function (t) {
      if (t.fights < Math.max(3, Math.ceil(maxFights / 2))) return false; // must be a regular
      var totalKills = presence[t.key] ? presence[t.key].kills : t.fights;
      return t.fights >= totalKills * 0.7; // played DPS in ≥70% of their kills (not a part-time tank)
    });
    if (dpsRegulars.length > 2) {
      // pick the lowest-average one that isn't already shamed
      var ranked = dpsRegulars
        .map(function (t) {
          return { t: t, avg: t.dpsList.reduce(function (a, b) { return a + b; }, 0) / t.fights };
        })
        .sort(function (a, b) { return a.avg - b.avg; });
      for (var si = 0; si < ranked.length; si++) {
        if (shamed[normNm(ranked[si].t.name)]) continue;
        var sl = ranked[si];
        addShame(sl.t.name, funCard("🍺", "Last one standing", sl.t.name, sl.t.cls,
          "there every raid but bottom of the meters · avg <b>" + fmt(Math.round(sl.avg)) +
          "</b> DPS — present, but not really 🫥", true));
        break;
      }
    }

    // 🧊 Ice cold — below the guild median on the MOST bosses (the opposite of the Overachiever): not one
    // bad parse, but consistently cold everywhere. Uses each person's best-per-boss vs the boss median.
    if (toons.length > 2) {
      var cold = toons
        .map(function (t) {
          var below = 0,
            cov = Object.keys(t.byBoss).length;
          Object.keys(t.byBoss).forEach(function (b) {
            if (t.byBoss[b] < (bossMed[b] || 0)) below++;
          });
          return { t: t, below: below, cov: cov, ratio: cov ? below / cov : 0 };
        })
        .filter(function (x) { return x.cov >= 3 && !shamed[normNm(x.t.name)]; })
        .sort(function (a, b) { return b.ratio - a.ratio || b.below - a.below; })[0];
      if (cold && cold.below >= 3)
        addShame(cold.t.name, funCard("🧊", "Ice cold", cold.t.name, cold.t.cls,
          "below par on <b>" + cold.below + "</b> of " + cold.cov + " bosses — time to warm up 🔥", true));
    }

    // Empty state: nothing to award AND nothing to shame → hide the titles/cards and show one centred
    // rats block (same look as the Leaderboards empty state) instead of two lonely "nothing yet" lines.
    var body = document.getElementById("funBody"),
      empty = document.getElementById("funEmpty");
    if (!awards.length && !shame.length && empty && body) {
      var rObj2 = (DATA.raids || []).filter(function (r) { return r.key === RAID; })[0];
      var lbl2 = (rObj2 && rObj2.label) || RAID || "this raid";
      var diff2 = SPLIT_DIFF_RAIDS[RAID] ? (PROGDIFF === "hc" ? "Heroic " : "Normal ") : "";
      empty.innerHTML = emptyRatHtml("No " + lbl2 + " " + diff2 + SIZE + "-man logs yet");
      empty.hidden = false;
      body.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (body) body.hidden = false;
    // one grid: positive awards first, then the negative ones (red-tinted) — no separate "shame" section
    awEl.innerHTML = awards.concat(shame).join("");
  }

  function renderProgress() {
    var el = document.getElementById("progress");
    if (!el) return;
    var rObj = (DATA.raids || []).filter(function (r) {
      return r.key === RAID;
    })[0];
    var raidLabel = (rObj && rObj.label) || RAID || "raid";
    var split = !!SPLIT_DIFF_RAIDS[RAID];
    var diffLabel = PROGDIFF === "hc" ? "Heroic" : "Normal";

    // Framed "Guild progress" header (board-head style, matches the Leaderboards) — shown for EVERY raid.
    // Only split raids (ToC/ICC) get the Normal|Heroic toggle on the right; Ulduar shows just the title.
    // The verdict + stat grid render INSIDE this same card (below the header); the per-boss table is its
    // own card below. progHeadOpen opens the card + header, `head` is injected, progHeadClose seals it.
    var toggleHtml = split
      ? '<div class="metricbar">' +
        '<button class="mbtn' + (PROGDIFF === "nm" ? " active" : "") + '" onclick="setProgDiff(\'nm\')">Normal</button>' +
        '<button class="mbtn' + (PROGDIFF === "hc" ? " active" : "") + '" onclick="setProgDiff(\'hc\')">Heroic</button>' +
        "</div>"
      : "";
    var progHeadOpen =
      '<div class="card board proghead"><div class="board-head">' +
      '<span class="board-title">Guild progress</span>' +
      toggleHtml +
      "</div>";
    var progHeadClose = "</div>";
    // empty state: header framed + self-closed
    var diffBar = progHeadOpen + progHeadClose;

    var scoped = filterByDiff(logsInScope(PERIOD));
    if (!scoped.length) {
      el.innerHTML =
        diffBar +
        '<div class="card emptyrat">' +
        emptyRatHtml("No " + raidLabel + " " + (split ? diffLabel + " " : "") + SIZE + "-man runs yet") +
        "</div>";
      return;
    }

    // Guild progress runs over the FULL raid+size history (so first-kill / vs-last are real). The
    // Week/Month/All filter picks the BASELINE the latest raid is compared to (see below).
    var allLogs = filterByDiff(logsInScope("all"));
    var lockGroups = {};
    allLogs.forEach(function (l) {
      var k = lockoutStart(l.date);
      (lockGroups[k] = lockGroups[k] || []).push(l);
    });
    var locks = lockoutsOf(allLogs); // newest-first, full history
    locks.forEach(function (g) {
      g.logs = lockGroups[g.lock] || [];
    });

    var hasTimes = allLogs.some(function (l) {
      return (l.bfights || []).some(function (f) {
        return f.kill && f.dur != null;
      });
    });

    // ---- stats per lockout + baseline (prev / avg / best) ----
    var head = "";
    var curDate = locks.length ? locks[0].date : null; // the raid the table anchors on (set by period below)
    if (locks.length >= 1) {
      var stats = locks.map(lockoutStats); // newest-first
      // CUR is ALWAYS this week's raid (the most recent). The Week/Month/All button only changes the
      // BASELINE it's compared to:  Week = last raid  ·  Month = avg of the last 31 days  ·  All = avg of all.
      var cur = stats[0];
      curDate = cur.date;
      var older = stats.slice(1);
      var baseSet, word;
      if (PERIOD === "week") {
        baseSet = older.slice(0, 1); // just the previous raid
        word = "last raid";
      } else if (PERIOD === "month") {
        baseSet = older.filter(function (m) {
          return (Date.now() - new Date(m.date).getTime()) / 86400000 <= 31;
        });
        word = "the month's average";
      } else {
        baseSet = older; // all-time
        word = "our all-time average";
      }

      // baseline value for a metric = average across baseSet (single raid for Week = that raid's value)
      function baseOf(key) {
        var vals = baseSet.map(function (m) { return m[key]; }).filter(function (x) { return x != null; });
        return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
      }
      // delta {chip, sign}; sign>0 means improvement (lowerIsBetter flips it for wipes/time)
      function d(key, lowerIsBetter) {
        var b = baseOf(key);
        if (cur[key] == null || b == null) return { chip: null, sign: 0 };
        var diff = cur[key] - b;
        var s = lowerIsBetter ? -diff : diff;
        return { chip: diff, sign: s > 0 ? 1 : s < 0 ? -1 : 0 };
      }
      var dDps = d("gdps", false),
        dTime = d("bossTime", true),
        dWipe = d("wipes", true),
        dBoss = d("bosses", false),
        dHm = d("hm", false);

      var score = dTime.sign * 2 + dWipe.sign + dDps.sign + dBoss.sign + dHm.sign * 2;
      var v = score > 0 ? "good" : score < 0 ? "bad" : "flat";
      var vEmoji = score > 0 ? "📈" : score < 0 ? "📉" : "➖";
      var vText = score > 0 ? "Sharper than " + word : score < 0 ? "Rougher than " + word : "On par with " + word;
      var bits = [];
      if (dTime.chip) bits.push(fmtDur(dTime.chip) + " " + (dTime.chip < 0 ? "faster" : "slower") + " clear");
      if (dWipe.chip) bits.push(Math.abs(Math.round(dWipe.chip * 10) / 10) + " " + (dWipe.chip < 0 ? "fewer" : "more") + " wipes");
      if (dHm.chip) bits.push(Math.abs(Math.round(dHm.chip * 10) / 10) + " " + (dHm.chip > 0 ? "more" : "fewer") + " hard mode" + (Math.abs(dHm.chip) !== 1 ? "s" : ""));
      if (dBoss.chip) bits.push(Math.abs(Math.round(dBoss.chip * 10) / 10) + " " + (dBoss.chip > 0 ? "more" : "fewer") + " bosses");

      // stat grid — Guild DPS · Boss time · Wipes · Bosses · Hard modes
      // Ulduar: mixed HC/NM within a lockout → show a "Hard modes X/N" card. ToC/ICC: the whole run is
      // one difficulty (chosen by the toggle) → no HM card (it'd always be N/N or 0/N).
      var grid =
        gsCard("Guild DPS", cur.gdps != null ? fmt(cur.gdps) : "—", dDps.chip != null ? deltaChip(dDps.chip, false) : "") +
        (hasTimes ? gsCard("Boss time", cur.bossTime != null ? fmtDur(cur.bossTime) : "—", dTime.chip != null ? tArrow(dTime.chip) : "") : "") +
        gsCard("Wipes", String(cur.wipes), dWipe.chip != null ? deltaChip(dWipe.chip, true) : "") +
        gsCard("Bosses cleared", String(cur.bosses), dBoss.chip != null ? deltaChip(dBoss.chip, false) : "") +
        (split ? "" : gsCard("Hard modes", cur.hm + '<span class="of"> / ' + cur.bosses + "</span>", dHm.chip != null ? deltaChip(dHm.chip, false) : ""));

      var hasBase = baseSet.length > 0;
      head =
        (hasBase
          ? '<div class="verdict ' + v + '"><span class="em">' + vEmoji + "</span><span>" + vText +
            '<span class="sub2">' + (bits.join(" · ") || "no change vs " + word) + "</span></span></div>"
          : "") +
        '<div class="gsum">' + grid + "</div>" +
        '<p class="compnote">This week\'s raid (' + esc(fmtDate(cur.date)) + ")" +
        (hasBase ? " vs " + esc(word) + (PERIOD === "week" ? " (" + esc(fmtDate(baseSet[0].date)) + ")" : ", " + baseSet.length + " raid" + (baseSet.length !== 1 ? "s" : "")) : "") +
        ".</p>";
    }

    // ---- per-boss table ----
    // Per boss:  best kill EVER (the goal, always shown)  ·  this week's kill  ·  a baseline kill time that
    // follows the SAME button as the grid (Week = last raid · Month = avg of month's kills · All = avg of
    // all kills). The "vs" column = this week's kill − baseline (red = slower than baseline → we regressed).
    var curLockKey = curDate ? lockoutStart(curDate) : null;
    // for Week, the baseline is exactly the single previous lockout
    var baselineWeekKey = locks.length >= 2 ? lockoutStart(locks[1].date) : null;
    function inBaseline(date) {
      var lk = lockoutStart(date);
      if (lk === curLockKey) return false; // this week is never its own baseline
      if (PERIOD === "week") return baselineWeekKey && lk === baselineWeekKey;
      if (PERIOD === "month") return (Date.now() - new Date(date).getTime()) / 86400000 <= 31;
      return true; // all-time
    }

    var pb = {};
    allLogs.forEach(function (l) {
      var isCur = lockoutStart(l.date) === curLockKey,
        isBase = inBaseline(l.date);
      (l.bfights || []).forEach(function (f) {
        var s = pb[f.bn] || (pb[f.bn] = { best: null, cur: null, baseTimes: [], wipesCur: 0, hm: false, first: null, killedEver: false });
        if (f.kill) {
          s.killedEver = true;
          if (f.dur != null && (s.best == null || f.dur < s.best)) s.best = f.dur;
          if (isCur) {
            if (f.dur != null) s.cur = f.dur;
            s.hm = f.hm; // this week's difficulty drives the HC/NM badge
          }
          if (isBase && f.dur != null) s.baseTimes.push(f.dur);
          if (!s.first || l.date < s.first) s.first = l.date;
        } else if (isCur) s.wipesCur++;
      });
      if (!(l.bfights && l.bfights.length)) {
        (l.bosses || []).forEach(function (bn) {
          var s = pb[bn] || (pb[bn] = { best: null, cur: null, baseTimes: [], wipesCur: 0, hm: false, first: null, killedEver: false });
          s.killedEver = true;
          if (!s.first || l.date < s.first) s.first = l.date;
        });
      }
    });

    var order = (BOSS_ORDER[RAID] || []).slice();
    Object.keys(pb).forEach(function (b) {
      if (order.indexOf(b) < 0) order.push(b);
    });
    var tableRows = order
      .filter(function (b) { return pb[b]; })
      .map(function (b) {
        var s = pb[b];
        // per-boss HC/NM badge only in Ulduar (mixed). In ToC/ICC the whole table is one difficulty.
        var hmTag = !split && s.killedEver && hasTimes
          ? (s.hm ? '<span class="hctag">✦ HC</span>' : '<span class="nmtag">NM</span>')
          : "";
        if (!s.killedEver) {
          return (
            '<tr class="nokill"><td class="bn">' + esc(shortBoss(b)) +
            '</td><td><span class="nokilltag">✖ not killed</span></td><td></td><td class="num">' + s.wipesCur + "</td><td></td></tr>"
          );
        }
        // vs column: this week's kill vs the baseline avg (faster than baseline = green)
        var vs;
        if (s.cur != null && s.baseTimes.length) {
          var baseAvg = s.baseTimes.reduce(function (a, c) { return a + c; }, 0) / s.baseTimes.length;
          vs = tArrow(s.cur - baseAvg);
        } else {
          vs = '<span class="d flat">—</span>';
        }
        // NEW KILL = first-ever kill happened this week
        var isNew = s.first && curLockKey && lockoutStart(s.first) === curLockKey;
        var flags = isNew ? '<span class="better">⭐ NEW KILL</span>' : "";
        return (
          '<tr><td class="bn">' + esc(shortBoss(b)) + " " + hmTag +
          '</td><td class="num best">' + (s.best != null ? fmtDur(s.best) : "—") +
          "</td><td>" + vs +
          '</td><td class="num">' + s.wipesCur +
          "</td><td>" + flags + "</td></tr>"
        );
      })
      .join("");

    var vsHead = PERIOD === "week" ? "vs last raid" : PERIOD === "month" ? "vs month avg" : "vs all-time avg";
    var fetchHint = hasTimes
      ? ""
      : '<p class="compnote" style="margin:10px 2px 0">⏳ Kill times, per-boss wipes &amp; hard-mode (HC) badges fill in after the next ' +
        "<b>🔄 Fetch</b> — older logs were captured before per-boss timings.</p>";

    var legend = hasTimes
      ? '<div class="leg">' +
        (split ? "" : '<span><b style="color:var(--accent)">✦ HC</b> hard mode</span><span><b style="color:#8a8f98">NM</b> normal</span>') +
        '<span>Best kill = record (the goal) · Wipes = this week · <b style="color:var(--ok)">⭐</b> first-ever kill</span></div>'
      : "";

    el.innerHTML =
      // header + verdict + grid, all inside one framed "Guild progress" card
      progHeadOpen +
      '<div class="proghead-body">' + head + "</div>" +
      progHeadClose +
      // per-boss table in its own card below
      '<div class="card" style="padding:4px 14px"><table class="progtbl"><thead><tr>' +
      "<th>Boss</th><th>Best kill</th><th>" + vsHead + "</th><th>Wipes</th><th></th></tr></thead><tbody>" +
      tableRows +
      "</tbody></table></div>" +
      fetchHint +
      legend;
  }

  // Sum of boss-fight durations in a set of bfights (kills only) — a "boss time" proxy for full-clear.
  function clearTime(bfights) {
    var t = 0,
      any = false;
    (bfights || []).forEach(function (f) {
      if (f.kill && f.dur != null) {
        t += f.dur;
        any = true;
      }
    });
    return any ? t : null;
  }
  // small stat card for the week verdict summary
  function gsCard(lbl, valHtml, deltaHtml) {
    return '<div class="gs"><div class="lbl">' + lbl + '</div><div class="v">' + valHtml + "</div>" + (deltaHtml || "") + "</div>";
  }
  // delta chip from a delta value (green/red). lowerIsBetter for wipes. Rounds to 1 dp (avg baselines).
  function deltaChip(d, lowerIsBetter) {
    if (d == null) return '<span class="d flat">—</span>';
    var r = Math.round(d * 10) / 10;
    if (!r) return '<span class="d flat">— same</span>';
    var better = lowerIsBetter ? r < 0 : r > 0;
    return '<span class="d ' + (better ? "good" : "bad") + '">' + (r > 0 ? "+" : "−") + Math.abs(r) + "</span>";
  }
  // time delta chip (faster=green). arg is seconds delta (cur-prev), lower is better.
  function tArrow(d) {
    if (!d) return '<span class="d flat">— same</span>';
    return '<span class="d ' + (d < 0 ? "good" : "bad") + '">' + (d < 0 ? "▼ " : "▲ ") + fmtDur(d) + "</span>";
  }

  var TAB = "board";
  // reflect raid/size/period/metric/tab in the URL so a reload keeps the view and links are shareable.
  function syncUrl() {
    var q = new URLSearchParams();
    if (RAID) q.set("raid", RAID);
    if (SIZE !== "25") q.set("size", SIZE);
    if (PERIOD !== "all") q.set("period", PERIOD);
    if (METRIC !== "dps") q.set("metric", METRIC);
    if (PROGDIFF !== "nm") q.set("diff", PROGDIFF);
    if (TAB !== "board") q.set("tab", TAB);
    var s = q.toString();
    history.replaceState(null, "", s ? "?" + s : location.pathname);
  }

  function setTab(b) {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t === b);
    });
    TAB = b.dataset.t;
    document.querySelectorAll(".panel").forEach(function (p) {
      p.hidden = p.dataset.panel !== TAB;
    });
    syncUrl();
  }

  // NOTE: toggles only re-render from already-loaded data — they never hit the network.
  var SIZE = "25";
  function setSize(b) {
    SIZE = b.dataset.s;
    document.querySelectorAll("#sizeSegs .seg").forEach(function (s) {
      s.classList.toggle("active", s === b);
    });
    syncUrl();
    render();
  }
  var PERIOD = "all";
  function setPeriod(b) {
    PERIOD = b.dataset.p;
    document.querySelectorAll("#periodSegs .seg").forEach(function (s) {
      s.classList.toggle("active", s === b);
    });
    syncUrl();
    render();
  }
  // one wide board — METRIC picks which leaderboard (DPS or HPS) is shown
  var METRIC = "dps";
  function setMetric(b) {
    METRIC = b.dataset.m;
    document.querySelectorAll(".metricbar .mbtn").forEach(function (s) {
      s.classList.toggle("active", s === b);
    });
    var dpsEl = document.getElementById("dps"),
      hpsEl = document.getElementById("hps");
    if (dpsEl) dpsEl.hidden = METRIC !== "dps";
    if (hpsEl) hpsEl.hidden = METRIC !== "hps";
    syncUrl();
    render(); // Records follows the active metric (DPS peaks ⇄ HPS peaks)
  }

  // Difficulty split for ToC/ICC (Normal vs Heroic are separate runs). SHARED by the Leaderboards and the
  // Guild Progress tab. Default Normal. Only shown/applied on split raids (SPLIT_DIFF_RAIDS).
  var PROGDIFF = "nm";
  function setProgDiff(v) {
    PROGDIFF = v;
    document.querySelectorAll("#boardDiff .mbtn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.d === v);
    });
    syncUrl();
    render(); // both leaderboards + progress recompute from the same difficulty
  }
  window.setProgDiff = setProgDiff;

  // Filter a rows[] list to the active difficulty on split raids (ToC/ICC); pass through otherwise.
  // Rows predating the `hm` field (legacy) pass through so old data isn't silently dropped.
  function rowsForDiff(rows) {
    markTankRows(rows); // flag tank rows on the original array (flag lives on each row, survives filtering)
    if (!SPLIT_DIFF_RAIDS[RAID]) return rows;
    var wantHC = PROGDIFF === "hc";
    return (rows || []).filter(function (r) {
      return r.hm == null || !!r.hm === wantHC;
    });
  }

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
  // Spec labels from the logs sometimes differ from the roster's SPECS map — normalize the odd ones.
  var SPEC_ALIAS = { "Feral Combat": "Feral", "Beast Mastery": "Beastmastery" };
  // short 3-letter tag per spec for the pill
  var SPEC_TAG = {
    Blood: "BLD", Frost: "FRO", Unholy: "UNH", Balance: "BAL", Feral: "FRL", Guardian: "GRD",
    Restoration: "RES", Beastmastery: "BM", Marksmanship: "MM", Survival: "SUR", Arcane: "ARC",
    Fire: "FIRE", Holy: "HOL", Protection: "PROT", Retribution: "RET", Discipline: "DISC",
    Shadow: "SHA", Assassination: "ASS", Combat: "CMB", Subtlety: "SUB", Elemental: "ELE",
    Enhancement: "ENH", Affliction: "AFF", Demonology: "DEMO", Destruction: "DES", Arms: "ARM", Fury: "FUR",
  };
  // spec pill (colored by class) — short tag like "ENH", "HOL", "ELE"
  function specPill(spec, cls) {
    var s = SPEC_ALIAS[spec] || spec || "";
    var tag = SPEC_TAG[s] || (s ? s.slice(0, 3).toUpperCase() : "");
    if (!tag) return "";
    var col = classColor(cls);
    return '<span class="specpill" style="color:' + col + ';border-color:' + col + '55" title="' + esc(s) + '">' + tag + "</span>";
  }
  // Discord emote id for a class+spec (reusing RatsData.SPECS, the same set the Comp/guild tools use).
  function specEmoteId(cls, spec) {
    if (!window.RatsData || !RatsData.SPECS) return null;
    var rows = RatsData.SPECS[cls];
    if (!rows) return null;
    var lbl = (SPEC_ALIAS[spec] || spec || "").toLowerCase();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).toLowerCase() === lbl) return rows[i][1];
    }
    return null;
  }
  // Prefer the SPEC icon (Fire vs Frost mage…); fall back to the class icon when spec is unknown.
  function cicon(cls, spec) {
    var eid = specEmoteId(cls, spec);
    if (eid) {
      return (
        '<img class="cic" src="https://cdn.discordapp.com/emojis/' +
        eid +
        '.png?size=44" alt="' +
        esc(spec || "") +
        '" title="' +
        esc((spec || "") + " " + cls) +
        "\" loading=\"lazy\" onerror=\"this.style.visibility='hidden'\">"
      );
    }
    var t = CLASS_ICON[cls];
    return t
      ? '<img class="cic" src="https://wow.zamimg.com/images/wow/icons/large/classicon_' +
          t +
          '.jpg" alt="" onerror="this.style.visibility=\'hidden\'">'
      : '<span class="cic"></span>';
  }
  // crown pill (N lockouts at #1) — shown after the name when there's no rank-change column (All time),
  // or inside the rank-change column otherwise. lbRow decides where via hasDeltaCol.
  function crownPill(streak) {
    return streak > 1 ? '<span class="crownmv" title="' + streak + ' weeks at #1">👑' + streak + "x</span>" : "";
  }
  function deltaTag(d, streak) {
    // All time = no previous period → NO rank-change column at all (the crown moves next to the name).
    if (d === "none") return "";
    var crown = crownPill(streak);
    if (crown && (d == null || d === 0)) return '<span class="mv">' + crown + "</span>";
    if (d == null) return '<span class="mv new" title="first appearance this period">NEW</span>';
    if (d > 0) return '<span class="mv up" title="up ' + d + '">▲' + d + "</span>";
    if (d < 0) return '<span class="mv down" title="down ' + -d + '">▼' + -d + "</span>";
    return '<span class="mv same" title="held position">=</span>';
  }
  function lbRow(p, i, metric) {
    var col = classColor(p.class);
    var rateLbl = metric === "hps" ? "HPS" : "DPS";
    var cls = i === 0 ? "g" : i === 1 ? "s" : i === 2 ? "b" : "";
    // podium sizing class: r1 biggest, r2 medium, r3 normal, rn smaller (still readable)
    var sizeCls = i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : "rn";
    // bar follows the RATE (the big number) via barWidths(); coherent with what the eye reads.
    var barPct = p.bar != null ? p.bar : Math.round((p.score || 0) * 100);
    // All time has no rank-change column → the crown goes next to the name (keeps rows aligned).
    var noDeltaCol = p.delta === "none";
    var nameCrown = noDeltaCol ? crownPill(p.streak) : "";
    return (
      '<li class="' +
      sizeCls +
      " " +
      metric +
      '">' +
      '<span class="rank ' +
      cls +
      '">' +
      (i + 1) +
      "</span>" +
      deltaTag(p.delta, p.streak) +
      cicon(p.class, p.spec) +
      // fixed-width name column so every bar starts at the same x
      '<span class="pnamecol">' +
      '<a href="' +
      esc(p.reportUrl || "#") +
      '" target="_blank" rel="noopener" style="text-decoration:none">' +
      '<span class="pname" style="color:' +
      col +
      '">' +
      esc(p.name) +
      "</span></a>" +
      nameCrown +
      "</span>" +
      // bar fills the middle
      '<div class="pbar"><i style="width:' +
      barPct +
      "%;background:" +
      col +
      '"></i></div>' +
      // fixed value column on the right
      '<span class="pval">' +
      '<span class="prate">' +
      fmt(p.rate || 0) +
      ' <span class="unit">' +
      rateLbl +
      "</span></span>" +
      '<span class="psub"><span class="ptot">' +
      fmtBig(p.value) +
      "</span> total" +
      (p.fights ? ' · ×' + p.fights : "") +
      // server percentile — always render (keeps rows aligned); placeholder --.- when we have no parse.
      // Real values always show 1 decimal (61 → 61.0) so the column reads consistently.
      (p.serverPct != null
        ? ' · <span class="psrv" title="percentile vs the whole server">' + p.serverPct.toFixed(1) + "% srv</span>"
        : ' · <span class="psrv none" title="no server parse for this player yet">--.-% srv</span>') +
      "</span>" +
      "</span>" +
      "</li>"
    );
  }
  // ---- leaderboard engine: aggregate players from logs[].rows for the active raid/size/period -----
  // Runs on every render (toggles just re-render — no network). Metric = AVERAGE across kills, with the
  // player's BEST parse shown alongside. role === "HEALER" → HPS table, everyone else → DPS.
  var MIN_FIGHTS = { week: 1, month: 3, all: 3 }; // consistency gate: bigger periods need ≥3 fights

  function logsInScope(period) {
    var rObj = (DATA.raids || []).find(function (r) {
      return r.key === RAID;
    });
    var rKeys = [RAID, rObj && rObj.label].filter(Boolean).map(function (x) {
      return String(x).toLowerCase();
    });
    return (DATA.logs || []).filter(function (l) {
      if (String(l.size) !== SIZE) return false;
      var raidMatch =
        rKeys.indexOf(String(l.raid).toLowerCase()) >= 0 || rKeys.indexOf(String(l.raidSlug).toLowerCase()) >= 0;
      if (!raidMatch) return false;
      return inPeriodDays(l.date, period);
    });
  }
  function inPeriodDays(dateStr, period) {
    if (period === "all") return true;
    var dt = new Date(dateStr);
    if (isNaN(dt)) return true;
    var days = (Date.now() - dt.getTime()) / 86400000;
    return days <= (period === "week" ? 7 : 31);
  }

  // Set of guild-member names (normalized). Leaderboards show ONLY guildies — pugs/externals ignored.
  // If the roster hasn't been captured yet (no rosterNames), fall back to showing everyone.
  function rosterSet() {
    if (!DATA.rosterNames || !DATA.rosterNames.length) return null;
    var s = {};
    DATA.rosterNames.forEach(function (n) {
      s[normNm(n)] = true;
    });
    return s;
  }

  // Apply the shared old-name→current-name alias map (RatsData.NAME_ALIASES) so a RENAMED character's
  // historical log name resolves to their present in-game name (e.g. "Foougg" → "Foug"). Returns the
  // current name if aliased, else the input unchanged. This is the single spot renames are patched:
  // add one line to NAME_ALIASES in data.js and every rankings/attendance view follows.
  function aliasName(name) {
    var a = window.RatsData && RatsData.aliasFor ? RatsData.aliasFor(name) : null;
    return a || name;
  }

  // Resolve a toon name → the PERSON (main). Renames fold to the current name first, then alts fold
  // into their main. Returns { key, name, cls }.
  function resolveIdentity(name, fallbackClass) {
    name = aliasName(name); // rename → current in-game name before alt→main
    var k = normNm(name);
    var am = DATA.altMap || {};
    var a = am[k];
    if (a && a.main) {
      return { key: normNm(a.main), name: a.main, cls: a.mainClass || fallbackClass || "" };
    }
    return { key: k, name: name, cls: fallbackClass || "" };
  }

  // Dominant role of a single TOON (over its own fights) — used to group by main+role. This is the key
  // to "fuse only within the same role": a person's DPS toons merge together, their healer toon stays
  // separate (e.g. Fazcafe=Shaman DPS and its alt Ninjacaldas=Druid healer become two lines, each with
  // its own class + server%). API mislabels of 1-2 offspec fights lose the majority vote.
  function toonRoles(logs) {
    var count = {};
    logs.forEach(function (l) {
      rowsForDiff(l.rows).forEach(function (r) {
        var k = normNm(r.n);
        var c = count[k] || (count[k] = { heal: 0, dps: 0 });
        if (r.r === "HEALER") c.heal++;
        else c.dps++;
      });
    });
    var role = {};
    Object.keys(count).forEach(function (k) {
      // roster main spec wins (Fazcafe's main is Resto → HEALER even if he only played Enh here);
      // fall back to the majority of fights when the roster doesn't tell us.
      role[k] = rosterRole(k) || (count[k].heal > count[k].dps ? "HEALER" : "DPS");
    });
    return role;
  }

  // Ranking blend: 60% total volume (damage/healing summed) + 40% rate (bayesian dps/hps). Total
  // rewards showing up to every raid (Okanor's case); rate keeps burst-per-fight relevant. Both axes
  // are boss-only (no trash in the feed) and normalized 0–1 against the board's best before blending.
  var W_TOTAL = 0.6,
    W_RATE = 0.4;

  // Tank fights must NOT count toward DPS — a tank was holding threat, not pumping damage, so its low
  // "dps" unfairly drags the player's average (e.g. Rellik Prot ~1500 dps on 4 bosses).
  //
  // Detecting a tank from the API is hard: `damageTaken`/threat are null, and Feral Combat (Druid) is
  // BOTH cat-dps and bear-tank under one spec name — the log can't tell them apart. So we combine:
  //   1) unambiguous tank specs (Protection) → always tank;
  //   2) AMBIGUOUS specs (Feral Druid, DK Blood/Frost/Unholy) → tank ONLY when their dps on that fight is
  //      far below the fight's real dps pack (a bear/blood tank parses a fraction of a cat/dps). We flag
  //      a row as tank when its dps < 55% of the fight's MEDIAN dps among plausible dps rows.
  // Rows get a computed `_tank` flag (see markTankRows); isTankFight reads it, falling back to spec.
  var TANK_SPEC = { Protection: true };
  // specs that can be either dps or tank — resolve by the low-dps heuristic
  var AMBIG_TANK_SPEC = { "Feral Combat": true, Feral: true, Blood: true, Frost: true, Unholy: true };
  var TANK_DPS_FRAC = 0.55; // below this share of the fight median dps ⇒ treat an ambiguous spec as tank

  // Flag tank rows in-place (adds `_tank` bool). Two passes over ONE log's rows:
  //   pass 1 — per fight, compute each ambiguous row's dps vs the fight's median dps (is this a low parse?);
  //   pass 2 — per PLAYER, if they were low on the MAJORITY of their ambiguous fights, mark ALL their rows
  //            in this log as tank. Deciding per-player (not per-boss) keeps a bear tank consistent across
  //            the run instead of flickering dps/tank when one fight's numbers happen to line up.
  // Idempotent — safe to call repeatedly on the same rows array.
  function markTankRows(rows) {
    if (!rows || !rows.length || rows._tankMarked) return rows;
    var byBoss = {};
    rows.forEach(function (r) {
      if (r.r === "HEALER") { r._tank = false; return; }
      if (TANK_SPEC[r.s]) { r._tank = true; return; } // unambiguous tank spec
      r._tank = false; // default; ambiguous rows resolved below
      (byBoss[r.b] = byBoss[r.b] || []).push(r);
    });
    // pass 1: mark each ambiguous row low/high for its own fight
    Object.keys(byBoss).forEach(function (b) {
      var pack = byBoss[b];
      var dpsVals = pack.map(function (r) { return r.d || 0; }).sort(function (a, bb) { return a - bb; });
      var mid = dpsVals.length ? dpsVals[Math.floor(dpsVals.length / 2)] : 0;
      pack.forEach(function (r) {
        r._low = !!AMBIG_TANK_SPEC[r.s] && mid > 0 && (r.d || 0) < mid * TANK_DPS_FRAC;
      });
    });
    // pass 2: per player, tank the whole log if low on the majority of their ambiguous fights
    var tally = {}; // normName → {ambig, low}
    rows.forEach(function (r) {
      if (!AMBIG_TANK_SPEC[r.s] || r.r === "HEALER") return;
      var k = normNm(r.n);
      var t = tally[k] || (tally[k] = { ambig: 0, low: 0 });
      t.ambig++; if (r._low) t.low++;
    });
    rows.forEach(function (r) {
      if (r._tank) return; // already an unambiguous tank
      if (!AMBIG_TANK_SPEC[r.s] || r.r === "HEALER") return;
      var t = tally[normNm(r.n)];
      if (t && t.ambig && t.low * 2 >= t.ambig) r._tank = true; // low on ≥half their fights ⇒ tank
    });
    try { Object.defineProperty(rows, "_tankMarked", { value: true }); } catch (e) { rows._tankMarked = true; }
    return rows;
  }
  function isTankFight(r) {
    if (r._tank != null) return r._tank; // computed flag wins
    return !!TANK_SPEC[r.s];
  }
  // Healer main-specs (from the roster). If the roster says someone's MAIN spec is a healing one, they
  // belong in Top Healing even if these logs only show them on an off-spec (e.g. Fazcafe's main is
  // Restoration but he only played Enhancement here → he must NOT pollute Top DPS).
  var HEALER_SPEC = { Restoration: true, Holy: true, Discipline: true };
  // roster main role for a toon (via mainSpec), or null if unknown → fall back to fight-based detection.
  function rosterRole(name) {
    var ms = DATA.mainSpec || {};
    var sp = ms[normNm(name)];
    if (!sp) return null;
    return HEALER_SPEC[sp] ? "HEALER" : "DPS";
  }

  // Aggregate rows → sorted leaderboard. wantHealer picks the table; healers use heal/hps, dps use dmg/dps.
  // GROUP KEY = main + toon's dominant role, so a person's same-role toons fuse but a DPS toon and a
  // HEALER toon of the same person stay separate. The displayed name/class/server% come from the toon
  // that contributed the most fights in that group (the "face" toon).
  function aggregate(logs, unusedMetricKey, wantHealer, minFights) {
    var by = {};
    var guild = rosterSet();
    var trole = toonRoles(logs); // per-TOON dominant role
    var rateKey = wantHealer ? "h" : "d",
      totKey = wantHealer ? "heal" : "dmg";
    logs.forEach(function (l) {
      rowsForDiff(l.rows).forEach(function (r) {
        var tk = normNm(r.n);
        var toonIsHealer = trole[tk] === "HEALER";
        if (wantHealer !== toonIsHealer) return; // this toon belongs to the other table
        if (toonIsHealer && r.r !== "HEALER") return; // ignore this toon's odd off-role fight
        if (!toonIsHealer && r.r === "HEALER") return;
        if (!toonIsHealer && isTankFight(r)) return; // don't count tank fights toward DPS
        // guildies only: the toon OR its resolved main must be in the roster
        var id = resolveIdentity(r.n, r.c);
        if (guild && !guild[id.key] && !guild[tk]) return;
        // group = main + role (so same-role toons of a person fuse; cross-role stays separate)
        var gk = id.key + "|" + (toonIsHealer ? "H" : "D");
        var e =
          by[gk] ||
          (by[gk] = { rateSum: 0, total: 0, best: 0, fights: 0, url: l.reportUrl, faces: {} });
        var rate = r[rateKey] || 0;
        e.rateSum += rate;
        e.total += r[totKey] || 0;
        e.fights++;
        if (rate > e.best) e.best = rate;
        // track per-toon fight counts to pick the "face" (most-used toon in this group)
        var f = e.faces[tk] || (e.faces[tk] = { name: r.n, cls: r.c, spec: r.s, n: 0 });
        f.n++;
      });
    });
    var players = Object.keys(by).map(function (gk) {
      var e = by[gk];
      // face = toon with most fights in this group → its name/class/server% represent the row
      var face = null;
      Object.keys(e.faces).forEach(function (tk) {
        if (!face || e.faces[tk].n > face.n) face = e.faces[tk];
      });
      e.name = face ? face.name : "?";
      e.class = face ? face.cls : "";
      e.spec = face ? face.spec : "";
      e.faceKey = face ? normNm(face.name) : "";
      return e;
    });
    if (!players.length) return [];

    // Bayesian shrink on the RATE (mean pulled toward global when few fights — kills 1-fight pumps).
    var rateTotal = 0,
      nTotal = 0,
      counts = [];
    players.forEach(function (e) {
      rateTotal += e.rateSum;
      nTotal += e.fights;
      counts.push(e.fights);
    });
    var globalRate = rateTotal / nTotal;
    counts.sort(function (a, b) {
      return a - b;
    });
    var C = Math.max(3, counts[Math.floor(counts.length / 2)] || 3);

    // per-player rate (bayesian) and total; then normalize each axis to the board max and blend.
    var maxTotal = 0,
      maxRate = 0;
    players.forEach(function (e) {
      e.mean = e.rateSum / e.fights;
      e.rate = (e.fights * e.mean + C * globalRate) / (e.fights + C);
      if (e.total > maxTotal) maxTotal = e.total;
      if (e.rate > maxRate) maxRate = e.rate;
    });
    maxTotal = maxTotal || 1;
    maxRate = maxRate || 1;

    var kept = players.filter(function (e) {
      return e.fights >= minFights;
    });
    // internal 60/40 (total volume + bayesian rate), normalized 0–1
    kept.forEach(function (e) {
      e.internal = W_TOTAL * (e.total / maxTotal) + W_RATE * (e.rate / maxRate);
    });
    // each player's INTERNAL percentile within the guild (rank position 0–1) — the fallback for anyone
    // without server data, so EVERYONE is scored on the same 0.5·internal + 0.5·percentile scale
    // (no more "half of two axes" vs "one axis" mismatch that let Tuggers jump the pack).
    var byInternal = kept.slice().sort(function (a, b) {
      return a.internal - b.internal;
    });
    var n = byInternal.length;
    byInternal.forEach(function (e, i) {
      e.internalPct = n > 1 ? i / (n - 1) : 1; // 0..1, worst→best
    });

    return kept
      .map(function (e) {
        var srv = serverPctFor(e.name); // 0–1 or null
        var pctAxis = srv == null ? e.internalPct : srv; // server% if we have it, else internal rank
        var score = 0.5 * e.internal + 0.5 * pctAxis; // same formula for everyone
        return {
          name: e.name,
          class: e.class,
          spec: e.spec,
          value: e.total, // shown as the main number (total damage/healing)
          score: score, // hybrid, this is what RANKS
          internal: e.internal,
          serverPct: srv == null ? null : Math.round(srv * 1000) / 10, // %, one decimal — only when real
          rate: Math.round(e.rate), // bayesian dps/hps (shown small)
          mean: Math.round(e.mean),
          best: Math.round(e.best),
          fights: e.fights,
          reportUrl: e.url,
        };
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });
  }

  // Server percentile (0–1) for the FACE toon of a row (the toon that actually parsed on that role).
  // Server data is per-toon in the API, so we look it up by the toon name — that's why a person's
  // DPS line and HEALING line each get their own correct server%. Null → hybrid falls back to internal.
  function serverPctFor(faceName) {
    var sp = DATA.serverPct || {};
    var rObj = (DATA.raids || []).find(function (r) {
      return r.key === RAID;
    });
    var slug = (rObj && rObj.key) || RAID; // raids use the slug as key (ulduar/toc/icc)
    var bySize = sp[slug] && sp[slug][SIZE];
    if (!bySize) return null;
    // prefer the active difficulty (Normal/Heroic toggle); fall back to the bare-size mirror for
    // back-compat with snapshots written before the per-difficulty split.
    var diffKey = SPLIT_DIFF_RAIDS[slug] ? (PROGDIFF === "hc" ? "hc" : "nm") : null;
    var bucket = (diffKey && bySize[diffKey]) || bySize;
    if (!bucket.players) return null;
    var rec = bucket.players[normNm(faceName)];
    if (!rec || rec.avg == null) return null;
    return Math.max(0, Math.min(1, rec.avg / 100));
  }

  // Attach rank-delta arrows by comparing to the SAME board one period back (previous lockout/month).
  function withDeltas(cur, prev) {
    var prevRank = {};
    (prev || []).forEach(function (p, i) {
      prevRank[normNm(p.name)] = i;
    });
    cur.forEach(function (p, i) {
      var k = normNm(p.name);
      p.delta = k in prevRank ? prevRank[k] - i : null; // +up / −down / null=new
    });
    return cur;
  }

  // Build dps/hps/mvp for the active toggles, plus the previous period for the arrows.
  function computeLeaderboards() {
    var minF = MIN_FIGHTS[PERIOD] || 1;
    var cur = logsInScope(PERIOD);
    // previous window: the logs just before the current period (for delta arrows)
    var prev = PERIOD === "all" ? [] : prevWindowLogs(PERIOD);

    var dps = aggregate(cur, "d", false, minF);
    var hps = aggregate(cur, "h", true, minF);
    // Only show rank arrows when a previous period with data actually exists. All time has none;
    // and while the guild only has ~1 month/week of logs, the "previous" window is empty too —
    // in both cases show no arrows/stars rather than flagging everyone as ★ new.
    if (PERIOD === "all" || !prev.length) {
      dps.forEach(function (p) {
        p.delta = "none";
      });
      hps.forEach(function (p) {
        p.delta = "none";
      });
    } else {
      withDeltas(dps, aggregate(prev, "d", false, minF));
      withDeltas(hps, aggregate(prev, "h", true, minF));
    }

    // MVP = single highest parse in scope (the period's top pump), guildies only. Shown under the
    // person's main identity, but keep the actual toon's class/spec (the parse happened on that toon).
    var guild = rosterSet();
    var mvp = null;
    cur.forEach(function (l) {
      rowsForDiff(l.rows).forEach(function (r) {
        var id = resolveIdentity(r.n, r.c);
        if (guild && !guild[id.key] && !guild[normNm(r.n)]) return;
        var isH = r.r === "HEALER";
        var v = isH ? r.h : r.d;
        if (!mvp || v > mvp.value)
          mvp = { name: id.name, class: r.c, spec: r.s, encounter: r.b, metric: isH ? "hps" : "dps", value: Math.round(v), date: (l.date || "").slice(0, 10) };
      });
    });

    // 👑 streak = consecutive lockouts the LATEST lockout's #1 has held #1. Only crown the board's
    // current #1 if THEY are that streak-holder (the all-time/bayesian #1 may be a different player).
    var streaks = computeStreaks();
    if (dps[0] && streaks.dps.name && normNm(dps[0].name) === streaks.dps.name && streaks.dps.count > 1)
      dps[0].streak = streaks.dps.count;
    if (hps[0] && streaks.hps.name && normNm(hps[0].name) === streaks.hps.name && streaks.hps.count > 1)
      hps[0].streak = streaks.hps.count;

    // Bar width follows the SCORE that ranks the board, so it always decreases from #1 down — never
    // someone lower with a longer bar. Scaled between the board's min/max score (min → 18%, max → 100%).
    barWidths(dps);
    barWidths(hps);

    // Most improved / Needs work — compares this period vs the previous window (follows the toggle).
    var mv = improvedAndNeedsWork(cur, prev);
    DATA.improved = mv.improved;
    DATA.bottom = mv.needsWork;
    DATA.records = topParses(cur);

    DATA.dps = dps;
    DATA.hps = hps;
    DATA.mvp = mvp;
  }

  // Records = the biggest single parses in scope (personal peaks), guildies only, matching the active
  // metric table (DPS peaks when DPS is showing, HPS peaks when Healing is). Boss shown for context
  // (a short fight like Hodir inflates DPS — that's why we tag the encounter). Top 5.
  function topParses(logs) {
    var guild = rosterSet();
    var wantHealer = METRIC === "hps";
    var out = [];
    logs.forEach(function (l) {
      rowsForDiff(l.rows).forEach(function (r) {
        var isH = r.r === "HEALER";
        if (wantHealer !== isH) return;
        if (!isH && isTankFight(r)) return;
        var id = resolveIdentity(r.n, r.c);
        if (guild && !guild[id.key] && !guild[normNm(r.n)]) return;
        // a record belongs to the TOON that actually parsed it (Ninjacaldas the healer, not the
        // roster main Fazcafe) — show the real toon's name + class + spec.
        out.push({
          name: r.n, class: r.c, spec: r.s, encounter: r.b,
          metric: isH ? "hps" : "dps", value: Math.round(isH ? r.h : r.d),
          date: (l.date || "").slice(0, 10),
        });
      });
    });
    out.sort(function (a, b) {
      return b.value - a.value;
    });
    return out.slice(0, 5);
  }

  // Per-person average rate map for a set of logs (dps for dps-toons, hps for healer-toons), keyed by
  // the person (alt→main, split by role) with the face toon's name/class. Returns { key: {name,class,spec,role,avg,fights} }.
  function ratesByPerson(logs) {
    var trole = toonRoles(logs);
    var guild = rosterSet();
    var by = {};
    logs.forEach(function (l) {
      rowsForDiff(l.rows).forEach(function (r) {
        var tk = normNm(r.n);
        var isHealer = trole[tk] === "HEALER";
        if (isHealer && r.r !== "HEALER") return;
        if (!isHealer && r.r === "HEALER") return;
        if (!isHealer && isTankFight(r)) return; // tank fights don't count toward DPS
        var id = resolveIdentity(r.n, r.c);
        if (guild && !guild[id.key] && !guild[tk]) return;
        var gk = id.key + "|" + (isHealer ? "H" : "D");
        var e = by[gk] || (by[gk] = { sum: 0, total: 0, fights: 0, role: isHealer ? "HEALER" : "DPS", faces: {} });
        e.sum += isHealer ? r.h || 0 : r.d || 0;
        e.total += isHealer ? r.heal || 0 : r.dmg || 0;
        e.fights++;
        var f = e.faces[tk] || (e.faces[tk] = { name: r.n, cls: r.c, spec: r.s, n: 0 });
        f.n++;
      });
    });
    // Same bayesian-shrunk average as the leaderboard — computed PER ROLE (dps pool vs healer pool
    // separately, like aggregate()) so a player's number is identical on the board and in Needs Work.
    var keys = Object.keys(by);
    ["DPS", "HEALER"].forEach(function (role) {
      var ks = keys.filter(function (gk) {
        return by[gk].role === role;
      });
      if (!ks.length) return;
      var totalSum = 0,
        totalN = 0,
        counts = [];
      ks.forEach(function (gk) {
        totalSum += by[gk].sum;
        totalN += by[gk].fights;
        counts.push(by[gk].fights);
      });
      var globalMean = totalN ? totalSum / totalN : 0;
      counts.sort(function (a, b) {
        return a - b;
      });
      var C = Math.max(3, counts[Math.floor(counts.length / 2)] || 3);
      ks.forEach(function (gk) {
        var e = by[gk];
        var mean = e.sum / e.fights;
        e.avg = (e.fights * mean + C * globalMean) / (e.fights + C);
      });
    });
    keys.forEach(function (gk) {
      var e = by[gk];
      var face = null;
      Object.keys(e.faces).forEach(function (tk) {
        if (!face || e.faces[tk].n > face.n) face = e.faces[tk];
      });
      e.name = face.name;
      e.class = face.cls;
      e.spec = face.spec;
    });
    return by;
  }

  // Rich row for Most improved / Needs work — same look as the leaderboard value column (big gold
  // rate + total·fights·srv subtitle), with a colored arrow on the left and the % chip on the right.
  function mvRichRow(p, arrow, pctHtml) {
    var col = classColor(p.class);
    var rateLbl = p.metric === "hps" ? "HPS" : "DPS";
    return (
      '<li class="mvrow">' +
      arrow +
      cicon(p.class, p.spec) +
      '<span class="mvname pname" style="color:' +
      col +
      '">' +
      esc(p.name) +
      "</span>" +
      '<span class="pval">' +
      '<span class="prate">' +
      fmt(p.rate || 0) +
      ' <span class="unit">' +
      rateLbl +
      "</span></span></span>" +
      pctHtml +
      "</li>"
    );
  }

  // server percentile as a display number (e.g. 73.7) or null — for the rich subtitle.
  function srvPctVal(name) {
    var p = serverPctFor(name);
    return p == null ? null : Math.round(p * 1000) / 10;
  }

  // Split scoped logs into lockouts (newest→oldest). Used to compare the last lockout vs the previous
  // one directly — works with sparse history (we have distinct lockouts even if all within a month).
  function lockoutGroups(logs) {
    var g = {};
    logs.forEach(function (l) {
      var k = lockoutStart(l.date);
      (g[k] = g[k] || []).push(l);
    });
    return Object.keys(g)
      .sort()
      .reverse()
      .map(function (k) {
        return g[k];
      });
  }

  // improved = biggest % gain vs previous period; needsWork = MIX (declined + below guild avg + low output).
  // Both require MIN_FIGHTS in each period they use, so a 1-fight fluke can't top the list.
  function improvedAndNeedsWork(cur, prev) {
    var minF = MIN_FIGHTS[PERIOD] || 1;
    var curMap = ratesByPerson(cur);
    // "previous" for improvement = the lockout before the current scope's most recent one. Compare
    // last lockout vs the one before (works with sparse history) rather than a fixed day window.
    var groups = lockoutGroups(cur);
    var prevMap = groups.length >= 2 ? ratesByPerson(groups[1]) : prev.length ? ratesByPerson(prev) : {};
    // for the improvement %, current side should also be just the latest lockout (fair comparison)
    var lastLockMap = groups.length ? ratesByPerson(groups[0]) : curMap;

    // Guild average per role — computed over ALL logs (raid+size), not just the current period, so the
    // "below average" baseline is stable (a quiet week doesn't shift the bar). More data = fairer.
    var allMap = ratesByPerson(logsInScope("all"));
    var roleSum = { DPS: 0, HEALER: 0 },
      roleN = { DPS: 0, HEALER: 0 };
    Object.keys(allMap).forEach(function (k) {
      var e = allMap[k];
      if (e.fights >= 3) {
        roleSum[e.role] += e.avg;
        roleN[e.role]++;
      }
    });
    var roleAvg = {
      DPS: roleN.DPS ? roleSum.DPS / roleN.DPS : 0,
      HEALER: roleN.HEALER ? roleSum.HEALER / roleN.HEALER : 0,
    };

    // rank positions in each lockout (per role, by avg) so we can show how many places someone climbed
    function rankMap(map) {
      var r = {};
      ["DPS", "HEALER"].forEach(function (role) {
        Object.keys(map)
          .filter(function (k) {
            return map[k].role === role;
          })
          .sort(function (a, b) {
            return map[b].avg - map[a].avg;
          })
          .forEach(function (k, i) {
            r[k] = i; // 0-based rank within its role
          });
      });
      return r;
    }
    var curRank = rankMap(lastLockMap),
      prevRank = rankMap(prevMap);

    var improved = [];
    Object.keys(lastLockMap).forEach(function (k) {
      var c = lastLockMap[k],
        p = prevMap[k];
      if (!p || c.fights < minF || p.fights < minF || p.avg <= 0) return;
      var pct = ((c.avg - p.avg) / p.avg) * 100;
      if (pct < 3) return; // ignore noise/flat — only real gains (≥3%)
      var cc = curMap[k] || c; // period totals for the rich subtitle (fights/total/srv over the scope)
      var up = k in prevRank && k in curRank ? prevRank[k] - curRank[k] : null; // places climbed
      improved.push({
        name: c.name, class: c.class, spec: c.spec, metric: c.role === "HEALER" ? "hps" : "dps",
        from: Math.round(p.avg), to: Math.round(c.avg), deltaPct: Math.round(pct),
        rate: Math.round(cc.avg), total: cc.total, fights: cc.fights,
        serverPct: srvPctVal(c.name), rankUp: up != null && up > 0 ? up : null,
      });
    });
    improved.sort(function (a, b) {
      return b.deltaPct - a.deltaPct;
    });

    // Needs work — simply who is BELOW the guild average for their role. A top DPS who dipped one raid
    // isn't "needs work"; only genuinely below-par players are. Worst (furthest below) first.
    var needs = [];
    Object.keys(curMap).forEach(function (k) {
      var c = curMap[k];
      if (c.fights < minF) return;
      var avgRole = roleAvg[c.role] || 1;
      var belowPct = Math.round(((avgRole - c.avg) / avgRole) * 100);
      if (belowPct < 15) return; // only clearly below par (≥15%) is "needs work", not a small dip
      needs.push({
        name: c.name, class: c.class, spec: c.spec, metric: c.role === "HEALER" ? "hps" : "dps",
        value: Math.round(c.avg), belowPct: belowPct,
        rate: Math.round(c.avg), total: c.total, fights: c.fights,
        serverPct: srvPctVal(c.name),
      });
    });
    needs.sort(function (a, b) {
      return b.belowPct - a.belowPct; // furthest below average first
    });

    // follow the active metric toggle — DPS view shows dps movers, Healing view shows healer movers
    var wantMetric = METRIC === "hps" ? "hps" : "dps";
    var byMetric = function (p) {
      return p.metric === wantMetric;
    };
    return {
      improved: improved.filter(byMetric).slice(0, 6),
      needsWork: needs.filter(byMetric).slice(0, 6),
    };
  }
  // Bar width = blend of the real score gap AND rank position, so bars follow the score but never look
  // identical when scores are near-tied (e.g. #3/#4/#5 within 0.01). 70% score-scaled + 30% even steps.
  function barWidths(list) {
    var n = list.length;
    if (!n) return;
    var scores = list.map(function (p) {
      return p.score || 0;
    });
    var max = Math.max.apply(null, scores),
      min = Math.min.apply(null, scores);
    var span = max - min || 1;
    list.forEach(function (p, i) {
      var byScore = ((p.score || 0) - min) / span; // 0..1 by real value
      var byRank = n > 1 ? (n - 1 - i) / (n - 1) : 1; // 0..1 by position (already sorted best→worst)
      var mix = 0.7 * byScore + 0.3 * byRank;
      p.bar = Math.round(40 + mix * 60); // 40–100%
    });
  }

  // For the current size+raid, walk every lockout oldest→newest, find each lockout's #1 (dps & hps),
  // and count how many consecutive most-recent lockouts the same player has led. Returns {dps, hps}.
  function computeStreaks() {
    var minF = 1; // within a single lockout, any parse counts toward "who led that week"
    var rObj = (DATA.raids || []).find(function (r) {
      return r.key === RAID;
    });
    var rKeys = [RAID, rObj && rObj.label].filter(Boolean).map(function (x) {
      return String(x).toLowerCase();
    });
    var scoped = (DATA.logs || []).filter(function (l) {
      if (String(l.size) !== SIZE) return false;
      return (
        rKeys.indexOf(String(l.raid).toLowerCase()) >= 0 || rKeys.indexOf(String(l.raidSlug).toLowerCase()) >= 0
      );
    });
    // group by lockout
    var groups = {};
    scoped.forEach(function (l) {
      var k = lockoutStart(l.date);
      (groups[k] = groups[k] || []).push(l);
    });
    var keys = Object.keys(groups).sort(); // oldest → newest
    if (keys.length < 1) return { dps: 0, hps: 0 };

    // #1 name per lockout for each board
    var leadDps = [],
      leadHps = [];
    keys.forEach(function (k) {
      var d = aggregate(groups[k], "d", false, minF);
      var h = aggregate(groups[k], "h", true, minF);
      leadDps.push(d[0] ? normNm(d[0].name) : null);
      leadHps.push(h[0] ? normNm(h[0].name) : null);
    });
    // trailing consecutive same leader → { name, count }
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
  // logs in the window immediately before the current period (same length back).
  function prevWindowLogs(period) {
    var span = period === "week" ? 7 : 31;
    var now = Date.now();
    var rObj = (DATA.raids || []).find(function (r) {
      return r.key === RAID;
    });
    var rKeys = [RAID, rObj && rObj.label].filter(Boolean).map(function (x) {
      return String(x).toLowerCase();
    });
    return (DATA.logs || []).filter(function (l) {
      if (String(l.size) !== SIZE) return false;
      var raidMatch =
        rKeys.indexOf(String(l.raid).toLowerCase()) >= 0 || rKeys.indexOf(String(l.raidSlug).toLowerCase()) >= 0;
      if (!raidMatch) return false;
      var dt = new Date(l.date);
      if (isNaN(dt)) return false;
      var age = (now - dt.getTime()) / 86400000;
      return age > span && age <= span * 2;
    });
  }

  function render() {
    var d = DATA;
    buildRaidSegs();
    // show the board-head Normal|Heroic toggle only for split raids (ToC/ICC); sync its active state
    var bd = document.getElementById("boardDiff");
    if (bd) {
      bd.hidden = !SPLIT_DIFF_RAIDS[RAID];
      bd.querySelectorAll(".mbtn").forEach(function (b) {
        b.classList.toggle("active", b.dataset.d === PROGDIFF);
      });
    }
    computeLeaderboards();
    // secondary sections follow the DPS/Healing toggle — label them so it's clear they're not mixed
    document.querySelectorAll(".secmetric").forEach(function (el) {
      el.textContent = METRIC === "hps" ? "Healing" : "DPS";
    });
    // Empty state: no players in EITHER table for this raid/size/diff → clear the rows, hide the whole
    // "Trends & records" strip, and show one centred rats joke. We CLEAR innerHTML (not just hide) so a
    // previous raid's rows can never linger under the empty message.
    var boardEmpty = !(d.dps && d.dps.length) && !(d.hps && d.hps.length);
    var dpsEl2 = document.getElementById("dps"),
      hpsEl2 = document.getElementById("hps"),
      emptyEl = document.getElementById("boardEmpty"),
      secEl = document.getElementById("boardSecondary");

    dpsEl2.innerHTML = boardEmpty
      ? ""
      : (d.dps || []).map(function (p, i) { return lbRow(p, i, "dps"); }).join("");
    hpsEl2.innerHTML = boardEmpty
      ? ""
      : (d.hps || []).map(function (p, i) { return lbRow(p, i, "hps"); }).join("");

    if (emptyEl) {
      if (boardEmpty) {
        var rObj = (DATA.raids || []).filter(function (r) { return r.key === RAID; })[0];
        var lbl = (rObj && rObj.label) || RAID || "this raid";
        var diffTxt = SPLIT_DIFF_RAIDS[RAID] ? (PROGDIFF === "hc" ? "Heroic " : "Normal ") : "";
        emptyEl.innerHTML = emptyRatHtml("No " + lbl + " " + diffTxt + SIZE + "-man logs yet");
        emptyEl.hidden = false;
        dpsEl2.hidden = true;
        hpsEl2.hidden = true;
        if (secEl) secEl.hidden = true;
      } else {
        emptyEl.hidden = true;
        emptyEl.innerHTML = "";
        if (secEl) secEl.hidden = false;
        dpsEl2.hidden = METRIC !== "dps";
        hpsEl2.hidden = METRIC !== "hps";
      }
    }
    // Most improved — leaderboard-style rich row + green +% on the right
    document.getElementById("improved").innerHTML =
      (d.improved || [])
        .map(function (p) {
          var arrow = '<span class="mv up" title="climbed ' + (p.rankUp || 0) + ' place' + (p.rankUp === 1 ? "" : "s") + '">▲' + (p.rankUp ? p.rankUp : "") + "</span>";
          return mvRichRow(p, arrow, '<span class="mvpct up" title="up ' + p.deltaPct + "% vs the previous raid (was " + fmt(p.from) + ')">+' + p.deltaPct + "%</span>");
        })
        .join("") || '<li class="mvempty">— not enough history yet</li>';
    // Needs work — same red ▼ as the leaderboard (declined) or a below-avg marker
    document.getElementById("bottom").innerHTML =
      (d.bottom || [])
        .map(function (p) {
          return mvRichRow(p, '<span class="mv down">▼</span>', '<span class="mvpct down" title="' + p.belowPct + '% below the guild average">−' + p.belowPct + "%</span>");
        })
        .join("") || '<li class="mvempty">— everyone at or above par 🧀</li>';

    renderFunShame();
    renderProgress();

    var medal = ["🥇", "🥈", "🥉"];
    document.getElementById("records").innerHTML =
      (d.records || [])
        .map(function (r, i) {
          var col = classColor(r.class);
          var sizeCls = i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : "rn";
          return (
            '<li class="mvrow rec ' +
            sizeCls +
            '">' +
            '<span class="recmedal">' +
            (medal[i] || i + 1) +
            "</span>" +
            cicon(r.class, r.spec) +
            '<span class="recname pname" style="color:' +
            col +
            '">' +
            esc(r.name) +
            "</span>" +
            '<span class="recboss">' +
            esc(shortBoss(r.encounter)) +
            "</span>" +
            '<span class="pval"><span class="prate">' +
            fmt(r.value) +
            ' <span class="unit">' +
            (r.metric || "dps").toUpperCase() +
            "</span></span></span></li>"
          );
        })
        .join("") || '<li class="mvempty">— no parses yet</li>';

    var rObj = (d.raids || []).find(function (r) {
      return r.key === RAID;
    });
    var rKeys = [RAID, rObj && rObj.label].filter(Boolean).map(function (x) {
      return String(x).toLowerCase();
    });
    var inPeriod = function (s) {
      if (PERIOD === "all") return true;
      var dt = new Date(s);
      if (isNaN(dt)) return true;
      return (Date.now() - dt.getTime()) / 86400000 <= (PERIOD === "week" ? 7 : 31);
    };
    var logsForSize = (d.logs || []).filter(function (l) {
      var raidMatch =
        rKeys.indexOf(String(l.raid).toLowerCase()) >= 0 || rKeys.indexOf(String(l.raidSlug).toLowerCase()) >= 0;
      return normSize(l.size) === SIZE && raidMatch && inPeriod(l.date || l.uploadedAt);
    });
    renderLogs(logsForSize, (rObj && rObj.label) || RAID);
  }

  // ---- raid selector: built from the raids that appear in the logs, in fixed progression order ----
  // Canonical guild order — never trust the snapshot's array order (older snapshots had ICC first).
  var RAID_ORDER = ["ulduar", "toc", "icc"];
  var RAID = "";
  function buildRaidSegs() {
    var row = document.getElementById("raidRow");
    var raids = (DATA.raids || []).slice().sort(function (a, b) {
      var ia = RAID_ORDER.indexOf(a.key),
        ib = RAID_ORDER.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    if (!raids.length) {
      row.style.display = "none";
      return;
    }
    row.style.display = "inline-flex";
    // apply a raid from the URL once (if it exists in the list), else keep current / default to first
    if (window.__urlRaid) {
      if (
        raids.some(function (r) {
          return r.key === window.__urlRaid;
        })
      )
        RAID = window.__urlRaid;
      window.__urlRaid = null;
    }
    if (
      !raids.some(function (r) {
        return r.key === RAID;
      })
    )
      RAID = raids[0].key;
    document.getElementById("raidSegs").innerHTML = raids
      .map(function (r) {
        return (
          '<button class="seg' +
          (r.key === RAID ? " active" : "") +
          '" data-r="' +
          esc(r.key) +
          '" onclick="setRaid(this)">' +
          esc(r.label || r.key) +
          "</button>"
        );
      })
      .join("");
  }
  function setRaid(b) {
    RAID = b.dataset.r;
    document.querySelectorAll("#raidSegs .seg").forEach(function (s) {
      s.classList.toggle("active", s === b);
    });
    syncUrl();
    render();
  }

  // ---- log delete (officer) ------------------------------------------------------------------
  // `excludedLogs` is NOT a UI blacklist — an archived log never has rows to show anyway. It exists only
  // so the fetch can SKIP re-pulling logs the API already flagged ARCHIVED (see fetchData/apiIncremental).
  // Render filters do not consult it. The trash button below is a hard delete (removes from the DB).
  // DELETE a log from the snapshot — literally remove it from the DB. It is NOT blacklisted, so the next
  // Fetch is free to pull it again (that's the point: delete → re-fetch a clean copy). Use this for a bad
  // capture you want re-pulled. (Truly superseded uploads are dropped automatically via API logStatus.)
  async function excludeLog(reportId) {
    reportId = String(reportId);
    if (!confirm("Delete log #" + reportId + " from the database?\n\nIt is NOT blacklisted — the next Fetch can pull it again.")) return;
    // remove ONLY from the stored logs. Do not touch excludedLogs (no permanent blacklist).
    DATA.logs = (DATA.logs || []).filter(function (l) {
      return String(l.reportId) !== reportId;
    });
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: DATA }));
    } catch (e) {}
    if (window.RatsData && RatsData.fbOn && RatsData.fbOn() && RatsData.saveRankings) {
      try {
        await RatsData.saveRankings(DATA);
      } catch (e) {}
    }
    render(); // client-side only — toggles unaffected
  }

  // ---- wow-logs API client (officer-side Fetch only) ----------------------------------------
  // Real contract in docs/WOWLOGS_API.md. api. subdomain, Bearer key, plural /guilds. We pull the
  // full history (deduping the cycling cursor), fetch each full log, and DISCARD archived ones.
  var API_BASE = "https://api.wow-logs.co.in/api/v1";
  var API_GUILD = "warmane-onyxia/rats";

  function normNm(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  // Raid size → bare digit string ("25"/"10"). The API sends it as a number on some endpoints and a
  // (sometimes padded) string on others; size filters compare strings, so normalise on read.
  function normSize(v) {
    var m = String(v == null ? "" : v).match(/\d+/);
    return m ? m[0] : "";
  }

  var API_COST = 0; // sums X-RateLimit-Cost across a Fetch run → bumped into the monthly usage counter
  async function apiGet(path, key) {
    var r = await fetch(API_BASE + path, { headers: { Authorization: "Bearer " + key }, cache: "no-store" });
    var c = Number(r.headers.get("X-RateLimit-Cost"));
    API_COST += isNaN(c) || !c ? 1 : c; // fall back to 1 if the header is missing
    var j = await r.json().catch(function () {
      return null;
    });
    if (!r.ok || !j || j.ok === false) {
      throw new Error((j && j.error && j.error.message) || "HTTP " + r.status + " on " + path);
    }
    return j.data;
  }

  // History metadata, deduped by logId (cursor cycles — stop when a page adds no new ids).
  // maxPages 0/undefined = all; N = at most N pages (5 logs each).
  async function apiHistory(key, maxPages) {
    var seen = {},
      order = [],
      cursor = "",
      pages = 0;
    var cap = maxPages && maxPages > 0 ? maxPages : 12;
    while (pages < cap) {
      var qs = "?limit=5" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
      var data = await apiGet("/guilds/" + API_GUILD + "/logs" + qs, key);
      var fresh = 0;
      (data.logs || []).forEach(function (l) {
        if (!seen[l.logId]) {
          seen[l.logId] = l;
          order.push(l.logId);
          fresh++;
        }
      });
      pages++;
      cursor = (data.pagination && data.pagination.nextCursor) || "";
      if (!cursor || fresh === 0) break;
    }
    return order.map(function (id) {
      return seen[id];
    });
  }

  // INCREMENTAL pull. `have` = map of logId → true we already have in the snapshot. We only fetch
  // full payloads for logIds we DON'T have yet. Archived logs are still fetched once (cheap way to
  // learn they're archived) then discarded; if a logId we had is now archived, the caller drops it.
  // Returns { fresh: [log,…] (new, non-archived), archivedIds: [id,…] (now-archived, to remove) }.
  async function apiIncremental(key, opts) {
    opts = opts || {};
    var have = opts.have || {};
    var meta = await apiHistory(key, opts.maxPages);
    var toFetch = meta.filter(function (m) {
      return !have[m.logId];
    });
    var fresh = [],
      archivedIds = [];
    for (var i = 0; i < toFetch.length; i++) {
      if (opts.onProgress) opts.onProgress(i + 1, toFetch.length);
      try {
        var d = await apiGet("/guilds/" + API_GUILD + "/logs/" + toFetch[i].logId, key);
        if (d.log && d.log.logStatus === "ARCHIVED") archivedIds.push(String(toFetch[i].logId));
        else if (d.log) fresh.push(d.log);
      } catch (e) {}
      await new Promise(function (r) {
        setTimeout(r, 350);
      }); // stay under 30 rpm
    }
    return { fresh: fresh, archivedIds: archivedIds };
  }

  var API_SERVER_ID = 3; // warmane-onyxia

  // Ask the API which season scores each raid — ONE call, no more probing seasons 8→3. Returns
  // { raidSlug: season } from /meta/seasons phases[]. Onyxia mapping: naxx 4 · ulduar 5 · toc 6 · icc 7.
  // Falls back to that static map if the endpoint shape surprises us.
  async function apiRaidSeasons(key) {
    var map = {};
    try {
      var d = await apiGet("/meta/seasons?serverId=" + API_SERVER_ID, key);
      // shape: data.seasons[] or data.{season, phases:[{phase, primaryRaid}]} — probe defensively.
      var season = (d && (d.season || (d.current && d.current.season))) || null;
      var phases = (d && (d.phases || (d.current && d.current.phases))) || [];
      phases.forEach(function (p) {
        var slug = p.primaryRaid || (p.raid && p.raid.slug) || p.raidSlug;
        if (slug) map[String(slug).toLowerCase()] = p.season || season;
      });
    } catch (e) {}
    // Fallback: Onyxia's known scoring seasons — one season per phase (naxx 4 · ulduar 5 · toc 6 · icc 7).
    var FALLBACK = { naxx: 4, ulduar: 5, toc: 6, icc: 7 };
    Object.keys(FALLBACK).forEach(function (slug) {
      if (map[slug] == null) map[slug] = FALLBACK[slug];
    });
    return map;
  }

  // ONE rankings call for a known (raid, season, difficulty). No season sweep — the caller already
  // resolved the season via apiRaidSeasons. Returns { season, players:[{name,avg,bossPoints,bosses}] }
  // or null (raid not scored that season / no data). difficulty = "25-nm" | "25-hc" | "10-nm" | "10-hc".
  async function apiServerRankings(key, raidSlug, season, difficulty) {
    if (season == null) return null;
    try {
      var d = await apiGet(
        "/guilds/" + API_GUILD + "/rankings?raid=" + raidSlug +
          "&season=" + season + "&difficulty=" + difficulty + "&ladder=regular",
        key
      );
      var pl = (d.rankings && d.rankings.players) || [];
      if (!pl.length) return null;
      return {
        season: season,
        players: pl.map(function (p) {
          return { name: p.name, avg: p.averagePercent || 0, bossPoints: p.bossPoints || 0, bosses: p.bosses || {} };
        }),
      };
    } catch (e) {}
    return null;
  }

  // Map one raw API log → the compact `logs` entry, tagging Fangs count from the roster name set.
  // Also captures killed bosses + kill/wipe counts so the Logs tab can group & summarise by lockout.
  function logEntry(log, fangSet) {
    var names = {},
      killed = [],
      kills = 0,
      wipes = 0,
      firstStart = null,
      bfights = [], // one compact per-boss fight (kill or wipe) — feeds the Guild progress tab
      rows = []; // one compact row per player per KILL — feeds the leaderboards
    (log.fights || []).forEach(function (f) {
      if (f.start && (!firstStart || f.start < firstStart)) firstStart = f.start;
      // per-boss fight: boss, kill flag, duration, start, difficulty (HC/NM — the real hard-mode signal;
      // `f.hardmode` is always null, so we read hard mode off `difficulty` ending in _HC).
      bfights.push({
        bn: f.bossName,
        kill: !!f.kill,
        dur: f.durationSec || null,
        t: f.start || null,
        diff: f.difficulty || null,
        hm: /_HC$/.test(f.difficulty || ""),
      });
      if (f.kill) {
        kills++;
        if (killed.indexOf(f.bossName) < 0) killed.push(f.bossName);
        (f.players || []).forEach(function (p) {
          rows.push({
            n: p.name,
            c: p.class,
            s: p.spec || "",
            r: p.role || "DPS",
            d: p.dps || 0,
            h: p.hps || 0,
            dmg: p.damage || 0, // total damage this kill (boss-only — no trash in the feed)
            heal: p.healing || 0, // total healing this kill
            b: f.bossName,
            hm: /_HC$/.test(f.difficulty || ""), // Heroic? (for the ToC/ICC leaderboard NM/HC split)
          });
        });
      } else {
        wipes++;
      }
      (f.players || []).forEach(function (p) {
        names[normNm(p.name)] = true;
      });
    });
    var fangs = 0;
    if (fangSet) {
      Object.keys(names).forEach(function (n) {
        if (fangSet[n]) fangs++;
      });
    }
    return {
      reportId: String(log.logId),
      reportUrl: log.logUrl,
      raid: (log.raid && log.raid.name) || log.title || "Raid",
      raidSlug: (log.raid && log.raid.slug) || "",
      size: log.size,
      date: firstStart || log.uploadedAt, // real raid date (first fight), not upload time
      uploadedAt: log.uploadedAt,
      fangs: fangs,
      bosses: killed,
      kills: kills,
      wipes: wipes,
      bfights: bfights,
      rows: rows,
    };
  }

  // Keep ONLY the raw, source-of-truth fields for persistence. Everything else (dps/hps/mvp/records/
  // improved/bottom/progress/perBoss/wipes/awards/deaths) is derived on render and must NOT be stored,
  // or a stale computed copy would shadow the live recompute.
  function rawSnapshot(d) {
    return {
      guild: d.guild,
      realm: d.realm,
      period: d.period,
      generatedAt: d.generatedAt,
      raids: d.raids,
      logs: d.logs || [],
      excludedLogs: d.excludedLogs || [],
      rosterNames: d.rosterNames || [],
      altMap: d.altMap || {},
      mainSpec: d.mainSpec || {},
      serverPct: d.serverPct || {},
    };
  }

  // Merge fresh logs into the existing `logs` list; drop any ids now archived; sort newest-first.
  function mergeLogs(existing, fresh, archivedIds, fangSet) {
    var by = {};
    (existing || []).forEach(function (e) {
      by[e.reportId] = e;
    });
    (archivedIds || []).forEach(function (id) {
      delete by[id];
    });
    (fresh || []).forEach(function (log) {
      by[String(log.logId)] = logEntry(log, fangSet);
    });
    return Object.keys(by)
      .map(function (k) {
        return by[k];
      })
      .sort(function (a, b) {
        return new Date(b.date) - new Date(a.date);
      });
  }

  // Officer = anyone with the guild key. Only they see the gold Fetch button.
  var IS_OFFICER = !!localStorage.getItem("ratsGuildKey");
  async function fetchData() {
    var b = document.getElementById("fetchBtn"),
      lbl = b && b.querySelector("span");
    var setLbl = function (t) {
      if (lbl) lbl.textContent = t;
    };
    // persistent banner (survives past the button label's 2.5s reset) so a failed Fetch is unmissable
    var msgEl = document.getElementById("fetchMsg");
    var showMsg = function (t) {
      if (!msgEl) return;
      msgEl.textContent = t || "";
      msgEl.hidden = !t;
    };
    if (b) b.disabled = true;
    showMsg("");
    setLbl("Fetching…");
    API_COST = 0; // reset per-run cost tally (bumped into the monthly usage counter on success)
    try {
      if (!window.RatsData) throw new Error("data.js not loaded");
      var key = await RatsData.loadApiKey();
      if (!key) throw new Error("No API key — save one in the Admin console.");

      // roster → Fangs set (badge) + guild-member names (guildies-only) + alt→main map + MAIN SPEC.
      var fangSet = null,
        rosterNames = null,
        altMap = null,
        mainSpec = null; // normName → roster main spec label (e.g. "Restoration") — decides true role
      try {
        var roster = await RatsData.loadRoster({ interactive: false });
        var fl = roster && roster.data && Array.isArray(roster.data.fangs) ? roster.data.fangs : [];
        if (fl.length) {
          fangSet = {};
          fl.forEach(function (n) {
            fangSet[normNm(n)] = true;
          });
        }
        var savedSpecs = (roster && roster.data && roster.data.specs) || {};
        var members = roster && Array.isArray(roster.roster) ? roster.roster : [];
        if (members.length) {
          rosterNames = [];
          altMap = {};
          mainSpec = {};
          // "<Main> alt" in the officer note marks a toon as an alt of <Main>.
          var mainNoteOf = function (m) {
            var on = ((m && m.officerNote) || "").trim();
            var mm = on.match(/^(.+?)\s+alt\b/i);
            return mm ? mm[1].trim() : null;
          };
          // index members by name for main class/spec lookup
          var byName = {};
          members.forEach(function (m) {
            if (m && m.name) byName[normNm(m.name)] = m;
          });
          members.forEach(function (m) {
            if (!m || !m.name) return;
            rosterNames.push(m.name);
            // main spec: saved override first, else guess from the note (same as the guild page)
            var sp =
              savedSpecs[m.name] || (RatsData.guessSpec ? RatsData.guessSpec(m) : "") || "";
            if (sp) mainSpec[normNm(m.name)] = sp;
            var main = mainNoteOf(m);
            if (main) {
              var mm = byName[normNm(main)];
              altMap[normNm(m.name)] = {
                main: main,
                mainClass: (mm && mm.class) || "",
              };
            }
          });
        }
      } catch (e) {}

      // snapshot to merge into: current live one, else a copy of SAMPLE (keeps the not-yet-real slices)
      var snap = DATA && DATA !== SAMPLE ? DATA : JSON.parse(JSON.stringify(SAMPLE));
      var have = {};
      (snap.logs || []).forEach(function (l) {
        have[l.reportId] = true;
      });
      // Also skip logs we already know are ARCHIVED (in excludedLogs) — don't waste a call re-fetching
      // a superseded log just to re-learn it's archived. A rebuild clears this so they're re-checked once.
      (snap.excludedLogs || []).forEach(function (id) {
        have[String(id)] = true;
      });

      var scopeEl = document.getElementById("fetchScope");
      var maxPages = scopeEl ? parseInt(scopeEl.value, 10) : 0;
      // "All" (maxPages 0) = full rebuild: ignore what we have and re-fetch every log (recomputes
      // bosses/kills/wipes if the snapshot shape changed). Bounded scopes stay incremental.
      var rebuild = maxPages === 0;
      if (rebuild) { have = {}; snap.excludedLogs = []; } // rebuild re-checks archived status from scratch

      // PHASE 1 — LOGS (independent): fetch only missing logs. Wrapped in its own try so a log-fetch
      // error can't skip Phase 2 (server ranks). If nothing is new, res.fresh is empty and we do nothing
      // here — but Phase 2 still runs, because server ranks change constantly and must always refresh.
      var res = { fresh: [], archivedIds: [] };
      var phase1Err = null; // set if the log fetch died — used to SKIP Phase 2 (don't waste API calls)
      try {
        setLbl(rebuild ? "Rebuilding…" : "Scanning history…");
        res = await apiIncremental(key, {
          have: have,
          maxPages: maxPages,
          onProgress: function (i, n) {
            setLbl((rebuild ? "Log " : "New log ") + i + "/" + n + "…");
          },
        });
        snap.logs = mergeLogs(rebuild ? [] : snap.logs, res.fresh, res.archivedIds, fangSet);
        // Remember archived ids so we NEVER fetch them again — the API marked them superseded, so a later
        // Fetch would otherwise re-pull each one just to re-learn it's archived (a wasted call per log).
        if (res.archivedIds && res.archivedIds.length) {
          var exSet = {};
          (snap.excludedLogs || []).forEach(function (id) { exSet[String(id)] = true; });
          res.archivedIds.forEach(function (id) { exSet[String(id)] = true; });
          snap.excludedLogs = Object.keys(exSet);
        }
      } catch (e) {
        // Log phase failed (e.g. API 500). Remember it — and DON'T run Phase 2: the same API is down,
        // so the server-ranks calls would just burn our rate limit re-hitting a broken endpoint.
        phase1Err = e;
      }
      if (rosterNames) snap.rosterNames = rosterNames; // guild-only filter for leaderboards
      if (altMap) snap.altMap = altMap; // alt→main, so a person's toons count as one
      if (mainSpec) snap.mainSpec = mainSpec; // roster main spec → decides true role (healer vs dps)

      // PHASE 2 — SERVER RANKS (independent of Phase 1): ONE call per (raid × size × difficulty) we
      // ACTUALLY raided, at the raid's real scoring season (from /meta/seasons). No season sweep, no
      // calling difficulties/sizes we never played. serverPct[raidSlug][sizeKey][diffKey] = {season,players}.
      //
      // This ALWAYS runs — even when Phase 1 fetched no new log — because server ranks change constantly.
      // A refresh with nothing new must still update ranks. `rankOk` tracks whether the whole ranks pass
      // completed: if it didn't, we must NOT overwrite the previously-saved serverPct with a half-built
      // one (that's how ToC ended up missing — the run died before ranks and saved without them).
      var rankOk = false;
      var rankErr = null; // set if the ranks pass died (or was skipped because Phase 1 failed)
      var prevServerPct = snap.serverPct; // keep the last good copy to fall back on if this pass fails
      if (phase1Err) rankErr = phase1Err; // API is down — skip Phase 2 entirely, save the calls
      try {
        if (phase1Err) throw phase1Err; // jump straight to the catch — no server-rank calls made
        // which (raidSlug, size, "nm"/"hc") combos do our logs actually contain?
        var combos = {}; // "toc|25|nm" → {slug, size, diff}
        (snap.logs || []).forEach(function (l) {
          if (!l.raidSlug || !l.size) return;
          var sizeKey = normSize(l.size);
          (l.bfights || []).forEach(function (f) {
            var diffKey = f.hm ? "hc" : "nm";
            combos[l.raidSlug + "|" + sizeKey + "|" + diffKey] = {
              slug: l.raidSlug, size: sizeKey, diff: diffKey,
            };
          });
        });
        var seasonMap = await apiRaidSeasons(key); // one /meta/seasons call
        snap.serverPct = snap.serverPct || {};
        var comboList = Object.keys(combos);
        for (var ci = 0; ci < comboList.length; ci++) {
          var c = combos[comboList[ci]];
          var season = seasonMap[c.slug];
          var apiDiff = c.size + "-" + c.diff; // "25-nm"
          setLbl("Server ranks " + c.slug + " " + c.size + " " + c.diff.toUpperCase() + "…");
          var sr = await apiServerRankings(key, c.slug, season, apiDiff);
          await new Promise(function (r) { setTimeout(r, 300); }); // stay under 30 rpm
          if (!sr) continue;
          var m = {};
          sr.players.forEach(function (p) {
            m[normNm(p.name)] = { avg: p.avg, bossPoints: p.bossPoints, bosses: p.bosses };
          });
          snap.serverPct[c.slug] = snap.serverPct[c.slug] || {};
          snap.serverPct[c.slug][c.size] = snap.serverPct[c.slug][c.size] || {};
          // keep per-difficulty; also mirror to the bare size key for back-compat with existing readers
          snap.serverPct[c.slug][c.size][c.diff] = { season: sr.season, players: m };
          snap.serverPct[c.slug][c.size].season = sr.season;
          snap.serverPct[c.slug][c.size].players = m;
        }
        rankOk = true; // full ranks pass completed — safe to persist this serverPct
      } catch (e) { rankErr = rankErr || e; }
      // If the ranks pass blew up mid-way, don't ship a half-built serverPct — keep the last good one.
      if (!rankOk && prevServerPct) snap.serverPct = prevServerPct;

      snap.generatedAt = new Date().toISOString();
      DATA = snap;
      var added = res.fresh.length,
        dropped = res.archivedIds.length;

      render();

      // Total failure (logs never loaded): nothing new was computed, so don't overwrite the good
      // Firebase snapshot / cache with this run. Jump to the error label below.
      if (phase1Err) throw phase1Err;

      // persist ONLY raw fields — never the computed leaderboards (dps/hps/mvp/records/…). Those are
      // derived from logs[].rows on every render, so the snapshot must stay raw or an old computed
      // copy would shadow the live recompute (e.g. a stale streak). This keeps "F5 recomputes" true.
      var rawSnap = rawSnapshot(DATA);
      var savedT = Date.now();
      if (window.RatsData && RatsData.fbOn && RatsData.fbOn() && RatsData.saveRankings) {
        try {
          var t = await RatsData.saveRankings(rawSnap);
          if (t) savedT = t; // cache under the SAME t Firebase stored, so the version probe matches
        } catch (e) {}
      }
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ t: savedT, data: rawSnap }));
      } catch (e) {}
      // add this run's real API cost (Σ X-RateLimit-Cost) to the guild-wide monthly usage counter
      if (window.RatsData && RatsData.bumpApiUsage) {
        try { await RatsData.bumpApiUsage(API_COST); } catch (e) {}
      }
      // A partial failure must NOT read as "✓ up to date". If logs merged but server ranks failed,
      // the data is only partly updated — say so with a ⚠ label + persistent banner.
      if (rankErr) {
        setLbl(
          (added || dropped ? "⚠ +" + added + (dropped ? " / −" + dropped : "") : "⚠ logs ok") +
            " (ranks failed)"
        );
        showMsg("Logs updated, but server ranks failed (" +
          (rankErr && rankErr.message ? rankErr.message : "request failed") +
          "). Guild leaderboards are current; server-percentile ranks may be stale — try Fetch again.");
      } else {
        setLbl(
          added || dropped
            ? "✓ +" + added + (dropped ? " / −" + dropped : "") + " (" + snap.logs.length + " logs)"
            : "✓ up to date (" + snap.logs.length + ")"
        );
      }
    } catch (e) {
      // Total failure (thrown from Phase 1 or the guard above): nothing was saved — the console shows
      // the real HTTP error (e.g. 500 on /meta/seasons). Keep the good snapshot; just warn the officer.
      setLbl("✗ fetch failed");
      showMsg("Fetch failed: " + (e && e.message ? e.message : "unknown error") +
        ". Nothing was saved — the rankings shown may be stale. Try again shortly.");
    }
    setTimeout(function () {
      if (b) b.disabled = false;
      setLbl("Fetch data");
    }, 2500);
  }

  // Public reads ONE snapshot from Firebase (officer's Fetch writes it). All raids/sizes/periods live
  // inside it, so toggles filter client-side. Cache-buster: we store the snapshot's own `t` and probe
  // only `rankings/t` (a few bytes) on load — if it matches the cache, we skip the full download; if
  // the officer re-fetched (new `t`), everyone picks it up immediately, no manual cache clear, no TTL.
  var CACHE_KEY = "ratsRankCache";
  async function load(force) {
    var cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    } catch (e) {}

    if (!force && cached && cached.data) {
      // cheap version probe — reuse cache unless Firebase has a newer snapshot
      try {
        if (window.RatsData && RatsData.loadRankingsVersion) {
          var ver = await RatsData.loadRankingsVersion();
          if (ver != null && ver === cached.t) {
            DATA = rawSnapshot(cached.data);
            render();
            return;
          }
        } else {
          // no probe available → fall back to using cache
          DATA = rawSnapshot(cached.data);
          render();
          return;
        }
      } catch (e) {
        DATA = rawSnapshot(cached.data);
        render();
        return;
      }
    }

    // fetch the full snapshot and cache it under ITS OWN `t` (so the probe above can match next time)
    try {
      if (window.RatsData && RatsData.loadRankings) {
        var snap = await RatsData.loadRankings();
        if (snap && snap.data) {
          DATA = rawSnapshot(snap.data);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ t: snap.t, data: DATA }));
          } catch (e) {}
        }
      }
    } catch (e) {}
    render();
  }

  // expose handlers used by inline onclick
  window.setTab = setTab;
  window.setSize = setSize;
  window.setPeriod = setPeriod;
  window.setRaid = setRaid;
  window.setMetric = setMetric;
  window.fetchData = fetchData;
  window.excludeLog = excludeLog;

  if (IS_OFFICER) {
    var fw = document.getElementById("fetchWrap");
    if (fw) fw.hidden = false;
  }

  // restore raid/size/period/metric/tab from the URL (deep-linkable, survives reload)
  (function restoreFromUrl() {
    var q = new URLSearchParams(location.search);
    // size
    var sz = q.get("size");
    if (sz === "10" || sz === "25") {
      SIZE = sz;
      document.querySelectorAll("#sizeSegs .seg").forEach(function (s) {
        s.classList.toggle("active", s.dataset.s === sz);
      });
    }
    // period
    var pd = q.get("period");
    if (pd === "week" || pd === "month" || pd === "all") {
      PERIOD = pd;
      document.querySelectorAll("#periodSegs .seg").forEach(function (s) {
        s.classList.toggle("active", s.dataset.p === pd);
      });
    }
    // metric
    var mt = q.get("metric");
    if (mt === "hps") {
      METRIC = "hps";
      document.querySelectorAll(".metricbar .mbtn").forEach(function (s) {
        s.classList.toggle("active", s.dataset.m === "hps");
      });
      var dEl = document.getElementById("dps"),
        hEl = document.getElementById("hps");
      if (dEl) dEl.hidden = true;
      if (hEl) hEl.hidden = false;
    }
    // progress difficulty split (ToC/ICC)
    var df = q.get("diff");
    if (df === "hc" || df === "nm") PROGDIFF = df;
    // tab
    var tb = q.get("tab");
    if (tb) {
      var tbBtn = document.querySelector('.tab[data-t="' + tb + '"]');
      if (tbBtn) setTab(tbBtn);
    }
    // raid is applied after DATA loads (buildRaidSegs) — stash it
    window.__urlRaid = q.get("raid") || null;
  })();

  load();
})();
