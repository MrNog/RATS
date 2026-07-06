/* RATS — Loot history. Public, addon-fed.
   The Okanvil addon reads MRT loot history (who ACTUALLY kept the item — survives the "ML loots to self
   then trades" case) and `/okanvil export`s JSON. An officer pastes it here; we MERGE into the plain `loot`
   Firebase node. Visitors read that node once per visit (TTL 30 min) and all tabs/segments filter
   client-side — toggles never hit the network. Full contract in docs/LOOT_EXPORT.md. */
(function () {
  "use strict";
  var U = window.RatsUtils;
  var esc = U.esc,
    classColor = U.classColor,
    fbGet = U.fbGet;
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var fmtTs = function (ts) {
    if (!ts) return "";
    var d = new Date(ts * 1000);
    return isNaN(d) ? "" : d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear();
  };
  var daysSince = function (ts) {
    if (!ts) return null;
    return Math.floor((Date.now() / 1000 - ts) / 86400);
  };

  // ⬇⬇ Export format the Okanvil addon produces (docs/LOOT_EXPORT.md). Fallback while the DB is empty. ⬇⬇
  var SAMPLE = {
    exportedAt: 1780700000,
    loot: [
      {
        ts: 1780518194,
        player: "Kobee",
        class: "Rogue",
        itemId: 45107,
        name: "Leviathan's Gaze",
        icon: "inv_jewelry_ring_73",
        boss: "Flame Leviathan",
        raid: "Ulduar",
        size: 25,
        runId: "2026-06-04-ulduar-25",
      },
      {
        ts: 1780518198,
        player: "Magoluso",
        class: "Mage",
        itemId: 45119,
        name: "Cindershard Ring",
        icon: "inv_jewelry_ring_75",
        boss: "Flame Leviathan",
        raid: "Ulduar",
        size: 25,
        runId: "2026-06-04-ulduar-25",
      },
      {
        ts: 1780518260,
        player: null,
        itemId: 45038,
        name: "Fragment of Val'anyr",
        icon: "inv_mace_146",
        boss: "Flame Leviathan",
        raid: "Ulduar",
        size: 25,
        runId: "2026-06-04-ulduar-25",
      },
      {
        ts: 1780519003,
        player: "Kobee",
        class: "Rogue",
        itemId: 45141,
        name: "Reused Straw",
        icon: "inv_wand_1h_ulduarraid_d_01",
        boss: "Razorscale",
        raid: "Ulduar",
        size: 25,
        runId: "2026-06-04-ulduar-25",
      },
      {
        ts: 1780519040,
        player: "Nutelaa",
        class: "Warlock",
        itemId: 45150,
        name: "Wand of the Archlich",
        icon: "inv_wand_1h_ulduarraid_d_02",
        boss: "Ignis the Furnace Master",
        raid: "Ulduar",
        size: 25,
        runId: "2026-06-04-ulduar-25",
      },
      {
        ts: 1780519692,
        player: "Onetreeheals",
        class: "Druid",
        itemId: 45186,
        name: "Living Ice Crystals",
        icon: "spell_frost_frostbolt02",
        boss: "Ignis the Furnace Master",
        raid: "Ulduar",
        size: 25,
        runId: "2026-06-04-ulduar-25",
      },
      {
        ts: 1780520674,
        player: "Magoluso",
        class: "Mage",
        itemId: 45446,
        name: "Aesir's Edge",
        icon: "inv_sword_106",
        boss: "Thorim",
        raid: "Ulduar",
        size: 25,
        runId: "2026-06-04-ulduar-25",
      },
      {
        ts: 1780522044,
        player: "Okanor",
        class: "Paladin",
        itemId: 45038,
        name: "Fragment of Val'anyr",
        icon: "inv_mace_146",
        boss: "Hodir",
        raid: "Ulduar",
        size: 25,
        runId: "2026-06-04-ulduar-25",
      },
      {
        ts: 1780607051,
        player: "Chims",
        class: "Priest",
        itemId: 45284,
        name: "Vestments of the Conqueror",
        icon: "inv_chest_cloth_71",
        boss: "Flame Leviathan",
        raid: "Ulduar",
        size: 10,
        runId: "2026-06-05-ulduar-10",
      },
      {
        ts: 1780607380,
        player: "Drfred",
        class: "Death Knight",
        itemId: 45299,
        name: "Gauntlets of the Kraken",
        icon: "inv_gauntlets_74",
        boss: "Razorscale",
        raid: "Ulduar",
        size: 10,
        runId: "2026-06-05-ulduar-10",
      },
      {
        ts: 1780608721,
        player: "Okanath",
        class: "Paladin",
        itemId: 45868,
        name: "Broken Stalactite",
        icon: "inv_misc_monsterscales_15",
        boss: "XT-002 Deconstructor",
        raid: "Ulduar",
        size: 10,
        runId: "2026-06-05-ulduar-10",
      },
    ],
  };

  var DATA = SAMPLE;
  var IS_OFFICER = !!localStorage.getItem("ratsGuildKey");
  // dev = localhost / file:// -> read the test file fresh (no cache) and keep edits local (never Firebase)
  var IS_DEV = location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var ROSTER = []; // filled from members node for the assign picker (officer only)
  var BOSS_TABLE = {}; // itemName(lower) -> boss, from data/ulduar-loot-table.json (loaded once)

  // Crafting mats & recipes grouped as "crafts" in the loot list (patterns/orbs shown once).
  var SKIP_RE = /^(pattern|plans|formula|design|recipe|schematic|glyph):|runed orb|orb of/i;
  // Items that must NOT count against a raider's LOOT PRIORITY — pure craft mats that are rolled
  // but aren't personal gear: any Val'anyr fragment, all crafting orbs (Runed / Crusader /
  // Primordial Saronite), and patterns/recipes. NOTE: ToC Trophies DO count (they're set-token
  // gear upgrades, so winning one spends priority). Superset of SKIP_RE for the craft mats.
  var PRIORITY_SKIP_RE =
    /fragment.*val'?anyr|val'?anyr.*fragment|^(pattern|plans|formula|design|recipe|schematic|glyph):|runed orb|crusader orb|orb of|primordial saronite/i;
  // Fragments of the legendary — always kept; boss resolved by "last real boss killed" (time).
  var FRAGMENT_RE = /fragment.*val'?anyr|val'?anyr.*fragment/i;
  // the 14 real Ulduar bosses that anchor the timeline (Assembly = the Iron Council)
  var REAL_BOSSES = {
    "Flame Leviathan": 1, "Ignis the Furnace Master": 1, Razorscale: 1, "XT-002 Deconstructor": 1,
    "Assembly of Iron": 1, Kologarn: 1, Auriaya: 1, Hodir: 1, Thorim: 1, Freya: 1,
    Mimiron: 1, "General Vezax": 1, "Yogg-Saron": 1, "Algalon the Observer": 1,
  };

  // A raid LOCKOUT groups both raid nights (we raid Wed + Mon of the same WotLK lockout, which resets
  // Wednesday). runId is anchored to that lockout's Wednesday, so both nights merge into one run.
  function lockoutRunId(l) {
    var dt = new Date((l.ts || 0) * 1000);
    var back = (dt.getDay() - 3 + 7) % 7; // days since this lockout's Wednesday (Wed=3)
    dt.setDate(dt.getDate() - back);
    dt.setHours(0, 0, 0, 0);
    var z = function (n) {
      return String(n).padStart(2, "0");
    };
    var day = dt.getFullYear() + "-" + z(dt.getMonth() + 1) + "-" + z(dt.getDate());
    return day + "-" + String(l.raid || "").toLowerCase() + "-" + l.size;
  }

  // Resolve every item's boss from OUR local table (no Wowhead). Returns { kept, skipped }.
  //   1. crafting/orb -> skip (not tracked)
  //   2. in the name table -> that boss (authoritative)
  //   3. not in table (fragments, quest bits) -> the last REAL boss killed before it, same run+size
  //      (fragments also enforce: at most ONE per boss per run)
  function resolveBosses(list) {
    var arr = list.slice().sort(function (a, b) {
      return (a.ts || 0) - (b.ts || 0);
    });
    var kept = [],
      skipped = 0;
    var lastRealByRun = {}; // runId -> boss name of the most recent real-boss drop
    var fragSeen = {}; // runId|boss -> 1 (fragment de-dupe: one per boss per run)
    arr.forEach(function (l) {
      l.runId = lockoutRunId(l); // merge both raid nights into one lockout run
      var name = l.name || "";
      if (SKIP_RE.test(name)) {
        skipped++;
        return; // crafting/orb — don't store
      }
      var tableBoss = BOSS_TABLE[name.toLowerCase()];
      var isFragment = FRAGMENT_RE.test(name);
      var boss;
      if (tableBoss && REAL_BOSSES[tableBoss]) {
        boss = tableBoss;
        lastRealByRun[l.runId] = tableBoss; // advance the run's current boss
      } else if (isFragment || !tableBoss) {
        // fragment / not-in-table -> last real boss killed before this drop in the run
        boss = lastRealByRun[l.runId] || tableBoss || "Trash";
      } else {
        boss = tableBoss; // in table but not a "real boss" bucket (e.g. Trash) -> keep it
      }
      if (isFragment) {
        // Only the real boss drop ("Fragment of Val'anyr") is 1-per-boss, so de-dupe THAT by
        // run|boss to catch two looters logging the same corpse. Keep the fragment NAME in the
        // key so the Unbound/Shattered quest variants (not boss drops) are never mistaken for a
        // dup of the plain Fragment and dropped.
        var fk = l.runId + "|" + boss + "|" + (name || "").toLowerCase();
        if (fragSeen[fk]) {
          skipped++;
          return; // same fragment kind, same boss/run = logging dup
        }
        fragSeen[fk] = 1;
      }
      l.boss = boss;
      kept.push(l);
    });
    return { kept: kept, skipped: skipped };
  }

  // ---- filtering state (toggles re-render from loaded data — never re-fetch) ----
  // Canonical WotLK raids + order come from the shared module (assets/js/data.js)
  // so changing them there updates every page. `key` here is the full instance
  // name (matches the addon export's l.raid); label is the short segment text.
  var ALL_RAIDS = (window.RatsData && RatsData.RAIDS
    ? RatsData.RAIDS.map(function (r) { return { key: r.name, label: r.label }; })
    : [
        { key: "Naxxramas", label: "Naxx" },
        { key: "Ulduar", label: "Ulduar" },
        { key: "Trial of the Crusader", label: "ToC" },
        { key: "Onyxia's Lair", label: "Ony" },
        { key: "Icecrown Citadel", label: "ICC" },
        { key: "The Ruby Sanctum", label: "RS" },
      ]);
  var RAID = "";
  var SIZE = "25";
  var PERIOD = "all";
  var HIST = { raids: [] }; // attendance history (loaded lazily for the Priority tab)
  var ITEM_WEIGHT = 1; // priority points: 1 raid = +1, 1 item = -ITEM_WEIGHT (tune here)

  function searchQ() {
    var el = document.getElementById("search");
    return el ? el.value.trim().toLowerCase() : "";
  }
  function rows() {
    var q = searchQ();
    return (DATA.loot || []).filter(function (l) {
      if (String(l.size) !== SIZE) return false;
      if (RAID && raidKeyFor(l.raid) !== RAID) return false;
      if (PERIOD !== "all") {
        var d = daysSince(l.ts);
        if (d != null && d > (PERIOD === "week" ? 7 : 31)) return false;
      }
      if (q) {
        var hay = (l.name || "") + " " + (l.boss || "") + " " + (l.player || "");
        if (hay.toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  // which canonical raid does a data raid-name belong to? (loose contains match)
  function raidKeyFor(name) {
    name = (name || "").toLowerCase();
    for (var i = 0; i < ALL_RAIDS.length; i++) {
      var k = ALL_RAIDS[i].key.toLowerCase();
      if (name === k || name.indexOf(k) >= 0 || k.indexOf(name) >= 0) return ALL_RAIDS[i].key;
    }
    return name ? ALL_RAIDS[1].key : ""; // default unknown raids to Ulduar bucket
  }
  function buildRaidSegs() {
    var row = document.getElementById("raidRow");
    // count loot per canonical raid so empty tiers can be dimmed
    var counts = {};
    (DATA.loot || []).forEach(function (l) {
      var k = raidKeyFor(l.raid);
      if (k) counts[k] = (counts[k] || 0) + 1;
    });
    // default to the newest tier that HAS loot, else the first tier
    if (!RAID) {
      RAID = ALL_RAIDS[0].key;
      for (var i = 0; i < ALL_RAIDS.length; i++) {
        if (counts[ALL_RAIDS[i].key]) { RAID = ALL_RAIDS[i].key; break; }
      }
    }
    row.style.display = "inline-flex";
    document.getElementById("raidSegs").innerHTML = ALL_RAIDS
      .map(function (r) {
        var empty = !counts[r.key];
        return (
          '<button class="seg' +
          (r.key === RAID ? " active" : "") +
          (empty ? " empty" : "") +
          '" data-r="' +
          esc(r.key) +
          '" title="' + esc(r.key) + (empty ? " — no loot yet" : "") + '"' +
          ' onclick="setRaid(this)">' +
          esc(r.label) +
          "</button>"
        );
      })
      .join("");
  }

  // ---- item icon (from the addon's icon slug) + plain item name (no external link) ----
  // The CDN serves icons by slug (e.g. inv_sword_39), not by itemId, so the Okanvil export carries `icon`.
  var ICON_BASE = "https://wow.zamimg.com/images/wow/icons/",
    ICON_FALLBACK = "inv_misc_questionmark",
    DE_ICON = "inv_enchant_abysscrystal"; // Abyss Crystal — shown for disenchanted loot
  function iconUrl(slug, size) {
    return ICON_BASE + (size || "large") + "/" + (slug || ICON_FALLBACK) + ".jpg";
  }
  function itemIcon(l) {
    return (
      '<img class="iic" src="' +
      esc(iconUrl(l.icon, "large")) +
      '" alt="" ' +
      "onerror=\"this.src='" +
      iconUrl(ICON_FALLBACK, "large") +
      "'\">"
    );
  }
  // WoW item-quality colors (0 poor … 5 legendary). Raid loot is epic by default, so records
  // that predate the `quality` field still read purple; fragments/legendaries (5) show orange.
  var QUALITY_COLOR = {
    0: "#9d9d9d", // poor (grey)
    1: "#ffffff", // common (white)
    2: "#1eff00", // uncommon (green)
    3: "#0070dd", // rare (blue)
    4: "#a335ee", // epic (purple)
    5: "#ff8000", // legendary (orange)
    6: "#e6cc80", // artifact / heirloom (tan)
    7: "#e6cc80",
  };
  function qualityColor(q) {
    return QUALITY_COLOR[q] || QUALITY_COLOR[4]; // default epic for raid loot without a quality
  }
  function itemLink(l) {
    var nm = l.name || "Item #" + l.itemId;
    var col = qualityColor(l.quality);
    return '<span class="iname" style="color:' + col + '">' + esc(nm) + "</span>";
  }
  function winnerHtml(l, idx) {
    // only officers (guild key present) get the pen to edit — never public visitors
    var edit = IS_OFFICER
      ? '<button class="editbtn" title="Change who won this" onclick="assign(' + idx + ')">✎</button>'
      : "";
    if (l.player === "Disenchant") {
      return (
        '<span class="disenchant"><img class="de-ic" src="' + iconUrl(DE_ICON, "small") +
        '" alt="">Disenchanted</span>' + edit
      );
    }
    if (l.player) {
      return '<span class="won" style="color:' + classColor(l.class) + '">' + esc(l.player) + "</span>" + edit;
    }
    return '<span class="unassignedtag">unassigned</span>' + edit;
  }

  function lootItemHtml(l) {
    var idx = (DATA.loot || []).indexOf(l);
    return (
      '<div class="lootitem' +
      (l.player ? "" : " unassigned") +
      '">' +
      itemIcon(l) +
      itemLink(l) +
      winnerHtml(l, idx) +
      '<span class="wat">' +
      fmtTs(l.ts) +
      "</span>" +
      "</div>"
    );
  }

  // ---- By run ----
  function renderRuns() {
    var el = document.getElementById("runs");
    var list = rows();
    if (!list.length) {
      el.innerHTML = '<div class="card empty">No loot recorded yet for this filter.</div>';
      return;
    }
    // group by runId, newest first
    var runs = {};
    list.forEach(function (l) {
      var k = l.runId || "run-" + (l.ts || 0);
      (runs[k] = runs[k] || []).push(l);
    });
    var keys = Object.keys(runs).sort(function (a, b) {
      return (runs[b][0].ts || 0) - (runs[a][0].ts || 0);
    });
    // only the newest run is open by default; the rest are collapsed
    el.innerHTML = keys
      .map(function (k, ri) {
        var items = runs[k].slice().sort(function (a, b) {
          return (a.ts || 0) - (b.ts || 0);
        });
        var first = items[0];
        var last = items[items.length - 1];
        // a lockout spans two nights (Wed + Mon) → show the date range; one night → single date
        var sameDay = new Date(first.ts * 1000).toDateString() === new Date(last.ts * 1000).toDateString();
        var dateLabel = sameDay ? fmtTs(first.ts) : fmtTs(first.ts) + " – " + fmtTs(last.ts);
        // group by boss within the run
        var byBoss = {},
          order = [];
        items.forEach(function (l) {
          var b = l.boss || "Unknown";
          if (!byBoss[b]) {
            byBoss[b] = [];
            order.push(b);
          }
          byBoss[b].push(l);
        });
        var bossHtml = order
          .map(function (b) {
            return (
              '<div class="bossgrp"><div class="bn">' +
              esc(b) +
              "</div>" +
              byBoss[b].map(lootItemHtml).join("") +
              "</div>"
            );
          })
          .join("");
        // searching → open every run with a match; otherwise newest open, respect user toggles
        var open = searchQ() ? true : OPEN_RUNS[k] != null ? OPEN_RUNS[k] : ri === 0;
        return (
          '<div class="run' +
          (open ? " open" : "") +
          '" data-run="' +
          esc(k) +
          '">' +
          '<div class="rhd" onclick="toggleRun(this)">' +
          '<span class="caret">' +
          (open ? "▾" : "▸") +
          "</span>" +
          '<span class="rtitle">' +
          esc(first.raid || "Raid") +
          " " +
          esc(first.size) +
          "-man</span>" +
          '<span class="rmeta">' +
          dateLabel +
          "</span>" +
          '<span class="rcount">' +
          items.length +
          " item" +
          (items.length !== 1 ? "s" : "") +
          "</span>" +
          (IS_OFFICER
            ? '<button class="delrun" title="Delete this whole run" ' +
              "onclick=\"event.stopPropagation();deleteRun('" + esc(k) + "')\">🗑</button>"
            : "") +
          "</div>" +
          '<div class="rbody">' +
          bossHtml +
          "</div></div>"
        );
      })
      .join("");
  }

  // remembers which runs the user opened/closed this session (keyed by runId)
  var OPEN_RUNS = {};
  function toggleRun(hd) {
    var run = hd.closest(".run");
    if (!run) return;
    var open = !run.classList.contains("open");
    run.classList.toggle("open", open);
    OPEN_RUNS[run.dataset.run] = open;
    var c = hd.querySelector(".caret");
    if (c) c.textContent = open ? "▾" : "▸";
  }
  // expand-all / collapse-all
  function setAllRuns(open) {
    document.querySelectorAll("#runs .run").forEach(function (run) {
      run.classList.toggle("open", open);
      OPEN_RUNS[run.dataset.run] = open;
      var c = run.querySelector(".rhd .caret");
      if (c) c.textContent = open ? "▾" : "▸";
    });
  }

  // ---- By player ----
  function renderPlayers() {
    var el = document.getElementById("players");
    var list = rows().filter(function (l) {
      return l.player;
    });
    if (!list.length) {
      el.innerHTML = '<div class="card empty">No assigned loot yet for this filter.</div>';
      return;
    }
    var by = {};
    list.forEach(function (l) {
      // group by MAIN so a raider's alts merge into one card (like the Priority tab).
      // Remember which toon actually got the item so the expanded list can show it.
      var main = mainName(l.player);
      var p = (by[main] = by[main] ||
        { name: main, class: mainClass(main) || l.class, items: [], frags: [], crafts: [], last: 0 });
      if (FRAGMENT_RE.test(l.name || "")) p.frags.push(l);
      else if (SKIP_RE.test(l.name || "")) p.crafts.push(l);
      else p.items.push(l);
      if ((l.ts || 0) > p.last) p.last = l.ts;
    });
    var players = Object.keys(by)
      .map(function (n) {
        return by[n];
      })
      .sort(function (a, b) {
        // Disenchant is pinned to the top; everyone else by real loot count
        if (a.name === DISENCHANT) return -1;
        if (b.name === DISENCHANT) return 1;
        return b.items.length - a.items.length;
      });
    el.innerHTML =
      '<div class="plist">' +
      players
        .map(function (p) {
          var isDE = p.name === DISENCHANT;
          var col = isDE ? "var(--purple, #a335ee)" : classColor(p.class);
          var d = daysSince(p.last);
          var drought = d != null && d >= 14 ? '<span class="drought"> · no loot ' + d + "d</span>" : "";
          var open = !!OPEN_PLAYERS[p.name];
          var nCraft = p.crafts.length;
          // Group the Val'anyr fragments by EXACT name so the three kinds stay separate:
          //   "Fragment of Val'anyr" = the real 1-per-boss raid drop,
          //   "Unbound Fragments of Val'anyr" = the 30-merge quest item (not a boss drop),
          //   "Shattered Fragments of Val'anyr" = the quest turn-in reward.
          // Merging them hid that only the first is loot. Each gets its own badge / row.
          var fragGroups = {}; // exact name -> { name, items: [] }
          p.frags.forEach(function (l) {
            var k = l.name || "Fragment of Val'anyr";
            (fragGroups[k] = fragGroups[k] || { name: k, items: [] }).items.push(l);
          });
          var fragList = Object.keys(fragGroups)
            .sort()
            .map(function (k) {
              return fragGroups[k];
            });
          // small "icon ×N" badge for a merged mat group (fragments / crafts)
          var badge = function (n, first, title) {
            return n
              ? '<span class="fragpeek"><img title="' + esc(title) + " ×" + n + '" src="' +
                  esc(iconUrl((first || {}).icon, "small")) + '" alt="" onerror="this.src=\'' +
                  iconUrl(ICON_FALLBACK, "small") + "'\"><i>×" + n + "</i></span>"
              : "";
          };
          var fragPeek =
            fragList
              .map(function (g) {
                return badge(g.items.length, g.items[0], g.name);
              })
              .join("") + badge(nCraft, p.crafts[0], "Recipes");
          // thumbnails (collapsed peek) or the full editable item list (expanded)
          var peek = p.items
            .slice(0, 14)
            .map(function (l) {
              return (
                '<img title="' + esc(l.name || l.itemId) + '" src="' + esc(iconUrl(l.icon, "small")) +
                '" alt="" onerror="this.src=\'' + iconUrl(ICON_FALLBACK, "small") + "'\">"
              );
            })
            .join("") + fragPeek;
          // merged summary rows in the full list (not editable — they're mats, not loot)
          var matRow = function (n, first, label) {
            return n
              ? '<div class="lootitem frag-row">' +
                  '<img class="iic" src="' + esc(iconUrl((first || {}).icon, "large")) +
                  '" alt="" onerror="this.src=\'' + iconUrl(ICON_FALLBACK, "large") + "'\">" +
                  '<span class="iname">' + esc(label) + "</span>" +
                  '<span class="frag-x">×' + n + "</span></div>"
              : "";
          };
          var full =
            p.items
              .slice()
              .sort(function (a, b) {
                return (b.ts || 0) - (a.ts || 0);
              })
              .map(lootItemHtml)
              .join("") +
            fragList
              .map(function (g) {
                return matRow(g.items.length, g.items[0], g.name);
              })
              .join("") +
            matRow(nCraft, p.crafts[0], nCraft === 1 ? "Recipe" : "Recipes");
          return (
            '<div class="pcard' + (open ? " open" : "") + (isDE ? " de-card" : "") +
            '" data-player="' + esc(p.name) + '">' +
            '<div class="ph" onclick="togglePlayer(this)">' +
            '<span class="pcaret">' + (open ? "▾" : "▸") + "</span>" +
            '<span class="pn" style="color:' + col + '">' +
            (isDE ? "📌 " : "") + esc(p.name) + "</span>" +
            '<span class="pc">' + p.items.length + "</span>" +
            "</div>" +
            '<div class="pd">last: ' + fmtTs(p.last) + drought + "</div>" +
            (open
              ? '<div class="pfull">' + full + "</div>"
              : '<div class="pitems">' + peek + "</div>") +
            "</div>"
          );
        })
        .join("") +
      "</div>";
  }

  // remembers which player cards are expanded this session
  var OPEN_PLAYERS = {};
  function togglePlayer(hd) {
    var card = hd.closest(".pcard");
    if (!card) return;
    var name = card.dataset.player;
    OPEN_PLAYERS[name] = !OPEN_PLAYERS[name];
    renderPlayers(); // re-render to swap thumbnails ↔ full editable list
  }

  // ---- Priority (fair loot): attendance × items won ----
  // alt -> main resolution (same rules as the history/comp tools, via the roster).
  function normName(s) {
    return (s || "").toLowerCase()
      .replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "") // [SHAKA] / (alt)
      .split(/[\/|,]/)[0] // Lecoque/Chims -> Lecoque
      .replace(/[^a-z0-9]/g, "").trim();
  }
  function guildMember(name) {
    var n = normName(name);
    if (!n) return null;
    var alias = window.RatsData && RatsData.aliasFor ? RatsData.aliasFor(name) : null;
    if (alias) n = normName(alias); // Discord nick -> in-game
    return (ROSTER || []).find(function (x) { return normName(x.name) === n; }) || null;
  }
  function altMainNote(m) {
    var on = ((m && m.officerNote) || "").trim();
    var mm = on.match(/^(.+?)\s+alt\b/i);
    return mm ? mm[1].trim() : null;
  }
  function isAltG(m) {
    return m && (m.rankIndex === 4 || /alt/i.test(m.rankName || "") || !!altMainNote(m));
  }
  function mainOfG(m) {
    if (!m) return null;
    var mn = altMainNote(m);
    if (mn) return mn;
    var pn = (m.publicNote || "").trim();
    if (pn) {
      var t = pn.split(/[\s,/\-(]/)[0];
      if (/^[A-Za-zÀ-ÿ]{2,}$/.test(t)) return t;
    }
    return null;
  }
  // resolve any toon/alt/nick to the canonical MAIN name
  function mainName(name) {
    var m = guildMember(name);
    if (!m) return name; // pug / not in roster -> keep as typed
    if (isAltG(m)) {
      var mn = mainOfG(m);
      if (mn) return mn;
    }
    return m.name; // canonical roster name (merges Kobe/Kobee, etc.)
  }
  // class of a raider's MAIN (for coloring) — looks up the resolved main in roster
  function mainClass(name) {
    var m = guildMember(mainName(name)) || guildMember(name);
    return m && m.class ? m.class : null;
  }
  // does a history raid match the current raid/size/period filter?
  function histInScope(r) {
    var sz = r.size === 10 || r.size === 25 ? r.size : ((r.groups || []).reduce(function (n, g) {
      return n + ((g.members || []).length);
    }, 0) > 10 ? 25 : 10);
    if (String(sz) !== SIZE) return false;
    if (RAID && RatsData && RatsData.raidKeyOf) {
      // history desc → canonical key; RAID here is the full instance name
      var want = RatsData.raidKeyOf(RAID) || RAID;
      var got = RatsData.raidKeyOf(r.desc || r.raid || r.name || "");
      if (got && want && got !== want) return false;
    }
    if (PERIOD !== "all" && r.date) {
      var d = daysSince(dateToTs(r.date));
      if (d != null && d > (PERIOD === "week" ? 7 : 31)) return false;
    }
    return true;
  }
  function dateToTs(dateStr) {
    // history dates are "YYYY-MM-DD"
    var p = String(dateStr || "").split("-");
    if (p.length !== 3) return 0;
    return Math.floor(new Date(+p[0], +p[1] - 1, +p[2]).getTime() / 1000);
  }
  function computePriority() {
    // Window: only count from the FIRST raid we have attendance for (in scope).
    // Loot older than that has no attendance to compare against, so it's excluded
    // — this is why there's never a "0 raids but has loot" row.
    var scoped = (HIST.raids || []).filter(histInScope);
    var firstTs = scoped.reduce(function (min, r) {
      var t = dateToTs(r.date);
      return t && (min === 0 || t < min) ? t : min;
    }, 0);

    // raids attended per raider (attendance history, in scope)
    var runs = {}, cls = {};
    scoped.forEach(function (r) {
      var seen = {};
      (r.groups || []).forEach(function (g) {
        (g.members || []).forEach(function (m) {
          var who = mainName(m.name);
          if (!who || seen[who]) return;
          seen[who] = 1;
          runs[who] = (runs[who] || 0) + 1;
          if (m.class && !cls[who]) cls[who] = m.class;
        });
      });
    });

    // items won per raider (loot in scope, AND on/after the attendance window).
    // Skip guild items (fragments, mats/patterns/orbs) and disenchants.
    // Keep the actual loot rows per raider so the row can expand to show them.
    var won = {}; // main name -> [loot rows]
    rows().forEach(function (l) {
      if (!l.player || l.player === DISENCHANT) return;
      if (firstTs && l.ts && l.ts < firstTs) return; // loot before we tracked attendance
      var nm = l.name || "";
      // craft mats (fragments/orbs/patterns) don't spend priority; ToC trophies DO (gear tokens).
      if (PRIORITY_SKIP_RE.test(nm)) return;
      var who = mainName(l.player);
      (won[who] = won[who] || []).push(l);
      if (l.class && !cls[who]) cls[who] = l.class;
    });

    // Only rank people who actually attended (runs > 0). Someone with loot but
    // no attendance in the window simply doesn't appear — no more phantom rows.
    // POINTS system: each raid attended = +1, each item won = -ITEM_WEIGHT.
    // So presence drives priority (3-raid regular > 1-raid guest) and loot
    // spends it. Higher points = more owed = higher priority.
    var list = Object.keys(runs).map(function (n) {
      var rn = runs[n], loot = won[n] || [];
      return {
        name: n, runs: rn, items: loot.length, loot: loot,
        class: mainClass(n) || cls[n],
        points: rn - loot.length * ITEM_WEIGHT,
      };
    });
    return { list: list, raids: scoped.length, firstTs: firstTs };
  }
  function renderPriority() {
    var el = document.getElementById("priority");
    if (!el) return;
    var d = computePriority();
    if (!d.list.length) {
      el.innerHTML = '<div class="card empty">No attendance recorded for this filter yet.</div>';
      return;
    }
    // Rank by POINTS (raids − items×weight), descending: most points = top priority.
    // Presence lifts you, loot spends it — so a 3-raid regular outranks a 1-raid guest.
    d.list.sort(function (a, b) { return b.points - a.points || b.runs - a.runs; });
    // scale the bidirectional bar by the biggest swing in either direction
    var maxAbs = d.list.reduce(function (m, p) { return Math.max(m, Math.abs(p.points)); }, 1);

    var head =
      '<div class="prio-legend sub">' +
      '<span class="prio-formula"><b>points</b> = raids attended <b>−</b> items won</span>' +
      '<span class="prio-key"><i class="dot ok"></i>owed loot' +
      '<i class="dot vt"></i>got extra</span>' +
      '<span class="prio-hint">click a row to see items · since attendance tracking began</span>' +
      "</div>";

    function chip(p) {
      var col = p.class ? classColor(p.class) : "var(--text)";
      return '<div class="dchip"><span class="dname" style="color:' + col + '">' + esc(p.name) +
        '</span><span class="dmeta">' + p.runs + " raids · " + p.items + " items</span>" +
        '<span class="dscore">' + (p.points > 0 ? "+" : "") + p.points + "</span></div>";
    }
    var top3 = d.list.slice(0, 3);            // most points
    var bottom3 = d.list.slice(-3).reverse(); // fewest points
    var dash =
      '<div class="prio-dash">' +
      '<div class="dcard hi"><div class="dhd">Next in line' +
      '<span class="dsub">most owed — give priority</span></div>' +
      top3.map(chip).join("") + "</div>" +
      '<div class="dcard lo"><div class="dhd">Well served' +
      '<span class="dsub">won the most for their attendance</span></div>' +
      bottom3.map(chip).join("") + "</div>" +
      "</div>";

    var rowsHtml = d.list.map(function (p, i) {
      var col = p.class ? classColor(p.class) : "var(--text)";
      // tone: positive points = owed (green); negative = got extra (red); 0 = neutral
      var tone = p.points > 0 ? "hi" : p.points < 0 ? "lo" : "mid";
      // bidirectional bar from the centre: + grows right (green, owed),
      // − grows left (red, got extra). Half-width so each side maxes at 50%.
      var half = Math.round((Math.abs(p.points) / maxAbs) * 50);
      var barFill = p.points >= 0
        ? '<i class="fbar-pos" style="width:' + half + '%"></i>'
        : '<i class="fbar-neg" style="width:' + half + '%"></i>';
      var open = !!OPEN_PRIO[p.name];
      var itemsHtml = open
        ? '<div class="prow-items" onclick="event.stopPropagation()">' +
          (p.loot.length
            ? p.loot.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })
                .map(lootItemHtml).join("")
            : '<div class="sub" style="padding:6px 2px">No items won yet.</div>') +
          "</div>"
        : "";
      return (
        '<div class="prow ' + tone + (open ? " open" : "") + '" data-prio="' + esc(p.name) +
        '" onclick="togglePrio(this)">' +
        '<span class="prank">' + (open ? "▾" : (i + 1)) + "</span>" +
        '<span class="pname" style="color:' + col + '">' + esc(p.name) + "</span>" +
        '<span class="pstat"><b>' + p.runs + "</b> raids</span>" +
        '<span class="pstat"><b>' + p.items + "</b> items</span>" +
        '<span class="fbar"><span class="fbar-center"></span>' + barFill + "</span>" +
        '<span class="pscore ' + tone + '">' + (p.points > 0 ? "+" : "") + p.points + "</span>" +
        "</div>" + itemsHtml
      );
    }).join("");
    el.innerHTML = head + dash + '<div class="prio-list">' + rowsHtml + "</div>";
  }
  // expand a priority row to show the raider's items (like By player)
  var OPEN_PRIO = {};
  function togglePrio(row) {
    var name = row && row.dataset && row.dataset.prio;
    if (!name) return;
    OPEN_PRIO[name] = !OPEN_PRIO[name];
    renderPriority();
  }

  function render() {
    buildRaidSegs();
    renderRuns();
    renderPlayers();
    renderPriority();
  }

  // ---- tabs / segments (client-side only) ----
  function setTab(b) {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t === b);
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.hidden = p.dataset.panel !== b.dataset.t;
    });
  }
  function setRaid(b) {
    RAID = b.dataset.r;
    document.querySelectorAll("#raidSegs .seg").forEach(function (s) {
      s.classList.toggle("active", s === b);
    });
    render();
  }
  function setSize(b) {
    SIZE = b.dataset.s;
    document.querySelectorAll("#sizeSegs .seg").forEach(function (s) {
      s.classList.toggle("active", s === b);
    });
    render();
  }
  function setPeriod(b) {
    PERIOD = b.dataset.p;
    document.querySelectorAll("#periodSegs .seg").forEach(function (s) {
      s.classList.toggle("active", s === b);
    });
    render();
  }

  // ---- officer: import (merge) ----
  function openImport() {
    if (!IS_OFFICER) return; // import is officer-only
    document.getElementById("importOv").classList.add("open");
  }
  function closeImport() {
    document.getElementById("importOv").classList.remove("open");
  }
  function importMsg(t, ok) {
    var e = document.getElementById("importMsg");
    e.style.color = ok ? "var(--ok)" : "#ff6b6b";
    e.textContent = t;
  }
  // merge new entries into DATA.loot, de-duped by ts+itemId (a drop is unique by time+item;
  // the winner can be edited later, so don't include player in the key or re-imports duplicate).
  function mergeLoot(incoming) {
    var key = function (l) {
      return (l.ts || 0) + "|" + l.itemId;
    };
    var seen = {};
    (DATA.loot || []).forEach(function (l) {
      seen[key(l)] = 1;
    });
    var added = 0;
    incoming.forEach(function (l) {
      if (!seen[key(l)]) {
        DATA.loot.push(l);
        seen[key(l)] = 1;
        added++;
      }
    });
    return added;
  }
  async function doImport() {
    if (!IS_OFFICER) return; // import is officer-only
    var raw = document.getElementById("importText").value.trim();
    if (!raw) {
      importMsg("Paste the export JSON first.");
      return;
    }
    var incoming;
    try {
      incoming = parseLootPaste(raw).list; // tolerant: accepts loose "{…},{…}" too
    } catch (e) {
      importMsg("Invalid JSON: " + e.message);
      return;
    }
    if (!DATA.loot) DATA.loot = [];
    // resolve each item's boss from our local Ulduar table (drops crafting mats); then merge
    var res = resolveBosses(incoming);
    var added = mergeLoot(res.kept);
    var skipNote = res.skipped ? " · skipped " + res.skipped + " craft/dup" : "";
    if (IS_DEV) {
      // dev: keep it in memory only, don't touch Firebase
      importMsg("✅ Merged " + added + " new item" + (added !== 1 ? "s" : "") + skipNote + " (dev — in memory).", true);
      render();
      setTimeout(closeImport, 1200);
      return;
    }
    importMsg("⏳ Saving…", true);
    try {
      await saveLoot();
      importMsg("✅ Merged " + added + " new item" + (added !== 1 ? "s" : "") + skipNote + ".", true);
      render();
      setTimeout(closeImport, 1200);
    } catch (e) {
      importMsg("Save failed: " + (e && e.message ? e.message : e));
    }
  }

  // persist after a maintenance action (dev = local, prod = Firebase)
  async function persistLoot(okMsg) {
    if (IS_DEV) {
      importMsg(okMsg + " (dev — in memory).", true);
      render();
      return;
    }
    importMsg("⏳ Saving…", true);
    try {
      await saveLoot();
      importMsg(okMsg + ".", true);
      render();
    } catch (e) {
      importMsg("Save failed: " + (e && e.message ? e.message : e));
    }
  }

  // Collapse duplicate drops in a list. A duplicate is the SAME winner getting the
  // SAME item within a short window — the MRT/loot log often records one physical
  // drop twice, seconds apart (two people opened the corpse), so an exact-ts match
  // misses them. Same player + itemId within DEDUP_WINDOW seconds = one drop.
  // Entries with a winner are kept over unassigned ones; earliest ts is kept.
  // Returns { kept: [...], removed: n }.
  // Tolerant parse of pasted loot JSON. Accepts, in order:
  //   1. a proper object  { "loot": [ … ] }  (or with a t/data wrapper)
  //   2. a bare array     [ { … }, { … } ]
  //   3. LOOSE objects pasted without the array brackets:
  //        { … },  { … }     <- what a partial copy/paste produces
  // For case 3 we wrap the text in [ … ] and strip a trailing comma so it parses.
  // Returns { list: [...] , shape: "array"|"loot"|"wrapped", parsed } or throws.
  function parseLootPaste(raw) {
    var txt = (raw || "").trim();
    if (!txt) throw new Error("empty");
    // try strict first
    try {
      var p = JSON.parse(txt);
      if (Array.isArray(p)) return { list: p, shape: "array", parsed: p };
      if (p && Array.isArray(p.loot)) return { list: p.loot, shape: "loot", parsed: p };
      // t/data wrapper (hub snapshot): { t, data:{ loot:[…] } }
      if (p && p.data && Array.isArray(p.data.loot))
        return { list: p.data.loot, shape: "wrapped", parsed: p };
    } catch (e) {
      /* fall through to loose repair */
    }
    // LOOSE repair: wrap in [] if it doesn't already start with [ or {"loot"
    var body = txt.replace(/,\s*$/, ""); // drop a trailing comma
    if (body[0] !== "[") body = "[" + body + "]";
    var arr = JSON.parse(body); // may still throw -> caller reports it
    if (!Array.isArray(arr)) throw new Error("not a loot array");
    return { list: arr, shape: "array", parsed: arr };
  }

  var DEDUP_WINDOW = 90; // seconds
  function dedupeList(list) {
    var kept = [],
      removed = 0;
    (list || [])
      .slice()
      .sort(function (a, b) {
        var aw = a.player ? 1 : 0,
          bw = b.player ? 1 : 0;
        if (aw !== bw) return bw - aw;
        return (a.ts || 0) - (b.ts || 0);
      })
      .forEach(function (l) {
        var dup = kept.some(function (k) {
          return (
            k.itemId === l.itemId &&
            (k.player || null) === (l.player || null) &&
            Math.abs((k.ts || 0) - (l.ts || 0)) <= DEDUP_WINDOW
          );
        });
        if (dup) {
          removed++;
          return;
        }
        kept.push(l);
      });
    kept.sort(function (a, b) {
      return (a.ts || 0) - (b.ts || 0);
    });
    return { kept: kept, removed: removed };
  }

  // "Remove duplicates" button. If there's JSON pasted in the import box, dedupe
  // THAT (rewrite the textarea in place) so you can clean an export before merging
  // — you shouldn't have to save dirty data first. If the box is empty, fall back
  // to deduping the already-saved DATA.loot.
  async function dedupeLoot() {
    if (!IS_OFFICER) return;
    var box = document.getElementById("importText");
    var raw = box ? box.value.trim() : "";

    // --- case 1: dedupe the pasted import text ---
    if (raw) {
      var pp;
      try {
        pp = parseLootPaste(raw); // tolerant: fixes loose "{…},{…}" pastes too
      } catch (e) {
        importMsg("Invalid JSON: " + e.message);
        return;
      }
      var res = dedupeList(pp.list);
      // rebuild the paste in the same shape it came in (or normalise a loose paste
      // into a proper { loot: [...] } so the next Merge & save is clean).
      var outObj;
      if (pp.shape === "loot") outObj = Object.assign({}, pp.parsed, { loot: res.kept });
      else if (pp.shape === "wrapped")
        outObj = Object.assign({}, pp.parsed, {
          data: Object.assign({}, pp.parsed.data, { loot: res.kept }),
        });
      else outObj = { loot: res.kept }; // array or loose -> wrap cleanly
      box.value = JSON.stringify(outObj, null, 1);
      if (!res.removed) {
        importMsg("No duplicates found (JSON cleaned up). Review, then Merge & save.", true);
        return;
      }
      importMsg(
        "🧹 Removed " +
          res.removed +
          " duplicate" +
          (res.removed !== 1 ? "s" : "") +
          " from the paste — review, then Merge & save.",
        true,
      );
      return;
    }

    // --- case 2: nothing pasted -> dedupe what's already saved ---
    var r = dedupeList(DATA.loot || []);
    if (!r.removed) {
      importMsg("No duplicates found.", true);
      return;
    }
    DATA.loot = r.kept;
    await persistLoot("🧹 Removed " + r.removed + " duplicate" + (r.removed !== 1 ? "s" : ""));
  }

  // wipe ALL loot history (double-confirmed)
  async function clearAllLoot() {
    if (!IS_OFFICER) return;
    var n = (DATA.loot || []).length;
    if (!n) return importMsg("Nothing to clear.", true);
    if (!confirm("Delete ALL " + n + " loot entries? This cannot be undone.")) return;
    if (!confirm("Really wipe the whole loot history?")) return;
    DATA.loot = [];
    await persistLoot("🗑 Cleared all loot (" + n + " removed)");
  }

  // ---- officer: change who won an item — dropdown of raiders + Disenchant ----
  // Fixes loot the Master Looter held then traded, or marks it disenchanted.
  var DISENCHANT = "Disenchant";
  var editIdx = -1;
  var pendingWho = ""; // selection awaiting Confirm

  // roster to pick from: everyone in the roster + anyone who won loot this session, de-duped by name.
  // Sorted purely ALPHABETICALLY (rank is only carried so alts can be filtered out in the list).
  function playerChoices() {
    var by = {}; // name -> { name, class, rank, rankName }
    ROSTER.forEach(function (r) {
      if (r.name) by[r.name] = { name: r.name, class: r.class || "", rank: r.rankIndex, rankName: r.rankName };
    });
    (DATA.loot || []).forEach(function (l) {
      if (l.player && l.player !== DISENCHANT && !by[l.player])
        by[l.player] = { name: l.player, class: l.class || "", rank: undefined, rankName: "" };
    });
    return Object.keys(by)
      .map(function (n) {
        return by[n];
      })
      .sort(function (a, b) {
        return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
      });
  }

  // class colour for a picked name (roster/loot), for the "to" label + the input text
  function classForName(name) {
    if (!name || name === DISENCHANT) return "";
    var p = playerChoices().find(function (x) {
      return x.name.toLowerCase() === name.toLowerCase();
    });
    return p ? classColor(p.class) : "";
  }
  // render the "from X → Y" line + colour the input to match the current pick
  function updateEditTo() {
    var toEl = document.getElementById("editTo");
    var inp = document.getElementById("editSearch");
    if (!toEl) return;
    if (pendingWho === DISENCHANT) {
      toEl.innerHTML =
        '<span class="disenchant"><img class="de-ic" src="' + iconUrl(DE_ICON, "small") + '" alt="">Disenchant</span>';
      if (inp) inp.style.color = "var(--purple)";
    } else if (pendingWho) {
      var col = classForName(pendingWho) || "var(--white)";
      toEl.innerHTML = '<b style="color:' + col + '">' + esc(pendingWho) + "</b>";
      if (inp) inp.style.color = col;
    } else {
      toEl.innerHTML = "<i>pick below</i>";
      if (inp) inp.style.color = "";
    }
  }

  function assign(idx) {
    if (!IS_OFFICER) return; // editing is officer-only
    var l = (DATA.loot || [])[idx];
    if (!l) return;
    editIdx = idx;
    var fromTxt = l.player
      ? l.player === DISENCHANT
        ? '<span class="disenchant"><img class="de-ic" src="' + iconUrl(DE_ICON, "small") + '" alt="">Disenchanted</span>'
        : '<b style="color:' + classColor(l.class) + '">' + esc(l.player) + "</b>"
      : '<i class="unassignedtag">unassigned</i>';
    document.getElementById("editItem").innerHTML =
      '<span class="edit-head">' +
      '<img class="iic" src="' + esc(iconUrl(l.icon, "large")) + '" alt="" ' +
      "onerror=\"this.src='" + iconUrl(ICON_FALLBACK, "large") + "'\">" +
      '<span class="edit-meta"><span class="edit-name" style="color:' + qualityColor(l.quality) + '">' +
      esc(l.name || "item #" + l.itemId) + "</span>" +
      '<span class="edit-sub">' + esc(l.boss || "") + " · " + fmtTs(l.ts) + "</span></span></span>" +
      '<div class="edit-from">from ' + fromTxt + ' <span class="edit-arrow">→</span> <span id="editTo"></span></div>';
    pendingWho = l.player || ""; // selection awaiting Confirm
    // pre-fill the field with the current winner (blank for unassigned/disenchant)
    document.getElementById("editSearch").value = l.player && l.player !== DISENCHANT ? l.player : "";
    document.getElementById("editList").style.display = "none";
    updateEditTo();
    document.getElementById("editOv").classList.add("open");
    setTimeout(function () {
      var s = document.getElementById("editSearch");
      s.focus();
      s.select();
    }, 40);
  }
  // typeahead list (same pattern as the vacations picker): vertical rows, class-coloured names.
  // Alts are skipped; raiders are sorted by rank then class then name (headers removed — plain list).
  function buildEditList(q) {
    var el = document.getElementById("editList");
    q = (q || "").toLowerCase();
    var special = [
      { name: "", label: "— unassigned —", col: "var(--text-dim-2)" },
      { name: DISENCHANT, label: "Disenchant", col: "var(--purple)", de: true },
    ];
    var mains = playerChoices().filter(function (p) {
      return !(p.rank === 4 || /alt/i.test(p.rankName || "")); // skip alts entirely
    });
    var html = special
      .filter(function (r) {
        return !q || r.name.toLowerCase().indexOf(q) >= 0;
      })
      .map(optHtml)
      .join("");
    mains.forEach(function (p) {
      if (q && p.name.toLowerCase().indexOf(q) < 0) return;
      html += optHtml({ name: p.name, label: p.name, col: classColor(p.class) });
    });
    el.innerHTML = html;
    el.style.display = "block"; // open the floating list
  }
  function optHtml(r) {
    var on = r.name === pendingWho;
    var de = r.de ? '<img class="de-ic" src="' + iconUrl(DE_ICON, "small") + '" alt="">' : "";
    return (
      '<div class="opt' + (on ? " on" : "") + '" style="color:' + r.col + '" ' +
      'onclick="selectWinner(' + JSON.stringify(r.name).replace(/"/g, "&quot;") + ')">' +
      de + esc(r.label) + (on ? '<span class="opt-cur">✓</span>' : "") + "</div>"
    );
  }
  function filterEditList() {
    var typed = document.getElementById("editSearch").value;
    buildEditList(typed);
    // as you type, treat an exact roster-name match as the pending pick (updates the "→ to" colour)
    var hit = playerChoices().find(function (p) {
      return p.name.toLowerCase() === typed.trim().toLowerCase();
    });
    pendingWho = hit ? hit.name : typed.trim();
    updateEditTo();
  }
  function selectWinner(name) {
    pendingWho = name;
    // reflect the pick in the field, then close the list (like the vacations picker)
    document.getElementById("editSearch").value = name || "";
    document.getElementById("editList").style.display = "none";
    updateEditTo();
  }
  // one-click: mark this item as disenchanted and save immediately
  function pickDisenchant() {
    pendingWho = DISENCHANT;
    document.getElementById("editSearch").value = DISENCHANT;
    confirmEdit();
  }
  function closeEdit() {
    document.getElementById("editOv").classList.remove("open");
    editIdx = -1;
  }
  async function confirmEdit() {
    if (!IS_OFFICER) return closeEdit();
    var l = (DATA.loot || [])[editIdx];
    if (!l) return closeEdit();
    // prefer a clicked selection; otherwise trust the typed text (matched case-insensitively to a raider)
    var typed = (document.getElementById("editSearch").value || "").trim();
    var who = pendingWho;
    if (typed !== (pendingWho || "")) {
      var hit = playerChoices().find(function (p) {
        return p.name.toLowerCase() === typed.toLowerCase();
      });
      who = hit ? hit.name : typed; // exact roster name, else the raw typed text
    }
    if (who === (l.player || "")) return closeEdit(); // unchanged
    l.player = who || null;
    var m =
      who && who !== DISENCHANT
        ? ROSTER.find(function (r) {
            return (r.name || "").toLowerCase() === who.toLowerCase();
          })
        : null;
    l.class = m && m.class ? m.class : undefined;
    closeEdit();
    if (IS_DEV) {
      saveDevEdit(l);
      render();
      return;
    }
    try {
      await saveLoot();
      render();
    } catch (e) {
      alert("Save failed: " + (e && e.message ? e.message : e));
    }
  }

  // delete a whole run/lockout (officer only): removes every loot entry sharing
  // this runId. Confirms with the count first, then saves.
  async function deleteRun(runId) {
    if (!IS_OFFICER) return;
    var victims = (DATA.loot || []).filter(function (l) {
      return (l.runId || "run-" + (l.ts || 0)) === runId;
    });
    if (!victims.length) return;
    var first = victims[0];
    var label = (first.raid || "Raid") + " " + (first.size || "") + "-man — " + victims.length + " item" +
      (victims.length !== 1 ? "s" : "");
    if (!confirm("Delete this whole run?\n\n" + label + "\n\nThis cannot be undone.")) return;
    DATA.loot = (DATA.loot || []).filter(function (l) {
      return (l.runId || "run-" + (l.ts || 0)) !== runId;
    });
    if (IS_DEV) {
      victims.forEach(saveDevDelete);
      render();
      return;
    }
    try {
      await saveLoot();
      render();
    } catch (e) {
      alert("Delete failed: " + (e && e.message ? e.message : e));
    }
  }

  // DEV: remember deletions locally so the test file re-import doesn't resurrect them
  function saveDevDelete(l) {
    var dels;
    try {
      dels = JSON.parse(localStorage.getItem(DEL_KEY) || "[]");
    } catch (e) {
      dels = [];
    }
    dels.push(l.ts + "|" + l.itemId);
    try {
      localStorage.setItem(DEL_KEY, JSON.stringify(dels));
    } catch (e) {}
  }

  // DEV: persist a single winner edit to localStorage immediately (no network, no Firebase)
  function saveDevEdit(l) {
    var edits;
    try {
      edits = JSON.parse(localStorage.getItem(EDIT_KEY) || "{}");
    } catch (e) {
      edits = {};
    }
    edits[l.ts + "|" + l.itemId] = { player: l.player, class: l.class };
    try {
      localStorage.setItem(EDIT_KEY, JSON.stringify(edits));
    } catch (e) {}
  }

  // write the whole loot node (PUT). Plain, world-readable — same node the public read uses.
  async function saveLoot() {
    var r = await fetch(U.FB + "loot.json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exportedAt: Math.floor(Date.now() / 1000), loot: DATA.loot || [] }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: DATA }));
    } catch (e) {}
  }

  // ---- public read: ONE cached snapshot (TTL 30 min). Toggles never re-fetch. ----
  // Order: cache -> local loot-data.json (test data, if present) -> Firebase `loot` node -> bundled SAMPLE.
  var CACHE_KEY = "ratsLootCache",
    EDIT_KEY = "ratsLootDevEdits",
    DEL_KEY = "ratsLootDevDeletes",
    CACHE_TTL = 30 * 60 * 1000;
  async function load() {
    // DEV: always read the test file fresh (no cache), then apply any local dev edits on top.
    if (IS_DEV) {
      try {
        var dr = await fetch("data/loot-data.json", { cache: "no-store" });
        if (dr.ok) {
          var dj = await dr.json();
          if (dj && dj.loot) DATA = dj;
        }
      } catch (e) {}
      applyDevEdits();
      render();
      return;
    }
    // PROD: cached snapshot (TTL 30 min) -> Firebase `loot` node -> SAMPLE.
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (c && Date.now() - c.t < CACHE_TTL && c.data) {
        DATA = c.data;
        render();
        return;
      }
    } catch (e) {}
    var node = await fbGet("loot");
    if (node && node.loot) {
      DATA = node;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: DATA }));
      } catch (e) {}
    }
    render();
  }

  // DEV winner edits are kept in localStorage (keyed by ts|itemId) and re-applied over the fresh file.
  function applyDevEdits() {
    var edits, dels;
    try {
      edits = JSON.parse(localStorage.getItem(EDIT_KEY) || "{}");
    } catch (e) {
      edits = {};
    }
    try {
      dels = JSON.parse(localStorage.getItem(DEL_KEY) || "[]");
    } catch (e) {
      dels = [];
    }
    // drop dev-deleted entries first
    if (dels.length) {
      var gone = {};
      dels.forEach(function (k) { gone[k] = 1; });
      DATA.loot = (DATA.loot || []).filter(function (l) {
        return !gone[l.ts + "|" + l.itemId];
      });
    }
    (DATA.loot || []).forEach(function (l) {
      var e = edits[l.ts + "|" + l.itemId];
      if (e) {
        l.player = e.player;
        l.class = e.class;
      }
    });
  }

  // officer picker source. Prefer the roster (has rankIndex + rankName → sort/group by rank).
  // The roster node is plain here, so read it directly; fall back to RatsData cache, then members.
  async function loadRosterForAssign() {
    await _fetchRoster();
    // roster drives alt→main merging + class colors; re-render once it's in so
    // alts (Chims→Lecoque, Nutelea→Dknutela) merge on load, not only after a click.
    if (ROSTER.length) render();
  }
  async function _fetchRoster() {
    try {
      var blob = await fbGet("roster");
      if (blob && Array.isArray(blob.roster) && blob.roster.length) {
        ROSTER = blob.roster;
        return;
      }
    } catch (e) {}
    try {
      if (window.RatsData && RatsData.loadRoster) {
        var data = await RatsData.loadRoster({ interactive: false });
        if (data && Array.isArray(data.roster) && data.roster.length) {
          ROSTER = data.roster;
          return;
        }
      }
    } catch (e) {}
    var m = await fbGet("members");
    if (Array.isArray(m)) ROSTER = m;
    else if (m && typeof m === "object")
      ROSTER = Object.keys(m).map(function (k) {
        return m[k];
      });
  }

  // expose inline handlers
  window.setTab = setTab;
  window.setRaid = setRaid;
  window.setSize = setSize;
  window.setPeriod = setPeriod;
  window.openImport = openImport;
  window.closeImport = closeImport;
  window.doImport = doImport;
  window.dedupeLoot = dedupeLoot;
  window.clearAllLoot = clearAllLoot;
  window.assign = assign;
  window.closeEdit = closeEdit;
  window.confirmEdit = confirmEdit;
  window.filterEditList = filterEditList;
  window.selectWinner = selectWinner;
  window.pickDisenchant = pickDisenchant;
  // close the suggestion list when clicking outside the search field / list (like vacations)
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#editSearch") && !e.target.closest("#editList")) {
      var el = document.getElementById("editList");
      if (el) el.style.display = "none";
    }
  });
  window.toggleRun = toggleRun;
  window.deleteRun = deleteRun;
  window.setAllRuns = setAllRuns;
  window.togglePlayer = togglePlayer;
  window.togglePrio = togglePrio;
  window.render = render;

  // load our local Ulduar item->boss table (used to resolve boss on import; no Wowhead calls)
  async function loadBossTable() {
    try {
      var r = await fetch("data/ulduar/table.json", { cache: "force-cache" });
      if (r.ok) BOSS_TABLE = await r.json();
    } catch (e) {}
  }
  // attendance history feeds the Priority tab; needs roster (alt-merge) too
  async function loadHistoryForPriority() {
    try {
      if (window.RatsData && RatsData.loadRoster) await RatsData.loadRoster({ interactive: false });
      if (window.RatsData && RatsData.loadHistory) {
        var h = await RatsData.loadHistory({ interactive: false });
        if (h && Array.isArray(h.raids)) HIST = h;
      }
    } catch (e) {}
    renderPriority();
  }

  // roster is public (read-only) — load it for EVERYONE so alt→main merging +
  // class colors work in "By player" on first paint, not just for officers.
  loadRosterForAssign();
  if (IS_OFFICER) {
    var ib = document.getElementById("importBtn");
    if (ib) ib.hidden = false;
    var pt = document.getElementById("prioTab");
    if (pt) pt.hidden = false; // Priority tab is officer-only
    loadBossTable(); // import needs the item->boss table
    loadHistoryForPriority(); // Priority tab: attendance × loot
  }
  load();
})();
