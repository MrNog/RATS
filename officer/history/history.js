    const CDN = id => "https://cdn.discordapp.com/emojis/" + id + ".png?size=44";
    const CLASS_COLOR = { "Death Knight": "#C41E3A", "DK": "#C41E3A", "Druid": "#FF7C0A", "Hunter": "#AAD372", "Mage": "#3FC7EB", "Paladin": "#F58CBA", "Priest": "#E6E6E6", "Rogue": "#FFF569", "Shaman": "#0070DD", "Warlock": "#8788EE", "Warrior": "#C69B6D" };
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
    function prettySpec(n) { return (n || "").replace(/1$/, "").replace(/_/g, " "); }
    // Raid-Helper sometimes stores a STATUS (Tank/Tentative/Late/Bench/Absence) as className — recover the real class from the spec
    function classFromSpec(s) {
      s = s || "";
      if (/Protection1|Holy1|Retribution/i.test(s)) return "Paladin";
      if (/_DPS|_Tank/i.test(s)) return "Death Knight";
      if (/Guardian|Feral|Balance|^Restoration$/i.test(s)) return "Druid";
      if (/Arms|Fury|^Protection$/i.test(s)) return "Warrior";
      if (/Assassination|Combat|Subtlety/i.test(s)) return "Rogue";
      if (/Elemental|Enhancement|Restoration1/i.test(s)) return "Shaman";
      if (/Arcane|Fire|^Frost$/i.test(s)) return "Mage";
      if (/Discipline|^Holy$|Shadow|Smite/i.test(s)) return "Priest";
      if (/Affliction|Demonology|Destruction/i.test(s)) return "Warlock";
      if (/Beastmastery|Marksmanship|Survival/i.test(s)) return "Hunter";
      return "";
    }
    function realClass(m) { const c = m && m.className; if (c && CLASS_COLOR[c]) return c === "DK" ? "Death Knight" : c; return classFromSpec(m && m.specName) || c || ""; }
    function msg(t, c) { const e = document.getElementById("msg"); e.style.color = c || "#7CFC8A"; e.textContent = t || ""; }

    let HIST = { raids: [] };
    let VAC = [];   // shared vacations (plain Firebase node, written by members + officers)

    // ---- alt -> main (same rules as the comp tool, reading the shared roster) ----
    function guildRoster() { try { const d = JSON.parse(localStorage.getItem("ratsGuild") || "null"); return (d && d.roster) ? d.roster : []; } catch (e) { return []; } }
    function guildData() { try { return JSON.parse(localStorage.getItem("ratsGuild") || "null") || {}; } catch (e) { return {}; } }
    function joinDateOf(name) { const j = (guildData().joined) || {}, n = normName(name); for (const k in j) if (normName(k) === n) return j[k]; return ""; }
    function isFangName(name) { const fs = (guildData().fangs) || [], n = normName(name); return fs.some(x => normName(x) === n); }
    // Raid-Helper gives the DISCORD name (with decorations); the roster has the IN-GAME name.
    // Normalize so they match: strip [tags]/(parens), take the part before a "/" (main/alt), drop punctuation.
    function normName(s) {
      return (s || "").toLowerCase()
        .replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "")  // [SHAKA] / (alt)
        .split(/[\/|,]/)[0]                                // Lecoque/Chims -> Lecoque
        .replace(/[^a-z0-9]/g, "").trim();
    }
    function guildMember(name) {
      let n = normName(name); if (!n) return null;
      const alias = (window.RatsData && RatsData.aliasFor) ? RatsData.aliasFor(name) : null;
      if (alias) n = normName(alias);                             // Discord nick -> in-game
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
    function resolveMain(typed) {
      const m = guildMember(typed);
      if (!m) return typed;                                  // not in roster -> keep as-is (pug)
      if (isAltG(m)) { const mn = mainOfG(m); if (mn) return mn; }  // alt -> its main
      return m.name;                                         // canonical roster name (merges Kobe/Kobee, etc.)
    }

    // ---- date range (quick-range segments) ----
    function inRange(dateStr) {
      const days = RANGE_DAYS;
      if (days > 0) {
        const cut = new Date(); cut.setDate(cut.getDate() - days);
        const z = n => String(n).padStart(2, "0");
        const cutStr = cut.getFullYear() + "-" + z(cut.getMonth() + 1) + "-" + z(cut.getDate());
        if (dateStr < cutStr) return false;
      }
      return true;
    }

    // 25-man vs 10-man (explicit size on the entry; legacy entries inferred from headcount)
    function raidSize(r) {
      if (r.size === 10 || r.size === 25) return r.size;
      const n = (r.groups || []).reduce((a, g) => a + (g.members || []).length, 0);
      return n > 10 ? 25 : 10;
    }
    // ---- continuation detection ----
    // A "continuation" = a later run that resumes an earlier run's WEEKLY LOCKOUT.
    // Same lockout week (Wed→Wed reset) + same instance + same size + ≥50% of the SAME
    // toons (name AND class — an alt like Okanata ≠ Okanor, so it's a fresh lockout).
    function lockoutStart(dateStr) {
      const p = String(dateStr || "").split("-").map(Number); if (p.length !== 3) return dateStr;
      const d = new Date(p[0], p[1] - 1, p[2]);
      const back = (d.getDay() - 3 + 7) % 7;   // Wednesday = 3; step back to this lockout's Wed
      d.setDate(d.getDate() - back);
      const z = n => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
    }
    function rosterKeys(r) {   // Set of "toon|class" for everyone in the groups
      const set = new Set();
      (r.groups || []).forEach(g => (g.members || []).forEach(m => {
        const nm = normName(m.name); if (nm) set.add(nm + "|" + realClass(m));
      }));
      return set;
    }
    function isContinuation(r) {
      if (/continuation/i.test(r.desc || "")) return true;   // honor a manually-typed note
      const keysR = rosterKeys(r); if (!keysR.size) return false;
      const wk = lockoutStart(r.date), sz = raidSize(r), rk = RatsData.raidKeyOf(r.desc);
      for (const p of (HIST.raids || [])) {
        if (p === r || !(p.date < r.date)) continue;          // only an EARLIER run counts as the origin
        if (lockoutStart(p.date) !== wk || raidSize(p) !== sz || RatsData.raidKeyOf(p.desc) !== rk) continue;
        const keysP = rosterKeys(p); if (!keysP.size) continue;
        let shared = 0; keysR.forEach(k => { if (keysP.has(k)) shared++; });
        if (shared / Math.min(keysR.size, keysP.size) >= 0.5) return true;
      }
      return false;
    }
    function contBadge(r) {
      if (!isContinuation(r)) return "";
      return '<span title="Same weekly lockout as an earlier run (≥50% same toons)" style="display:inline-flex;align-items:center;font-size:10px;font-weight:800;letter-spacing:.4px;border-radius:10px;padding:2px 8px;border:1px solid #2e5a52;background:#13302b;color:#5bd6c0"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;flex:0 0 auto"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>CONTINUATION</span>';
    }

    // The per-raid toggle: ⚪ Optional = log-only (history, counts for nobody). Default OFF.
    // When NOT optional: 25-man counts for everyone, 10-man is a 💀 Fang run (counts for Fangs).
    function isLogOnly(r) { return !!r.optional; }
    // raid "kind" for the badge: 'log' | 'mando' (25) | 'fang' (10)
    function raidKind(r) { return isLogOnly(r) ? "log" : (raidSize(r) === 25 ? "mando" : "fang"); }
    // a raider on vacation that day -> that raid is excused (no miss, doesn't count)
    function onVacation(name, date) {
      const vs = VAC || [], n = normName(name);
      return vs.some(v => v.start && normName(v.name) === n && date >= v.start && date <= (v.end || v.start));
    }
    function raidInstOf(r) { return (window.RatsData && RatsData.raidKeyOf) ? (RatsData.raidKeyOf(r.desc) || "Other") : "Other"; }
    function filteredRaids() {
      const sf = SIZE;
      return (HIST.raids || [])
        .filter(r => r.date && inRange(r.date)
          && (sf === "all" || String(raidSize(r)) === sf)
          && (RAID === "all" || raidInstOf(r) === RAID))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
    }

    // ---- attendance aggregation ----
    function computeAttendance(raids) {
      const map = {}; // key -> {name, cls, present, noShow, lastDate}
      function ent(name, cls) {
        const main = resolveMain(name), key = main.toLowerCase();
        if (!map[key]) {
          // prefer the MAIN's true class from the roster, not whichever alt raided that night
          const rm = guildMember(main);
          map[key] = { name: main, cls: (rm && rm.class) || cls || "", present: 0, noShow: 0, lastDate: "", involved: new Set(), presentDates: new Set(), excused: new Set(), rankIndex: rm && rm.rankIndex != null ? rm.rankIndex : 99, rankName: (rm && rm.rankName) || "" };
        } else if (!map[key].cls && cls) map[key].cls = cls;
        return map[key];
      }
      raids.forEach(r => {
        const seen = new Set();
        (r.groups || []).forEach(g => (g.members || []).forEach(m => {
          const o = ent(m.name, realClass(m)), key = o.name.toLowerCase();
          if (!seen.has(key)) { o.present++; seen.add(key); }
          o.involved.add(r.date); o.presentDates.add(r.date);   // showed up -> always counts (even if on vacation)
          // roster members keep their MAIN's class; pugs show whatever they last raided
          if (r.date >= o.lastDate) { o.lastDate = r.date; if (!o._roster) { const rc = realClass(m); if (rc) o.cls = rc; } }
        }));
        (r.noshows || []).forEach(m => {
          const o = ent(m.name, realClass(m)), key = o.name.toLowerCase();
          if (seen.has(key)) return;
          if (m.vacation || onVacation(o.name, r.date)) { o.excused.add(r.date); }  // 🏖️ excused -> never counts
          else { o.noShow++; o.involved.add(r.date); }   // signed up & missed -> counts (+ red counter)
        });
      });
      // optionally include roster raiders who never showed in this range
      if (document.getElementById("incRoster").checked) {
        guildRoster().forEach(m => {
          if (isAltG(m)) return;
          if (/pug/i.test(m.rankName || "")) return;
          const key = (m.name || "").toLowerCase();
          if (key && !map[key]) map[key] = { name: m.name, cls: m.class || "", present: 0, noShow: 0, lastDate: "", involved: new Set(), presentDates: new Set(), excused: new Set(), rankIndex: m.rankIndex != null ? m.rankIndex : 99, rankName: m.rankName || "" };
        });
      }
      const total = raids.length;
      // Group non-optional raids into LOCKOUT CHAINS by (lockout week + instance + size). A chain =
      // one weekly obligation, however many NIGHTS it took to complete. Multi-night runs (couldn't
      // full-clear in one sitting, esp. hardmodes) belong to the same chain, so they count ONCE.
      const chains = {};
      raids.forEach(r => {
        if (isLogOnly(r)) return;
        const inst = window.RatsData ? RatsData.raidKeyOf(r.desc) : (r.desc || "");
        const gk = raidSize(r) + "|" + lockoutStart(r.date) + "|" + inst;
        if (!chains[gk]) chains[gk] = [];
        chains[gk].push(r);
      });
      const chainList = Object.values(chains);
      const rows = Object.values(map).map(o => {
        const joinD = joinDateOf(o.name), fang = isFangName(o.name);
        // ONE obligation per lockout chain (per weekly reset + instance), worth 1 in the denominator
        // however many nights it took. Credit = nights you attended / nights the run ran — this feeds
        // LOOT COUNCIL, so it measures how much of the run you actually did:
        //   1) came to every night (1/2/3 nights) → 100%.
        //   2) came 1 of 2 nights → 50% — for everyone, whatever the reason.
        // The % carries this (rounded to a whole number); the Runs column shows whole lockouts.
        //   25-man: obligation for EVERYONE since join date.  10-man: obligation for 💀 Fangs.
        //   Joined the guild MID-chain (after night 1) → skip the whole chain, no credit/no fault.
        //   ⚪ Optional (log-only): never counts.
        let denom = 0, present = 0, attendedLockouts = 0, halves = 0;

        chainList.forEach(nights => {
          const size = raidSize(nights[0]);
          const firstDate = nights.map(r => r.date).sort()[0];
          if (joinD && firstDate < joinD) return;                    // whole chain predates them
          if (joinD && nights.some(r => r.date < joinD) && nights.some(r => r.date >= joinD)) return; // joined mid-chain → skip

          const ordered = nights.slice().sort((a, b) => a.date < b.date ? -1 : 1);   // chronological
          const wasPresent = r => o.presentDates.has(r.date);
          const isExcused  = r => !wasPresent(r) && (o.excused.has(r.date) || onVacation(o.name, r.date));
          const nAttended = ordered.filter(wasPresent).length;
          const nExcused  = ordered.filter(isExcused).length;

          // is this chain an obligation for this person?
          const obligated = size === 25
            ? (nAttended > 0 || o.involved.has(firstDate) || fang || !joinD || firstDate >= joinD)
            : (nAttended > 0 || fang);                                // 10-man → Fangs (or anyone who showed)
          if (!obligated) return;

          if (nAttended === 0 && nExcused === nights.length) return;  // 🏖️ excused from every night

          denom++;                                                    // one obligation
          if (nAttended > 0) {
            attendedLockouts++;                                       // showed up to this lockout at all
            const counting = nights.length - nExcused;               // nights that actually counted
            present += counting > 0 ? nAttended / counting : 1;       // fractional credit → % (loot council)
            // HALF = came the FIRST night then vanished: present on the first attended night, but
            // absent (not excused) a LATER night. A latecomer (missed the first night, came later
            // to help) has no missed night AFTER their first appearance → not a half.
            const firstIdx = ordered.findIndex(wasPresent);
            const missedLater = ordered.slice(firstIdx + 1).some(r => !wasPresent(r) && !isExcused(r));
            if (missedLater) halves++;
          }
        });

        const pct = denom ? Math.round(present / denom * 100) : 0;
        return { ...o, lockouts: attendedLockouts, halves, total: denom, pct };
      });
      return { rows, total };
    }

    // 10 stepped tiers (every 10%) — softened but still colorful, green → red
    function barColor(p) {
      return p >= 90 ? "#4fb573"   // green
        :    p >= 80 ? "#82bd5b"   // lime
        :    p >= 70 ? "#b3c24d"   // yellow-green
        :    p >= 60 ? "#d4bc48"   // yellow
        :    p >= 50 ? "#d9a648"   // gold
        :    p >= 40 ? "#d68946"   // orange
        :    p >= 30 ? "#d16d46"   // dark orange
        :    p >= 20 ? "#cd5a4c"   // red-orange
        :    p >= 10 ? "#c74d55"   // red
        :              "#b8454f";  // deep red
    }

    function renderAttendance() {
      const raids = filteredRaids();
      const { rows, total } = computeAttendance(raids);
      const sf = SIZE;
      const sizeLbl = sf === "all" ? "all raids" : sf + "-man";
      document.getElementById("attHead").textContent = "📊 Attendance (" + sizeLbl + ") — " + total + " raid" + (total != 1 ? "s" : "") + " tracked";

      const lg = document.getElementById("legend");
      // key with context — the full rules live in the "How attendance works" panel above.
      const scope = sf === "10" ? '💀 <b>10-man</b> counts for Fangs' : sf === "25" ? '🔴 <b>25-man</b> counts for everyone' : '🔴 25-man = everyone · 💀 10-man = Fangs';
      lg.innerHTML = scope
        + '. <b>%</b> = share of the run you did (1 of 2 nights = 50%). '
        + '<span class="pill">ghost</span> = signed up but never showed; '
        + '<span class="pill half">2nd day</span> = came night 1, skipped a later night.';

      const q = (document.getElementById("search").value || "").toLowerCase().trim();
      let list = q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows;
      const sort = SORT;
      list = list.slice().sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "class") return (a.cls || "").localeCompare(b.cls || "") || b.pct - a.pct || a.name.localeCompare(b.name);
        if (sort === "present") return b.lockouts - a.lockouts || b.pct - a.pct;
        if (sort === "pct") return b.pct - a.pct || b.lockouts - a.lockouts || a.name.localeCompare(b.name);
        // default: guild rank (GM → Officer → Raider → Sewer), then class, then alphabetical
        return (a.rankIndex - b.rankIndex) || (a.cls || "").localeCompare(b.cls || "") || a.name.localeCompare(b.name);
      });

      const el = document.getElementById("attendance");
      if (!total) { el.innerHTML = '<div class="empty">No raids saved in this range yet. Build a comp and hit <b>💾 Save to history</b>.</div>'; return; }
      if (!list.length) { el.innerHTML = '<div class="empty">No raiders match.</div>'; return; }

      const ar = s => sort === s ? ' ▼' : '';
      const tc = s => sort === s ? ' style="color:#fff"' : '';
      let html = '<table><thead><tr>'
        + `<th onclick="setSort('name')"${tc('name')}>Raider${ar('name')}</th>`
        + '<th class="attcol">Attendance</th>'
        + `<th class="runcol" onclick="setSort('present')"${tc('present')} title="Lockouts attended / lockouts that counted">Runs${ar('present')}</th>`
        + `<th class="pctcol" onclick="setSort('pct')"${tc('pct')}>%${ar('pct')}</th>`
        + '</tr></thead><tbody>';
      const byRank = (sort === "rank"); // collapsible rank groups only when sorted by rank
      // seed defaults once: Sewer Rats collapsed (less important)
      if (byRank && collapsedRanks === null) {
        collapsedRanks = new Set();
        list.forEach(r => { const rk = r.rankName || "Unranked / Pug"; if (/sewer/i.test(rk)) collapsedRanks.add(rk); });
        saveCollapsed();
      }
      const collapsed = byRank ? (collapsedRanks || new Set()) : new Set();
      const rankCounts = {};
      if (byRank) list.forEach(r => { const rk = r.rankName || "Unranked / Pug"; rankCounts[rk] = (rankCounts[rk] || 0) + 1; });
      let curRank = null, curCollapsed = false;
      list.forEach(r => {
        if (byRank) {
          const rk = r.rankName || "Unranked / Pug";
          if (rk !== curRank) {
            curRank = rk; curCollapsed = collapsed.has(rk);
            html += `<tr class="rankrow"><td colspan="4" data-rk="${esc(rk).replace(/"/g, "&quot;")}" onclick="toggleRank(this.dataset.rk)" style="cursor:pointer;user-select:none">${curCollapsed ? "▸" : "▾"} ${esc(rk)} <span style="color:#6e7178;font-weight:600">(${rankCounts[rk]})</span></td></tr>`;
          }
        }
        const hidden = (byRank && curCollapsed) ? ' style="display:none"' : '';
        const col = CLASS_COLOR[r.cls] || "#ddd";
        const ghost = r.noShow ? `<span class="pill" title="Signed up but never showed">${r.noShow}&times; ghost</span>` : "";
        const half = r.halves ? `<span class="pill half" title="Came the first night but didn't return for a later night of the same run">${r.halves}&times; 2nd day</span>` : "";
        const fang = isFangName(r.name);
        const fangMark = fang ? `<span title="Fang — expected at all 10-mans" style="cursor:help">💀 </span>` : "";
        const why = `Showed up to ${r.lockouts} of ${r.total} lockout${r.total != 1 ? "s" : ""} that counted. The % reflects how much of each run you did.`;
        html += `<tr${hidden}>
          <td class="nm" style="color:${col}">${fangMark}${esc(r.name)}</td>
          <td class="attcol"><div class="bar"><i style="width:${r.pct}%;background:${barColor(r.pct)}"></i></div></td>
          <td class="runcol" title="${esc(why)}" style="cursor:help">${r.lockouts} / ${r.total}${ghost}${half}</td>
          <td class="pctcol pct" style="color:${barColor(r.pct)}">${r.pct}%</td>
        </tr>`;
      });
      html += '</tbody></table>';
      el.innerHTML = html;
    }

    function setSort(v) { SORT = v; document.querySelectorAll("#sortSegs .seg").forEach(s => s.classList.toggle("active", s.dataset.v === SORT)); renderAttendance(); }

    // segmented filters (raid size + quick date range + sort) — same style as the rankings page
    let SIZE = "25", RANGE_DAYS = 0, SORT = "rank", RAID = "all";
    function setSize(b) { SIZE = b.dataset.s; document.querySelectorAll("#sizeSegs .seg").forEach(s => s.classList.toggle("active", s === b)); rerender(); }
    function setRange(b) { RANGE_DAYS = parseInt(b.dataset.d) || 0; document.querySelectorAll("#rangeSegs .seg").forEach(s => s.classList.toggle("active", s === b)); rerender(); }
    function setRaid(b) { RAID = b.dataset.r; document.querySelectorAll("#raidSegs .seg").forEach(s => s.classList.toggle("active", s === b)); rerender(); }

    // collapsible rank sections (state persisted; Sewer Rats collapsed by default)
    let collapsedRanks = (function () { try { const a = JSON.parse(localStorage.getItem("ratsAttCollapsed") || "null"); return Array.isArray(a) ? new Set(a) : null; } catch (e) { return null; } })();
    function saveCollapsed() { try { localStorage.setItem("ratsAttCollapsed", JSON.stringify([...(collapsedRanks || [])])); } catch (e) {} }
    function toggleRank(rk) {
      if (!collapsedRanks) collapsedRanks = new Set();
      if (collapsedRanks.has(rk)) collapsedRanks.delete(rk); else collapsedRanks.add(rk);
      saveCollapsed(); renderAttendance();
    }

    // ---- WoW lockout grouping: runs of the same instance + size in one Wed→Wed week = one lockout ----
    function lockoutWed(dateStr) {
      const d = new Date(dateStr + "T00:00:00");
      if (isNaN(d)) return dateStr;
      d.setDate(d.getDate() - ((d.getDay() - 3 + 7) % 7)); // back to the Wednesday on/before
      const z = n => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
    }
    function lockoutKey(r) {
      const inst = (window.RatsData && RatsData.raidKeyOf) ? (RatsData.raidKeyOf(r.desc || "") || "?") : "?";
      return inst + "|" + raidSize(r) + "|" + lockoutWed(r.date);
    }
    function raiderCount(r) { return (r.groups || []).reduce((n, g) => n + (g.members || []).length, 0); }
    function metaHtml(r) {
      const ns = (r.noshows || []).length;
      return `<span class="meta">${raiderCount(r)} raiders${ns ? " · " + ns + " no-show" + (ns != 1 ? "s" : "") : ""}</span>`;
    }
    function editHeadHtml(r) {
      return `<div class="head editing">
        <input class="tedit" id="te_title" value="${esc(r.title || r.date)}" placeholder="Title" onclick="event.stopPropagation()">
        <input class="tedit" id="te_desc" value="${esc(r.desc || "")}" placeholder="Note / description" onclick="event.stopPropagation()" style="flex:1 1 160px">
        <button class="ren" onclick="event.stopPropagation();saveTitle('${esc(r.date)}')">💾 Save</button>
        <button class="pen" title="Cancel" onclick="event.stopPropagation();cancelTitle()">✕</button>
      </div>`;
    }
    // the roster + no-shows grid + actions for ONE run (shared by standalone & grouped runs)
    function runBodyHtml(r) {
      const groups = (r.groups || []).map(g => {
        const mem = (g.members || []).map(m => {
          const icon = m.specEmoteId || m.classEmoteId;
          const img = icon ? `<img class="ic" src="${CDN(icon)}" onerror="this.style.visibility='hidden'">` : `<span class="ic"></span>`;
          const col = CLASS_COLOR[realClass(m)] || "#ddd";
          return `<div class="mrow">${img}<span style="color:${col}">${esc(m.name)}</span></div>`;
        }).join("");
        return `<div><div class="ghead">${esc(g.name)}</div>${mem || '<div class="sub">—</div>'}</div>`;
      }).join("");
      const ns = (r.noshows || []).length;
      const nsRows = (r.noshows || []).map(m => {
        const vac = !!m.vacation;
        const tag = vac ? ' <span class="vac">vacation</span>' : '';
        const col = CLASS_COLOR[realClass(m)] || "#ddd";
        const nameStyle = vac ? "color:#7CFC8A" : ("color:" + col);
        const ico = m.specEmoteId || m.classEmoteId;
        const img = ico ? `<img class="ic" src="${CDN(ico)}" onerror="this.style.visibility='hidden'">` : `<span class="ic"></span>`;
        return `<div class="mrow"><span style="font-size:11px;flex:0 0 auto">${vac ? "🏖️" : "❌"}</span>${img}<span style="${nameStyle}">${esc(m.name)}</span>${tag}</div>`;
      }).join("");
      const nsBlock = ns ? `<div><div class="ghead" style="color:#ff6b6b">❌ No-shows (${ns})</div>${nsRows}</div>` : "";
      return `<div class="body">
        <div class="ggrid">${groups}${nsBlock}</div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="editbtn" onclick="event.stopPropagation();editInComp('${esc(r.date)}')" title="Open this raid in the Comp tool to fix names / move raiders, then Save to overwrite it">✏️ Edit in Comp</button>
          <button class="exp" onclick="event.stopPropagation();exportRaid('${esc(r.date)}')">⬇ Export JSON</button>
          <button class="post" onclick="event.stopPropagation();postRaidToDiscord('${esc(r.date)}')">📣 Post to Discord</button>
          <button class="del" onclick="event.stopPropagation();deleteRaid('${esc(r.date)}')">🗑 Delete this raid</button>
        </div>
      </div>`;
    }
    // standalone run (a lockout with a single run) — full header with size + raid + continuation badge
    function runCard(r, id) {
      const head = editDate === r.date ? editHeadHtml(r)
        : `<div class="head" onclick="document.getElementById('${id}').classList.toggle('open')">
            <span class="date">${esc(r.title || r.date)}</span>
            <span class="szbadge">${raidSize(r)}-man</span>
            ${kindBadge(r)}
            ${RatsData.raidBadge((r.desc || "").replace(/\s*[-–]?\s*continuation\s*$/i, ""))}
            ${contBadge(r)}
            ${metaHtml(r)}
            ${optSwitch(r)}
            <button class="pen" title="Edit title & note" onclick="event.stopPropagation();editTitle('${esc(r.date)}')">✏️</button>
          </div>`;
      return `<div class="raid" id="${id}">${head}${runBodyHtml(r)}</div>`;
    }
    // a run INSIDE a lockout group — size + raid live on the group header, so omit them here
    function subRunCard(r, id) {
      const head = editDate === r.date ? editHeadHtml(r)
        : `<div class="head" onclick="document.getElementById('${id}').classList.toggle('open')">
            <span class="date">${esc(r.title || r.date)}</span>
            ${kindBadge(r)}
            ${metaHtml(r)}
            ${optSwitch(r)}
            <button class="pen" title="Edit title & note" onclick="event.stopPropagation();editTitle('${esc(r.date)}')">✏️</button>
          </div>`;
      return `<div class="raid subraid" id="${id}">${head}${runBodyHtml(r)}</div>`;
    }
    // a lockout with 2+ runs → one group card; expand to see each run; each run expands to its roster
    function groupCard(runs, gid) {
      const ordered = runs.slice().sort((a, b) => (a.date < b.date ? -1 : 1)); // oldest -> newest inside
      const r0 = ordered[0], rN = ordered[ordered.length - 1];
      // UNIQUE raiders across the lockout (don't sum 25+25 — count each person once)
      const uniq = new Set();
      ordered.forEach(r => (r.groups || []).forEach(g => (g.members || []).forEach(m => uniq.add((m.name || "").trim().toLowerCase()))));
      const total = uniq.size;
      const subs = ordered.map((r, j) => subRunCard(r, "run" + gid + "_" + j)).join("");
      const head = `<div class="head" onclick="document.getElementById('grp${gid}').classList.toggle('open')">
        <span class="date">${esc(r0.title || r0.date)} <span style="color:var(--text-dim-2)">→</span> ${esc(rN.title || rN.date)}</span>
        <span class="szbadge">${raidSize(r0)}-man</span>
        ${kindBadge(r0)}
        ${RatsData.raidBadge((r0.desc || "").replace(/\s*[-–]?\s*continuation\s*$/i, ""))}
        <span class="runs-chip" title="Same lockout — ${ordered.length} runs">⛓ ${ordered.length} runs</span>
        <span class="meta">${total} raider${total !== 1 ? "s" : ""}</span>
      </div>`;
      return `<div class="raid grp" id="grp${gid}">${head}<div class="body">${subs}</div></div>`;
    }
    function renderLog() {
      const raids = filteredRaids();
      const el = document.getElementById("log");
      if (!raids.length) { el.innerHTML = '<div class="empty">No raids in this range.</div>'; return; }
      // group by lockout, keeping the (newest-first) order of first appearance
      const order = [], byKey = {};
      raids.forEach(r => { const k = lockoutKey(r); if (!byKey[k]) { byKey[k] = []; order.push(k); } byKey[k].push(r); });
      el.innerHTML = order.map((k, gi) => {
        const runs = byKey[k];
        return runs.length > 1 ? groupCard(runs, gi) : runCard(runs[0], "raid" + gi);
      }).join("");
    }

    function rerender() { renderAttendance(); renderLog(); }

    // build comp-tool-importable JSON (slots format) from a saved raid
    function compJSON(r) {
      const groups = r.groups || [];
      const slots = [];
      groups.forEach((g, gi) => (g.members || []).forEach((m, si) => {
        slots.push({
          name: m.name, className: m.className, specName: m.specName,
          specEmoteId: m.specEmoteId, classEmoteId: m.classEmoteId,
          color: CLASS_COLOR[m.className] || "#ffffff",
          groupNumber: gi + 1, slotNumber: si + 1
        });
      }));
      return {
        title: r.title || r.date,
        date: r.date,
        desc: r.desc || "",
        groupCount: Math.max(5, groups.length),
        groups: groups.map((g, gi) => ({ name: g.name || ("Group " + (gi + 1)), position: gi + 1 })),
        slots,
        noshows: (r.noshows || []).map(m => ({ name: m.name, className: m.className, specName: m.specName, specEmoteId: m.specEmoteId, classEmoteId: m.classEmoteId, color: CLASS_COLOR[m.className] || "#ffffff", vacation: !!m.vacation }))
      };
    }

    // open the Comp tool with this saved raid loaded for editing — Save there overwrites it (same date)
    function editInComp(date) {
      const r = (HIST.raids || []).find(x => x.date === date); if (!r) return;
      const d = r.desc || "";
      const raid = /icc|icecrown/i.test(d) ? "ICC" : /uld/i.test(d) ? "Ulduar" : /to[gc]c?|crusader/i.test(d) ? "ToC"
        : /ony/i.test(d) ? "Ony" : /naxx/i.test(d) ? "Naxx" : /\brs\b|ruby|halion/i.test(d) ? "RS" : "ICC";
      const diff = /\bhm\b|heroic|hard/i.test(d) ? "HM" : "";
      try {
        localStorage.setItem("ratsCompEdit", JSON.stringify({
          json: JSON.stringify(compJSON(r)), date: r.date, size: String(raidSize(r)), raid: raid, diff: diff, optional: !!isLogOnly(r)
        }));
      } catch (e) { msg("❌ Couldn't open the editor (storage blocked).", "#ff6b6b"); return; }
      location.href = "../comp/index.html";
    }

    // rebuild comp-tool-importable JSON (slots format) from a saved raid and download it
    function exportRaid(date) {
      const r = (HIST.raids || []).find(x => x.date === date);
      if (!r) return;
      const out = compJSON(r);
      const a = document.createElement("a");
      a.download = "raid-" + r.date + ".json";
      a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
      a.click();
      msg("✅ Exported raid-" + r.date + ".json — paste it into the Raid Comp tool's Import to reload it.");
    }

    // post a saved raid straight to Discord (same embed as the comp tool, using the webhook from Admin)
    function postRaidToDiscord(date) {
      const url = (localStorage.getItem("ratsWebhook") || "").trim();
      if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/\S+/.test(url)) {
        msg("❌ No Discord webhook set — add it in the Admin console (🛠 Admin → Discord webhook).", "#ff6b6b"); return;
      }
      const r = (HIST.raids || []).find(x => x.date === date); if (!r) return;
      const healSpecs = /Holy|Discipline|Restoration/i, tankSpecs = /Protection|Guardian|_Tank/i;
      const emo = m => { const id = m.specEmoteId || m.classEmoteId; const nm = ((m.specName || m.className || "spec").replace(/[^A-Za-z0-9_]/g, "") || "spec").slice(0, 32); return id ? `<:${nm}:${id}> ` : ""; };
      let tanks = 0, heals = 0, dps = 0, total = 0;
      const fields = (r.groups || []).filter(g => (g.members || []).length).map(g => {
        (g.members || []).forEach(m => { total++; const s = m.specName || ""; if (tankSpecs.test(s)) tanks++; else if (healSpecs.test(s)) heals++; else dps++; });
        return { name: g.name, value: (g.members || []).map(m => emo(m) + "**" + m.name + "**").join("\n") || "—", inline: true };
      });
      const ns = (r.noshows || []);
      if (ns.length) fields.push({ name: "❌ No-shows (" + ns.length + ")", value: ns.map(m => emo(m) + "**" + m.name + "**" + (m.vacation ? " 🏖️" : "")).join("\n"), inline: true });
      while (fields.length % 3 !== 0) fields.push({ name: "​", value: "​", inline: true });
      const embed = {
        author: { name: "RATS • Raid Roster" },
        title: "🐀 " + (r.title || r.date),
        color: 0xC0943A,
        fields,
        footer: { text: total + " raiders   •   " + tanks + " Tank · " + heals + " Healer · " + dps + " DPS   •   FOR THE RATS 🧀" },
        timestamp: new Date((r.date || "") + "T20:00:00").toISOString()
      };
      if (r.desc) embed.description = r.desc;
      msg("⏳ Posting to Discord…", "#8a8d93");
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [embed] }) })
        .then(rr => { if (rr.ok) msg("✅ Posted to Discord!", "#7CFC8A"); else msg("❌ Discord rejected it (HTTP " + rr.status + ").", "#ff6b6b"); })
        .catch(() => msg("❌ Post blocked (CORS / file:// origin). Open the tools via a local server, not file://.", "#ff6b6b"));
    }

    // ---- inline edit of a saved raid's title + note (prompt() is unreliable in the desktop webview) ----
    let editDate = null;
    function editTitle(date) { editDate = date; renderLog(); const el = document.getElementById("te_title"); if (el) { el.focus(); el.select(); } }
    function cancelTitle() { editDate = null; renderLog(); }
    async function saveTitle(date) {
      const r = (HIST.raids || []).find(x => x.date === date);
      if (!r) return;
      const title = (document.getElementById("te_title").value || "").trim();
      const desc = (document.getElementById("te_desc").value || "").trim();
      r.title = title || r.date;
      r.desc = desc;
      editDate = null;
      if (window.RatsData) RatsData.cacheHistory(HIST);
      renderLog();
      const pass = window.RatsData && RatsData.getPass();
      if (!pass) { msg("⚠️ Changed locally — open from the index & enter the guild key to share it.", "#e0b860"); return; }
      msg("⏳ Saving…", "#8a8d93");
      try { const res = await RatsData.saveHistory(HIST, pass); msg(res.mode === "firebase" ? "✅ Title updated & shared." : "✅ Saved — commit history.json via Fork."); }
      catch (e) { msg("❌ Save failed: " + e.message, "#ff6b6b"); }
    }

    async function deleteRaid(date) {
      const r = (HIST.raids || []).find(x => x.date === date);
      if (!r) return;
      const fb = window.RatsData && RatsData.fbOn();
      if (!confirm("Delete the raid \"" + (r.title || date) + "\" from history?" + (fb ? " This deletes it for everyone." : " You'll download an updated history.json to commit."))) return;
      if (!window.RatsData) { msg("❌ Data layer not loaded.", "#ff6b6b"); return; }
      const pass = RatsData.getPass();
      if (!pass) { msg("❌ Locked — open the tools from the index and enter the guild key first.", "#ff6b6b"); return; }
      HIST.raids = HIST.raids.filter(x => x.date !== date);
      msg("⏳ Deleting…", "#8a8d93");
      try {
        const res = await RatsData.saveHistory(HIST, pass);
        rerender();
        msg(res.mode === "firebase" ? "✅ Deleted for everyone." : "✅ Deleted — commit the downloaded history.json via Fork to publish.");
      } catch (e) { msg("❌ Delete failed: " + e.message, "#ff6b6b"); }
    }

    // per-card badge + toggle
    function kindBadge(r) {
      const k = raidKind(r);
      const s = "font-size:10px;font-weight:800;letter-spacing:.4px;border-radius:10px;padding:1px 8px;flex:0 0 auto;border:1px solid";
      if (k === "mando") return `<span style="${s} #6e2e2e;background:#3a1c1c;color:#ff8a8a" title="Mandatory — counts for everyone since they joined">MANDATORY</span>`;
      if (k === "fang") return `<span style="${s} #5a2e5a;background:#2e1f33;color:#e09ad0" title="Fang run — counts for Warchief's Fangs">💀 FANGS</span>`;
      return `<span style="${s} #3a3d44;background:#26282d;color:#9aa0a6" title="Optional — log only, counts for nobody">⚪ OPTIONAL</span>`;
    }
    function optSwitch(r) {
      return `<label class="optsw" onclick="event.stopPropagation()" title="Optional = log only (alt / casual run — doesn't count for attendance)">
        <input type="checkbox" ${isLogOnly(r) ? "checked" : ""} onchange="setOptional('${esc(r.date)}',this.checked)">
        <span class="otrack"><span class="oknob"></span></span><span class="olbl">Optional</span></label>`;
    }
    // toggle a raid to optional/log-only — saves immediately, no edit mode
    async function setOptional(date, on) {
      const r = (HIST.raids || []).find(x => x.date === date);
      if (!r) return;
      r.optional = !!on;
      if (window.RatsData) RatsData.cacheHistory(HIST);
      renderAttendance(); renderLog();
      const pass = window.RatsData && RatsData.getPass();
      if (!pass) { msg("⚠️ Changed locally — open from the index & enter the guild key to share it.", "#e0b860"); return; }
      msg("⏳ Saving…", "#8a8d93");
      try { const res = await RatsData.saveHistory(HIST, pass); msg(res.mode === "firebase" ? "✅ " + (on ? "Marked optional (log-only)." : "Now counts for attendance.") + " Shared." : "✅ Saved — commit history.json via Fork."); }
      catch (e) { msg("❌ Save failed: " + e.message, "#ff6b6b"); }
    }

    async function boot() {
      try { if (window.RatsData) await RatsData.loadRoster({ interactive: false }); } catch (e) {}
      try { HIST = (window.RatsData ? await RatsData.loadHistory({ interactive: false }) : { raids: [] }) || { raids: [] }; }
      catch (e) { HIST = { raids: [] }; }
      if (!Array.isArray(HIST.raids)) HIST = { raids: [] };
      try { VAC = window.RatsData ? await RatsData.loadVacations() : []; } catch (e) { VAC = []; }
      rerender();
    }
    boot();
