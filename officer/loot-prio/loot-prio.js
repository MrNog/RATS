/* RATS — Loot Priority (officer).

   Reads the live hub nodes (roster / rankings / loot) and lets prio-engine.js work out
   every ladder in the browser. Nothing here is hand-maintained: post the raid, push
   loot and rankings as usual, hit refresh, and the order is already right. */
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
  var IDS = {};   // item name -> itemId, for the addon's chat links

  function iconUrl(slug) {
    return ICON_BASE + "large/" + String(slug || ICON_FALLBACK).toLowerCase() + ".jpg";
  }

  function addIcons(byId) {
    Object.keys(byId || {}).forEach(function (id) {
      var e = byId[id];
      if (e && e.name && e.icon) ICONS[String(e.name).toLowerCase()] = e.icon;
      // Keep the id too: the addon needs it to build a real item link. A name
      // alone only resolves for items the client has already cached, which a
      // token nobody has looted never is.
      //
      // Five entries still carry a placeholder id from before the in-game icon
      // scan (900004, 900048, 900063, 900073, 900074). Those are not real items,
      // so asking the client about one can never resolve -- skip them and let the
      // addon fall back to the item's name.
      if (e && e.name && Number(id) < 900000) {
        IDS[String(e.name).toLowerCase()] = id;
      }
    });
  }

  var TIER_LABEL = { R: "Reserved", P: "Prio roll" };
  // Slot -> the heading an officer looks under when something drops.
  var GROUPS = {
    // tier tokens buy a T10 piece rather than filling a slot, so they get their
    // own heading instead of falling through to Armour
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
  var SLOTS = {};   // item name -> INVTYPE_*, from icons.json

  var DATA = null, RAW = null, TIER = "all", QUERY = "", MIN_DAYS = 1;

  // Which groups are folded shut. Not remembered between visits: the page opens
  // showing everything, because an officer arriving mid-raid should see the whole
  // list rather than whatever they happened to collapse last week.
  var CLOSED = {};

  // clear any state left by an earlier build that did persist this
  try { localStorage.removeItem("ratsPrioClosed"); } catch (e) { /* private window */ }

  var grid = document.getElementById("grid"),
    empty = document.getElementById("empty"),
    countEl = document.getElementById("count");

  function groupOf(itemName) {
    var g = GROUPS[SLOTS[itemName.toLowerCase()]];
    return g || ["Armour", 7];
  }

  // ---- one item row --------------------------------------------------
  function rowHtml(it) {
    var slug = ICONS[it.item.toLowerCase()];
    var icon =
      '<img class="iic" src="' + esc(iconUrl(slug)) + '" alt="" loading="lazy" ' +
      "onerror=\"this.src='" + iconUrl(ICON_FALLBACK) + "'\">";

    var names = "", lastBand = null, shownWon = false;
    if (!it.ladder.length) {
      names = '<span class="nobody">nobody eligible</span>';
    } else {
      it.ladder.forEach(function (p, i) {
        if (i) {
          // a won name starts the "already has it" tail; otherwise > inside a band
          // and » where the sheet drops to a lower priority group.
          names += p.won && !shownWon
            ? '<span class="sep has" title="already won it">•</span>'
            : (p.band > lastBand
              ? '<span class="sep drop" title="lower priority band">&raquo;</span>'
              : '<span class="sep">&rsaquo;</span>');
        }
        if (p.won) shownWon = true;
        lastBand = p.band;

        var tip = p.spec +
          (p.iccdps ? " — " + p.iccdps + " dps in ICC" : "") +
          (p.iccpct ? ", " + Math.round(p.iccpct) + "th percentile" : "") +
          " — " + p.att + " raid days, " + (p.icc || 0) + " in ICC" +
          (p.won ? " — already won this" : "") +
          (p.offspec ? " — off-spec, takes leftovers" : "") +
          (p.unproven ? " — only " + (p.icc || 0) + " ICC 25 night" + ((p.icc === 1) ? "" : "s") + " so far" : "") +
          (p.low ? " — off the pace for our raid" : "") +
          (p.tail ? " — holds this group open, last in line until he proves it" : "") +
          (p.luck === 0 ? " — owed: " + p.owed + " items behind the raid's rate" : "") +
          (p.luck === 2 ? " — well served: " + Math.abs(p.owed) + " items ahead of the raid's rate" : "");

        // The first name that has NOT won it is the one it goes to now.
        var isNext = !p.won && !it.ladder.slice(0, i).some(function (q) { return !q.won; });

        names +=
          '<span class="pl' + (isNext ? " top" : "") + (p.offspec ? " off" : "") +
          (p.won ? " has" : "") + '" title="' + esc(tip) + '">' +
          '<b style="color:' + classColor(p.cls) + '">' + esc(p.name) + "</b>" +
          (p.offspec ? '<i class="offtag">off</i>' : "") +
          (p.unproven ? '<i class="offtag new">new</i>' : "") +
          (p.low ? '<i class="offtag low">low</i>' : "") +
          (!p.won && p.luck === 0 ? '<i class="offtag owed">owed</i>' : "") +
          (!p.won && p.luck === 2 ? '<i class="offtag lucky">lucky</i>' : "") +
          "</span>";
      });
    }

    return (
      '<li class="row t-' + it.tier + '">' +
      icon +
      '<div class="meta">' +
      '<span class="iname">' + esc(it.item) + "</span>" +
      '<span class="iboss">' + esc(it.boss) + "</span>" +
      '<span class="sheet" title="Fusion sheet priority">' + esc(it.prio) + "</span>" +
      "</div>" +
      '<div class="names">' + names + "</div>" +
      "</li>"
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

  function render() {
    var list = DATA.items.filter(matches);
    // The three tier tokens always read in the same order rather than alphabetically,
    // so an officer looking for "which token is the rogue one" finds it in the
    // same place every week.
    var TOKEN_ORDER = ["Vanquisher", "Conqueror", "Protector"];
    function tokenRank(name) {
      for (var i = 0; i < TOKEN_ORDER.length; i++) {
        if (name.indexOf(TOKEN_ORDER[i]) === 0) return i;
      }
      return 99;
    }

    list.sort(function (a, b) {
      var ga = groupOf(a.item), gb = groupOf(b.item);
      return (ga[1] - gb[1]) ||
        (tokenRank(a.item) - tokenRank(b.item)) ||
        ((a.tier === "R" ? 0 : 1) - (b.tier === "R" ? 0 : 1)) ||
        a.item.localeCompare(b.item);
    });

    // Count each group first so the header can say how many are inside even when
    // it is folded shut.
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
          '<button class="gh' + (shut ? " shut" : "") + '" type="button" ' +
          'data-group="' + esc(g) + '" aria-expanded="' + (shut ? "false" : "true") + '">' +
          '<span class="ghcaret"></span>' +
          '<span class="ghname">' + esc(g) + "</span>" +
          '<i class="ghn">' + counts[g] + (counts[g] === 1 ? " item" : " items") + "</i>" +
          (shut ? '<i class="ghhint">show</i>' : "") +
          "</button>" +
          '<ul class="list"' + (shut ? " hidden" : "") + ">";
      }
      html += rowHtml(it);
    });
    if (group !== null) html += "</ul>";

    grid.innerHTML = html;
    syncCollapseBtn();
    empty.hidden = list.length > 0;
    countEl.textContent = list.length + " of " + DATA.items.length + " items";
  }

  // ---- loot luck: everyone's items won against what their ICC nights should give ----
  var OPEN_LUCK = {};
  function renderLuck() {
    var el = document.getElementById("luck");
    if (!el || !DATA) return;
    var m = DATA.meta;
    var list = Object.keys(DATA.players)
      .map(function (k) { return DATA.players[k]; })
      .filter(function (p) { return !p.inactive && p.lootNights > 0; })
      .sort(function (a, b) { return (b.owed - a.owed) || (b.lootNights - a.lootNights); });
    if (!m.lootFrom || !list.length) {
      el.innerHTML = '<div class="empty">No ICC 25 loot recorded yet — import a raid on the Loot page.</div>';
      return;
    }
    var maxAbs = list.reduce(function (x, p) { return Math.max(x, Math.abs(p.owed)); }, 1);
    var rate = Math.round(m.luckRate * 100) / 100;
    var head =
      '<p class="lnote">Since <b>' + esc(m.lootFrom) + "</b> the raid wins about <b>" + rate +
      "</b> items per raider per ICC 25 night. <b>Owed</b> = what your nights should have given you − what you won. " +
      "<b>±" + m.luckMargin + "</b> or more moves you inside your group on every ladder. Click a row for the items.</p>";
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
            return '<span class="lit"><img src="' + esc(iconUrl(it.icon || ICON_FALLBACK)) + '" alt="" loading="lazy">' +
              esc(it.name) + '<i>' + esc(it.boss) + " · " + esc(it.day) + "</i></span>";
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
        (p.luck === 0 ? '<i class="offtag owed">owed</i>' : p.luck === 2 ? '<i class="offtag lucky">lucky</i>' : '<i class="offtag even">even</i>') +
        "</li>" + items
      );
    }).join("");
    el.innerHTML = head + '<ul class="llist">' + rows + "</ul>";
  }
  document.getElementById("luck").addEventListener("click", function (e) {
    var row = e.target.closest(".lrow");
    if (!row) return;
    var n = row.getAttribute("data-luck");
    OPEN_LUCK[n] = !OPEN_LUCK[n];
    renderLuck();
  });

  // ---- view: the ladders, or everyone's loot luck ----
  var VIEW = "items";
  function setView(v) {
    VIEW = v;
    Array.prototype.forEach.call(document.querySelectorAll(".views .vbtn"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === v);
    });
    var items = v === "items";
    document.getElementById("itemCtl").hidden = !items;
    document.getElementById("legend").hidden = !items;
    grid.hidden = !items;
    if (!items) empty.hidden = true;
    document.getElementById("luck").hidden = items;
    if (items) render(); else renderLuck();
  }
  Array.prototype.forEach.call(document.querySelectorAll(".views .vbtn"), function (b) {
    b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
  });

  // ---- wire up ------------------------------------------------------
  document.getElementById("q").addEventListener("input", function (e) {
    QUERY = e.target.value.trim().toLowerCase();
    render();
  });
  Array.prototype.forEach.call(document.querySelectorAll(".tabs .tbtn"), function (b) {
    b.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll(".tabs .tbtn"), function (x) {
        x.classList.remove("active");
      });
      b.classList.add("active");
      TIER = b.getAttribute("data-tier");
      render();
    });
  });

  var minSel = document.getElementById("minDays");
  if (minSel) {
    minSel.addEventListener("change", function (e) {
      MIN_DAYS = parseInt(e.target.value, 10) || 1;
      if (!RAW) return;                 // still loading
      DATA = window.RatsPrio.build(RAW, { minDays: MIN_DAYS });
      render();
      if (VIEW === "luck") renderLuck();
    });
  }


  // ---- export the Reserved list -------------------------------------
  // Plain text for Discord: no colour, no hover, so the tags spell themselves out
  // and the marks are ones chat can carry.
  // ---- export for the addon -----------------------------------------
  // Okanvil ships the ladder as a Lua table: a 3.3.5a client cannot reach this
  // page, and WoW has no JSON parser, so a Lua literal is what loads for free --
  // the same shape as the addon's other generated data files.
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
    // When this file was exported, as a sortable UTC stamp. `generated` is the
    // last raid it was built from, which is not the same thing: two exports made
    // on different days from the same last raid share it, and the addon needs to
    // tell which of two officers' copies is the newer one.
    L.push("\texported = \"" + new Date().toISOString().replace("T", " ").slice(0, 19) + "\",");
    L.push("\titems = {");

    // Every contested item, not just the Reserved ones. A prio-roll item still has
    // an order worth reading out when it drops, and the addon has no other source
    // for it -- exporting only Reserved left it saying "not on the list" for most
    // of what the raid actually sees. `r = 1` marks the Reserved ones.
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
      // Whoever already holds the item is left out entirely, not greyed: in game
      // this list answers "who gets it now", and a name that can no longer take
      // it is one more thing to read past mid-raid.
      it.ladder.filter(function (p) { return !p.won; }).forEach(function (p, i) {
        if (i) names.push(p.band > lastBand ? ">>" : ">");
        lastBand = p.band;
        // Name|Class, plus the same marks the page shows. The class travels with
        // the name so the addon colours the list exactly as this page does instead
        // of printing one flat grey line.
        // No space in the class token: the addon splits a ladder on whitespace,
        // and "Death Knight" would break in half and lose its colour.
        // Only off-spec is marked. "low" and "new" applied to most of the list at
        // once in game, so they added length without changing a decision -- the
        // ORDER already says who is ahead.
        var n = p.name + "|" + String(p.cls || "").replace(/\s+/g, "");
        if (p.offspec) n += "*";
        names.push(n);
      });
      if (!names.length) return;
      var slug = ICONS[it.item.toLowerCase()];
      var iid = IDS[it.item.toLowerCase()];
      var grp = groupOf(it.item);   // ["Trinkets", 2] -- same slot grouping as the page
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

  var exportBtn = document.getElementById("export");
  if (exportBtn) {
    exportBtn.addEventListener("click", function () {
      if (!DATA) return;
      var text = exportText();
      // clipboard API needs a secure context; fall back to a selectable box
      var done = function () {
        exportBtn.textContent = "✓ Copied";
        setTimeout(function () { exportBtn.textContent = "⧉ Export reserved"; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { showExport(text); });
      } else {
        showExport(text);
      }
    });
  }

  // Fallback when the clipboard is unavailable: show it, selected, to copy by hand.
  function showExport(text) {
    var box = document.getElementById("exportBox");
    if (!box) {
      box = document.createElement("textarea");
      box.id = "exportBox";
      box.className = "ta exportbox";
      box.setAttribute("readonly", "readonly");
      grid.parentNode.insertBefore(box, grid);
    }
    box.value = text;
    box.hidden = false;
    box.focus();
    box.select();
  }

  var refresh = document.getElementById("refresh");
  if (refresh) refresh.addEventListener("click", function () { load(true); });

  // ---- collapsible groups -------------------------------------------
  var collapseBtn = document.getElementById("collapse");

  function groupNames() {
    return Array.prototype.map.call(grid.querySelectorAll(".gh"), function (b) {
      return b.getAttribute("data-group");
    });
  }

  function syncCollapseBtn() {
    if (!collapseBtn) return;
    var names = groupNames();
    var allShut = names.length > 0 && names.every(function (g) { return CLOSED[g]; });
    collapseBtn.textContent = allShut ? "⊞ Expand all" : "⊟ Collapse all";
  }

  // one listener on the container rather than one per header
  grid.addEventListener("click", function (e) {
    var head = e.target.closest ? e.target.closest(".gh") : null;
    if (!head || !grid.contains(head)) return;
    var g = head.getAttribute("data-group");
    if (CLOSED[g]) delete CLOSED[g]; else CLOSED[g] = true;
    render();
  });

  if (collapseBtn) {
    collapseBtn.addEventListener("click", function () {
      var names = groupNames();
      var allShut = names.length > 0 && names.every(function (g) { return CLOSED[g]; });
      CLOSED = {};
      if (!allShut) names.forEach(function (g) { CLOSED[g] = true; });
      render();
    });
  }

  var why = document.getElementById("why"), whybox = document.getElementById("whybox");
  if (why && whybox) {
    why.addEventListener("click", function () {
      var open = whybox.hidden;
      whybox.hidden = !open;
      why.setAttribute("aria-expanded", String(open));
      why.textContent = open ? "hide" : "why";
    });
  }

  // ---- load ---------------------------------------------------------
  // Name each step as it happens. The fetches are usually quick, so hold a step for
  // a beat before moving on: an officer should see WHAT is being read, not a flash.
  var STEPS = [
    "Reading the guild roster…",
    "Pulling raid logs and attendance…",
    "Checking who already won what…",
    "Working out the priority…",
  ];
  var STEP_MS = 320;

  function skeleton(msg) {
    var rows = "";
    for (var i = 0; i < 7; i++) {
      rows += '<div class="skel"><span class="s1"></span><span class="s2"></span>' +
        '<span class="s3"></span></div>';
    }
    grid.innerHTML = '<div class="loading"><div class="lmsg">' +
      '<i class="spin"></i><span id="lstep">' + esc(msg) + "</span></div>" + rows + "</div>";
  }

  function setStep(i) {
    var el = document.getElementById("lstep");
    if (el && STEPS[i]) el.textContent = STEPS[i];
  }

  function hold(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function load(force) {
    if (refresh) refresh.disabled = true;
    document.getElementById("meta").innerHTML = "";   // no stale counts while reloading
    skeleton(STEPS[0]);
    var started = Date.now();
    // walk the captions while the network works
    var step = 0;
    var ticker = setInterval(function () {
      step += 1;
      if (step < STEPS.length) setStep(step); else clearInterval(ticker);
    }, STEP_MS);

    Promise.all([
      fbGet("roster"),
      fbGet("rankings"),
      fbGet("loot"),
      // icons.json gives art + slot for items nobody has won yet; the loot node
      // carries a real slug for everything that HAS dropped.
      fetch("icons.json", { cache: force ? "reload" : "default" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; }),
    ]).then(function (res) {
      // Let the captions finish their walk, so the steps are readable even when the
      // fetch comes back instantly.
      var minimum = STEPS.length * STEP_MS;
      var elapsed = Date.now() - started;
      return hold(Math.max(0, minimum - elapsed)).then(function () { return res; });
    }).then(function (res) {
      clearInterval(ticker);
      if (refresh) refresh.disabled = false;
      var roster = res[0], rankings = res[1], loot = res[2], icons = res[3];
      if (!roster || !rankings) {
        grid.innerHTML = '<div class="empty">Could not reach the guild database. ' +
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
      // the live loot node knows the icon for anything that actually dropped
      var lootRows = (loot && loot.loot) || [];
      lootRows.forEach(function (l) {
        if (l && l.name && l.icon) ICONS[String(l.name).toLowerCase()] = l.icon;
      });

      RAW = { roster: roster, rankings: rankings, loot: loot };
      DATA = window.RatsPrio.build(RAW, { minDays: MIN_DAYS });

      var m = DATA.meta;
      document.getElementById("meta").innerHTML =
        "<i><b>" + m.active + "</b> raiders</i>" +
        "<i><b>" + m.raidDays + "</b> raid days</i>" +
        "<i>last raid <b>" + esc(m.lastRaid) + "</b></i>";
      render();
      if (VIEW === "luck") renderLuck();
    }).catch(function (e) {
      clearInterval(ticker);
      if (refresh) refresh.disabled = false;
      grid.innerHTML = '<div class="empty">Something went wrong building the list: ' +
        esc(String(e && e.message ? e.message : e)) + "</div>";
    });
  }

  load(false);
})();
