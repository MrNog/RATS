    const CDN = id => "https://cdn.discordapp.com/emojis/" + id + ".png?size=44";

    // built-in class/spec list (Raid-Helper emote ids) so Add-raider works without importing a comp
    const DEFAULT_CLASSES = [
      { name: "Hunter", emoteId: "579532029880827924", specs: [{ name: "Beastmastery", color: "#AAD372", emoteId: "637564202021814277" }, { name: "Marksmanship", color: "#AAD372", emoteId: "637564202084466708" }, { name: "Survival", color: "#AAD372", emoteId: "637564202130866186" }] },
      { name: "Druid", emoteId: "579532029675438081", specs: [{ name: "Balance", color: "#FF7C0A", emoteId: "637564171994529798" }, { name: "Feral", color: "#FF7C0A", emoteId: "637564172061900820" }, { name: "Restoration", color: "#FF7C0A", emoteId: "637564172007112723" }, { name: "Guardian", color: "#FF7C0A", emoteId: "637564171696734209" }] },
      { name: "Warrior", emoteId: "579532030153588739", specs: [{ name: "Arms", color: "#C69B6D", emoteId: "637564445031399474" }, { name: "Fury", color: "#C69B6D", emoteId: "637564445215948810" }, { name: "Protection", color: "#C69B6D", emoteId: "637564444834136065" }] },
      { name: "Priest", emoteId: "579532029901799437", specs: [{ name: "Discipline", color: "#FFFFFF", emoteId: "637564323442720768" }, { name: "Holy", color: "#FFFFFF", emoteId: "637564323530539019" }, { name: "Shadow", color: "#FFFFFF", emoteId: "637564323291725825" }] },
      { name: "Mage", emoteId: "579532030161977355", specs: [{ name: "Arcane", color: "#3FC7EB", emoteId: "637564231545389056" }, { name: "Fire", color: "#3FC7EB", emoteId: "637564231239073802" }, { name: "Frost", color: "#3FC7EB", emoteId: "637564231469891594" }] },
      { name: "Shaman", emoteId: "579532030056857600", specs: [{ name: "Elemental", color: "#0070DD", emoteId: "637564379595931649" }, { name: "Enhancement", color: "#0070DD", emoteId: "637564379772223489" }, { name: "Restoration1", color: "#0070DD", emoteId: "637564379847458846" }] },
      { name: "DK", emoteId: "599012538935410701", specs: [{ name: "Blood_DPS", color: "#C41E3A", emoteId: "1013371105874018405" }, { name: "Frost_DPS", color: "#C41E3A", emoteId: "1013371107610468445" }, { name: "Unholy_DPS", color: "#C41E3A", emoteId: "1013371108575162419" }, { name: "Blood_Tank", color: "#C41E3A", emoteId: "1013371175210065960" }, { name: "Frost_Tank", color: "#C41E3A", emoteId: "1013371176430620725" }, { name: "Unholy_Tank", color: "#C41E3A", emoteId: "1013371178485817424" }] },
      { name: "Paladin", emoteId: "579532029906124840", specs: [{ name: "Holy1", color: "#F48CBA", emoteId: "637564297622454272" }, { name: "Protection1", color: "#F48CBA", emoteId: "637564297647489034" }, { name: "Retribution", color: "#F48CBA", emoteId: "637564297953673216" }] },
      { name: "Rogue", emoteId: "579532030086217748", specs: [{ name: "Assassination", color: "#FFF468", emoteId: "637564351707873324" }, { name: "Combat", color: "#FFF468", emoteId: "637564352333086720" }, { name: "Subtlety", color: "#FFF468", emoteId: "637564352169508892" }] },
      { name: "Warlock", emoteId: "579532029851336716", specs: [{ name: "Affliction", color: "#8788EE", emoteId: "637564406984867861" }, { name: "Demonology", color: "#8788EE", emoteId: "637564407001513984" }, { name: "Destruction", color: "#8788EE", emoteId: "637564406682877964" }] }
    ];
    function baseComp() { return { title: "", groupCount: 5, groups: [1, 2, 3, 4, 5].map(i => ({ name: "Group " + i, position: i })), classes: DEFAULT_CLASSES, slots: [] }; }

    function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

    // "2026-06-24" -> "WED — JUN 24" (board title from the raid date)
    function formatRaidTitle(d) {
      if (!d) return "";
      const p = d.split("-").map(Number); if (p.length !== 3) return "";
      const dt = new Date(p[0], p[1] - 1, p[2]);
      const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
      const MO = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      return WD[dt.getDay()] + " — " + MO[p[1] - 1] + " " + p[2];
    }

    // role emoji fallback (when a class emoji isn't configured)
    function roleEmoji(spec, cls) {
      if (/Protection|Guardian|_Tank/i.test(spec)) return "🛡️";
      if (/Holy|Discipline|Restoration/i.test(spec)) return "💚";
      if (cls === "Hunter") return "🏹";
      if (cls === "Mage" || cls === "Warlock") return "🔮";
      if (/Shadow|Balance|Elemental/i.test(spec)) return "🔮";
      return "⚔️";
    }

    // the 10 classes (key used for emoji + localStorage)
    const CLASSES = [["warrior", "Warrior"], ["paladin", "Paladin"], ["hunter", "Hunter"], ["rogue", "Rogue"],
    ["priest", "Priest"], ["dk", "Death Knight"], ["shaman", "Shaman"], ["mage", "Mage"], ["warlock", "Warlock"], ["druid", "Druid"]];

    // Raid-Helper often puts a STATUS in className (Tank/Tentative/Late/Bench/Absence) instead of the
    // real class — recover the real class from the spec in those cases.
    const REAL_CLASS_KEYS = ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid", "dk"];
    function classKeyFromSpec(s) {
      s = s || "";
      if (/Protection1|Holy1|Retribution/i.test(s)) return "paladin";
      if (/_DPS|_Tank/i.test(s)) return "dk";
      if (/Guardian|Feral|Balance|^Restoration$/i.test(s)) return "druid";
      if (/Arms|Fury|^Protection$/i.test(s)) return "warrior";
      if (/Assassination|Combat|Subtlety/i.test(s)) return "rogue";
      if (/Elemental|Enhancement|Restoration1/i.test(s)) return "shaman";
      if (/Arcane|Fire|^Frost$/i.test(s)) return "mage";
      if (/Discipline|^Holy$|Shadow|Smite/i.test(s)) return "priest";
      if (/Affliction|Demonology|Destruction/i.test(s)) return "warlock";
      if (/Beastmastery|Marksmanship|Survival/i.test(s)) return "hunter";
      return "";
    }
    function resolveClassKey(m) {
      let c = (m.className || "").toLowerCase();
      if (c === "death knight" || c === "deathknight") c = "dk";
      if (REAL_CLASS_KEYS.includes(c)) return c;           // already a real class
      return classKeyFromSpec(m.specName) || "warrior";    // status/empty -> infer from spec
    }
    // canonical class name (e.g. "Death Knight") for color + saved data
    function realClassName(m) { const f = CLASSES.find(x => x[0] === resolveClassKey(m)); return f ? f[1] : (m.className || ""); }

    function loadEmojiMap() { try { return JSON.parse(localStorage.getItem("ratsEmoji") || "{}"); } catch (e) { return {}; } }
    function saveEmojiMap(map) { try { localStorage.setItem("ratsEmoji", JSON.stringify(map)); } catch (e) { } }

    // emoji name must be [A-Za-z0-9_], 2-32 chars (Discord renders by ID, name is cosmetic)
    function sanitizeName(s) { s = (s || "").replace(/[^A-Za-z0-9_]/g, ""); return s.length >= 2 ? s.slice(0, 32) : "spec"; }

    // priority: manual class override > exact spec icon from JSON > class icon from JSON > role emoji
    function emojiFor(m) {
      const map = loadEmojiMap();
      const ov = (map[resolveClassKey(m)] || "").trim();
      if (ov) return ov;
      if (m.specEmoteId) return "<:" + sanitizeName(m.specName) + ":" + m.specEmoteId + ">";
      if (m.classEmoteId) return "<:" + sanitizeName(m.className) + ":" + m.classEmoteId + ">";
      return m.role;
    }

    // ---- guild roster autocomplete + alt->main merge (shared DB with guild.html) ----
    const GUILD_CLASS_KEY = { "Death Knight": "DK" };
    function guildRoster() { try { const d = JSON.parse(localStorage.getItem("ratsGuild") || "null"); return (d && d.roster) ? d.roster : []; } catch (e) { return []; } }
    // Raid-Helper gives the DISCORD name (with decorations); the roster has the IN-GAME name.
    function normName(s) {
      return (s || "").toLowerCase()
        .replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "")  // [SHAKA] / (alt)
        .split(/[\/|,]/)[0]                                // Lecoque/Chims -> Lecoque
        .replace(/[^a-z0-9]/g, "").trim();
    }
    function guildMember(name) {
      let n = normName(name); if (!n) return null;
      const alias = (window.RatsData && RatsData.aliasFor) ? RatsData.aliasFor(name) : null;
      if (alias) n = normName(alias);                                                     // Discord nick -> in-game
      return guildRoster().find(x => normName(x.name) === n) || null;  // exact (normalized) or alias only — no fuzzy guessing
    }
    function altMainNote(m) { const on = ((m && m.officerNote) || "").trim(); const mm = on.match(/^(.+?)\s+alt\b/i); return mm ? mm[1].trim() : null; }
    function isAltG(m) { return m && (m.rankIndex === 4 || /alt/i.test(m.rankName || "") || !!altMainNote(m)); }
    function mainOfG(m) {
      if (!m) return null;
      const on = (m.officerNote || "").trim(); const mm = on.match(/^(.+?)\s+alt\b/i); if (mm) return mm[1].trim();
      const pn = (m.publicNote || "").trim(); if (pn) { const t = pn.split(/[\s,/\-(]/)[0]; if (/^[A-Za-zÀ-ÿ]{2,}$/.test(t)) return t; }
      return null;
    }
    // an alt counts as its MAIN; mains/unknowns stay as typed
    function resolveMain(typed) {
      const m = guildMember(typed);
      if (!m) return typed;                                  // not in roster -> keep as-is (pug)
      if (isAltG(m)) { const mn = mainOfG(m); if (mn) return mn; }  // alt -> its main
      return m.name;                                         // canonical roster name (merges Kobe/Kobee, etc.)
    }
    // roster-picker icons: 👑 GM (King Rat) · ⭐ officer (Warchief Rat) · 💀 Fang
    function compGuildData() { try { return JSON.parse(localStorage.getItem("ratsGuild") || "null") || {}; } catch (e) { return {}; } }
    function isFangP(m) { const fs = (compGuildData().fangs) || [], n = (m.name || "").toLowerCase().replace(/[^a-z0-9]/g, ""); return fs.some(x => (x || "").toLowerCase().replace(/[^a-z0-9]/g, "") === n); }
    // one icon only, highest rank wins: 👑 GM > ⭐ officer > 💀 Fang (no doubling up)
    function rankIcon(m) {
      let s = "", t = "";
      if (m.rankIndex === 0) { s = "👑"; t = "Guild Master"; }
      else if (m.rankIndex === 1) { s = "⭐"; t = "Officer"; }
      else if (isFangP(m)) { s = "💀"; t = "Fang"; }
      return s ? `<span style="flex:0 0 auto" title="${t}">${s}</span>` : "";
    }
    function populateGuildNames() {
      const dl = document.getElementById("guildNames"); if (!dl) return;
      dl.innerHTML = guildRoster().map(m => `<option value="${(m.name || "").replace(/"/g, "")}">`).join("");
    }
    // guess a spec from the guild note text (publicNote/officerNote)
    const SPEC_ALIASES = {
      Beastmastery: ["beast", "bm"], Marksmanship: ["marks", "mm"], Survival: ["surv", "sv"],
      Balance: ["balance", "boomkin", "boom", "bala", "moonkin"], Feral: ["feral", "cat"], Restoration: ["resto", "rdudu", "rdru", "tree"], Guardian: ["guardian", "bear"],
      Arms: ["arms"], Fury: ["fury"], Protection: ["prot"],
      Discipline: ["disc", "disco", "disci"], Holy: ["holy"], Shadow: ["shadow", "spriest"],
      Arcane: ["arcane"], Fire: ["fire"], Frost: ["frost"],
      Elemental: ["ele", "elem", "elemental"], Enhancement: ["enh", "enhance", "spellhance"], Restoration1: ["resto", "rsham", "rshamy", "tree"],
      Blood_DPS: ["blood dps"], Frost_DPS: ["frost dk", "frost dps", "frost"], Unholy_DPS: ["unholy", "uh"], Blood_Tank: ["bdk", "blood dk", "blood tank", "btank", "blood"], Frost_Tank: ["frost tank"], Unholy_Tank: ["unholy tank"],
      Holy1: ["holy"], Protection1: ["prot"], Retribution: ["ret", "retri", "rett"],
      Assassination: ["assa", "sin", "mut"], Combat: ["combat"], Subtlety: ["sub", "subtlety"],
      Affliction: ["affli", "aff"], Demonology: ["demo", "demono"], Destruction: ["destro", "destruction"]
    };
    function guessSpecName(member, classObj) {
      if (!classObj) return null;
      const note = ((member.publicNote || "") + " " + (member.officerNote || "")).toLowerCase();
      if (!note.trim()) return null;
      for (const s of classObj.specs) {
        const pretty = prettySpec(s.name).toLowerCase();
        if (pretty && note.includes(pretty)) return s.name;
        const al = SPEC_ALIASES[s.name];
        if (al && al.some(a => note.includes(a))) return s.name;
      }
      return null;
    }
    function guildAutofill() {
      const m = guildMember(document.getElementById("arName").value);
      const hint = document.getElementById("arHint");
      if (!m) return;
      const key = GUILD_CLASS_KEY[m.class] || m.class;
      const sel = document.getElementById("arClass");
      let ok = false;
      if (sel && sel.options.length) { for (const o of sel.options) { if (o.value === key) { sel.value = key; ok = true; break; } } }
      if (ok) {
        fillSpecs();
        const cs = (window.__classes && window.__classes.length) ? window.__classes : DEFAULT_CLASSES;
        const guess = guessSpecName(m, cs.find(x => x.name === key));
        const sp = document.getElementById("arSpec");
        if (sp) { if (guess) sp.value = guess; if (!sp.value && sp.options.length > 1) sp.selectedIndex = 1; }
      }
      const main = isAltG(m) ? mainOfG(m) : null;
      if (main && hint) { hint.style.display = ""; hint.innerHTML = `↳ <b>${m.name}</b> is <b>${main}</b>'s alt — will be added as <b>${main}</b> (${m.class})`; }
    }

    // custom autocomplete dropdown anchored under the Name field
    const CLASS_COLOR = { "Death Knight": "#C41E3A", "Druid": "#FF7C0A", "Hunter": "#AAD372", "Mage": "#3FC7EB", "Paladin": "#F58CBA", "Priest": "#E6E6E6", "Rogue": "#FFF569", "Shaman": "#0070DD", "Warlock": "#8788EE", "Warrior": "#C69B6D" };
    function guildSuggest() {
      guildAutofill(); // keep class auto-fill + alt hint on exact match
      const inp = document.getElementById("arName"), box = document.getElementById("arSuggest");
      const q = (inp.value || "").toLowerCase().trim();
      if (!q) { box.style.display = "none"; box.innerHTML = ""; return; }
      const matches = guildRoster().filter(m => (m.name || "").toLowerCase().includes(q)).slice(0, 12);
      if (!matches.length) { box.style.display = "none"; return; }
      box.innerHTML = matches.map(m => {
        const col = CLASS_COLOR[m.class] || "#ddd";
        const alt = isAltG(m) ? ` <span style="color:#7aa2c9;font-style:italic">↳ ${esc(mainOfG(m) || "")}</span>` : "";
        return `<div class="sug" data-n="${(m.name || "").replace(/"/g, "&quot;")}" onmousedown="pickSuggest(this)"
          style="padding:7px 10px;cursor:pointer;display:flex;gap:8px;align-items:center">
          <span style="color:${col};font-weight:700">${esc(m.name)}</span>
          <span style="color:#6e7178;font-size:11px">${esc(m.class)}</span>${alt}</div>`;
      }).join("");
      box.style.display = "block";
    }
    function pickSuggest(el) {
      document.getElementById("arName").value = el.getAttribute("data-n");
      document.getElementById("arSuggest").style.display = "none";
      guildAutofill();
    }

    // ---- manual add-raider form ----
    function prettySpec(n) { return (n || "").replace(/1$/, "").replace(/_/g, " "); }
    function fillSpecs() {
      const cs = (window.__classes && window.__classes.length) ? window.__classes : DEFAULT_CLASSES;
      const c = cs.find(x => x.name === document.getElementById("arClass").value);
      const sp = document.getElementById("arSpec"); sp.innerHTML = '<option value="" disabled selected>Spec…</option>';
      if (c) c.specs.forEach(s => { const o = document.createElement("option"); o.value = s.name; o.textContent = prettySpec(s.name); sp.appendChild(o); });
    }
    function populateAddForm() {
      const cs = (window.__classes && window.__classes.length) ? window.__classes : DEFAULT_CLASSES;
      const cl = document.getElementById("arClass"); if (!cl) return;
      const hint = document.getElementById("arHint"); if (hint) hint.style.display = "none";
      cl.innerHTML = '<option value="" disabled selected>Class…</option>';
      cs.filter(c => c.name !== "Tank").forEach(c => { const o = document.createElement("option"); o.value = c.name; o.textContent = (c.name === "DK" ? "Death Knight" : c.name); cl.appendChild(o); });
      fillSpecs();
    }
    // first group with room (<5), starting from `start`; makes a new group if all are full
    function nextGroupWithRoom(data, start) {
      const cap = 5, max = data.groupCount || 5;
      const count = g => (data.slots || []).filter(x => x.groupNumber === g).length;
      for (let i = (start || 1); i <= max; i++) if (count(i) < cap) return i;
      for (let i = 1; i <= max; i++) if (count(i) < cap) return i;
      return max + 1; // all full -> overflow into a new group
    }
    function addRaider() {
      const ta = document.getElementById("jsonIn"); let data;
      try { data = JSON.parse(ta.value.trim()); } catch (e) { data = null; }
      if (!data || !Array.isArray(data.slots)) data = baseComp();   // build from scratch if nothing imported
      if (!data.classes || !data.classes.length) data.classes = DEFAULT_CLASSES;
      const typed = document.getElementById("arName").value.trim();
      if (!typed) { setMsg("❌ Enter a name to add."); return; }
      const name = resolveMain(typed); // alts count as their main
      const clName = document.getElementById("arClass").value, specName = document.getElementById("arSpec").value;
      if (!clName || !specName) { setMsg("❌ Pick a class and spec."); return; }
      data.slots = data.slots || [];
      // auto-place: first group with room (drag to rearrange afterwards)
      let grp = nextGroupWithRoom(data, 1);
      if (grp > (data.groupCount || 5)) data.groupCount = grp;
      const c = (data.classes || []).find(x => x.name === clName);
      const s = c && c.specs.find(x => x.name === specName);
      const inGroup = data.slots.filter(x => x.groupNumber === grp).length;
      data.slots.push({
        specName: specName, color: (s && s.color) || "#ffffff", slotNumber: inGroup + 1,
        name: name, className: clName, specEmoteId: (s && s.emoteId), classEmoteId: (c && c.emoteId), groupNumber: grp
      });
      ta.value = JSON.stringify(data);
      document.getElementById("arName").value = "";
      render();
      const via = (name !== typed) ? " (" + typed + ")" : "";
      setMsg("✅ Added " + name + via + " — " + prettySpec(specName) + " " + (clName === "DK" ? "Death Knight" : clName) + " (Group " + grp + ")", "#7CFC8A");
    }
    function addNoShow() {
      const ta = document.getElementById("jsonIn"); let data;
      try { data = JSON.parse(ta.value.trim()); } catch (e) { data = null; }
      if (!data || !Array.isArray(data.slots)) data = baseComp();
      if (!data.classes || !data.classes.length) data.classes = DEFAULT_CLASSES;
      const typed = document.getElementById("arName").value.trim();
      if (!typed) { setMsg("❌ Enter a name to mark no-show."); return; }
      const name = resolveMain(typed); // alts count as their main
      const clName = document.getElementById("arClass").value, specName = document.getElementById("arSpec").value;
      if (!clName || !specName) { setMsg("❌ Pick a class and spec."); return; }
      const c = (data.classes || []).find(x => x.name === clName);
      const s = c && c.specs.find(x => x.name === specName);
      data.noshows = data.noshows || [];
      data.noshows.push({
        name: name, className: clName, specName: specName, color: (s && s.color) || "#ffffff",
        specEmoteId: (s && s.emoteId), classEmoteId: (c && c.emoteId), role: roleEmoji(specName, clName)
      });
      ta.value = JSON.stringify(data);
      document.getElementById("arName").value = "";
      render();
      setMsg("✅ " + name + " marked no-show — " + prettySpec(specName) + " " + (clName === "DK" ? "Death Knight" : clName), "#7CFC8A");
    }

    // ---- interactive board: move / no-show / remove (operate on the jsonIn data) ----
    function groupOpts(cur, count) { let o = ""; for (let i = 1; i <= count; i++) o += `<option value="${i}"${i === cur ? " selected" : ""}>G${i}</option>`; return o; }
    function _cd() { try { return JSON.parse(document.getElementById("jsonIn").value.trim()); } catch (e) { return null; } }
    function _commit(d) { document.getElementById("jsonIn").value = JSON.stringify(d); render(); }

    // ---- edit a raider's spec inline (fixes the spec/role + icon, recomputes tank/heal/dps) ----
    function specClassObj(m) { return DEFAULT_CLASSES.find(x => x.name.toLowerCase() === resolveClassKey(m)) || null; }
    function specOpts(m) {
      const c = specClassObj(m);
      if (!c) return `<option selected>${esc(prettySpec(m.specName) || "—")}</option>`;
      return c.specs.map(s => `<option value="${esc(s.name)}"${s.name === m.specName ? " selected" : ""}>${esc(prettySpec(s.name))}</option>`).join("");
    }
    function setSlotSpec(i, specName) {
      const d = _cd(); if (!d || !d.slots || !d.slots[i]) return;
      const m = d.slots[i];
      const c = specClassObj(m);
      const s = c && c.specs.find(x => x.name === specName);
      m.specName = specName;
      if (s) { m.specEmoteId = s.emoteId; m.color = s.color; }
      if (c) { m.classEmoteId = c.emoteId; if (/^(tank)?$/i.test(m.className || "")) m.className = c.name; }
      _commit(d);
    }
    // keep slotNumber in sync with array order within each group (so display order = array order)
    function renumber(d) { const n = {}; (d.slots || []).forEach(s => { const g = s.groupNumber || 1; n[g] = (n[g] || 0) + 1; s.slotNumber = n[g]; }); }
    // drop on a GROUP's empty space -> append to the end of that group
    function moveSlot(i, g) { const d = _cd(); if (!d || !d.slots || !d.slots[i]) return; const m = d.slots.splice(i, 1)[0]; m.groupNumber = parseInt(g) || 1; d.slots.push(m); renumber(d); _commit(d); }
    // drop ON a raider -> insert at that exact position (reorder within / across groups)
    function onDropSlot(ev, targetIdx) {
      ev.preventDefault(); ev.stopPropagation(); dragEnd();
      const p = (ev.dataTransfer.getData("text/plain") || "").split(":");
      const d = _cd(); if (!d || !d.slots) return;
      const target = d.slots[targetIdx]; if (!target) return;
      const grp = target.groupNumber;
      let moving = null;
      if (p[0] === "slot") { const from = +p[1]; if (from === targetIdx) return; moving = d.slots.splice(from, 1)[0]; }
      else if (p[0] === "ns") { if (!d.noshows || !d.noshows[+p[1]]) return; moving = d.noshows.splice(+p[1], 1)[0]; }
      if (!moving) return;
      moving.groupNumber = grp;
      const ti = d.slots.indexOf(target);            // target index after the splice above
      d.slots.splice(ti, 0, moving);                 // insert right before the raider you dropped on
      renumber(d); _commit(d);
    }
    function delSlot(i) { const d = _cd(); if (!d || !d.slots || !d.slots[i]) return; d.slots.splice(i, 1); _commit(d); }
    function slotNoShow(i) {
      const d = _cd(); if (!d || !d.slots || !d.slots[i]) return;
      const m = d.slots.splice(i, 1)[0];
      d.noshows = d.noshows || [];
      d.noshows.push({ name: m.name, className: m.className, specName: m.specName, color: m.color, specEmoteId: m.specEmoteId, classEmoteId: m.classEmoteId, role: roleEmoji(m.specName, m.className) });
      _commit(d);
    }
    function delNoShow(i) { const d = _cd(); if (!d || !d.noshows || !d.noshows[i]) return; d.noshows.splice(i, 1); _commit(d); }
    function noShowToGroup(i, g) {
      const d = _cd(); if (!d || !d.noshows || !d.noshows[i] || !g) return;
      const m = d.noshows.splice(i, 1)[0];
      const grp = parseInt(g) || 1;
      d.slots = d.slots || [];
      const inGroup = d.slots.filter(x => x.groupNumber === grp).length;
      d.slots.push({ specName: m.specName, color: m.color, slotNumber: inGroup + 1, name: m.name, className: m.className, specEmoteId: m.specEmoteId, classEmoteId: m.classEmoteId, groupNumber: grp });
      _commit(d);
    }

    // ---- drag & drop: move raiders between groups (and to/from no-shows) ----
    function onDragStart(ev, kind, i) {
      ev.dataTransfer.setData("text/plain", kind + ":" + i);
      ev.dataTransfer.effectAllowed = "move";
      document.body.classList.add("dragging");
    }
    function dragEnd() { document.body.classList.remove("dragging"); }
    function allowDrop(ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; }
    function onDropGroup(ev, g) {
      ev.preventDefault(); dragEnd();
      const p = (ev.dataTransfer.getData("text/plain") || "").split(":");
      if (p[0] === "slot") moveSlot(+p[1], g);
      else if (p[0] === "ns") noShowToGroup(+p[1], g);
    }
    function onDropNoShow(ev) {
      ev.preventDefault(); dragEnd();
      const p = (ev.dataTransfer.getData("text/plain") || "").split(":");
      if (p[0] === "slot") slotNoShow(+p[1]);
    }

    let SIZE = "25"; // raid size segmented toggle (25 / 10)
    function raidSize() { return SIZE === "10" ? 10 : 25; }
    function setSize(b) {
      SIZE = b.dataset.s;
      document.querySelectorAll("#sizeSegs .seg").forEach(s => s.classList.toggle("active", s === b));
      try { localStorage.setItem("ratsSize", SIZE); } catch (e) { }
      render();
    }

    // raid + difficulty toggles -> the subtitle (e.g. "Ulduar HM")
    let RAID = "ICC", DIFF = "";
    function compDesc() { return (RAID + (DIFF ? " " + DIFF : "")).trim(); }
    function setRaid(b) {
      RAID = b.dataset.r;
      document.querySelectorAll("#raidSegs .seg").forEach(s => s.classList.toggle("active", s === b));
      try { localStorage.setItem("ratsRaid", RAID); } catch (e) { }
      render();
    }
    function setDiff(b) {
      DIFF = b.dataset.d;
      document.querySelectorAll("#diffSegs .seg").forEach(s => s.classList.toggle("active", s === b));
      try { localStorage.setItem("ratsDiff", DIFF); } catch (e) { }
      render();
    }

    // Optional (log-only) on/off toggle button
    let OPT = false;
    function toggleOpt(b) { OPT = !OPT; b.classList.toggle("active", OPT); }

    // date input uses the shared dark calendar (assets/js/datepicker.js); we just react to changes
    document.getElementById("dateIn").addEventListener("change", function () {
      try { localStorage.setItem("ratsDate", this.value); } catch (e) { }
      render();
    });

    function render() {
      const errEl = document.getElementById("err");
      errEl.textContent = "";
      const rawJson = document.getElementById("jsonIn").value.trim();
      let data;
      if (!rawJson) { data = { slots: [] }; }              // empty -> show a template (empty groups)
      else {
        try { data = JSON.parse(rawJson); }
        catch (e) { errEl.textContent = "❌ Invalid JSON — copy the full Composition Tool export."; return; }
      }
      if (!Array.isArray(data.slots)) data.slots = [];
      const slots = data.slots || [];

      // title / desc: manual override > JSON title > default
      const dateVal = document.getElementById("dateIn").value;
      const dIn = compDesc();
      const resolvedTitle = formatRaidTitle(dateVal) || data.title || "Raid Composition";
      document.getElementById("boardTitle").textContent = resolvedTitle;
      document.getElementById("boardDesc").innerHTML = (window.RatsData && RatsData.raidBadge) ? RatsData.raidBadge(dIn) : esc(dIn || "");
      window.__title = resolvedTitle;
      window.__date = dateVal; // saved for the future history feature

      // group the slots — empty board shows a size-based template (25-man = 5 groups, 10-man = 2)
      const templateGroups = raidSize() === 10 ? 2 : 5;
      const groupCount = data.groupCount || (slots.length ? Math.max(...slots.map(s => s.groupNumber || 1)) : templateGroups);
      window.__classes = data.classes || [];
      window.__groupCount = groupCount;
      const groupNames = {};
      (data.groups || []).forEach(g => { if (g.position) groupNames[g.position] = g.name; });
      const byGroup = {};
      slots.forEach(s => { (byGroup[s.groupNumber] = byGroup[s.groupNumber] || []).push(s); });

      let html = "";
      let tanks = 0, heals = 0, dps = 0, total = 0;
      const healSpecs = /Holy|Discipline|Restoration/i;
      const tankSpecs = /Protection|Guardian|_Tank|Blood_Tank|Frost_Tank|Unholy_Tank/i;

      const comp = []; // structured roster for the native embed
      for (let g = 1; g <= groupCount; g++) {
        const members = (byGroup[g] || []).slice().sort((a, b) => (a.slotNumber || 0) - (b.slotNumber || 0));
        const gname = groupNames[g] || ("Group " + g);
        html += `<div class="group" ondragover="allowDrop(event)" ondrop="onDropGroup(event,${g})"><div class="ghead">${esc(gname)}</div>`;
        const mem = [];
        members.forEach(m => {
          total++;
          let role;
          if (tankSpecs.test(m.specName)) { tanks++; role = "🛡️"; }
          else if (healSpecs.test(m.specName)) { heals++; role = "💚"; }
          else { dps++; role = roleEmoji(m.specName, m.className); }
          const icon = m.specEmoteId || m.classEmoteId;
          const img = icon ? `<img class="ic" src="${CDN(icon)}" onerror="this.style.visibility='hidden'">` : `<span class="ic"></span>`;
          const idx = slots.indexOf(m);
          html += `<div class="slot" draggable="true" ondragstart="onDragStart(event,'slot',${idx})" ondragend="dragEnd()" ondragover="allowDrop(event)" ondrop="onDropSlot(event,${idx})">${img}<span class="nm" style="color:${esc(m.color) || '#fff'}">${esc(m.name)}</span>`
            + `<span class="acts"><select class="mv" title="Change spec" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" onchange="setSlotSpec(${idx},this.value)">${specOpts(m)}</select>`
            + `<button title="Send to no-shows" onclick="slotNoShow(${idx})">💤</button>`
            + `<button title="Remove" onclick="delSlot(${idx})">✕</button></span></div>`;
          mem.push({
            name: m.name, className: realClassName(m), specName: m.specName, role: role,
            specEmoteId: m.specEmoteId, classEmoteId: m.classEmoteId
          });
        });
        html += `</div>`;
        comp.push({ name: gname, members: mem });
      }
      // no-shows -> rendered as an extra group box (like "Group 6"), dimmed + red header
      const nsArr = data.noshows || [];
      window.__noshows = nsArr;
      // always render the no-shows box as a drop target; hidden when empty unless you're dragging
      html += `<div class="group nsbox${nsArr.length ? "" : " nsempty"}" ondragover="allowDrop(event)" ondrop="onDropNoShow(event)"><div class="ghead" style="color:#ff6b6b;border-bottom-color:#5a2e2e">❌ No-shows (${nsArr.length})</div>`;
      nsArr.forEach((m, i) => {
        const icon = m.specEmoteId || m.classEmoteId;
        const img = icon ? `<img class="ic" src="${CDN(icon)}" onerror="this.style.visibility='hidden'">` : `<span class="ic"></span>`;
        html += `<div class="slot" draggable="true" ondragstart="onDragStart(event,'ns',${i})" ondragend="dragEnd()" style="opacity:.85"><span class="ic" style="margin-right:-3px;text-align:center">❌</span>${img}<span class="nm" style="color:${esc(m.color) || '#fff'}">${esc(m.name)}</span>`
          + `<span class="acts"><button title="Remove" onclick="delNoShow(${i})">✕</button></span></div>`;
      });
      if (!nsArr.length) html += `<div class="sub" style="margin:6px 2px;font-style:italic">drop a raider here to mark a no-show</div>`;
      html += `</div>`;

      document.getElementById("grid").innerHTML = html;
      const nb = document.getElementById("noshowBox"); if (nb) nb.innerHTML = "";
      window.__comp = comp;
      window.__stats = { total, tanks, heals, dps };

      document.getElementById("foot").textContent =
        `${total} raiders  ·  ${tanks} tank${tanks != 1 ? "s" : ""} · ${heals} healer${heals != 1 ? "s" : ""} · ${dps} dps`
        + (nsArr.length ? `  ·  ❌ ${nsArr.length} no-show${nsArr.length != 1 ? "s" : ""}` : "") + "  🐀🧀";

      updatePostState();
    }

    const MIN_RAIDERS = 10;
    function updatePostState() {
      const total = (window.__stats && window.__stats.total) || 0;
      const ok = total >= MIN_RAIDERS;
      const pb = document.getElementById("postBtn"), sb = document.getElementById("saveHistBtn");
      if (pb) pb.disabled = !ok;
      if (sb) sb.disabled = !ok;
    }

    function setMsg(txt, color) {
      const e = document.getElementById("err");
      e.style.color = color || "#ff6b6b";
      e.textContent = txt;
    }

    // ---- webhook persistence + posting ----
    (function () {
      try {
        // date always defaults to TODAY on open (not the last-used date); the shared calendar renders the label
        const di = document.getElementById("dateIn");
        const z = n => String(n).padStart(2, "0"), now = new Date();
        const today = now.getFullYear() + "-" + z(now.getMonth() + 1) + "-" + z(now.getDate());
        di.value = today;
        if (window.RatsCal) RatsCal.sync();
        // raid size (25/10) — remembered; changing it re-templates the empty board
        SIZE = localStorage.getItem("ratsSize") || "25";
        document.querySelectorAll("#sizeSegs .seg").forEach(s => s.classList.toggle("active", s.dataset.s === SIZE));
        // raid + difficulty -> subtitle, remembered
        RAID = localStorage.getItem("ratsRaid") || "ICC";
        DIFF = localStorage.getItem("ratsDiff") || "";
        document.querySelectorAll("#raidSegs .seg").forEach(s => s.classList.toggle("active", s.dataset.r === RAID));
        document.querySelectorAll("#diffSegs .seg").forEach(s => s.classList.toggle("active", s.dataset.d === DIFF));
        // load the shared guild roster (for the roster picker + alt->main merge); gate lives on the index
        if (window.RatsData) RatsData.loadRoster({ interactive: false });
        render(); // draw the empty-group template on load
      } catch (e) { }
    })();

    // ---- handoff from History → "✏️ Edit in Comp": load a saved raid here for editing ----
    // (Save to history overwrites the raid with the same date, so the original date is restored.)
    (function () {
      let payload;
      try { payload = JSON.parse(localStorage.getItem("ratsCompEdit") || "null"); } catch (e) { payload = null; }
      if (!payload) return;
      try { localStorage.removeItem("ratsCompEdit"); } catch (e) { }
      try {
        document.getElementById("jsonIn").value = payload.json || "";
        if (payload.date) {
          const di = document.getElementById("dateIn"); di.value = payload.date;
          try { localStorage.setItem("ratsDate", payload.date); } catch (e) { }
          if (window.RatsCal) RatsCal.sync();
        }
        if (payload.size) { SIZE = payload.size; document.querySelectorAll("#sizeSegs .seg").forEach(s => s.classList.toggle("active", s.dataset.s === SIZE)); try { localStorage.setItem("ratsSize", SIZE); } catch (e) { } }
        if (payload.raid) { RAID = payload.raid; document.querySelectorAll("#raidSegs .seg").forEach(s => s.classList.toggle("active", s.dataset.r === RAID)); try { localStorage.setItem("ratsRaid", RAID); } catch (e) { } }
        DIFF = payload.diff || ""; document.querySelectorAll("#diffSegs .seg").forEach(s => s.classList.toggle("active", s.dataset.d === DIFF)); try { localStorage.setItem("ratsDiff", DIFF); } catch (e) { }
        OPT = !!payload.optional; const ob = document.getElementById("optBtn"); if (ob) ob.classList.toggle("active", OPT);
        render();
        setMsg("✏️ Editing " + (payload.date || "this raid") + " — fix names / move raiders, then 💾 Save to history to overwrite it.", "#9ad0ff");
      } catch (e) { }
    })();

    function postWebhook() {
      const url = (localStorage.getItem("ratsWebhook") || "").trim();
      if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/\S+/.test(url)) {
        setMsg("❌ No webhook set. Add it in the Admin console (🛠 Admin → Discord webhook).");
        return;
      }
      if (!window.__comp || !window.__comp.length) { setMsg("❌ Import a comp first."); return; }
      if (((window.__stats && window.__stats.total) || 0) < MIN_RAIDERS) { setMsg("❌ Need at least " + MIN_RAIDERS + " raiders to post."); return; }

      const title = window.__title || formatRaidTitle(document.getElementById("dateIn").value) || "Raid Composition";
      const desc = compDesc();
      const st = window.__stats || { total: 0, tanks: 0, heals: 0, dps: 0 };
      const blankField = () => ({ name: "​", value: "​", inline: true });
      // only post groups that actually have raiders — drops empty G3/G4/G5 on a 10-man,
      // so No-shows slides up into the next free cell (the Group 3 column)
      const groupFields = window.__comp.filter(g => g.members && g.members.length).map(g => ({
        name: g.name,
        value: g.members.map(m => emojiFor(m) + " **" + m.name + "**").join("\n") || "—",
        inline: true
      }));
      // no-shows -> fills the next free cell right after the last populated group
      const nsList = window.__noshows || [];
      if (nsList.length) {
        groupFields.push({
          name: "❌ No-shows (" + nsList.length + ")",
          value: nsList.map(m => emojiFor(m) + " **" + m.name + "**").join("\n"),
          inline: true
        });
      }
      // pad so the final row has 3 aligned columns
      while (groupFields.length % 3 !== 0) groupFields.push(blankField());
      const embed = {
        author: { name: "RATS • Raid Roster" },
        title: "🐀 " + title,
        color: 0xC0943A, // RATS gold
        fields: groupFields,
        footer: { text: st.total + " raiders   •   " + st.tanks + " Tank · " + st.heals + " Healer · " + st.dps + " DPS   •   FOR THE RATS 🧀" },
        timestamp: new Date().toISOString()
      };
      if (desc) embed.description = desc;

      setMsg("⏳ Posting…", "#9aa0a6");
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [embed] }) })
        .then(r => {
          if (r.ok) setMsg("✅ Posted to Discord!", "#7CFC8A");
          else setMsg("❌ Discord rejected it (HTTP " + r.status + "). Check the webhook URL.");
        })
        .catch(() => setMsg("❌ Post blocked (CORS / file:// origin). Serve via a local server: python -m http.server, then open http://localhost:8000/officer/comp/"));
    }

    // ---- save the current comp into the shared raid history (downloads history.json) ----
    async function saveToHistory() {
      if (!window.RatsData) { setMsg("❌ Data layer not loaded."); return; }
      const pass = RatsData.getPass();
      if (!pass) { setMsg("❌ Locked — open the tools from the index and enter the guild key first."); return; }
      if (!window.__comp || !window.__comp.length) { setMsg("❌ Render a comp first (Import JSON or add raiders)."); return; }
      if (((window.__stats && window.__stats.total) || 0) < MIN_RAIDERS) { setMsg("❌ Need at least " + MIN_RAIDERS + " raiders to save."); return; }
      const dateVal = document.getElementById("dateIn").value;
      if (!dateVal) { setMsg("❌ Pick a raid date first (the calendar at the top)."); return; }

      setMsg("⏳ Saving…", "#9aa0a6");
      try {
        // pull the latest shared history so we append (never overwrite) what others saved
        const hist = await RatsData.loadHistory({ interactive: false });
        hist.raids = Array.isArray(hist.raids) ? hist.raids : [];

        const entry = {
          date: dateVal,
          title: window.__title || formatRaidTitle(dateVal),
          size: raidSize(),
          optional: OPT,   // ⚪ log-only (alt/casual run)
          desc: compDesc(),
          groups: (window.__comp || []).map(g => ({
            name: g.name,
            members: g.members.map(m => ({ name: m.name, className: m.className, specName: m.specName, specEmoteId: m.specEmoteId, classEmoteId: m.classEmoteId }))
          })),
          noshows: (window.__noshows || []).map(m => ({ name: m.name, className: m.className, specName: m.specName, specEmoteId: m.specEmoteId, classEmoteId: m.classEmoteId })),
          stats: window.__stats || { total: 0, tanks: 0, heals: 0, dps: 0 },
          savedAt: new Date().toISOString()
        };

        // one raid per date: replace an existing same-date entry, else append
        const existing = hist.raids.findIndex(r => r.date === dateVal);
        let verb = "Saved";
        if (existing >= 0) { hist.raids[existing] = entry; verb = "Updated"; }
        else hist.raids.push(entry);
        hist.raids.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

        const count = entry.groups.reduce((n, g) => n + g.members.length, 0);
        const res = await RatsData.saveHistory(hist, pass);
        setMsg("✅ " + verb + " " + entry.title + " (" + count + " raiders)"
          + (res.mode === "firebase" ? " — saved & shared instantly. 🐀" : " — commit the downloaded history.json via Fork to share it."), "#7CFC8A");
      } catch (e) { setMsg("❌ Save failed: " + (e && e.message ? e.message : e), "#ff6b6b"); }
    }

    // ---- roster multi-select picker ----
    let rpSelected = new Set(); // lowercased names currently checked
    function openRosterPicker() {
      if (!guildRoster().length) { setMsg("❌ No roster loaded — open the tools from the index (enter the guild key) first."); return; }
      rpSelected = new Set();
      document.getElementById("rosterModal").style.display = "flex";
      document.getElementById("rpSearch").value = "";
      document.getElementById("rpAlts").checked = false;
      renderRosterPicker();
      setTimeout(() => document.getElementById("rpSearch").focus(), 50);
    }
    function closeRosterPicker() { document.getElementById("rosterModal").style.display = "none"; }
    function updateRpCount() { const e = document.getElementById("rpCount"); if (e) e.textContent = rpSelected.size + " selected"; }
    function rpToggle(cb) { const k = (cb.getAttribute("data-name") || "").toLowerCase(); if (cb.checked) rpSelected.add(k); else rpSelected.delete(k); updateRpCount(); }
    function rpSelectAll(v) {
      document.querySelectorAll('#rosterList input[type=checkbox]').forEach(cb => { cb.checked = v; const k = (cb.getAttribute("data-name") || "").toLowerCase(); if (v) rpSelected.add(k); else rpSelected.delete(k); });
      updateRpCount();
    }
    function renderRosterPicker() {
      const box = document.getElementById("rosterList");
      const q = (document.getElementById("rpSearch").value || "").toLowerCase().trim();
      const incAlts = document.getElementById("rpAlts").checked;
      let roster = guildRoster().filter(m => !/pug/i.test(m.rankName || ""));
      if (!incAlts) roster = roster.filter(m => !isAltG(m));
      if (q) roster = roster.filter(m => (m.name || "").toLowerCase().includes(q) || (m.class || "").toLowerCase().includes(q));
      if (!roster.length) { box.innerHTML = '<div class="sub" style="padding:10px;margin:0">No roster loaded, or nothing matches.</div>'; updateRpCount(); return; }
      const order = ["Warrior", "Paladin", "Death Knight", "Hunter", "Rogue", "Shaman", "Druid", "Priest", "Mage", "Warlock"];
      const byClass = {};
      roster.forEach(m => { (byClass[m.class] = byClass[m.class] || []).push(m); });
      const classes = Object.keys(byClass).sort((a, b) => { const ia = order.indexOf(a), ib = order.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); });
      let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:16px">';
      classes.forEach(cl => {
        const col = CLASS_COLOR[cl] || "#ddd";
        // alphabetical within each class — easy to find a name
        const members = byClass[cl].slice().sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));
        html += `<div><div style="color:${col};font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #2f3137;padding-bottom:3px;margin-bottom:5px">${esc(cl)} (${members.length})</div>`;
        members.forEach(m => {
          const nm = m.name || "";
          const isC = rpSelected.has(nm.toLowerCase());
          const altTag = isAltG(m) ? ` <span style="color:#7aa2c9;font-style:italic;font-size:11px">↳${esc(mainOfG(m) || "")}</span>` : "";
          html += `<label style="display:flex;align-items:center;gap:7px;padding:2px 0;cursor:pointer">
            <input type="checkbox" data-name="${nm.replace(/"/g, "&quot;")}"${isC ? " checked" : ""} onchange="rpToggle(this)">
            <span style="color:${col};font-weight:600">${esc(nm)}</span>${rankIcon(m)}${altTag}</label>`;
        });
        html += `</div>`;
      });
      html += '</div>';
      box.innerHTML = html;
      updateRpCount();
    }
    function applyRosterPicker() {
      if (!rpSelected.size) { closeRosterPicker(); return; }
      const ta = document.getElementById("jsonIn"); let data;
      try { data = JSON.parse(ta.value.trim()); } catch (e) { data = null; }
      if (!data || !Array.isArray(data.slots)) data = baseComp();
      if (!data.classes || !data.classes.length) data.classes = DEFAULT_CLASSES;
      data.slots = data.slots || [];
      const exists = new Set(data.slots.map(x => (x.name || "").toLowerCase()));
      let added = 0, skipped = 0;
      // add in roster order; alts collapse to their main
      guildRoster().forEach(m => {
        if (!rpSelected.has((m.name || "").toLowerCase())) return;
        const name = resolveMain(m.name);
        if (exists.has(name.toLowerCase())) { skipped++; return; }
        const clKey = GUILD_CLASS_KEY[m.class] || m.class;
        const c = (data.classes || []).find(x => x.name === clKey);
        if (!c) { skipped++; return; }
        let specName = guessSpecName(m, c); if (!specName && c.specs.length) specName = c.specs[0].name;
        const s = c.specs.find(x => x.name === specName);
        const grp = nextGroupWithRoom(data, 1);
        if (grp > (data.groupCount || 5)) data.groupCount = grp;
        const inGroup = data.slots.filter(x => x.groupNumber === grp).length;
        data.slots.push({ specName: specName, color: (s && s.color) || "#ffffff", slotNumber: inGroup + 1, name: name, className: clKey, specEmoteId: (s && s.emoteId), classEmoteId: (c && c.emoteId), groupNumber: grp });
        exists.add(name.toLowerCase()); added++;
      });
      ta.value = JSON.stringify(data);
      closeRosterPicker();
      render();
      setMsg("✅ Added " + added + " raider" + (added != 1 ? "s" : "") + " from the roster" + (skipped ? " (" + skipped + " skipped — already in comp)" : "") + ".", "#7CFC8A");
    }

    function loadSample() {
      document.getElementById("jsonIn").value = JSON.stringify({
        title: "WEEKLY ULDUAR 25", groupCount: 1,
        groups: [{ name: "Group 1", position: 1 }],
        slots: [
          { name: "Grunho", color: "#C69B6D", specName: "Protection", classEmoteId: "580801859221192714", specEmoteId: "637564444834136065", groupNumber: 1, slotNumber: 1 },
          { name: "Okanor", color: "#F48CBA", specName: "Holy1", classEmoteId: "579532029906124840", specEmoteId: "637564297622454272", groupNumber: 1, slotNumber: 2 }
        ]
      });
      render();
    }

    // ---- import modal ----
    function openImport() {
      document.getElementById("importModal").style.display = "flex";
      setTimeout(() => document.getElementById("jsonIn").focus(), 50);
    }
    function closeImport() {
      document.getElementById("importModal").style.display = "none";
    }
    function importRender() {
      render();
      const err = document.getElementById("err").textContent || "";
      const me = document.getElementById("modalErr");
      if (err.indexOf("❌") === 0) { me.textContent = err; return; } // stay open on bad JSON
      me.textContent = "";
      closeImport();
    }
    document.addEventListener("keydown", e => { if (e.key === "Escape") { closeImport(); closeRosterPicker(); } });
