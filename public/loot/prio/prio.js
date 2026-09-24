/* RATS — Loot page, Priority tab (officers).

   Two views of the same data, read live from the hub nodes (roster / rankings / loot):
     BiS list   — who gets each contested drop, per the Fusion sheet ladder that
                  prio-engine.js builds; exported as a Lua table for Okanvil.
     Loot luck  — who has won less, or more, than their ICC nights should have given
                  them. The engine already folds it into every ladder.
   Nothing here is hand-maintained: post the raid, push loot and rankings as usual,
   refresh, and the order is right. Loads the first time the tab is opened. */
(function () {
  "use strict";
  var U = window.RatsUtils;
  var esc = U.esc, classColor = U.classColor, fbGet = U.fbGet;

  var ICON_BASE = "https://wow.zamimg.com/images/wow/icons/",
    ICON_FALLBACK = "inv_misc_questionmark";

  // item name (lowercased) -> icon slug. Filled from the live loot node (the addon
  // exports a real slug with every drop) and from icons.json for items nobody has
  // won yet. Slugs are never written by hand: one that merely EXISTS on the CDN can
  // still draw the wrong picture, which is worse than no picture.
  var ICONS = {};
  var IDS = {}; // item name -> itemId, for the addon's chat links

  function iconUrl(slug) {
    return ICON_BASE + "large/" + String(slug || ICON_FALLBACK).toLowerCase() + ".jpg";
  }

  function addIcons(byId) {
    Object.keys(byId || {}).forEach(function (id) {
      var e = byId[id];
      if (e && e.name && e.icon) ICONS[String(e.name).toLowerCase()] = e.icon;
      // Keep the id too: the addon needs it to build a real item link. A name alone
      // only resolves for items the client has already cached, which a token nobody
      // has looted never is. Ids from 900000 up are placeholders from before the
      // in-game icon scan -- not real items, so the addon falls back to the name.
      if (e && e.name && Number(id) < 900000) IDS[String(e.name).toLowerCase()] = id;
    });
  }

  var TIER_LABEL = { R: "Reserved", P: "Prio roll" };
  // Slot -> the heading an officer looks under when something drops.
  var GROUPS = {
    // tier tokens buy a T10 piece rather than filling a slot, so they get their own
    // heading instead of falling through to Armour
    INVTYPE_TOKEN: ["T10 tokens", 0],
    INVTYPE_TRINKET: ["Trinkets", 1],
    INVTYPE_2HWEAPON: ["Two-hand weapons", 2],
    INVTYPE_WEAPON: ["One-hand weapons", 3],
    INVTYPE_WEAPONMAINHAND: ["One-hand weapons", 3],
    INVTYPE_WEAPONOFFHAND: ["Off-hands & shields", 4],
    INVTYPE_HOLDABLE: ["Off-hands & shields", 4],
    INVTYPE_SHIELD: ["Off-hands & shields", 4],
    INVTYPE_RANGED: ["Ranged", 5],
    INVTYPE_RANGEDRIGHT: ["Ranged", 5],
    INVTYPE_RELIC: ["Ranged", 5],
    INVTYPE_NECK: ["Neck & rings", 6],
    INVTYPE_FINGER: ["Neck & rings", 6],
    // armour splits by slot: a drop is announced as "boots dropped", not "leather"
    INVTYPE_HEAD: ["Head", 10],
    INVTYPE_SHOULDER: ["Shoulders", 11],
    INVTYPE_CLOAK: ["Backs", 12],
    INVTYPE_CHEST: ["Chests", 13],
    INVTYPE_ROBE: ["Chests", 13],
    INVTYPE_WRIST: ["Bracers", 14],
    INVTYPE_HAND: ["Gloves", 15],
    INVTYPE_WAIST: ["Belts", 16],
    INVTYPE_LEGS: ["Legs", 17],
    INVTYPE_FEET: ["Boots", 18],
  };
  var SLOTS = {}; // item name -> INVTYPE_*, from icons.json

  function groupOf(itemName) {
    var g = GROUPS[SLOTS[itemName.toLowerCase()]];
    return g || ["Armour", 7];
  }

  var DATA = null, RAW = null, LOADED = false, LOADING = false;
  var VIEW = "bis", TIER = "all", QUERY = "", MIN_DAYS = 1;
  // How many names a ladder shows before "+N": the one who gets it and the next few.
  var SHOWN = 4;
  // Folded groups, opened ladders and opened luck rows. Not remembered between
  // visits: an officer arriving mid-raid should see the whole list.
  var CLOSED = {}, OPEN_ITEM = {}, OPEN_LUCK = {};

  function $(id) { return document.getElementById(id); }

  // ---- BiS list: one compact card per item ----------------------------
  function nameHtml(p, isNext) {
    var tip = p.spec +
      (p.iccdps ? " — " + p.iccdps + " dps in ICC" : "") +
      (p.iccpct ? ", " + Math.round(p.iccpct) + "th percentile" : "") +
      " — " + p.att + " raid days, " + (p.icc || 0) + " in ICC" +
      (p.won ? " — already won this" : "") +
      (p.offspec ? " — off-spec, takes leftovers" : "") +
      (p.unproven ? " — only " + (p.icc || 0) + " ICC 25 night" + (p.icc === 1 ? "" : "s") + " so far" : "") +
      (p.low ? " — off the pace for our raid" : "") +
      (p.tail ? " — holds this group open, last in line until he proves it" : "") +
      (p.luck === 0 ? " — owed: " + p.owed + " items behind the raid's rate" : "") +
      (p.luck === 2 ? " — well served: " + Math.abs(p.owed) + " items ahead of the raid's rate" : "");
    return (
      '<span class="pl' + (isNext ? " top" : "") + (p.offspec ? " off" : "") + (p.won ? " has" : "") +
      '" title="' + esc(tip) + '"><b style="color:' + classColor(p.cls) + '">' + esc(p.name) + "</b>" +
      (p.offspec ? '<i class="tag">off</i>' : "") +
      (p.unproven ? '<i class="tag new">new</i>' : "") +
      (p.low ? '<i class="tag low">low</i>' : "") +
      (!p.won && p.luck === 0 ? '<i class="tag owed">owed</i>' : "") +
      (!p.won && p.luck === 2 ? '<i class="tag lucky">lucky</i>' : "") +
      "</span>"
    );
  }

  function ladderHtml(it) {
    if (!it.ladder.length) return '<span class="nobody">nobody eligible</span>';
    var open = !!OPEN_ITEM[it.item];
    // compact: only people who can still take it, the first few of them
    var live = it.ladder.filter(function (p) { return !p.won; });
    var list = open ? it.ladder : live.slice(0, SHOWN);
    var hidden = it.ladder.length - list.length;
    var html = "", lastBand = null, shownWon = false, nextDone = false;
    list.forEach(function (p, i) {
      if (i) {
        // a won name starts the "already has it" tail; otherwise > inside a band
        // and » where the sheet drops to a lower priority group
        html += p.won && !shownWon
          ? '<span class="sep has" title="already won it">•</span>'
          : (p.band > lastBand
            ? '<span class="sep drop" title="lower priority group">&raquo;</span>'
            : '<span class="sep">&rsaquo;</span>');
      }
      if (p.won) shownWon = true;
      lastBand = p.band;
      // the first name that has NOT won it is the one it goes to now
      var isNext = !p.won && !nextDone;
      if (isNext) nextDone = true;
      html += nameHtml(p, isNext);
    });
    if (hidden > 0 || open) {
      html += '<button class="more" type="button" data-item="' + esc(it.item) + '">' +
        (open ? "less" : "+" + hidden) + "</button>";
    }
    return html;
  }

  function cardHtml(it) {
    var slug = ICONS[it.item.toLowerCase()];
    return (
      '<li class="pi t-' + it.tier + (OPEN_ITEM[it.item] ? " open" : "") + '">' +
      '<img class="pi-ic" src="' + esc(iconUrl(slug)) + '" alt="" loading="lazy" ' +
      "onerror=\"this.src='" + iconUrl(ICON_FALLBACK) + "'\">" +
      '<div class="pi-main">' +
      '<div class="pi-hd"><span class="pi-name">' + esc(it.item) + "</span>" +
      '<span class="pi-tier">' + esc(TIER_LABEL[it.tier] || it.tier) + "</span></div>" +
      '<div class="pi-sub">' + esc(it.boss) + ' · <span title="Fusion sheet priority">' + esc(it.prio) + "</span></div>" +
      '<div class="pi-names">' + ladderHtml(it) + "</div>" +
      "</div></li>"
    );
  }

  function matches(it) {
    if (TIER !== "all" && it.tier !== TIER) return false;
    if (!QUERY) return true;
    var q = QUERY;
    if (it.item.toLowerCase().indexOf(q) >= 0) return true;
    if (it.boss.toLowerCase().indexOf(q) >= 0) return true;
    return it.ladder.some(function (p) {
      return p.name.toLowerCase().indexOf(q) >= 0 || p.spec.toLowerCase().indexOf(q) >= 0;
    });
  }

  // The three tier tokens always read in the same order rather than alphabetically,
  // so "which token is the rogue one" is in the same place every week.
  var TOKEN_ORDER = ["Vanquisher", "Conqueror", "Protector"];
  function tokenRank(name) {
    for (var i = 0; i < TOKEN_ORDER.length; i++) if (name.indexOf(TOKEN_ORDER[i]) === 0) return i;
    return 99;
  }

  function renderBis() {
    var grid = $("prGrid");
    if (!grid || !DATA) return;
    var list = DATA.items.filter(matches);
    list.sort(function (a, b) {
      var ga = groupOf(a.item), gb = groupOf(b.item);
      return (ga[1] - gb[1]) ||
        (tokenRank(a.item) - tokenRank(b.item)) ||
        ((a.tier === "R" ? 0 : 1) - (b.tier === "R" ? 0 : 1)) ||
        a.item.localeCompare(b.item);
    });
    var counts = {};
    list.forEach(function (it) {
      var g = groupOf(it.item)[0];
      counts[g] = (counts[g] || 0) + 1;
    });
    var html = "", group = null;
    list.forEach(function (it) {
      var g = groupOf(it.item)[0];
      if (g !== group) {
        if (group !== null) html += "</ul>";
        group = g;
        var shut = !!CLOSED[g];
        html +=
          '<button class="gh' + (shut ? " shut" : "") + '" type="button" data-group="' + esc(g) +
          '" aria-expanded="' + (shut ? "false" : "true") + '"><span class="ghcaret"></span>' +
          '<span class="ghname">' + esc(g) + '</span><i class="ghn">' + counts[g] +
          (counts[g] === 1 ? " item" : " items") + "</i></button>" +
          '<ul class="pis"' + (shut ? " hidden" : "") + ">";
      }
      html += cardHtml(it);
    });
    if (group !== null) html += "</ul>";
    grid.innerHTML = html || '<div class="pr-empty">Nothing matches that filter.</div>';
    $("prCount").textContent = list.length + " of " + DATA.items.length + " items";
    var names = Object.keys(counts);
    $("prCollapse").textContent = names.length && names.every(function (g) { return CLOSED[g]; })
      ? "⊞ Expand all" : "⊟ Collapse all";
  }

  // ---- Loot luck: items won against what the ICC nights should give -----
  function renderLuck() {
    var el = $("prLuck");
    if (!el || !DATA) return;
    var m = DATA.meta;
    var list = Object.keys(DATA.players)
      .map(function (k) { return DATA.players[k]; })
      .filter(function (p) { return !p.inactive && p.lootNights > 0; })
      .sort(function (a, b) { return (b.owed - a.owed) || (b.lootNights - a.lootNights); });
    if (!m.lootFrom || !list.length) {
      el.innerHTML = '<div class="pr-empty">No ICC 25 loot recorded yet — import a raid first.</div>';
      return;
    }
    var maxAbs = list.reduce(function (x, p) { return Math.max(x, Math.abs(p.owed)); }, 1);
    var rate = Math.round(m.luckRate * 100) / 100;
    var head =
      '<p class="lnote">Since <b>' + esc(m.lootFrom) + "</b> the raid wins about <b>" + rate +
      "</b> items per raider per ICC 25 night. <b>Owed</b> = what your nights should have given you − what you won. " +
      "<b>±" + m.luckMargin + "</b> or more moves you inside your group on every BiS ladder. Click a row for the items.</p>";
    var rows = list.map(function (p) {
      var tone = p.luck === 0 ? "owed" : p.luck === 2 ? "lucky" : "even";
      var half = Math.round((Math.abs(p.owed) / maxAbs) * 50);
      var bar = p.owed >= 0
        ? '<i class="lb-pos" style="width:' + half + '%"></i>'
        : '<i class="lb-neg" style="width:' + half + '%"></i>';
      var open = !!OPEN_LUCK[p.name];
      var items = open
        ? '<div class="litems">' + (p.lootItems.length
          ? p.lootItems.slice().sort(function (a, b) { return a.day < b.day ? 1 : -1; }).map(function (it) {
            return '<span class="lit"><img src="' + esc(iconUrl(it.icon || ICONS[it.name.toLowerCase()])) +
              '" alt="" loading="lazy">' + esc(it.name) + "<i>" + esc(it.boss) + " · " + esc(it.day) + "</i></span>";
          }).join("")
          : '<span class="lit none">Nothing won yet.</span>') + "</div>"
        : "";
      return (
        '<li class="lrow ' + tone + (open ? " open" : "") + '" data-luck="' + esc(p.name) + '">' +
        '<b class="lname" style="color:' + classColor(p.cls) + '">' + esc(p.name) + "</b>" +
        '<span class="lstat"><b>' + p.lootNights + "</b> nights</span>" +
        '<span class="lstat"><b>' + p.lootWon + "</b> won</span>" +
        '<span class="lstat"><b>' + p.lootExpected + "</b> expected</span>" +
        '<span class="lbar"><span class="lb-mid"></span>' + bar + "</span>" +
        '<span class="lowed">' + (p.owed > 0 ? "+" : "") + p.owed + "</span>" +
        '<i class="tag ' + tone + '">' + (tone === "even" ? "even" : tone) + "</i>" +
        "</li>" + items
      );
    }).join("");
    el.innerHTML = head + '<ul class="llist">' + rows + "</ul>";
  }

  function render() {
    if (VIEW === "bis") renderBis(); else renderLuck();
  }

  function setView(v) {
    VIEW = v;
    Array.prototype.forEach.call(document.querySelectorAll("#priority .vbtn"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === v);
    });
    $("prBis").hidden = v !== "bis";
    $("prLuck").hidden = v !== "luck";
    render();
  }

  // ---- export for the addon ---------------------------------------------
  // Okanvil ships the ladder as a Lua table: a 3.3.5a client cannot reach this page,
  // and WoW has no JSON parser, so a Lua literal is what loads for free -- the same
  // shape as the addon's other generated data files.
  function exportText() {
    var L = [];
    L.push("-- ============================================================");
    L.push("--  Okanvil -- LootPrio-Data: the officer page's ladder, as data.");
    L.push("--");
    L.push("--  Generated by the Loot Priority page. Do not hand-edit: export");
    L.push("--  again after a raid, or whenever the roster changes.");
    L.push("--");
    L.push("--    >   next in the same priority group");
    L.push("--    >>  the sheet drops to a lower group");
    L.push("--    *   off-spec (fills the role, takes leftovers)");
    L.push("--    ()  already won it");
    L.push("--");
    L.push("--  Each name carries its class after a | so the addon can colour it the");
    L.push("--  same way this page does; ic/bo/sl are the item's icon, boss and slot.");
    L.push("-- ============================================================");
    L.push("");
    L.push("OkanvilLootPrio = {");
    L.push("\tgenerated = \"" + (DATA.meta.lastRaid || "") + "\",");
    // When this file was exported, as a sortable UTC stamp. `generated` is the last
    // raid it was built from: two exports made on different days from the same last
    // raid share it, and the addon needs to tell which officer's copy is newer.
    L.push("\texported = \"" + new Date().toISOString().replace("T", " ").slice(0, 19) + "\",");
    L.push("\titems = {");

    // Every contested item, not just the Reserved ones: a prio-roll item still has an
    // order worth reading out when it drops, and the addon has no other source for
    // it. `r = 1` marks the Reserved ones.
    var list = DATA.items.slice();
    list.sort(function (a, b) {
      var ga = groupOf(a.item), gb = groupOf(b.item);
      return (ga[1] - gb[1]) || a.item.localeCompare(b.item);
    });

    function q(t) {
      return String(t).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    list.forEach(function (it) {
      var names = [], lastBand = null;
      // Whoever already holds the item is left out entirely, not greyed: in game this
      // list answers "who gets it now".
      it.ladder.filter(function (p) { return !p.won; }).forEach(function (p, i) {
        if (i) names.push(p.band > lastBand ? ">>" : ">");
        lastBand = p.band;
        // Name|Class, so the addon colours the list like this page. No space in the
        // class token: the addon splits a ladder on whitespace, and "Death Knight"
        // would break in half. Only off-spec is marked -- the ORDER says the rest.
        var n = p.name + "|" + String(p.cls || "").replace(/\s+/g, "");
        if (p.offspec) n += "*";
        names.push(n);
      });
      if (!names.length) return;
      var slug = ICONS[it.item.toLowerCase()];
      var iid = IDS[it.item.toLowerCase()];
      var grp = groupOf(it.item); // ["Trinkets", 2] -- same slot grouping as the page
      L.push("\t[\"" + q(it.item.toLowerCase()) + "\"] = { n = \"" + q(it.item) +
        "\", p = \"" + q(names.join(" ")) + "\"" +
        (it.boss ? ", bo = \"" + q(it.boss) + "\"" : "") +
        (slug ? ", ic = \"" + q(slug) + "\"" : "") +
        (iid ? ", id = " + iid : "") +
        ", g = \"" + q(grp[0]) + "\", go = " + (grp[1] || 0) +
        (it.tier === "R" ? ", r = 1" : "") + " },");
    });

    L.push("\t},");
    L.push("}");
    return L.join(String.fromCharCode(10));
  }

  // Fallback when the clipboard is unavailable: show it, selected, to copy by hand.
  function showExport(text) {
    var box = $("prExportBox");
    box.value = text;
    box.hidden = false;
    box.focus();
    box.select();
  }

  // ---- loading ---------------------------------------------------------
  function load(force) {
    if (LOADING) return;
    LOADING = true;
    var refresh = $("prRefresh");
    if (refresh) refresh.disabled = true;
    $("prMeta").innerHTML = "";
    $("prGrid").innerHTML = '<div class="pr-loading"><i class="spin"></i>Reading roster, logs and loot…</div>';
    Promise.all([
      fbGet("roster"),
      fbGet("rankings"),
      fbGet("loot"),
      // icons.json gives art + slot for items nobody has won yet; the loot node
      // carries a real slug for everything that HAS dropped.
      fetch("prio/icons.json", { cache: force ? "reload" : "default" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; }),
    ]).then(function (res) {
      LOADING = false;
      if (refresh) refresh.disabled = false;
      var roster = res[0], rankings = res[1], loot = res[2], icons = res[3];
      if (!roster || !rankings) {
        $("prGrid").innerHTML = '<div class="pr-empty">Could not reach the guild database. ' +
          "Check that you are online, then refresh.</div>";
        return;
      }
      if (icons) {
        addIcons(icons);
        Object.keys(icons).forEach(function (id) {
          var e = icons[id];
          if (e && e.name && e.slot) SLOTS[String(e.name).toLowerCase()] = e.slot;
        });
      }
      ((loot && loot.loot) || []).forEach(function (l) {
        if (l && l.name && l.icon) ICONS[String(l.name).toLowerCase()] = l.icon;
      });
      RAW = { roster: roster, rankings: rankings, loot: loot };
      DATA = window.RatsPrio.build(RAW, { minDays: MIN_DAYS });
      LOADED = true;
      var m = DATA.meta;
      $("prMeta").innerHTML =
        "<i><b>" + m.active + "</b> raiders</i>" +
        "<i><b>" + m.raidDays + "</b> raid days</i>" +
        "<i>last raid <b>" + esc(m.lastRaid) + "</b></i>";
      render();
    }).catch(function (e) {
      LOADING = false;
      if (refresh) refresh.disabled = false;
      $("prGrid").innerHTML = '<div class="pr-empty">Something went wrong building the list: ' +
        esc(String(e && e.message ? e.message : e)) + "</div>";
    });
  }

  // ---- wire up ------------------------------------------------------------
  function wire() {
    var root = $("priority");
    root.addEventListener("click", function (e) {
      var t = e.target;
      var v = t.closest(".vbtn");
      if (v) return setView(v.getAttribute("data-view"));
      var more = t.closest(".more");
      if (more) {
        var it = more.getAttribute("data-item");
        OPEN_ITEM[it] = !OPEN_ITEM[it];
        return renderBis();
      }
      var gh = t.closest(".gh");
      if (gh) {
        var g = gh.getAttribute("data-group");
        CLOSED[g] = !CLOSED[g];
        return renderBis();
      }
      var tb = t.closest(".tbtn");
      if (tb) {
        Array.prototype.forEach.call(root.querySelectorAll(".tbtn"), function (x) {
          x.classList.toggle("active", x === tb);
        });
        TIER = tb.getAttribute("data-tier");
        return renderBis();
      }
      var row = t.closest(".lrow");
      if (row) {
        var n = row.getAttribute("data-luck");
        OPEN_LUCK[n] = !OPEN_LUCK[n];
        return renderLuck();
      }
      if (t.closest("#prCollapse") && DATA) {
        var names = {};
        DATA.items.filter(matches).forEach(function (x) { names[groupOf(x.item)[0]] = 1; });
        var keys = Object.keys(names);
        var allShut = keys.length && keys.every(function (k) { return CLOSED[k]; });
        keys.forEach(function (k) { CLOSED[k] = !allShut; });
        return renderBis();
      }
      if (t.closest("#prWhy")) {
        var box = $("prWhyBox");
        box.hidden = !box.hidden;
        t.closest("#prWhy").setAttribute("aria-expanded", box.hidden ? "false" : "true");
        return;
      }
      if (t.closest("#prRefresh")) return load(true);
      var ex = t.closest("#prExport");
      if (ex && DATA) {
        var text = exportText();
        var done = function () {
          ex.textContent = "✓ Copied";
          setTimeout(function () { ex.textContent = "⧉ Export for Okanvil"; }, 1800);
        };
        // clipboard API needs a secure context; fall back to a selectable box
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { showExport(text); });
        } else {
          showExport(text);
        }
      }
    });
    $("prQ").addEventListener("input", function (e) {
      QUERY = e.target.value.trim().toLowerCase();
      renderBis();
    });
    $("prMinDays").addEventListener("change", function (e) {
      MIN_DAYS = parseInt(e.target.value, 10) || 1;
      if (!RAW) return; // still loading
      DATA = window.RatsPrio.build(RAW, { minDays: MIN_DAYS });
      render();
    });
  }

  var wired = false;
  // called by the Loot page when the Priority tab opens
  window.RatsLootPrio = {
    open: function () {
      if (!wired) { wire(); wired = true; }
      if (!LOADED) load(false);
    },
  };
})();
