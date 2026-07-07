/* RATS — Rankings & Hall of Fame. Public, logs-fed.
   Officer's gold Fetch (guild-key-gated) pulls the wow-logs API, computes, writes ONE `rankings`
   snapshot to Firebase. Visitors read that snapshot once per visit (TTL 30 min) and filter client-side
   — raid/size/period toggles never hit the network. Full spec in .claude/rules/rankings.md. */
(function () {
  "use strict";
  var U = window.RatsUtils;
  var CLASS_COLOR = U.CLASS_COLOR,
    esc = U.esc,
    classColor = U.classColor;
  var fmt = function (n) {
    return Number(n || 0).toLocaleString("en-US");
  };
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
              ? '<button class="logdel" title="Exclude this log (bad/duplicate upload)" ' +
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

  function renderProgress(d) {
    var el = document.getElementById("progress");
    if (!el) return;
    var p = d.progress || {},
      tw = p.thisWeek,
      lw = p.lastWeek;
    var boss = d.perBoss || [];
    var statusOf = function (b) {
      return (b.kill && b.kill.status) || b.status || (b.kill && b.kill.time ? "killed" : "pending");
    };
    var total = boss.length;
    var killed =
      tw && tw.bosses != null
        ? tw.bosses
        : boss.filter(function (b) {
            return statusOf(b) === "killed";
          }).length;
    var head = "";
    if (tw && lw) {
      var dB = (tw.bosses || 0) - (lw.bosses || 0);
      var dW = (tw.wipes || 0) - (lw.wipes || 0);
      var dT = (toSec(tw.raidTime) || 0) - (toSec(lw.raidTime) || 0);
      var score = 0;
      if (dB > 0) score++;
      if (dB < 0) score--;
      if (dW < 0) score++;
      if (dW > 0) score--;
      if (dT < 0) score++;
      if (dT > 0) score--;
      var v = score > 0 ? "good" : score < 0 ? "bad" : "flat";
      var vEmoji = score > 0 ? "📈" : score < 0 ? "📉" : "➖";
      var vText =
        score > 0
          ? "Better week than last time"
          : score < 0
            ? "Tougher week than last time"
            : "About the same as last week";
      var bits = [];
      if (dB)
        bits.push(
          Math.abs(dB) + " " + (dB > 0 ? "more" : "fewer") + " boss" + (Math.abs(dB) !== 1 ? "es" : "") + " down"
        );
      if (dW) bits.push(Math.abs(dW) + " " + (dW < 0 ? "fewer" : "more") + " wipes");
      if (dT) bits.push(fmtDur(dT) + " " + (dT < 0 ? "faster" : "slower") + " clear");
      head =
        '<div class="verdict ' +
        v +
        '"><span class="em">' +
        vEmoji +
        "</span><span>" +
        vText +
        '<span class="sub2">' +
        (bits.join(" · ") || "no change vs last raid") +
        "</span></span></div>" +
        '<div class="gsum">' +
        '<div class="gs"><div class="lbl">Bosses cleared</div><div class="v">' +
        killed +
        '<span style="font-size:14px;color:#6e7178"> / ' +
        total +
        "</span></div>" +
        cmp(
          killed,
          lw.bosses,
          false,
          function (x) {
            return "+" + x;
          },
          ["", ""]
        ) +
        "</div>" +
        '<div class="gs"><div class="lbl">Total wipes</div><div class="v">' +
        (tw.wipes != null ? tw.wipes : "—") +
        "</div>" +
        cmp(
          tw.wipes,
          lw.wipes,
          true,
          function (x) {
            return x;
          },
          ["fewer", "more"]
        ) +
        "</div>" +
        '<div class="gs"><div class="lbl">Boss encounter time</div><div class="v">' +
        esc(tw.bossTime || "—") +
        "</div>" +
        cmp(toSec(tw.bossTime), toSec(lw.bossTime), true, fmtDur, ["faster", "slower"]) +
        "</div>" +
        '<div class="gs"><div class="lbl">Full clear time</div><div class="v">' +
        esc(tw.raidTime || "—") +
        "</div>" +
        cmp(toSec(tw.raidTime), toSec(lw.raidTime), true, fmtDur, ["faster", "slower"]) +
        "</div>" +
        "</div>" +
        '<p class="compnote">This raid (' +
        esc(tw.date || "") +
        ") vs last raid (" +
        esc(lw.date || "") +
        ").</p>";
    }
    var rows = boss
      .map(function (b) {
        var k = b.kill || {},
          st = statusOf(b);
        var mt =
          '<span class="mtag ' +
          (b.metric === "hps" ? "hps" : "dps") +
          '">' +
          (b.metric === "hps" ? "HPS" : "DPS") +
          "</span>";
        if (st === "pending") {
          var att = k.pulls ? k.pulls + " pull" + (k.pulls !== 1 ? "s" : "") + " so far" : "not pulled yet";
          return (
            '<tr class="pend"><td class="bn">' +
            esc(b.encounter) +
            " " +
            mt +
            '</td><td><span class="pendtag">⏳ not yet</span></td><td></td><td class="num">' +
            att +
            '</td><td><span class="pendtag">' +
            esc(k.note || "saved for next raid night") +
            "</span></td></tr>"
          );
        }
        if (st === "nokill") {
          var att2 = k.pulls ? k.pulls + " pull" + (k.pulls !== 1 ? "s" : "") : "—";
          return (
            '<tr class="nokill"><td class="bn">' +
            esc(b.encounter) +
            " " +
            mt +
            '</td><td><span class="nokilltag">✖ no kill</span></td><td></td><td class="num">' +
            att2 +
            '</td><td><span class="nokilltag">lockout reset unkilled</span></td></tr>'
          );
        }
        var tDelta = cmp(toSec(k.time), toSec(k.prevTime), true, fmtDur, ["faster", "slower"]);
        var wipes =
          k.wipes == null
            ? "—"
            : k.wipes +
              (k.prevWipes != null && k.prevWipes !== k.wipes
                ? ' <span class="' + (k.prevWipes > k.wipes ? "better" : "d bad") + '">(was ' + k.prevWipes + ")</span>"
                : "");
        var flags = [
          b.record ? '<span class="rec">🏆 record</span>' : "",
          k.newThisWeek ? '<span class="better">⭐ NEW KILL</span>' : "",
          k.hardmode ? '<span class="rec">HARD MODE</span>' : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          '<tr><td class="bn">' +
          esc(b.encounter) +
          " " +
          mt +
          '</td><td class="num">' +
          esc(k.time || "—") +
          "</td><td>" +
          tDelta +
          '</td><td class="num">' +
          wipes +
          "</td><td>" +
          flags +
          "</td></tr>"
        );
      })
      .join("");
    el.innerHTML =
      head +
      '<div class="card" style="padding:4px 14px"><table class="progtbl"><thead><tr><th>Boss</th><th>Kill time</th><th>vs last</th><th>Wipes</th><th></th></tr></thead><tbody>' +
      rows +
      "</tbody></table></div>" +
      '<div class="leg"><span><b>✓</b> killed</span><span><b style="color:#9aa0a6">⏳</b> saved for the next raid night</span><span><b style="color:#ff9b9b">✖</b> lockout reset without the kill</span></div>';
  }

  function setTab(b) {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t === b);
    });
    var t = b.dataset.t;
    document.querySelectorAll(".panel").forEach(function (p) {
      p.hidden = p.dataset.panel !== t;
    });
  }

  // NOTE: toggles only re-render from already-loaded data — they never hit the network.
  var SIZE = "25";
  function setSize(b) {
    SIZE = b.dataset.s;
    document.querySelectorAll("#sizeSegs .seg").forEach(function (s) {
      s.classList.toggle("active", s === b);
    });
    render();
  }
  var PERIOD = "all";
  function setPeriod(b) {
    PERIOD = b.dataset.p;
    document.querySelectorAll("#periodSegs .seg").forEach(function (s) {
      s.classList.toggle("active", s === b);
    });
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
    render(); // Records follows the active metric (DPS peaks ⇄ HPS peaks)
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
  function deltaTag(d, streak) {
    // 👑 crown (N weeks at #1) lives in the rank-change column; it replaces the "=" for a held #1.
    var crown = streak > 1 ? '<span class="crownmv" title="' + streak + ' weeks at #1">👑' + streak + "x</span>" : "";
    if (crown && (d === "none" || d == null || d === 0)) return '<span class="mv">' + crown + "</span>";
    if (d === "none") return crown ? '<span class="mv">' + crown + "</span>" : ""; // All time: no prev period
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
      (p.serverPct != null
        ? ' · <span class="psrv" title="percentile vs the whole server">' + p.serverPct + "% srv</span>"
        : "") +
      "</span>" +
      "</span>" +
      "</li>"
    );
  }
  function shameRow(p, i) {
    var col = classColor(p.class);
    return (
      "<li>" +
      '<span class="rank">' +
      (i + 1) +
      "</span>" +
      '<span style="flex:1 1 auto;min-width:0"><span class="pname" style="color:' +
      col +
      '">' +
      esc(p.name) +
      "</span>" +
      (p.tagline ? '<span class="tagline">"' + esc(p.tagline) + '"</span>' : "") +
      "</span>" +
      '<span class="pval">' +
      p.deaths +
      " ☠️</span>" +
      "</li>"
    );
  }
  // ---- leaderboard engine: aggregate players from logs[].rows for the active raid/size/period -----
  // Runs on every render (toggles just re-render — no network). Metric = AVERAGE across kills, with the
  // player's BEST parse shown alongside. role === "HEALER" → HPS table, everyone else → DPS.
  var MIN_FIGHTS = { week: 1, month: 3, all: 3 }; // consistency gate: bigger periods need ≥3 fights

  function logsInScope(period) {
    var excl = excludedSet();
    var rObj = (DATA.raids || []).find(function (r) {
      return r.key === RAID;
    });
    var rKeys = [RAID, rObj && rObj.label].filter(Boolean).map(function (x) {
      return String(x).toLowerCase();
    });
    return (DATA.logs || []).filter(function (l) {
      if (excl[String(l.reportId)]) return false;
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

  // Resolve a toon name → the PERSON (main). Alts fold into their main. Returns { key, name, cls }.
  function resolveIdentity(name, fallbackClass) {
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
      (l.rows || []).forEach(function (r) {
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

  // Tank fights must NOT count toward DPS — a Protection warrior/paladin was TANKING, not doing damage
  // (e.g. Rellik went Prot on 4 bosses; those ~1500 dps fights unfairly tanked his average). Protection
  // is always a tank spec in WotLK. (We can't reliably detect DK/Druid tanking without threat/dmgTaken.)
  var TANK_SPEC = { Protection: true };
  function isTankFight(r) {
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
      (l.rows || []).forEach(function (r) {
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
    if (!bySize || !bySize.players) return null;
    var rec = bySize.players[normNm(faceName)];
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
      (l.rows || []).forEach(function (r) {
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
      (l.rows || []).forEach(function (r) {
        var isH = r.r === "HEALER";
        if (wantHealer !== isH) return;
        if (!isH && isTankFight(r)) return;
        var id = resolveIdentity(r.n, r.c);
        if (guild && !guild[id.key] && !guild[normNm(r.n)]) return;
        out.push({
          name: id.name, class: r.c, spec: r.s, encounter: r.b,
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
      (l.rows || []).forEach(function (r) {
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

    return { improved: improved.slice(0, 6), needsWork: needs.slice(0, 6) };
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
    var excl = excludedSet();
    var rObj = (DATA.raids || []).find(function (r) {
      return r.key === RAID;
    });
    var rKeys = [RAID, rObj && rObj.label].filter(Boolean).map(function (x) {
      return String(x).toLowerCase();
    });
    var scoped = (DATA.logs || []).filter(function (l) {
      if (excl[String(l.reportId)]) return false;
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
    var excl = excludedSet();
    var rObj = (DATA.raids || []).find(function (r) {
      return r.key === RAID;
    });
    var rKeys = [RAID, rObj && rObj.label].filter(Boolean).map(function (x) {
      return String(x).toLowerCase();
    });
    return (DATA.logs || []).filter(function (l) {
      if (excl[String(l.reportId)]) return false;
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
    computeLeaderboards();
    var m = d.mvp,
      mc = m ? classColor(m.class) : "#fff";
    document.getElementById("mvp").innerHTML = m
      ? '<div class="mvp">' +
        '<span class="crown">🔥</span>' +
        '<div><div class="who" style="color:' +
        mc +
        '">' +
        esc(m.name) +
        "</div>" +
        '<div class="meta">' +
        esc(m.spec || "") +
        " · " +
        esc(m.encounter || "") +
        " · " +
        esc(m.date || "") +
        "</div></div>" +
        '<div class="val"><b>' +
        fmt(m.value) +
        "</b><span>" +
        (m.metric || "dps").toUpperCase() +
        " · top parse " +
        (PERIOD === "all" ? "all time" : PERIOD === "month" ? "this month" : "this week") +
        "</span></div>" +
        "</div>"
      : "";
    document.getElementById("dps").innerHTML = (d.dps || [])
      .map(function (p, i) {
        return lbRow(p, i, "dps");
      })
      .join("");
    document.getElementById("hps").innerHTML = (d.hps || [])
      .map(function (p, i) {
        return lbRow(p, i, "hps");
      })
      .join("");
    document.getElementById("deaths").innerHTML = (d.deaths || []).map(shameRow).join("");
    document.getElementById("awards").innerHTML = (d.awards || [])
      .map(function (a) {
        var col = classColor(a.class);
        return (
          '<div class="award"><span class="em">' +
          (a.emoji || "🏅") +
          "</span>" +
          '<div><div class="at">' +
          esc(a.title) +
          "</div>" +
          '<div class="an" style="color:' +
          col +
          '">' +
          esc(a.name) +
          "</div>" +
          '<div class="ad">' +
          esc(a.note || "") +
          "</div></div></div>"
        );
      })
      .join("");

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

    var fs = d.funStats || {};
    var funCard = function (em, title, o, suffix) {
      if (!o) return "";
      var col = classColor(o.class);
      var extra = o.ability ? " · " + esc(o.ability) : o.encounter ? " · " + esc(o.encounter) : "";
      return (
        '<div class="award"><span class="em">' +
        em +
        '</span><div><div class="at">' +
        title +
        '</div><div class="an" style="color:' +
        col +
        '">' +
        esc(o.name) +
        '</div><div class="ad">' +
        fmt(o.value) +
        (suffix || "") +
        extra +
        "</div></div></div>"
      );
    };
    document.getElementById("fun").innerHTML = [
      funCard("💥", "Biggest hit", fs.biggestHit, ""),
      funCard("🛡️", "Most damage taken", fs.mostDamageTaken, ""),
      funCard("🌊", "Most overhealing", fs.mostOverhealing, ""),
      funCard("⚡", "Most interrupts", fs.mostInterrupts, " casts"),
    ].join("");

    renderProgress(d);

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
            '<span class="recname"><span class="pname" style="color:' +
            col +
            '">' +
            esc(r.name) +
            '</span> <span class="recboss">· ' +
            esc(r.encounter) +
            "</span></span>" +
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
    var excl = excludedSet();
    var logsForSize = (d.logs || []).filter(function (l) {
      if (excl[String(l.reportId)]) return false;
      var raidMatch =
        rKeys.indexOf(String(l.raid).toLowerCase()) >= 0 || rKeys.indexOf(String(l.raidSlug).toLowerCase()) >= 0;
      return String(l.size) === SIZE && raidMatch && inPeriod(l.date || l.uploadedAt);
    });
    renderLogs(logsForSize, (rObj && rObj.label) || RAID);

    document.getElementById("wipes").innerHTML =
      (d.wipes || [])
        .map(function (w) {
          return (
            '<li><span class="pname" style="flex:1 1 auto;color:#cfd2d6">' +
            esc(w.encounter) +
            "</span>" +
            (w.pulls ? '<span class="pspec" style="margin-right:10px">' + w.pulls + " pulls</span>" : "") +
            '<span class="pval" style="color:#ff9b9b">' +
            w.deaths +
            " ☠️</span></li>"
          );
        })
        .join("") || '<li style="border:0;color:#6e7178">No wipes — clean week! 🧀</li>';
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
    render();
  }

  // ---- manual log exclusion (officer) --------------------------------------------------------
  // The API sometimes keeps a bad/duplicate upload as "Original" (e.g. a log the officer archived
  // but a second raider re-uploaded, carrying a phantom kill). Officers can exclude a reportId here;
  // the id lives in the shared snapshot (`excludedLogs`) so everyone sees the cleaned view. Excluding
  // only re-renders + re-persists — it never re-fetches, so all toggles keep filtering client-side.
  function excludedSet() {
    var s = {};
    ((DATA && DATA.excludedLogs) || []).forEach(function (id) {
      s[String(id)] = true;
    });
    return s;
  }
  async function excludeLog(reportId) {
    reportId = String(reportId);
    if (!confirm("Exclude log #" + reportId + " from the rankings? (bad/duplicate upload)")) return;
    DATA.excludedLogs = ((DATA && DATA.excludedLogs) || []).slice();
    if (DATA.excludedLogs.indexOf(reportId) < 0) DATA.excludedLogs.push(reportId);
    // drop it from the stored logs too, so it won't reappear without a full rebuild
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

  async function apiGet(path, key) {
    var r = await fetch(API_BASE + path, { headers: { Authorization: "Bearer " + key }, cache: "no-store" });
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

  // Fetch server-wide percentiles (Boss Points V2) for a raid. The scoring SEASON isn't the phase
  // number — we probe seasons (newest→older) until one returns players with points. Returns
  // { season, players:[{name, avg, bosses}] } or null. difficulty is "25-hc" / "10-hc".
  async function apiServerRankings(key, raidSlug, difficulty) {
    for (var s = 8; s >= 3; s--) {
      try {
        var d = await apiGet(
          "/guilds/" +
            API_GUILD +
            "/rankings?raid=" +
            raidSlug +
            "&season=" +
            s +
            "&difficulty=" +
            difficulty +
            "&ladder=regular",
          key
        );
        var pl = (d.rankings && d.rankings.players) || [];
        var withPts = pl.filter(function (p) {
          return (p.bossPoints || 0) > 0;
        });
        if (withPts.length) {
          return {
            season: s,
            players: pl.map(function (p) {
              return { name: p.name, avg: p.averagePercent || 0, bossPoints: p.bossPoints || 0, bosses: p.bosses || {} };
            }),
          };
        }
      } catch (e) {}
      await new Promise(function (r) {
        setTimeout(r, 300);
      });
    }
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
      rows = []; // one compact row per player per KILL — feeds the leaderboards
    (log.fights || []).forEach(function (f) {
      if (f.start && (!firstStart || f.start < firstStart)) firstStart = f.start;
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
    if (b) b.disabled = true;
    setLbl("Fetching…");
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

      var scopeEl = document.getElementById("fetchScope");
      var maxPages = scopeEl ? parseInt(scopeEl.value, 10) : 0;
      // "All" (maxPages 0) = full rebuild: ignore what we have and re-fetch every log (recomputes
      // bosses/kills/wipes if the snapshot shape changed). Bounded scopes stay incremental.
      var rebuild = maxPages === 0;
      if (rebuild) have = {};

      setLbl(rebuild ? "Rebuilding…" : "Scanning history…");
      var res = await apiIncremental(key, {
        have: have,
        maxPages: maxPages,
        onProgress: function (i, n) {
          setLbl((rebuild ? "Log " : "New log ") + i + "/" + n + "…");
        },
      });

      snap.logs = mergeLogs(rebuild ? [] : snap.logs, res.fresh, res.archivedIds, fangSet);
      if (rosterNames) snap.rosterNames = rosterNames; // guild-only filter for leaderboards
      if (altMap) snap.altMap = altMap; // alt→main, so a person's toons count as one
      if (mainSpec) snap.mainSpec = mainSpec; // roster main spec → decides true role (healer vs dps)

      // server-wide percentiles (Boss Points) for the HYBRID score + profile pages.
      // serverPct[raidSlug][sizeKey][normName] = { avg, bosses }. Probes seasons to find data.
      try {
        var raidSlugs = {};
        (snap.logs || []).forEach(function (l) {
          if (l.raidSlug) raidSlugs[l.raidSlug] = true;
        });
        snap.serverPct = snap.serverPct || {};
        var slugList = Object.keys(raidSlugs);
        for (var si = 0; si < slugList.length; si++) {
          var slug = slugList[si];
          snap.serverPct[slug] = snap.serverPct[slug] || {};
          var diffs = [
            ["25", "25-hc"],
            ["10", "10-hc"],
          ];
          for (var di = 0; di < diffs.length; di++) {
            setLbl("Server ranks " + slug + " " + diffs[di][0] + "…");
            var sr = await apiServerRankings(key, slug, diffs[di][1]);
            if (sr) {
              var m = {};
              sr.players.forEach(function (p) {
                m[normNm(p.name)] = { avg: p.avg, bosses: p.bosses };
              });
              snap.serverPct[slug][diffs[di][0]] = { season: sr.season, players: m };
            }
          }
        }
      } catch (e) {}

      snap.generatedAt = new Date().toISOString();
      DATA = snap;
      var added = res.fresh.length,
        dropped = res.archivedIds.length;

      render();

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
      setLbl(
        added || dropped
          ? "✓ +" + added + (dropped ? " / −" + dropped : "") + " (" + snap.logs.length + " logs)"
          : "✓ up to date (" + snap.logs.length + ")"
      );
    } catch (e) {
      setLbl("✗ " + (e && e.message ? e.message : "failed"));
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
  load();
})();
