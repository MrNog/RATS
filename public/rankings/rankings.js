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
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var fmtDate = function (s) {
    if (!s) return "";
    var d = new Date(s);
    return isNaN(d) ? String(s) : d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear();
  };

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
  var SAMPLE = {
    guild: "RATS",
    realm: "Onyxia",
    period: "week",
    generatedAt: "2026-06-28T20:00:00Z",
    raids: [
      { key: "icc", label: "ICC" },
      { key: "ulduar", label: "Ulduar" },
      { key: "toc", label: "ToC" },
    ],
    mvp: {
      name: "Okanor",
      class: "Paladin",
      spec: "Retribution",
      encounter: "Lord Marrowgar",
      metric: "dps",
      value: 6012,
      reportUrl: "#",
      date: "2026-06-25",
    },
    dps: [
      {
        name: "Kobee",
        class: "Rogue",
        spec: "Assassination",
        value: 6450,
        fights: 12,
        delta: 2,
        streak: 3,
        reportUrl: "#",
      },
      { name: "Magoluso", class: "Mage", spec: "Fire", value: 6210, fights: 13, delta: 1, reportUrl: "#" },
      { name: "Okanor", class: "Paladin", spec: "Retribution", value: 6012, fights: 14, delta: -2, reportUrl: "#" },
      { name: "Franzherman", class: "Warlock", spec: "Affliction", value: 5740, fights: 14, delta: 0, reportUrl: "#" },
      { name: "Ardil", class: "Druid", spec: "Feral", value: 5400, fights: 11, delta: 3, reportUrl: "#" },
      { name: "Kinven", class: "Hunter", spec: "Marksmanship", value: 5120, fights: 13, delta: -1, reportUrl: "#" },
      { name: "Rellik", class: "Paladin", spec: "Retribution", value: 4880, fights: 9, delta: null, reportUrl: "#" },
      { name: "Shmurda", class: "Warrior", spec: "Fury", value: 4600, fights: 12, delta: 0, reportUrl: "#" },
      { name: "Mijinho", class: "Shaman", spec: "Enhancement", value: 4310, fights: 8, delta: 1, reportUrl: "#" },
      { name: "Pamevoid", class: "Warlock", spec: "Demonology", value: 4050, fights: 10, delta: -3, reportUrl: "#" },
    ],
    hps: [
      {
        name: "Khaddash",
        class: "Priest",
        spec: "Discipline",
        value: 5100,
        fights: 14,
        delta: 0,
        streak: 5,
        reportUrl: "#",
      },
      { name: "Tchilly", class: "Priest", spec: "Holy", value: 4720, fights: 12, delta: 1, reportUrl: "#" },
      { name: "Aquafresh", class: "Shaman", spec: "Restoration", value: 4480, fights: 10, delta: -1, reportUrl: "#" },
      { name: "Skyleen", class: "Druid", spec: "Restoration", value: 4200, fights: 11, delta: 2, reportUrl: "#" },
      { name: "Rshamyy", class: "Shaman", spec: "Restoration", value: 3960, fights: 9, delta: null, reportUrl: "#" },
      { name: "Coizinho", class: "Priest", spec: "Holy", value: 3740, fights: 8, delta: -2, reportUrl: "#" },
    ],
    deaths: [
      { name: "Khaddash", class: "Priest", deaths: 14, fights: 14, tagline: "the floor tank" },
      { name: "Kinven", class: "Hunter", deaths: 9, fights: 13, tagline: "lava enthusiast" },
      { name: "Shmurda", class: "Warrior", deaths: 7, fights: 12, tagline: "" },
    ],
    improved: [
      { name: "Ardil", class: "Druid", spec: "Feral", metric: "dps", from: 3800, to: 4500, deltaPct: 18 },
      { name: "Tchilly", class: "Priest", spec: "Holy", metric: "hps", from: 3700, to: 4520, deltaPct: 22 },
      { name: "Shmurda", class: "Warrior", spec: "Fury", metric: "dps", from: 3500, to: 4000, deltaPct: 14 },
    ],
    bottom: [
      { name: "Pamevoid", class: "Warlock", spec: "Demonology", metric: "dps", value: 2900 },
      { name: "Mijinho", class: "Shaman", spec: "Enhancement", metric: "dps", value: 3100 },
    ],
    funStats: {
      biggestHit: { name: "Kobee", class: "Rogue", value: 18234, ability: "Mutilate", encounter: "Saurfang" },
      mostDamageTaken: { name: "Grunho", class: "Warrior", value: 1840000 },
      mostOverhealing: { name: "Tchilly", class: "Priest", value: 920000 },
      mostInterrupts: { name: "Kobee", class: "Rogue", value: 23 },
    },
    progress: {
      thisWeek: { date: "2026-06-25", bosses: 11, wipes: 21, bossTime: "59:23", raidTime: "2:32:48" },
      lastWeek: { date: "2026-06-18", bosses: 10, wipes: 38, bossTime: "1:08:40", raidTime: "2:51:10" },
    },
    perBoss: [
      {
        encounter: "Lord Marrowgar",
        metric: "dps",
        kill: { time: "3:58", prevTime: "4:30", wipes: 0 },
        top: [
          { name: "Okanor", class: "Paladin", value: 6012 },
          { name: "Magoluso", class: "Mage", value: 5800 },
          { name: "Kobee", class: "Rogue", value: 5600 },
          { name: "Franzherman", class: "Warlock", value: 5300 },
          { name: "Ardil", class: "Druid", value: 5100 },
          { name: "Kinven", class: "Hunter", value: 4900 },
        ],
      },
      {
        encounter: "Lady Deathwhisper",
        metric: "dps",
        kill: { time: "5:12", prevTime: "5:05", wipes: 1 },
        top: [
          { name: "Magoluso", class: "Mage", value: 7100 },
          { name: "Franzherman", class: "Warlock", value: 6800 },
          { name: "Okanor", class: "Paladin", value: 6200 },
        ],
      },
      {
        encounter: "Gunship Battle",
        metric: "dps",
        kill: { time: "4:02", prevTime: "4:10", wipes: 0 },
        top: [
          { name: "Kobee", class: "Rogue", value: 5400 },
          { name: "Ardil", class: "Druid", value: 5100 },
          { name: "Shmurda", class: "Warrior", value: 4900 },
        ],
      },
      {
        encounter: "Deathbringer Saurfang",
        metric: "dps",
        kill: { time: "4:45", prevTime: "4:40", wipes: 2 },
        top: [
          { name: "Kobee", class: "Rogue", value: 6450 },
          { name: "Okanor", class: "Paladin", value: 6100 },
          { name: "Magoluso", class: "Mage", value: 6000 },
        ],
      },
      {
        encounter: "Festergut",
        metric: "dps",
        kill: { time: "3:40", prevTime: "4:05", wipes: 1 },
        record: true,
        top: [
          { name: "Kobee", class: "Rogue", value: 6210 },
          { name: "Okanor", class: "Paladin", value: 5990 },
          { name: "Ardil", class: "Druid", value: 5400 },
        ],
      },
      {
        encounter: "Rotface",
        metric: "dps",
        kill: { time: "4:20", prevTime: "4:20", wipes: 0 },
        top: [
          { name: "Magoluso", class: "Mage", value: 5800 },
          { name: "Franzherman", class: "Warlock", value: 5600 },
          { name: "Kobee", class: "Rogue", value: 5500 },
        ],
      },
      {
        encounter: "Professor Putricide",
        metric: "dps",
        kill: { time: "6:10", prevTime: "7:30", wipes: 3, prevWipes: 8 },
        top: [
          { name: "Okanor", class: "Paladin", value: 5300 },
          { name: "Magoluso", class: "Mage", value: 5200 },
          { name: "Ardil", class: "Druid", value: 5050 },
        ],
      },
      {
        encounter: "Blood Prince Council",
        metric: "dps",
        kill: { time: "3:30", prevTime: "3:25", wipes: 0 },
        top: [
          { name: "Franzherman", class: "Warlock", value: 6900 },
          { name: "Magoluso", class: "Mage", value: 6700 },
          { name: "Kobee", class: "Rogue", value: 6400 },
        ],
      },
      {
        encounter: "Blood-Queen Lana'thel",
        metric: "dps",
        kill: { time: "4:05", prevTime: "4:35", wipes: 1 },
        top: [
          { name: "Kobee", class: "Rogue", value: 7200 },
          { name: "Okanor", class: "Paladin", value: 6900 },
          { name: "Magoluso", class: "Mage", value: 6850 },
        ],
      },
      {
        encounter: "Valithria Dreamwalker",
        metric: "hps",
        kill: { time: "5:00", prevTime: "5:30", wipes: 0 },
        top: [
          { name: "Khaddash", class: "Priest", value: 8100 },
          { name: "Tchilly", class: "Priest", value: 7400 },
          { name: "Aquafresh", class: "Shaman", value: 6900 },
        ],
      },
      {
        encounter: "Sindragosa",
        metric: "dps",
        kill: { time: "6:40", prevTime: "7:50", wipes: 4, prevWipes: 11 },
        top: [
          { name: "Okanor", class: "Paladin", value: 6300 },
          { name: "Kobee", class: "Rogue", value: 6150 },
          { name: "Franzherman", class: "Warlock", value: 6000 },
        ],
      },
      {
        encounter: "The Lich King",
        metric: "dps",
        kill: { status: "pending", pulls: 3, note: "Saved for Monday" },
        top: [],
      },
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
    wipes: [
      { encounter: "The Lich King", deaths: 64, pulls: 9 },
      { encounter: "Professor Putricide", deaths: 38, pulls: 6 },
      { encounter: "Sindragosa", deaths: 29, pulls: 4 },
      { encounter: "Blood-Queen Lana'thel", deaths: 21, pulls: 3 },
      { encounter: "Festergut", deaths: 12, pulls: 2 },
    ],
    awards: [
      { emoji: "🐔", title: "Floor Tank", name: "Khaddash", class: "Priest", note: "14 deaths — gravity won." },
      { emoji: "🎯", title: "Sniper", name: "Kobee", class: "Rogue", note: "Highest single hit." },
      { emoji: "🛡️", title: "Damage Sponge", name: "Grunho", class: "Warrior", note: "Most damage taken." },
      { emoji: "💤", title: "AFK King", name: "Pamevoid", class: "Warlock", note: "Lowest activity %." },
    ],
    logs: [
      {
        reportId: "20459",
        reportUrl: "https://wow-logs.co.in/20459",
        raid: "ICC",
        size: 25,
        date: "2026-06-25",
        fangs: 6,
      },
      {
        reportId: "20312",
        reportUrl: "https://wow-logs.co.in/20312",
        raid: "ICC",
        size: 25,
        date: "2026-06-22",
        fangs: 4,
      },
      {
        reportId: "20188",
        reportUrl: "https://wow-logs.co.in/20188",
        raid: "ICC",
        size: 10,
        date: "2026-06-18",
        fangs: 5,
      },
      {
        reportId: "20047",
        reportUrl: "https://wow-logs.co.in/20047",
        raid: "Ulduar",
        size: 25,
        date: "2026-06-15",
        fangs: 3,
      },
    ],
  };

  var DATA = SAMPLE;

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
  var PERIOD = "week";
  function setPeriod(b) {
    PERIOD = b.dataset.p;
    document.querySelectorAll("#periodSegs .seg").forEach(function (s) {
      s.classList.toggle("active", s === b);
    });
    render();
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
  function cicon(cls) {
    var t = CLASS_ICON[cls];
    return t
      ? '<img class="cic" src="https://wow.zamimg.com/images/wow/icons/large/classicon_' +
          t +
          '.jpg" alt="" onerror="this.style.visibility=\'hidden\'">'
      : '<span class="cic"></span>';
  }
  function deltaTag(d) {
    if (d == null) return '<span class="mv new" title="new this week">★</span>';
    if (d > 0) return '<span class="mv up" title="up ' + d + '">▲' + d + "</span>";
    if (d < 0) return '<span class="mv down" title="down ' + -d + '">▼' + -d + "</span>";
    return '<span class="mv same" title="no change">–</span>';
  }
  function lbRow(p, i, metric) {
    var col = classColor(p.class);
    var max = (DATA[metric] && DATA[metric][0] && DATA[metric][0].value) || 1;
    var cls = i === 0 ? "g" : i === 1 ? "s" : i === 2 ? "b" : "";
    var streak =
      p.streak > 1 ? '<span class="streak" title="' + p.streak + ' weeks at #1">👑×' + p.streak + "</span>" : "";
    return (
      "<li>" +
      '<span class="rank ' +
      cls +
      '">' +
      (i + 1) +
      "</span>" +
      deltaTag(p.delta) +
      cicon(p.class) +
      '<span style="min-width:0;flex:1 1 auto">' +
      '<a href="' +
      esc(p.reportUrl || "#") +
      '" target="_blank" rel="noopener" style="text-decoration:none">' +
      '<span class="pname" style="color:' +
      col +
      '">' +
      esc(p.name) +
      "</span></a>" +
      streak +
      '<div class="pbar"><i style="width:' +
      Math.round((p.value / max) * 100) +
      "%;background:" +
      col +
      '"></i></div>' +
      "</span>" +
      '<span class="pval">' +
      fmt(p.value) +
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
  function render() {
    var d = DATA;
    buildRaidSegs();
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
        " · parse of the week</span></div>" +
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

    document.getElementById("improved").innerHTML =
      (d.improved || [])
        .map(function (p) {
          var col = classColor(p.class);
          return (
            '<li><span class="rank g">▲</span><span style="flex:1 1 auto;min-width:0"><span class="pname" style="color:' +
            col +
            '">' +
            esc(p.name) +
            '</span> <span class="pspec">' +
            esc(p.spec || "") +
            " · " +
            (p.metric || "dps").toUpperCase() +
            '</span></span><span class="pval" style="color:var(--ok)">+' +
            p.deltaPct +
            "%</span></li>"
          );
        })
        .join("") || '<li style="border:0;color:#6e7178">—</li>';
    document.getElementById("bottom").innerHTML =
      (d.bottom || [])
        .map(function (p, i) {
          var col = classColor(p.class);
          return (
            '<li><span class="rank">' +
            (i + 1) +
            '</span><span style="flex:1 1 auto;min-width:0"><span class="pname" style="color:' +
            col +
            '">' +
            esc(p.name) +
            '</span> <span class="pspec">' +
            esc(p.spec || "") +
            " · " +
            (p.metric || "dps").toUpperCase() +
            '</span></span><span class="pval">' +
            fmt(p.value) +
            "</span></li>"
          );
        })
        .join("") || '<li style="border:0;color:#6e7178">—</li>';

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

    document.getElementById("records").innerHTML =
      (d.records || [])
        .map(function (r) {
          var col = classColor(r.class);
          return (
            '<li><span class="rank g">🏅</span><span style="flex:1 1 auto;min-width:0"><span class="pname" style="color:' +
            col +
            '">' +
            esc(r.name) +
            '</span> <span class="pspec">' +
            esc(r.encounter) +
            " · " +
            (r.metric || "dps").toUpperCase() +
            '</span></span><span class="pval">' +
            fmt(r.value) +
            ' <span style="color:#6e7178;font-weight:600;font-size:11px">(was ' +
            fmt(r.prev) +
            ")</span></span></li>"
          );
        })
        .join("") || '<li style="border:0;color:#6e7178">No new records.</li>';

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
      return (
        String(l.size) === SIZE && rKeys.indexOf(String(l.raid).toLowerCase()) >= 0 && inPeriod(l.date || l.uploadedAt)
      );
    });
    document.getElementById("logs").innerHTML = logsForSize.length
      ? '<div class="loglist">' +
        logsForSize
          .map(function (l) {
            var fang =
              l.fangs >= 5
                ? '<span class="lfangs" title="' + l.fangs + " Warchief's Fangs in this raid\">💀 Fangs night</span>"
                : "";
            return (
              '<a class="logbadge" href="' +
              esc(l.reportUrl) +
              '" target="_blank" rel="noopener">' +
              '<span class="lraid">' +
              esc(l.raid || "Raid") +
              "</span>" +
              '<span class="ldate">' +
              esc(fmtDate(l.date || l.uploadedAt)) +
              "</span>" +
              fang +
              '<span class="lid">#' +
              esc(l.reportId || "") +
              '</span><span class="lgo">↗</span></a>'
            );
          })
          .join("") +
        "</div>"
      : '<div class="card" style="color:#6e7178">No ' +
        esc((rObj && rObj.label) || RAID) +
        " " +
        SIZE +
        "-man logs uploaded yet.</div>";

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

  // ---- raid selector: built from the raids that actually appear in the logs (DATA.raids) ----
  var RAID = "";
  function buildRaidSegs() {
    var row = document.getElementById("raidRow");
    var raids = DATA.raids || [];
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

  // Officer = anyone with the guild key. Only they see the gold Fetch button.
  var IS_OFFICER = !!localStorage.getItem("ratsGuildKey");
  async function fetchData() {
    var b = document.getElementById("fetchBtn"),
      lbl = b && b.querySelector("span");
    if (b) {
      b.disabled = true;
      if (lbl) lbl.textContent = "Fetching…";
    }
    try {
      await load(true);
    } catch (e) {}
    if (lbl) lbl.textContent = "Updated ✓";
    setTimeout(function () {
      if (b) b.disabled = false;
      if (lbl) lbl.textContent = "Fetch data";
    }, 1500);
  }

  // Public reads ONE snapshot from Firebase (officer's Fetch writes it). All raids/sizes/periods live
  // inside it, so we read it at most once per visit and the toggles filter client-side. Cost ≈ 0.
  var RANKINGS_URL = ""; // e.g. Firebase snapshot node: ".../rats/rankings.json"
  var CACHE_KEY = "ratsRankCache",
    CACHE_TTL = 30 * 60 * 1000;
  async function load(force) {
    if (RANKINGS_URL) {
      if (!force) {
        try {
          var c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
          if (c && Date.now() - c.t < CACHE_TTL && c.data) {
            DATA = c.data;
            render();
            return;
          }
        } catch (e) {}
      }
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
    render();
  }

  // expose handlers used by inline onclick
  window.setTab = setTab;
  window.setSize = setSize;
  window.setPeriod = setPeriod;
  window.setRaid = setRaid;
  window.fetchData = fetchData;

  if (IS_OFFICER) {
    var fb = document.getElementById("fetchBtn");
    if (fb) fb.hidden = false;
  }
  load();
})();
