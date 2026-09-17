/* RATS — loot priority engine.

   Computes every ladder in the browser from the SAME live nodes the rest of the hub
   writes: `roster` (who is in the guild), `rankings` (logs -> attendance + output) and
   `loot` (who already won what). Nothing is hand-maintained here -- post the raid, push
   loot and rankings as usual, refresh, and the order is right: a winner is struck
   through and the next name lights up, a new pumper climbs past a veteran who does no
   damage, and someone who stops showing up drops off.

   window.RatsPrio.build(data) -> { items, players, meta }
*/
(function (w) {
  "use strict";

  // ---- who counts as what ------------------------------------------------
  var HEAL_SPECS = ["Restoration", "Holy", "Discipline"];
  var TANK_SPECS = ["Protection", "Blood"];
  var FERAL = ["Feral Combat", "Feral"];
  var PLATE_STR = ["Arms", "Fury"];
  var CASTER_CLASSES = ["Mage", "Warlock", "Priest", "Druid", "Shaman"];

  // How long someone can be absent before they drop off the ladders, measured in
  // raid days rather than calendar days so a quiet fortnight does not evict the raid.
  var RECENT_WINDOW = 8;
  // This page is about 25-man loot, so only 25-man nights count. A log carries its
  // difficulty per fight (TWENTY_FIVE_NM / _HC, TEN_NM / _HC): a 10-man night is a
  // different raid with different gear and a different bar, and folding its numbers
  // in here made a single alt run look like ICC form.
  function isIcc25(lg) {
    if (lg.raidSlug !== "icc") return false;
    var f = lg.bfights || [];
    for (var i = 0; i < f.length; i++) {
      if (String(f[i].diff || "").indexOf("TWENTY_FIVE") === 0) return true;
    }
    return false;
  }

  // One night can hold both sizes -- the guild clears 25 and then runs a 10 on the
  // same log. Rows carry a boss name and fights carry the difficulty, so map boss
  // -> size and keep only the 25-man rows.
  function icc25Bosses(lg) {
    var ok = {};
    (lg.bfights || []).forEach(function (f) {
      if (String(f.diff || "").indexOf("TWENTY_FIVE") === 0 && f.bn) ok[f.bn] = 1;
    });
    return ok;
  }

  // Everyone in the guild who raids appears on their class's ladders, however new.
  // A Rat on the list is a Rat: hiding someone is a judgement they cannot answer,
  // whereas a low place is one they can climb out of.

  function has(arr, v) { return arr.indexOf(v) >= 0; }

  var S = function (p) { return p.spec; };
  var C = function (p) { return p.cls; };
  var R = function (p) { return p.role; };

  function meleeStr(p) {
    return R(p) === "DPS" &&
      (has(PLATE_STR, S(p)) || C(p) === "Death Knight" || S(p) === "Retribution");
  }
  // Frost/Unholy DKs dual-wield, so a 2H is dead weight unless they hold Shadowmourne
  // (an officer call, not a list). Blood tanks DO want them -- the sheet's tank BiS
  // is Glorenzelg/Cryptmaker.
  function twoHandStr(p) {
    if (C(p) === "Death Knight") return S(p) === "Blood";
    return R(p) === "DPS" && (has(PLATE_STR, S(p)) || S(p) === "Retribution");
  }
  function caster(p) {
    return has(CASTER_CLASSES, C(p)) && R(p) === "DPS" &&
      S(p) !== "Enhancement" && !has(FERAL, S(p));
  }
  function healer(p) { return R(p) === "HEALER"; }
  // A healer holding Val'anyr is done with weapons -- the sheet says as much
  // ("Healers should have valanyr"), so they drop off caster weapon ladders.
  function healerNeedsWeapon(p) { return healer(p) && !p.valanyr; }
  function tank(p) { return R(p) === "TANK"; }
  function rogue(p) { return C(p) === "Rogue"; }
  function hunter(p) { return C(p) === "Hunter"; }
  function plateTank(p) { return tank(p) && (C(p) === "Paladin" || C(p) === "Warrior"); }

  // The sheet's tier philosophy, and only that: "your tanks are going to need all
  // the help they can get... Once that's done, we believe DPS should get priority.
  // Unholy DK's go last, Mages and Rets near first, and everyone else somewhere in
  // between." Healers are not placed above DPS anywhere in it, so they sit with
  // "everyone else" rather than in a band of their own -- and inside that band our
  // own ICC output decides, which is what stops a bottom-percentile healer
  // outranking the raid's best DPS on a token.
  function tierBand(p) {
    if (R(p) === "TANK") return 0;
    if (C(p) === "Mage" || S(p) === "Retribution") return 1;
    if (S(p) === "Unholy") return 3;
    return 2;
  }

  // Everyone eligible stays on the list -- but a raider who is genuinely off the pace
  // in OUR raid does not hold the sheet's top group against better players. Measured
  // against the rest of the raid in the same role, never against the server.
  // In the guild, but not part of the 25-man roster. The guild roster cannot say
  // this -- they keep their rank -- so officers name them here. Lowercase.
  var NOT_RAIDING = ["kinvein"];

  var WEAK_SHARE = 0.75;    // under this share of the raid's median = off the pace
  var MIN_ICC_TO_JUDGE = 2; // and only once we have seen enough nights to say so

  // Inside a band, OUR raid decides the order -- what they actually put out in ICC,
  // measured against the rest of the raid, not against the server. A feral at 4.3k
  // does not lead the raid's best physical trinket over one at 6.7k just because he
  // turns up more often; attendance breaks ties, it does not overturn output.
  function standing(p) {
    var out = p.role === "HEALER" ? (p.icchps || 0) : (p.iccdps || 0);
    // no ICC record yet: fall back to the old-tier parse so they are not pinned last
    if (!out) out = (p.perf || 0) * 30;
    // One big night is not a season. Trust the number in proportion to how many ICC
    // nights it rests on, so a 3-raid newcomer does not displace a 32-raid regular
    // on a single parse -- they climb as the evidence accumulates.
    return out;
  }

  // ---- the items we gate, and who the sheet says wants them --------------
  // `band` returns a priority group: 0 first, 1 next. Inside a band, our own
  // performance + attendance decides.
  var ITEMS = [
    ["Deathbringer's Will", "Saurfang", "R", "Warr/Feral > Hunt/Rog/Frost/Blood > Unholy/Enh",
      function (p) {
        return R(p) === "DPS" && (has(PLATE_STR, S(p)) || has(FERAL, S(p)) ||
          has(["Survival", "Marksmanship", "Combat", "Assassination", "Frost", "Unholy", "Enhancement"], S(p)));
      },
      function (p) {
        if (has(PLATE_STR, S(p)) || has(FERAL, S(p))) return 0;
        // the sheet ties Hunt/Rog in one group; we put rogues ahead of hunters
        if (has(["Combat", "Assassination"], S(p))) return 1;
        if (has(["Survival", "Marksmanship", "Frost"], S(p))) return 2;
        return 3;
      }],

    ["Phylactery of the Nameless Lich", "Sindragosa", "R", "Fire/Demo > Rest",
      caster, function (p) { return has(["Fire", "Demonology"], S(p)) ? 0 : 1; }],

    ["Dislodged Foreign Object", "Rotface", "R", "Rest > Fire/Demo",
      caster, function (p) { return has(["Fire", "Demonology"], S(p)) ? 1 : 0; }],

    ["Sindragosa's Flawless Fang", "Sindragosa", "R", "LK tank > other tank",
      tank, function () { return 0; }],

    ["Althor's Abacus", "Gunship", "R", "Rdruid = Rsham = Disc",
      healer, function (p) { return has(["Restoration", "Discipline"], S(p)) ? 0 : 1; }],

    ["Tiny Abomination in a Jar", "Putricide", "R", "Ret > Assa > Rest",
      function (p) { return R(p) === "DPS" && has(["Retribution", "Assassination", "Combat"], S(p)); },
      function (p) { return S(p) === "Retribution" ? 0 : 1; }],

    // "ALL DPS + HEALERS" on the sheet means all CASTER dps -- the item is on the
    // CasterHealer tab and is Int/SP/Haste/Crit. No warrior, rogue or DK wants it.
    ["Blood Queen's Crimson Choker", "Blood-Queen Lana'thel", "R", "All caster DPS + healers — pumper prio",
      function (p) { return caster(p) || healer(p); },
      function (p) { return R(p) === "DPS" ? 0 : 1; }],

    ["Shadow Silk Spindle", "Blood Council", "R", "Giga OH — all casters + both priests",
      function (p) { return caster(p) || (healer(p) && C(p) !== "Paladin"); },
      function () { return 0; }],

    ["Glorenzelg, High-Blade of the Silver Hand", "Lich King", "R", "Warr > Ret = Blood (2H only)",
      twoHandStr, function (p) { return has(PLATE_STR, S(p)) ? 0 : 1; }],

    ["Havoc's Call, Blade of Lordaeron Kings", "Lich King", "R", "DK = Combat > Enh",
      function (p) {
        return R(p) === "DPS" && (C(p) === "Death Knight" || has(["Combat", "Enhancement"], S(p)));
      },
      function (p) { return S(p) === "Enhancement" ? 1 : 0; }],

    ["Oathbinder, Charge of the Ranger-General", "Lich King", "R", "Feral (cat + bear) > Hunter",
      function (p) { return has(FERAL, S(p)) || hunter(p); },
      function (p) { return has(FERAL, S(p)) ? 0 : 1; }],

    ["Bloodsurge, Kel'Thuzad's Blade of Agony", "Lich King", "R", "Fire = Aff > Demo",
      function (p) { return has(["Fire", "Affliction", "Demonology"], S(p)); },
      function (p) { return S(p) === "Demonology" ? 1 : 0; }],

    ["Royal Scepter of Terenas II", "Lich King", "R", "Spriest = Boomy = DPS shaman > healer",
      function (p) { return has(["Shadow", "Balance", "Elemental"], S(p)) || healerNeedsWeapon(p); },
      function (p) { return has(["Shadow", "Balance", "Elemental"], S(p)) ? 0 : 1; }],

    ["Archus, Greatstaff of Antonidas", "Lich King", "R", "DPS > healer",
      function (p) { return caster(p) || healerNeedsWeapon(p); },
      function (p) { return R(p) === "DPS" ? 0 : 1; }],

    ["Heaven's Fall, Kryss of a Thousand Lies", "Lich King", "R", "Rogue > rest",
      rogue, function () { return 0; }],

    ["Fal'inrush, Defender of Quel'thalas", "Lich King", "R", "Hunter > rest",
      hunter, function () { return 0; }],

    ["Mithrios, Bronzebeard's Legacy", "Lich King", "R", "Prot pal = prot warr",
      plateTank, function () { return 0; }],

    ["Cryptmaker", "Blood Council", "R", "Warr = Blood > Ret (2H only)",
      twoHandStr, function (p) { return S(p) === "Retribution" ? 1 : 0; }],

    ["Rigormortis", "Putricide", "R", "Fire = Aff = Demo",
      function (p) { return has(["Fire", "Affliction", "Demonology"], S(p)); },
      function () { return 0; }],

    ["Dying Light", "Blood-Queen Lana'thel", "R", "Whoever misses an LK staff/sword",
      function (p) { return caster(p) || healerNeedsWeapon(p); }, function () { return 0; }],

    ["Distant Land", "Festergut", "R", "Feral > Hunter",
      function (p) { return has(FERAL, S(p)) || hunter(p); },
      function (p) { return has(FERAL, S(p)) ? 0 : 1; }],

    ["Bloodfall", "Blood-Queen Lana'thel", "R", "Feral > Hunter",
      function (p) { return has(FERAL, S(p)) || hunter(p); },
      function (p) { return has(FERAL, S(p)) ? 0 : 1; }],

    ["Nibelung", "Lady Deathwhisper", "R", "Boomy > Ele/Mage > rest",
      function (p) { return has(["Balance", "Elemental", "Fire", "Arcane"], S(p)); },
      function (p) { return S(p) === "Balance" ? 0 : 1; }],

    ["Black Bruise", "Festergut", "R", "Phys Enh > Combat > rest",
      function (p) { return has(["Enhancement", "Combat"], S(p)); },
      function (p) { return S(p) === "Enhancement" ? 0 : 1; }],

    ["Bryntroll, the Bone Arbiter", "Lord Marrowgar", "R", "Ret/Blood > Warr (2H only)",
      twoHandStr, function (p) { return has(["Retribution", "Blood"], S(p)) ? 0 : 1; }],

    // ---- Tier P: roll inside the eligible group ----
    ["Heartpierce", "Lady Deathwhisper", "P", "Rogue only — daggers have one home",
      rogue, function () { return 0; }],

    ["Zod's Repeating Longbow", "Lady Deathwhisper", "P", "Hunter",
      hunter, function () { return 0; }],

    ["Last Word", "Putricide", "P", "Unholy DK",
      function (p) { return C(p) === "Death Knight" && R(p) === "DPS"; },
      function (p) { return S(p) === "Unholy" ? 0 : 1; }],

    ["Icecrown Glacial Wall", "Blood-Queen Lana'thel", "P", "Prot pal = prot warr",
      plateTank, function () { return 0; }],

    ["Juggernaut Band", "Lady Deathwhisper", "P", "Tanks — LK tank first",
      tank, function () { return 0; }],

    ["Corpse Tongue Coin", "Gunship", "P", "Tanks",
      tank, function () { return 0; }],

    ["Trauma", "Rotface", "P", "Healers without Val'anyr",
      healerNeedsWeapon, function () { return 0; }],

    ["Crushing Coldwraith Belt", "Lord Marrowgar", "P", "Mage/Lock/Spriest/Ele > Boomy > healer",
      function (p) { return caster(p) || healer(p); },
      function (p) {
        if (has(["Fire", "Arcane", "Affliction", "Demonology", "Shadow", "Elemental"], S(p))) return 0;
        return S(p) === "Balance" ? 1 : 2;
      }],

    // Armour type does NOT gate a caster item: these are the only 277 cloth boots in
    // the raid and they are Holy Paladin BiS on the sheet's own healer list, plate
    // class or not. Anyone who heals or casts wants them.
    ["Plague Scientist's Boots", "Festergut", "P", "Casters — only 277 cloth boots",
      function (p) { return caster(p) || healer(p); },
      function (p) { return R(p) === "DPS" ? 0 : 1; }],

    ["Frostbitten Fur Boots", "Lord Marrowgar", "P", "Feral > Rogue/Ret/MM > SV",
      function (p) {
        return has(FERAL, S(p)) ||
          has(["Combat", "Assassination", "Retribution", "Marksmanship", "Survival"], S(p));
      },
      function (p) {
        if (has(FERAL, S(p))) return 0;
        return has(["Combat", "Assassination", "Retribution", "Marksmanship"], S(p)) ? 1 : 2;
      }],

    ["Blood-Soaked Saronite Stompers", "Lady Deathwhisper", "P", "Warr > DK > Ret",
      meleeStr,
      function (p) {
        if (has(PLATE_STR, S(p))) return 0;
        return C(p) === "Death Knight" ? 1 : 2;
      }],

    ["Polar Bear Claw Bracers", "Gunship", "P", "DK = Ret > Warr",
      meleeStr, function (p) { return has(PLATE_STR, S(p)) ? 1 : 0; }],

    ["Toskk's Maximized Wristguards", "Saurfang", "P", "Tank > Feral = Rogue = Warr",
      function (p) {
        return tank(p) || has(FERAL, S(p)) ||
          has(["Combat", "Assassination", "Arms", "Fury"], S(p));
      },
      function (p) { return tank(p) ? 0 : 1; }],

    ["Band of the Bone Colossus", "Marrowgar", "P", "Enh/Ass > Feral/Ret",
      function (p) { return (S(p)==="Enhancement") || (S(p)==="Assassination") || (has(FERAL,S(p))) || (S(p)==="Retribution"); },
      function (p) {
        if ((S(p)==="Enhancement") || (S(p)==="Assassination")) return 0;
        return 1;
      }],

    ["Leggings of Northern Lights", "LDW", "P", "Hunter > Rest",
      function (p) { return (C(p)==="Hunter"); },
      function () { return 0; }],

    ["Ahn'kahar Onyx Neckguard", "LDW", "P", "Unholy > Ret > Rest",
      function (p) { return (S(p)==="Unholy") || (S(p)==="Retribution"); },
      function (p) {
        if ((S(p)==="Unholy")) return 0;
        return 1;
      }],

    ["Shadowvault Slayer's Cloak", "Gunship", "P", "Enh = Ret = Ass",
      function (p) { return (S(p)==="Enhancement") || (S(p)==="Retribution") || (S(p)==="Assassination"); },
      function () { return 0; }],

    ["Ikfirus's Sack of Wonder", "Gunship", "P", "Bear Tank > Rogue > Rest",
      function (p) { return (has(FERAL,S(p))&&R(p)==="TANK"&&R(p)==="TANK") || (C(p)==="Rogue"); },
      function (p) {
        if ((has(FERAL,S(p))&&R(p)==="TANK"&&R(p)==="TANK")) return 0;
        return 1;
      }],

    ["Scourge Hunter's Vambraces", "Gunship", "P", "Hunter > Rest",
      function (p) { return (C(p)==="Hunter"); },
      function () { return 0; }],

    ["Scourgeborne Waraxe", "Gunship", "P", "Combat > Rest",
      function (p) { return (S(p)==="Combat"); },
      function () { return 0; }],

    // "DK = Warr = Ret" is a dps ring -- a Blood TANK is not one of them, even
    // though he is a death knight.
    ["Skeleton Lord's Circle", "Gunship", "P", "DK = Warr = Ret",
      function (p) { return R(p) === "DPS" && ((C(p)==="Death Knight") || (has(PLATE_STR,S(p))) || (S(p)==="Retribution")); },
      function () { return 0; }],

    ["Bloodvenom Blade", "Saurfang", "P", "Unholy = Rogue = Frost > Rest",
      function (p) { return (S(p)==="Unholy") || (C(p)==="Rogue") || (S(p)==="Frost"); },
      function () { return 0; }],

    ["Gangrenous Leggings", "Festergut", "P", "Combat > Rest",
      function (p) { return (S(p)==="Combat"); },
      function () { return 0; }],

    ["Carapace of Forgotten Kings", "Festergut", "P", "Enhance > Rest",
      function (p) { return (S(p)==="Enhancement"); },
      function () { return 0; }],

    ["Nerub'ar Stalker's Cord", "Festergut", "P", "Hunter > Phys Enh > Rest",
      function (p) { return (C(p)==="Hunter") || (S(p)==="Enhancement"); },
      function (p) {
        if ((C(p)==="Hunter")) return 0;
        return 1;
      }],

    ["Fleshrending Gauntlets", "Festergut", "P", "Ret > Rest",
      function (p) { return (S(p)==="Retribution"); },
      function () { return 0; }],

    ["Winding Sheet", "Rotface", "P", "Unholy > Rest",
      function (p) { return (S(p)==="Unholy"); },
      function () { return 0; }],

    ["Aldriana's Gloves of Secrecy", "Rotface", "P", "Warr = Rogue > Feral",
      function (p) { return (has(PLATE_STR,S(p))) || (C(p)==="Rogue") || (has(FERAL,S(p))); },
      function (p) {
        if ((has(PLATE_STR,S(p))) || (C(p)==="Rogue")) return 0;
        return 1;
      }],

    ["Rib Spreader", "Rotface", "P", "Rogue > Rest",
      function (p) { return (C(p)==="Rogue"); },
      function () { return 0; }],

    ["Astrylian's Sutured Cinch", "Putricide", "P", "Bear Tank > Ret > Rogue/Feral",
      function (p) { return (has(FERAL,S(p))&&R(p)==="TANK"&&R(p)==="TANK") || (S(p)==="Retribution") || (C(p)==="Rogue") || (has(FERAL,S(p))); },
      function (p) {
        if ((has(FERAL,S(p))&&R(p)==="TANK"&&R(p)==="TANK")) return 0;
        if ((S(p)==="Retribution")) return 1;
        return 2;
      }],

    ["Treads of the Wasteland", "Council", "P", "SV Hunter = Enh > Rest",
      function (p) { return (S(p)==="Survival"&&C(p)==="Hunter") || (S(p)==="Enhancement"); },
      function () { return 0; }],

    ["Keleseth's Seducer", "Council", "P", "Enhance > Rest",
      function (p) { return (S(p)==="Enhancement"); },
      function () { return 0; }],

    // dps neck -- the sheet's note calls it a "potential neck for Warr/Ret", so
    // Frost/Blood here is the dps pairing, not the tank spec
    ["Lana'thel's Chain of Flagellation", "BQL", "P", "Frost = Blood > Rest",
      function (p) { return R(p) === "DPS" && ((S(p)==="Frost") || (S(p)==="Blood")); },
      function () { return 0; }],

    ["Anub'ar Stalker's Gloves", "Dreamwalker", "P", "Enh>Rest",
      function (p) { return (S(p)==="Enhancement"); },
      function () { return 0; }],

    ["Coldwraith Links", "Dreamwalker", "P", "Warr = Frost/Blood > Unholy",
      function (p) { return R(p) === "DPS" && ((has(PLATE_STR,S(p))) || (S(p)==="Frost") || (S(p)==="Blood") || (S(p)==="Unholy")); },
      function (p) {
        if ((has(PLATE_STR,S(p))) || (S(p)==="Frost") || (S(p)==="Blood")) return 0;
        return 1;
      }],

    ["Scourge Reaver's Legplates", "Dreamwalker", "P", "Unholy > Rest",
      function (p) { return (S(p)==="Unholy"); },
      function () { return 0; }],

    ["Frostbrood Sapphire Ring", "Dreamwalker", "P", "Hunter > Warrior > Rest",
      function (p) { return (C(p)==="Hunter") || (has(PLATE_STR,S(p))); },
      function (p) {
        if ((C(p)==="Hunter")) return 0;
        return 1;
      }],

    ["Lungbreaker", "Dreamwalker", "P", "Rogue > Rest",
      function (p) { return (C(p)==="Rogue"); },
      function () { return 0; }],

    ["Sindragosa's Cruel Claw", "Sindragosa", "P", "Cat/Rogue/Hunter > War/Ret",
      function (p) { return (has(FERAL,S(p))) || (C(p)==="Rogue") || (C(p)==="Hunter") || (has(PLATE_STR,S(p))) || (S(p)==="Retribution"); },
      function (p) {
        if ((has(FERAL,S(p))) || (C(p)==="Rogue") || (C(p)==="Hunter")) return 0;
        return 1;
      }],

    ["Wodin's Lucky Necklace", "Trash", "P", "Phys DPS",
      function (p) { return (R(p)==="DPS"); },
      function () { return 0; }],

    ["Handguards of Winter's Respite", "Marrowgar", "P", "Druids",
      function (p) { return (C(p)==="Druid"); },
      function () { return 0; }],

    ["Rusted Bonespike Pauldrons", "Marrowgar", "P", "Hpal",
      function (p) { return (C(p)==="Paladin"&&R(p)==="HEALER"); },
      function () { return 0; }],

    ["Loop of the Endless Labyrinth", "Marrowgar", "P", "Boomy/Fire > Rest",
      function (p) { return (S(p)==="Balance") || (S(p)==="Fire"); },
      function () { return 0; }],

    ["Marrowgar's Frigid Eye", "Marrowgar", "P", "Healers (Not Disc)",
      function (p) { return (R(p)==="HEALER"&&S(p)==="Discipline"); },
      function () { return 0; }],

    ["Bulwark of Smouldering Steel", "Marrowgar", "P", "Ele > Hpal=Rsham",
      function (p) { return (S(p)==="Elemental") || (C(p)==="Paladin"&&R(p)==="HEALER") || (C(p)==="Shaman"&&R(p)==="HEALER"); },
      function (p) {
        if ((S(p)==="Elemental")) return 0;
        return 1;
      }],

    ["The Lady's Brittle Bracers", "LDW", "P", "Shadow = Fire = Aff > Rest",
      function (p) { return (S(p)==="Shadow") || (S(p)==="Fire") || (S(p)==="Affliction"); },
      function () { return 0; }],

    ["Deathwhisper Raiment", "LDW", "P", "Druids",
      function (p) { return (C(p)==="Druid"); },
      function () { return 0; }],

    ["Necrophotic Greaves", "LDW", "P", "Rshaman > Rest",
      function (p) { return (C(p)==="Shaman"&&R(p)==="HEALER"); },
      function () { return 0; }],

    ["Fallen Lord's Handguards", "LDW", "P", "Hpal",
      function (p) { return (C(p)==="Paladin"&&R(p)==="HEALER"); },
      function () { return 0; }],

    ["Ring of Maddening Whispers", "LDW", "P", "Mage Sidegrade > Rest",
      function (p) { return (C(p)==="Mage"); },
      function () { return 0; }],

    ["Boots of Unnatural Growth", "Gunship", "P", "Druids",
      function (p) { return (C(p)==="Druid"); },
      function () { return 0; }],

    ["Waistband of Righteous Fury", "Gunship", "P", "Hpal",
      function (p) { return (C(p)==="Paladin"&&R(p)==="HEALER"); },
      function () { return 0; }],

    ["Amulet of the Silent Eulogy", "Gunship", "P", "Demo > Enh > Hit option > Rest",
      function (p) { return (S(p)==="Demonology") || (S(p)==="Enhancement"); },
      function (p) {
        if ((S(p)==="Demonology")) return 0;
        return 1;
      }],

    ["Ring of Rapid Ascent", "Gunship", "P", "DPS > Healer",
      function (p) { return caster(p) || healer(p); },
      function (p) {
        if ((caster(p))) return 0;
        return 1;
      }],

    ["Greatcloak of the Turned Champion", "Saurfang", "P", "Demo >  Rdruid > Rest",
      function (p) { return (S(p)==="Demonology") || (C(p)==="Druid"&&R(p)==="HEALER"); },
      function (p) {
        if ((S(p)==="Demonology")) return 0;
        return 1;
      }],

    ["Belt of the Blood Nova", "Saurfang", "P", "Rsham > Rest",
      function (p) { return (C(p)==="Shaman"&&R(p)==="HEALER"); },
      function () { return 0; }],

    ["Lingering Illness", "Festergut", "P", "Demo > Disc > Rest",
      function (p) { return (S(p)==="Demonology") || (S(p)==="Discipline"); },
      function (p) {
        if ((S(p)==="Demonology")) return 0;
        return 1;
      }],

    ["Plaguebringer's Stained Pants", "Festergut", "P", "Aff = Shadow = Boomy = Ele",
      function (p) { return (S(p)==="Affliction") || (S(p)==="Shadow") || (S(p)==="Balance") || (S(p)==="Elemental"); },
      function () { return 0; }],

    ["Leather of Stitched Scourge Parts", "Festergut", "P", "Druid",
      function (p) { return (C(p)==="Druid"); },
      function () { return 0; }],

    ["Horrific Flesh Epaulets", "Festergut", "P", "Shaman",
      function (p) { return (C(p)==="Shaman"); },
      function () { return 0; }],

    ["Unclean Surgical Gloves", "Festergut", "P", "Rsham >  Rest",
      function (p) { return (C(p)==="Shaman"&&R(p)==="HEALER"); },
      function () { return 0; }],

    ["Faceplate of the Forgotten", "Festergut", "P", "Hpal",
      function (p) { return (C(p)==="Paladin"&&R(p)==="HEALER"); },
      function () { return 0; }],

    ["Holiday's Grace", "Festergut", "P", "Disc > Rest",
      function (p) { return (S(p)==="Discipline"); },
      function () { return 0; }],

    ["Death Surgeon's Sleeves", "Rotface", "P", "Demo/Mage > Disc > Rest",
      function (p) { return (S(p)==="Demonology") || (C(p)==="Mage") || (S(p)==="Discipline"); },
      function (p) {
        if ((S(p)==="Demonology") || (C(p)==="Mage")) return 0;
        return 1;
      }],

    ["Helm of the Elder Moon", "Rotface", "P", "Druid",
      function (p) { return (C(p)==="Druid"); },
      function () { return 0; }],

    ["Bloodsunder's Bracers", "Rotface", "P", "Shaman",
      function (p) { return (C(p)==="Shaman"); },
      function () { return 0; }],

    ["Rot-Resistant Breastplate", "Rotface", "P", "Hpal",
      function (p) { return (C(p)==="Paladin"&&R(p)==="HEALER"); },
      function () { return 0; }],

    ["Corpse-Impaling Spike", "Rotface", "P", "Aff = Fire = Shadow > Rest",
      function (p) { return (S(p)==="Affliction") || (S(p)==="Fire") || (S(p)==="Shadow"); },
      function () { return 0; }],

    ["Professor's Bloodied Smock", "Putricide", "P", "Druid",
      function (p) { return (C(p)==="Druid"); },
      function () { return 0; }],

    ["Sanguine Silk Robes", "Council", "P", "Demo >  Rdruid > Rest",
      function (p) { return (S(p)==="Demonology") || (C(p)==="Druid"&&R(p)==="HEALER"); },
      function (p) {
        if ((S(p)==="Demonology")) return 0;
        return 1;
      }],

    ["San'layn Ritualist Gloves", "Council", "P", "Disc > Rest",
      function (p) { return (S(p)==="Discipline"); },
      function () { return 0; }],

    ["Shoulders of Frost-Tipped Thorns", "Council", "P", "Druid",
      function (p) { return (C(p)==="Druid"); },
      function () { return 0; }],

    ["Mail of Crimson Coins", "Council", "P", "Rshaman",
      function (p) { return (C(p)==="Shaman"&&R(p)==="HEALER"); },
      function () { return 0; }],

    ["Crypt Keeper's Bracers", "Council", "P", "Hpal",
      function (p) { return (C(p)==="Paladin"&&R(p)==="HEALER"); },
      function () { return 0; }],

    ["Incarnadine Band of Mending", "Council", "P", "Disc > Rest",
      function (p) { return (S(p)==="Discipline"); },
      function () { return 0; }],

    ["Valanar's Other Signet Ring", "Council", "P", "Demo > Rest",
      function (p) { return (S(p)==="Demonology"); },
      function () { return 0; }],

    ["Frostbinder's Shredded Cape", "Dreamwalker", "P", "DPS > Healer",
      function (p) { return caster(p) || healer(p); },
      function (p) {
        if ((caster(p))) return 0;
        return 1;
      }],

    ["Robe of the Waking Nightmare", "Dreamwalker", "P", "Mage > Rest",
      function (p) { return (C(p)==="Mage"); },
      function () { return 0; }],

    ["Bracers of Eternal Dreaming", "Dreamwalker", "P", "Druid",
      function (p) { return (C(p)==="Druid"); },
      function () { return 0; }],

    ["Snowstorm Helm", "Dreamwalker", "P", "Shaman",
      function (p) { return (C(p)==="Shaman"); },
      function () { return 0; }],

    ["Leggings of Dying Candles", "Dreamwalker", "P", "Hpal",
      function (p) { return (C(p)==="Paladin"&&R(p)==="HEALER"); },
      function () { return 0; }],

    ["Boots of the Funeral March", "Dreamwalker", "P", "Hpal",
      function (p) { return (C(p)==="Paladin"&&R(p)==="HEALER"); },
      function () { return 0; }],

    ["Nightmare Ender", "Dreamwalker", "P", "Demo > Disc > Rest",
      function (p) { return (S(p)==="Demonology") || (S(p)==="Discipline"); },
      function (p) {
        if ((S(p)==="Demonology")) return 0;
        return 1;
      }],

    ["Memory of Malygos", "Sindragosa", "P", "DPS > Healer",
      function (p) { return caster(p) || healer(p); },
      function (p) {
        if ((caster(p))) return 0;
        return 1;
      }],

    ["Sundial of Eternal Dusk", "Sindragosa", "P", "Demo > Rdruid/Hpriest > Rest",
      function (p) { return (S(p)==="Demonology") || (C(p)==="Druid"&&R(p)==="HEALER") || (C(p)==="Priest"&&S(p)==="Holy"); },
      function (p) {
        if ((S(p)==="Demonology")) return 0;
        return 1;
      }],

    ["Bracers of Dark Reckoning", "Marrowgar", "P", "LK Tank > other tank",
      function (p) { return (R(p)==="TANK") || (R(p)==="TANK"); },
      function (p) {
        if ((R(p)==="TANK")) return 0;
        return 1;
      }],

    ["Legguards of Lost Hope", "Marrowgar", "P", "LK Tank > other tank",
      function (p) { return (R(p)==="TANK") || (R(p)==="TANK"); },
      function (p) {
        if ((R(p)==="TANK")) return 0;
        return 1;
      }],

    ["Broken Ram Skull Helm", "LDW", "P", "LK Tank > other tank",
      function (p) { return (R(p)==="TANK") || (R(p)==="TANK"); },
      function (p) {
        if ((R(p)==="TANK")) return 0;
        return 1;
      }],

    ["Belt of Broken Bones", "Festergut", "P", "LK Tank > other tank",
      function (p) { return (R(p)==="TANK") || (R(p)==="TANK"); },
      function (p) {
        if ((R(p)==="TANK")) return 0;
        return 1;
      }],

    ["Bile-Encrusted Medallion", "Rotface", "P", "LK Tank > other tank",
      function (p) { return (R(p)==="TANK") || (R(p)==="TANK"); },
      function (p) {
        if ((R(p)==="TANK")) return 0;
        return 1;
      }],

    ["Royal Crimson Cloak", "Council", "P", "LK Tank > other tank",
      function (p) { return (R(p)==="TANK") || (R(p)==="TANK"); },
      function (p) {
        if ((R(p)==="TANK")) return 0;
        return 1;
      }],

    ["Taldaram's Plated Fists", "Council", "P", "LK Tank > other tank",
      function (p) { return (R(p)==="TANK") || (R(p)==="TANK"); },
      function (p) {
        if ((R(p)==="TANK")) return 0;
        return 1;
      }],

    ["Grinning Skull Greatboots", "Dreamwalker", "P", "LK Tank > other tank",
      function (p) { return (R(p)==="TANK") || (R(p)==="TANK"); },
      function (p) {
        if ((R(p)==="TANK")) return 0;
        return 1;
      }],

    ["Devium's Eternally Cold Ring", "Dreamwalker", "P", "LK Tank > other tank",
      function (p) { return (R(p)==="TANK") || (R(p)==="TANK"); },
      function (p) {
        if ((R(p)==="TANK")) return 0;
        return 1;
      }],

    // ---- Tier tokens ----------------------------------------------------
    // Marks of Sanctification drop off ICC bosses and buy a T10 piece. The sheet
    // gives no per-item ladder for them, only a raid-wide order in its tier
    // philosophy -- tanks first (the Lich King hits very hard and fast), then DPS,
    // "Unholy DK's go last, Mages and Rets near first". That is what these encode;
    // nothing finer is invented, because the sheet does not say it.
    ["Vanquisher's Mark of Sanctification", "ICC bosses", "P",
      "T10 token — Rogue / DK / Mage / Druid",
      function (p) { return has(["Rogue", "Death Knight", "Mage", "Druid"], C(p)); },
      tierBand],

    ["Conqueror's Mark of Sanctification", "ICC bosses", "P",
      "T10 token — Paladin / Priest / Warlock",
      function (p) { return has(["Paladin", "Priest", "Warlock"], C(p)); },
      tierBand],

    ["Protector's Mark of Sanctification", "ICC bosses", "P",
      "T10 token — Warrior / Hunter / Shaman",
      function (p) { return has(["Warrior", "Hunter", "Shaman"], C(p)); },
      tierBand],

    // ---- sheet items the parser would have had to guess at ---------------
    // "(2h)" and faction notes are conditions the prio column cannot express as a
    // spec list, so these three are written out rather than parsed.
    ["Might of Blight", "Festergut", "P", "Frost = Blood = Unholy (2H) > Ret > rest",
      meleeStr,
      function (p) {
        if (C(p) === "Death Knight") return 0;
        return S(p) === "Retribution" ? 1 : 2;
      }],

    ["Gunship Captain's Mittens", "Gunship", "P", "Boomy (Horde) > Fire (Alliance) > rest",
      caster,
      function (p) {
        if (S(p) === "Balance") return 0;
        return S(p) === "Fire" ? 1 : 2;
      }],

    ["Noose of Malachite", "Dreamwalker", "P", "Whichever tank needs hit — Pal BiS",
      tank,
      function (p) { return C(p) === "Paladin" ? 0 : 1; }],
  ];

  // ---- spec parsing ------------------------------------------------------
  // Officers write the spec in the public note ("Feral Cat 5.5k", "4.9+ assa"). For
  // someone with no log history that note is the only spec we have.
  var NOTE_SPECS = [
    ["Assassination", ["assassination", "assa", "mutilate"]],
    ["Combat", ["combat"]],
    ["Subtlety", ["subtlety"]],
    ["Marksmanship", ["marksman", "marks", " mm"]],
    ["Survival", ["survival", "surv"]],
    ["Beast Mastery", ["beast", " bm"]],
    ["Feral Combat", ["feral", "kitty"]],
    ["Balance", ["boomkin", "balance", "boomy", "moonkin"]],
    ["Restoration", ["resto", "rdudu", "rdruid"]],
    ["Protection", ["prot", "tank"]],
    ["Retribution", ["retri", "ret ", "/ret", "ret/"]],
    ["Holy", ["holy", "hpal"]],
    ["Discipline", ["disc"]],
    ["Shadow", ["shadow", "spriest"]],
    ["Elemental", ["elemental", "elem", "ele ", "ele/"]],
    ["Enhancement", ["enhancement", "enh"]],
    ["Affliction", ["affliction", "affly", "affli", "aff "]],
    ["Demonology", ["demonology", "demo"]],
    ["Destruction", ["destruction", "destro"]],
    ["Fire", ["fire"]], ["Frost", ["frost"]], ["Arcane", ["arcane"]],
    ["Unholy", ["unholy"]], ["Blood", ["blood"]],
    ["Fury", ["fury"]], ["Arms", ["arms"]],
  ];
  var CLASS_SPECS = {
    "Death Knight": ["Blood", "Frost", "Unholy"],
    "Druid": ["Balance", "Feral Combat", "Restoration"],
    "Hunter": ["Beast Mastery", "Marksmanship", "Survival"],
    "Mage": ["Arcane", "Fire", "Frost"],
    "Paladin": ["Holy", "Protection", "Retribution"],
    "Priest": ["Discipline", "Holy", "Shadow"],
    "Rogue": ["Assassination", "Combat", "Subtlety"],
    "Shaman": ["Elemental", "Enhancement", "Restoration"],
    "Warlock": ["Affliction", "Demonology", "Destruction"],
    "Warrior": ["Arms", "Fury", "Protection"],
  };

  function specFromNote(note, cls) {
    var low = " " + String(note || "").toLowerCase() + " ";
    var allowed = CLASS_SPECS[cls] || [];
    for (var i = 0; i < NOTE_SPECS.length; i++) {
      var spec = NOTE_SPECS[i][0], words = NOTE_SPECS[i][1];
      if (!has(allowed, spec)) continue;
      for (var j = 0; j < words.length; j++) {
        if (low.indexOf(words[j]) >= 0) return spec;
      }
    }
    return null;
  }

  function roleOf(spec, seenRole) {
    if (has(HEAL_SPECS, spec)) return "HEALER";
    // The meter calls a Blood DK "DPS" because he deals damage; the spec decides.
    if (has(TANK_SPECS, spec) || spec === "Guardian") return "TANK";
    if (seenRole === "HEALER" || seenRole === "TANK") return seenRole;
    return "DPS";
  }

  function pctRank(value, pool) {
    if (!pool.length || !(value > 0)) return null;
    var below = 0;
    for (var i = 0; i < pool.length; i++) if (pool[i] < value) below++;
    return Math.round(1000 * below / pool.length) / 10;
  }

  // ---- build -------------------------------------------------------------
  function build(data, opts) {
    opts = opts || {};
    // How many raid days someone needs before they appear on a ladder. 1 shows every
    // Rat who has raided at all; raise it to hide one-night entries. The officer
    // chooses -- the right answer depends on how much of the guild is new.
    var minDays = opts.minDays > 0 ? opts.minDays : 1;

    var rosterBlob = data.roster || {};
    var roster = rosterBlob.roster || [];
    var fangs = rosterBlob.fangs || [];
    var joined = rosterBlob.joined || {};
    var officerSpecs = rosterBlob.specs || {};
    var rank = (data.rankings && data.rankings.data) || {};
    var logs = rank.logs || [];
    var altMap = rank.altMap || {};
    var lootBlob = data.loot || {};
    var loot = lootBlob.loot || (Array.isArray(lootBlob) ? lootBlob : []);

    // -- roster: who is in the guild right now. Someone who leaves is simply not
    //    here any more, so no hand-kept "they left" list is needed.
    var mains = {};
    roster.forEach(function (m) {
      // rankIndex 4 = Alt: folds into a main, never holds a prio slot of its own.
      if (m.rankIndex === 4) return;
      if ((m.level || 0) < 80) return;          // bank alts / levelling chars
      mains[String(m.name).toLowerCase()] = {
        name: m.name, cls: m["class"], rank: m.rankName, rankIndex: m.rankIndex,
        joined: joined[m.name] || "",
        fangs: has(fangs, m.name),
        note: (m.publicNote || "") + " " + (m.officerNote || ""),
      };
    });

    // -- logs: attendance, which specs they actually play, ICC output
    var days = {}, allDays = [];
    logs.forEach(function (lg) { days[String(lg.date).slice(0, 10)] = 1; });
    allDays = Object.keys(days).sort();
    var recent = {};
    allDays.slice(-RECENT_WINDOW).forEach(function (d) { recent[d] = 1; });

    var att = {}, iccAtt = {}, recAtt = {}, specSeen = {}, iccDps = {}, iccHps = {};
    var specNights = {};   // main -> "class|spec|role" -> { day: 1 }
    function mainOf(n) {
      var k = String(n || "").toLowerCase();
      return (altMap[k] && altMap[k].main ? String(altMap[k].main) : k).toLowerCase();
    }
    logs.forEach(function (lg) {
      var day = String(lg.date).slice(0, 10);
      var isIcc = isIcc25(lg);
      var icc25 = isIcc ? icc25Bosses(lg) : null;
      var seen = {};
      (lg.rows || []).forEach(function (r) {
        if (!r.n) return;
        var m = mainOf(r.n);
        seen[m] = 1;
        // Count NIGHTS in a spec, not fights. A fight count says how long someone
        // was in a role on one evening, which makes a single emergency fill look
        // like a main spec -- Coizinho healed once because we were short and would
        // otherwise read as a healer. Nights say how often they take the role at
        // all, which is what a standing arrangement actually looks like:
        // Mongoloide off-tanks on 4 of the last 4, Coizinho healed on 1.
        var key = [r.c, r.s, r.r].join("|");
        var byDay = (specNights[m] = specNights[m] || {});
        (byDay[key] = byDay[key] || {})[day] = 1;
        // only the 25-man fights of this log count toward ICC form
        if (isIcc && icc25[r.b]) {
          if (r.r === "HEALER") (iccHps[m] = iccHps[m] || []).push(r.h || 0);
          else if (r.r === "DPS") (iccDps[m] = iccDps[m] || []).push(r.d || 0);
        }
      });
      Object.keys(seen).forEach(function (m) {
        (att[m] = att[m] || {})[day] = 1;
        if (isIcc) (iccAtt[m] = iccAtt[m] || {})[day] = 1;
        if (recent[day]) (recAtt[m] = recAtt[m] || {})[day] = 1;
      });
    });

    // -- server percentiles, where they exist
    var perf = {};
    var sp = rank.serverPct || {};
    Object.keys(sp).forEach(function (raid) {
      Object.keys(sp[raid] || {}).forEach(function (size) {
        var diffs = sp[raid][size];
        if (!diffs || typeof diffs !== "object") return;
        Object.keys(diffs).forEach(function (diff) {
          var node = diffs[diff];
          if (!node || !node.players) return;
          Object.keys(node.players).forEach(function (k) {
            var v = node.players[k];
            if (v && v.avg) (perf[mainOf(k)] = perf[mainOf(k)] || []).push(v.avg);
          });
        });
      });
    });

    var ND = allDays.length;
    var firstLog = allDays[0] || "";
    var avg = function (a) {
      return a && a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0;
    };
    var count = function (o) { return o ? Object.keys(o).length : 0; };

    // -- assemble players
    var players = {};
    Object.keys(mains).forEach(function (key) {
      if (has(NOT_RAIDING, key)) return;
      var info = mains[key];
      var a = count(att[key]);
      if (a < 1) return;              // in the guild but never raided with us

      var spec = null, seenRole = null, cls = info.cls, offspecs = [], offRecent = {};

      // Flatten nights-in-spec into a weight. A recent night counts double, so a
      // standing arrangement (Mongoloide off-tanks every night lately) overtakes an
      // old one, while a single emergency fill (Coizinho healing once when we were
      // short) never outweighs the spec someone actually plays.
      var seen = null, nights = specNights[key];
      if (nights) {
        seen = {};
        Object.keys(nights).forEach(function (k) {
          var days = Object.keys(nights[k]), score = 0;
          days.forEach(function (d) { score += recent[d] ? 2 : 1; });
          seen[k] = score;
        });
      }
      if (seen) {
        var byCls = {}, k, parts;
        for (k in seen) {
          parts = k.split("|");
          byCls[parts[0]] = (byCls[parts[0]] || 0) + seen[k];
        }
        // The MAIN's class is what the roster says, not whichever character logged
        // the most fights: alts fold into their main, so someone who raids an alt
        // more than their main (Shackaa logs a lot on his Shockaa shaman) would
        // otherwise be filed under the alt's class and get the wrong loot.
        // Only fall back to the logs when the roster has no class at all.
        cls = info.cls ||
          Object.keys(byCls).sort(function (x, y) { return byCls[y] - byCls[x]; })[0];

        var sub = {}, tot = 0;
        for (k in seen) {
          parts = k.split("|");
          if (parts[0] !== cls) continue;
          sub[parts[1] + "|" + parts[2]] = (sub[parts[1] + "|" + parts[2]] || 0) + seen[k];
          tot += seen[k];
        }
        // The roster says one class and we have never once seen them raid it --
        // most likely a reused name (Ruddy is a Rogue on the roster, an Enhancement
        // shaman in every log). Believe the character that actually shows up.
        if (!Object.keys(sub).length) {
          cls = Object.keys(byCls).sort(function (x, y) { return byCls[y] - byCls[x]; })[0];
          for (k in seen) {
            parts = k.split("|");
            if (parts[0] !== cls) continue;
            sub[parts[1] + "|" + parts[2]] = (sub[parts[1] + "|" + parts[2]] || 0) + seen[k];
            tot += seen[k];
          }
        }
        var subKeys = Object.keys(sub);
        if (subKeys.length) {
          var top = subKeys.sort(function (x, y) { return sub[y] - sub[x]; })[0];
          spec = top.split("|")[0];
          seenRole = top.split("|")[1];
          // A spec played a real share of the time is one they can be asked to fill.
          subKeys.forEach(function (kk) {
            var s = kk.split("|")[0];
            if (s !== spec && sub[kk] / tot >= 0.15) offspecs.push([sub[kk], s]);
          });
          offspecs.sort(function (x, y) { return y[0] - x[0]; });

          // How many of the LAST few nights they actually filled each off-spec.
          // Two people can both list "Protection" while only one is currently the
          // off-tank; this is what tells them apart on a tank ladder.
          offRecent = {};
          Object.keys(nights || {}).forEach(function (k) {
            var parts = k.split("|");
            if (parts[0] !== cls) return;
            var n = 0;
            Object.keys(nights[k]).forEach(function (d) { if (recent[d]) n++; });
            if (n) offRecent[parts[1]] = Math.max(offRecent[parts[1]] || 0, n);
          });
        }
        var off = officerSpecs[info.name];
        var seenSpecs = [spec].concat(offspecs.map(function (o) { return o[1]; }));
        // The officer table is the authority when it names a spec of the main's
        // class -- it is how an officer says "this is the character he raids".
        if (off && has(CLASS_SPECS[cls] || [], off)) spec = off;
        else if (off && has(seenSpecs, off)) spec = off;
        offspecs = offspecs.filter(function (o) { return o[1] !== spec; });
      }
      if (!spec || a < 3) {
        var noteSpec = specFromNote(info.note, cls);
        if (!spec && noteSpec) spec = noteSpec;
      }
      if (!spec) return;

      var pl = perf[key] || [];
      players[key] = {
        key: key, name: info.name, cls: cls, spec: spec,
        role: roleOf(spec, seenRole),
        rank: info.rank, rankIndex: info.rankIndex, fangs: info.fangs,
        joined: info.joined || "founding",
        founder: !info.joined || info.joined <= firstLog,
        att: a, attpct: Math.round(1000 * a / ND) / 10,
        icc: count(iccAtt[key]), recent: count(recAtt[key]),
        perf: pl.length ? Math.round(avg(pl) * 10) / 10 : 0,
        iccdps: Math.round(avg(iccDps[key])),
        icchps: Math.round(avg(iccHps[key])),
        offspecs: offspecs.map(function (o) { return o[1]; }),
        // nights in the recent window per spec -- who is REALLY filling the role now
        offRecent: offRecent,
      };
      // Not raiding lately -> off the ladders. Loot goes to people in the raid.
      players[key].inactive = players[key].recent === 0;
    });

    // -- rank ICC output against peers in the same role
    var dpsPool = [], hpsPool = [];
    Object.keys(players).forEach(function (k) {
      var p = players[k];
      if (p.role === "DPS" && p.iccdps > 0) dpsPool.push(p.iccdps);
      if (p.role === "HEALER" && p.icchps > 0) hpsPool.push(p.icchps);
    });

    var RANK_BUMP = { 0: 6, 1: 5, 2: 3, 5: 0 };
    var nRecent = Math.min(RECENT_WINDOW, ND);
    var nIcc = Object.keys(logs.reduce(function (acc, lg) {
      if (isIcc25(lg)) acc[String(lg.date).slice(0, 10)] = 1;
      return acc;
    }, {})).length;

    Object.keys(players).forEach(function (k) {
      var p = players[k];
      var out = p.role === "HEALER" ? pctRank(p.icchps, hpsPool)
        : p.role === "DPS" ? pctRank(p.iccdps, dpsPool) : null;
      p.iccpct = out === null ? 0 : out;
      // how many people that percentile was measured against
      p.pool = p.role === "HEALER" ? hpsPool.length
        : p.role === "DPS" ? dpsPool.length : 0;

      // What they do in ICC now outweighs how they parsed in an old tier. A newcomer
      // with no parse history is judged purely on what they actually put out.
      var merit = out === null ? p.perf
        : p.perf > 0 ? p.perf * 0.4 + out * 0.6
          : out;

      // Attendance used to be worth roughly twice merit once `activity` was added
      // on top of it, which let a bottom-percentile healer with a perfect turnout
      // outrank the best performer in the raid. Turning up is the price of entry,
      // not the case for a drop: performance leads, attendance and standing adjust.
      var activity = (nIcc ? 100 * p.icc / nIcc : 0) * 0.10 +
        (nRecent ? 100 * p.recent / nRecent : 0) * 0.10;
      var standing = (RANK_BUMP[p.rankIndex] || 0) + (p.fangs ? 4 : 0) + (p.founder ? 2 : 0);

      p.score = Math.round((merit * 0.65 + p.attpct * 0.35 + standing + activity) * 10) / 10;
    });

    // -- legendaries, read out of the loot history rather than hand-kept.
    // A healer who has Val'anyr does not want a caster weapon: the sheet's line is
    // "Healers should have valanyr". 30 fragments make the mace, but collecting the
    // fragments IS the commitment -- once the raid has been feeding someone, they
    // are the holder and the weapons should go elsewhere.
    var fragCount = {};
    loot.forEach(function (l) {
      if (!l || !l.player || !l.name) return;
      if (String(l.name).toLowerCase().indexOf("val'anyr") < 0) return;
      var who = String(l.player).toLowerCase();
      fragCount[who] = (fragCount[who] || 0) + 1;
    });
    // Whoever the raid has been feeding fragments is the holder -- the count itself
    // does not matter, the decision to feed one person does.
    var fragLeader = Object.keys(fragCount).sort(function (a, b) {
      return fragCount[b] - fragCount[a];
    })[0];
    Object.keys(players).forEach(function (k) {
      players[k].valanyr = !!fragLeader && k === fragLeader && players[k].role === "HEALER";
    });

    // -- what "off the pace" means in OUR raid: the median of everyone doing that
    // job here. A median, not a mean, so one 8k parse does not drag the bar up.
    function median(a) {
      if (!a.length) return 0;
      a = a.slice().sort(function (x, y) { return x - y; });
      var m = Math.floor(a.length / 2);
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }
    var medDps = median(Object.keys(players).map(function (k) { return players[k]; })
      .filter(function (p) { return p.role === "DPS" && p.iccdps > 0; })
      .map(function (p) { return p.iccdps; }));
    var medHps = median(Object.keys(players).map(function (k) { return players[k]; })
      .filter(function (p) { return p.role === "HEALER" && p.icchps > 0; })
      .map(function (p) { return p.icchps; }));
    Object.keys(players).forEach(function (k) {
      var p = players[k];
      // A tank is not judged on output: low damage is the job. Only dps and
      // healers are measured against their own kind.
      if (p.role === "TANK") { p.weak = false; return; }
      var mine = p.role === "HEALER" ? p.icchps : p.iccdps;
      var bar = p.role === "HEALER" ? medHps : medDps;
      // Only judge someone we have actually seen enough of.
      p.weak = !!(bar && mine && (p.icc || 0) >= MIN_ICC_TO_JUDGE &&
        mine < bar * WEAK_SHARE);
    });

    // -- who already won what (live from the loot node)
    var wonBy = {};
    loot.forEach(function (l) {
      if (!l || !l.name || !l.player) return;
      var who = String(l.player);
      if (/^(disenchant|bank|_)/i.test(who)) return;     // not a person
      var item = String(l.name).toLowerCase();
      (wonBy[item] = wonBy[item] || []).push({
        player: who, runId: l.runId || "", boss: l.boss || "",
      });
    });

    // -- build each ladder
    var list = Object.keys(players).map(function (k) { return players[k]; });
    var items = ITEMS.map(function (row) {
      var name = row[0], boss = row[1], tier = row[2], prio = row[3];
      var elig = row[4], band = row[5];
      var won = wonBy[name.toLowerCase()] || [];
      var wonNames = {};
      won.forEach(function (x) { wonNames[x.player.toLowerCase()] = 1; });

      var cand = [];
      list.forEach(function (p) {
        if (p.inactive) return;
        if (p.att < minDays) return;
        if (elig(p)) { cand.push({ p: p, band: band(p), off: null }); return; }
        for (var i = 0; i < p.offspecs.length; i++) {
          var w = {};
          for (var kk in p) w[kk] = p[kk];
          w.spec = p.offspecs[i];
          w.role = roleOf(w.spec, null);
          // A HEALER never off-specs onto dps or tank gear. Their kit is healing
          // gear; an old Enhancement night does not make a resto shaman a candidate
          // for a physical dps trinket. Melee and tanks do swap for real though
          // (a ret paladin who off-tanks), so only the healer case is blocked.
          if (p.role === "HEALER" && w.role !== "HEALER") continue;
          if (elig(w)) {
            cand.push({
              p: w, band: band(w), off: p.offspecs[i],
              // nights in the last window actually spent in this off-spec
              offN: (p.offRecent && p.offRecent[p.offspecs[i]]) || 0,
            });
            break;
          }
        }
      });

      // The sheet's band IS the priority. We do not second-guess it with server
      // percentiles: everyone eligible stays on the list, ordered by their standing
      // in OUR raid (score), and the council reads the order. Nobody is pushed out
      // of the group the sheet put them in.

      // Winners drop to the bottom, struck through: they already have it, so the
      // next name is who it goes to now. An unproven raider sorts behind the
      // established ones in their band -- visible, and able to climb out of it as
      // they keep turning up, which hiding them would never allow.
      cand.forEach(function (c) {
        c.won = !!wonNames[c.p.name.toLowerCase()];
        // One night cannot buy the front of the queue. An unproven raider sits a
        // band lower than their spec would otherwise earn -- still on the list, and
        // it costs them nothing permanent: the tag lifts the moment they raid again.
        // "Unproven" now means we have not seen enough ICC nights to trust the
        // number, not that they are new to the guild: one big parse does not jump
        // the queue, and two nights is enough to stop being a fluke.
        c.unproven = (c.p.icc || 0) < MIN_ICC_TO_JUDGE;
        c.bumpNew = c.unproven;
        // Off the pace for our raid, with enough nights to be sure: they stay on the
        // list but stop holding the sheet's group against people who out-perform them.
        c.bumpWeak = !!c.p.weak;
        c.orig = c.band;   // where the sheet put them, before any bump
      });

      cand.forEach(function (c) {
        if (c.bumpNew) c.band += 1;
        if (c.bumpWeak) { c.band += 1; c.low = true; }
        c.unproven = !!c.bumpNew;
      });

      // A group the sheet names must never vanish. When every one of its people is
      // bumped away we keep the best of them on the list, but at the very bottom --
      // they hold the group open without jumping ahead of raiders who have shown up
      // and put out numbers. They climb back to the sheet's spot once they prove it.
      var byOrig = {};
      cand.forEach(function (c) {
        if (c.won) return;
        byOrig[c.orig] = byOrig[c.orig] || { all: [], moved: [] };
        byOrig[c.orig].all.push(c);
        if (c.band !== c.orig) byOrig[c.orig].moved.push(c);
      });
      var lastBand = 0;
      cand.forEach(function (c) { if (c.band > lastBand) lastBand = c.band; });
      Object.keys(byOrig).forEach(function (b) {
        var g = byOrig[b];
        if (!g.moved.length || g.moved.length !== g.all.length) return;
        g.moved.sort(function (x, y) { return standing(y.p) - standing(x.p); });
        g.moved[0].band = lastBand + 1;
        g.moved[0].tail = true;
      });

      // An off-spec never outranks somebody's MAIN spec. Band is compared before
      // the off-spec flag, so without this a resto shaman with Enhancement listed
      // sits above two real rogues on Black Bruise just because the sheet puts
      // "Phys Enh" in a higher band than "Combat". Filling in is worth a place in
      // the queue, not the front of it.
      var mainBands = cand
        .filter(function (c) { return !c.off; })
        .map(function (c) { return c.band; });
      if (mainBands.length) {
        var worstMain = Math.max.apply(null, mainBands);
        cand.forEach(function (c) {
          if (c.off && c.band <= worstMain) c.band = worstMain + 1;
        });
      }
      cand.sort(function (a, b) {
        return (a.won - b.won) || (a.band - b.band) ||
          ((a.off ? 1 : 0) - (b.off ? 1 : 0)) ||
          // two people can both list the same off-spec while only one is actually
          // filling it lately -- that one goes first
          ((b.offN || 0) - (a.offN || 0)) ||
          ((a.unproven ? 1 : 0) - (b.unproven ? 1 : 0)) ||
          (standing(b.p) - standing(a.p)) ||
          (b.p.score - a.p.score);
      });

      // An item both roles want must SHOW both roles. Keep the best few of each
      // band rather than letting one band fill the whole list -- a healer reading
      // "all caster DPS + healers" needs to see where the healers actually stand.
      var bands = {};
      cand.forEach(function (c) { (bands[c.band] = bands[c.band] || []).push(c); });
      var keys = Object.keys(bands).sort(function (a, b) { return a - b; });
      var shown = [];
      if (keys.length > 1) {
        // Share the row between the bands. With a fixed quota the first band eats
        // every slot and the last one never appears at all -- which is how the
        // healers vanished from a belt the sheet says they want.
        // Weight the row toward the band that actually gets the item. An even split
        // starved the top band: nine caster dps competed for the Choker and only two
        // were shown, while a lone off-spec healer three bands down got a slot.
        // Leading band keeps most of the row; each lower one gets a token presence
        // so the council can still see who is behind them.
        var per = Math.max(2, 10 - keys.length);
        keys.forEach(function (b) {
          // A winner is shown as context, not as a candidate, so they must not use
          // up a band's quota -- that is how a feral who can still take the item
          // fell off a ladder whose top band was full of people already holding it.
          // first band gets `per`, the rest get enough to show the next few names
          var quota = (String(b) === String(keys[0])) ? per : Math.max(2, Math.floor(per / 2));
          var live = bands[b].filter(function (c) { return !c.won; }).slice(0, quota);
          var got = bands[b].filter(function (c) { return c.won; }).slice(0, 2);
          shown = shown.concat(live, got);
        });
        shown.sort(function (a, b) {
          return (a.won - b.won) || (a.band - b.band) ||
            ((a.off ? 1 : 0) - (b.off ? 1 : 0)) ||
            ((b.offN || 0) - (a.offN || 0)) ||
            ((a.unproven ? 1 : 0) - (b.unproven ? 1 : 0)) ||
            (standing(b.p) - standing(a.p)) ||
          (b.p.score - a.p.score);
        });
      } else {
        shown = cand;
      }

      return {
        item: name, boss: boss, tier: tier, prio: prio,
        won: won, group: null,
        ladder: trimTo10(shown).map(function (c) {
          return {
            name: c.p.name, spec: c.p.spec, cls: c.p.cls, role: c.p.role,
            score: c.p.score, perf: c.p.perf, att: c.p.att,
            icc: c.p.icc, iccpct: c.p.iccpct, iccdps: c.p.iccdps,
            band: c.band, offspec: !!c.off, won: c.won, low: !!c.low,
            unproven: !!c.unproven, tail: !!c.tail,
          };
        }),
      };
    });

    // Ten names is all that fits on a line. A player parked at the tail to hold
    // their group open is the one who must never be the name that falls off -- the
    // whole point of keeping them is that the group stays visible.
    function trimTo10(list) {
      if (list.length <= 10) return list;
      var tails = list.filter(function (c) { return c.tail; });
      if (!tails.length) return list.slice(0, 10);
      var rest = list.filter(function (c) { return !c.tail; });
      return rest.slice(0, 10 - tails.length).concat(tails);
    }

    // -- keep only what an officer actually has to arbitrate ----------------
    // The page exists to settle contests BETWEEN classes. If every eligible player
    // is the same class they can roll it out among themselves -- that is what the
    // Discord post already says -- and an item nobody present can use is noise.
    // Dropping both keeps this a short list you can read mid-raid instead of a
    // 125-row catalogue of the whole instance.
    items = items.filter(function (it) {
      var live = it.ladder.filter(function (p) { return !p.won; });
      if (live.length < 2) return false;
      var classes = {};
      live.forEach(function (p) { classes[p.cls] = 1; });
      return Object.keys(classes).length > 1;
    });

    return {
      items: items,
      players: players,
      meta: {
        raidDays: ND,
        lastRaid: allDays[allDays.length - 1] || "",
        active: list.filter(function (p) { return !p.inactive; }).length,
      },
    };
  }

  w.RatsPrio = { build: build, ITEMS: ITEMS };
})(window);
