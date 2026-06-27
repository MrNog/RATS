/* RATS shared data layer — load/save guild data, with optional client-side encryption.
   Reused by all tools so they share one roster (and future shared data).

   Model:
   - roster.json in the repo holds the shared data, fetched on page load.
   - It can be PLAIN ({ roster:[...] }) or ENCRYPTED ({ v:1, enc:true, salt, iv, ct }).
   - Encrypted: AES-GCM, key derived from a guild password via PBKDF2 (all in-browser).
   - The password + the decrypted copy are cached in localStorage, so officers type the
     password once per browser; roster updates (re-encrypted with the SAME password)
     decrypt silently with no re-prompt.
*/
window.RatsData = (function () {
  const PASS_LS = "ratsGuildKey"; // cached guild password
  const DATA_LS = "ratsGuild"; // cached decrypted roster (also what the tools read)

  function getPass() {
    try {
      return localStorage.getItem(PASS_LS) || "";
    } catch (e) {
      return "";
    }
  }
  function setPass(p) {
    try {
      localStorage.setItem(PASS_LS, p);
    } catch (e) {}
  }
  function clearPass() {
    try {
      localStorage.removeItem(PASS_LS);
    } catch (e) {}
  }
  function cached() {
    try {
      return JSON.parse(localStorage.getItem(DATA_LS) || "null");
    } catch (e) {
      return null;
    }
  }
  function cache(obj) {
    try {
      localStorage.setItem(DATA_LS, JSON.stringify(obj));
    } catch (e) {}
  }

  // ---- Firebase Realtime DB: instant shared saves, no commit needed ----
  // Paste your Realtime Database URL here to turn it ON. Empty string = manual download mode.
  // e.g. "https://rats-tools-xxxx-default-rtdb.firebaseio.com"  (see DEV.md → "Firebase")
  const FIREBASE_URL = "https://rats-tools-default-rtdb.europe-west1.firebasedatabase.app";

  function fbOn() {
    return !!FIREBASE_URL;
  }
  function fbUrl(path) {
    return FIREBASE_URL.replace(/\/+$/, "") + "/rats/" + path + ".json";
  }
  async function fbGet(path) {
    try {
      const r = await fetch(fbUrl(path), { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json(); // null if the path is empty
    } catch (e) {
      return null;
    }
  }
  async function fbPut(path, obj) {
    const r = await fetch(fbUrl(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(obj),
    });
    if (!r.ok) throw new Error("Firebase write failed (HTTP " + r.status + ")");
    return true;
  }
  async function fbPost(path, obj) { // append with an auto key -> returns the key
    const r = await fetch(fbUrl(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });
    if (!r.ok) throw new Error("Firebase push failed (HTTP " + r.status + ")");
    const j = await r.json(); return j && j.name;
  }
  async function fbDelete(path) {
    const r = await fetch(fbUrl(path), { method: "DELETE" });
    if (!r.ok) throw new Error("Firebase delete failed (HTTP " + r.status + ")");
    return true;
  }

  // ---- shared VACATIONS (plain, not encrypted) — members self-serve, tools read the same node ----
  async function loadVacations() {
    if (!fbOn()) return [];
    const o = await fbGet("vacations");
    return o ? Object.keys(o).map(k => Object.assign({ key: k }, o[k])) : [];
  }
  function addVacation(entry) { return fbPost("vacations", entry); }
  function updateVacation(key, entry) { return fbPut("vacations/" + key, entry); }
  function removeVacation(key) { return fbDelete("vacations/" + key); }

  // ---- shared MEMBER directory (plain names+class for the public vacation picker) ----
  function publishMembers(list) { return fbOn() ? fbPut("members", list) : Promise.resolve(); }
  async function loadMembers() { return (fbOn() ? await fbGet("members") : null) || []; }

  // download a json file (manual-commit fallback when Firebase is off)
  function download(name, obj) {
    const a = document.createElement("a");
    a.download = name;
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(obj)], { type: "application/json" }),
    );
    a.click();
  }

  // base64 <-> ArrayBuffer
  function ab2b64(buf) {
    let s = "",
      b = new Uint8Array(buf);
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function b642u8(b64) {
    const s = atob(b64),
      u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }

  async function deriveKey(pass, salt) {
    const base = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(pass),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async function encrypt(obj, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pass, salt);
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(obj)),
    );
    return {
      v: 1,
      enc: true,
      salt: ab2b64(salt),
      iv: ab2b64(iv),
      ct: ab2b64(ct),
    };
  }

  async function decrypt(blob, pass) {
    const key = await deriveKey(pass, b642u8(blob.salt));
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b642u8(blob.iv) },
      key,
      b642u8(blob.ct),
    );
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // Load the shared roster. Returns the roster object (or null).
  // opts.interactive (default true): prompt for the password if needed.
  async function loadRoster(opts) {
    opts = opts || {};
    const interactive = opts.interactive !== false;
    const url = opts.url || "roster.json";
    let blob = null;
    if (fbOn()) blob = await fbGet("roster"); // live shared copy
    if (!blob) {
      // Firebase off, or empty/wiped -> restore from the committed backup file
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) blob = await r.json();
      } catch (e) {}
    }

    if (blob && blob.roster) {
      cache(blob);
      return blob;
    } // plain shared file

    if (blob && (blob.enc || blob.ct)) {
      // encrypted shared file
      let pass = getPass();
      for (let tries = 0; tries < 4; tries++) {
        if (!pass) {
          if (!interactive) break;
          pass = window.prompt(
            "🔒 Enter the RATS guild password to unlock the roster:",
          );
          if (pass == null) break;
        }
        try {
          const obj = await decrypt(blob, pass);
          setPass(pass);
          cache(obj);
          return obj;
        } catch (e) {
          clearPass();
          pass = "";
          if (!interactive) break;
          window.alert("Wrong password — try again.");
        }
      }
    }

    return cached(); // offline / file:// / no server file -> last imported copy
  }

  // ---- shared raid history (same model as the roster: encrypted history.json) ----
  const HIST_LS = "ratsHistory"; // cached decrypted history { raids:[...] }
  function cachedHistory() {
    try {
      const h = JSON.parse(localStorage.getItem(HIST_LS) || "null");
      return h && Array.isArray(h.raids) ? h : { raids: [] };
    } catch (e) {
      return { raids: [] };
    }
  }
  function cacheHistory(obj) {
    try {
      localStorage.setItem(HIST_LS, JSON.stringify(obj));
    } catch (e) {}
  }

  // Load the shared raid history. Returns { raids:[...] }.
  // Non-interactive by default — the gate (index) already unlocked the key.
  async function loadHistory(opts) {
    opts = opts || {};
    const interactive = opts.interactive === true;
    const url = opts.url || "history.json";
    let blob = null;
    if (fbOn()) blob = await fbGet("history"); // live shared copy
    if (!blob) {
      // Firebase off, or empty/wiped -> restore from the committed backup file
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) blob = await r.json();
      } catch (e) {}
    }

    if (blob && Array.isArray(blob.raids)) {
      cacheHistory(blob);
      return blob;
    } // plain shared file

    if (blob && (blob.enc || blob.ct)) {
      let pass = getPass();
      for (let tries = 0; tries < (interactive ? 4 : 1); tries++) {
        if (!pass) {
          if (!interactive) break;
          pass = window.prompt("🔒 Enter the RATS guild key to unlock the history:");
          if (pass == null) break;
        }
        try {
          const obj = await decrypt(blob, pass);
          setPass(pass);
          const h = obj && Array.isArray(obj.raids) ? obj : { raids: [] };
          cacheHistory(h);
          return h;
        } catch (e) {
          if (!interactive) break;
          clearPass();
          pass = "";
          window.alert("Wrong key — try again.");
        }
      }
    }

    return cachedHistory(); // offline / no file -> last cached copy
  }

  // Save the history. Firebase (instant, shared) when on; else download for manual commit.
  // Returns { mode: "firebase" | "download" }.
  async function saveHistory(obj, pass) {
    const data = obj && Array.isArray(obj.raids) ? obj : { raids: [] };
    cacheHistory(data);
    const blob = await encrypt(data, pass);
    if (fbOn()) {
      await fbPut("history", blob);
      return { mode: "firebase" };
    }
    download("history.json", blob);
    return { mode: "download" };
  }

  // Save the roster. Firebase (instant, shared) when on; else download for manual commit.
  async function saveRoster(obj, pass) {
    cache(obj);
    const blob = await encrypt(obj, pass);
    if (fbOn()) {
      await fbPut("roster", blob);
      return { mode: "firebase" };
    }
    download("roster.json", blob);
    return { mode: "download" };
  }

  // Backup: download the current encrypted roster.json + history.json (from Firebase
  // when on, else the cached copies) so they can be committed to the repo via Fork.
  // Each commit is an immutable snapshot; if Firebase is ever wiped, loadRoster/loadHistory
  // restore from these committed files automatically.
  async function backup() {
    const done = [];
    let roster = fbOn() ? await fbGet("roster") : null;
    if (!roster && cached()) roster = await encrypt(cached(), getPass());
    if (roster) { download("roster.json", roster); done.push("roster.json"); }
    await new Promise((r) => setTimeout(r, 500)); // stagger so the browser allows both downloads
    let history = fbOn() ? await fbGet("history") : null;
    if (!history && cachedHistory().raids.length) history = await encrypt(cachedHistory(), getPass());
    if (history) { download("history.json", history); done.push("history.json"); }
    return done;
  }

  // Maintainer helper: download an encrypted history.json for committing to the repo.
  async function exportHistory(obj, pass, filename) {
    download(filename || "history.json", await encrypt(obj, pass));
  }

  // Maintainer helper: download an encrypted roster.json for committing to the repo.
  async function exportEncrypted(obj, pass) {
    download("roster.json", await encrypt(obj, pass));
  }

  // ---- access gate: block the page until the guild key is entered ----
  let _unlocked = false;

  function _lockUI(resolve, verify) {
    const ov = document.createElement("div");
    ov.id = "ratsGate";
    ov.style.cssText = "position:fixed;inset:0;z-index:99999;background:#0f1012;display:flex;align-items:center;justify-content:center;font-family:'Segoe UI',Roboto,Arial,sans-serif";
    ov.innerHTML =
      '<div style="background:#1b1d21;border:1px solid #34373d;border-radius:12px;padding:30px 28px;max-width:360px;width:90%;text-align:center;box-shadow:0 16px 50px rgba(0,0,0,.6)">'
      + '<div style="font-size:46px;line-height:1;margin-bottom:8px">🧀🔒</div>'
      + '<div style="color:#fff;font-weight:800;font-size:18px;letter-spacing:.5px">No cheese without a key!</div>'
      + '<div style="color:#8a8d93;font-size:13px;margin:6px 0 16px">Officers only — enter the guild key to access the RATS tools.</div>'
      + '<input id="ratsGatePass" type="password" placeholder="Guild key" autocomplete="current-password" style="width:100%;height:40px;background:#0f1012;color:#fff;border:1px solid #333;border-radius:8px;padding:0 12px;font-size:14px;text-align:center;color-scheme:dark">'
      + '<div id="ratsGateErr" style="color:#ff6b6b;font-size:12px;min-height:16px;margin:8px 0"></div>'
      + '<button id="ratsGateBtn" style="width:100%;height:40px;background:#c0943a;color:#1b1d21;border:0;border-radius:8px;font-weight:800;cursor:pointer;font-size:14px">Unlock 🐀</button>'
      + '</div>';
    document.body.appendChild(ov);
    const inp = ov.querySelector("#ratsGatePass"), err = ov.querySelector("#ratsGateErr"), btn = ov.querySelector("#ratsGateBtn");
    setTimeout(function () { inp.focus(); }, 50);
    async function tryUnlock() {
      const pass = inp.value; if (!pass) return;
      btn.disabled = true; err.style.color = "#8a8d93"; err.textContent = "Checking…";
      try { await verify(pass); ov.remove(); resolve(true); }
      catch (e) { err.style.color = "#ff6b6b"; err.textContent = "Wrong key — try again."; btn.disabled = false; inp.select(); }
    }
    btn.onclick = tryUnlock;
    inp.onkeydown = function (e) { if (e.key === "Enter") tryUnlock(); };
  }

  // Resolves true once unlocked. Verified by decrypting an encrypted check file.
  // Checks gate.json first (lock token — arms the lock without needing a roster), then roster.json.
  // If neither encrypted file exists (pre-setup / local file://), it lets you through.
  async function gate(opts) {
    opts = opts || {};
    if (_unlocked) return true;
    let blob = null;
    const checks = opts.checks || ["gate.json", "roster.json"];
    for (let i = 0; i < checks.length; i++) {
      try { const r = await fetch(checks[i], { cache: "no-store" }); if (r.ok) { const j = await r.json(); if (j && (j.enc || j.ct)) { blob = j; break; } } } catch (e) { }
    }
    if (!blob) { _unlocked = true; return true; }
    const verify = async function (pass) { const obj = await decrypt(blob, pass); if (obj && obj.roster) cache(obj); setPass(pass); _unlocked = true; return true; };
    const cp = getPass();
    if (cp) { try { await verify(cp); return true; } catch (e) { clearPass(); } }
    return new Promise(function (res) { _lockUI(res, verify); });
  }

  // ---- Discord-name -> in-game name aliases ----
  // Raid-Helper gives Discord nicks that sometimes don't match the in-game roster name.
  // Map them here ONCE (Discord nick -> in-game character name); from there the roster's
  // own alt->main note resolves the rest. Keys are matched loosely (case/space/[tags] ignored).
  // Add a line per raider that shows up as "Unranked / Pug":   "discordnick": "IngameName",
  const NAME_ALIASES = {
    "kobe": "Kobee",        // Discord "Kobe" -> in-game "Kobee"
    "mojo": "Mojobimbo",    // Discord "Mojo" -> one of his toons; roster alt->main does the rest
    "foug": "Fouug",        // Discord "Foug" -> in-game "Fouug" (Hunter)
    // add more Discord-nick -> in-game pairs here as needed:
    // "shockaa": "Shockaa",
  };
  function _normAlias(s) {
    return (s || "").toLowerCase().replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "")
      .split(/[\/|,]/)[0].replace(/[^a-z0-9]/g, "").trim();
  }
  function aliasFor(name) { return NAME_ALIASES[_normAlias(name)] || null; }

  return {
    aliasFor,
    loadVacations, addVacation, updateVacation, removeVacation,
    publishMembers, loadMembers,
    loadRoster,
    loadHistory,
    cachedHistory,
    cacheHistory,
    saveHistory,
    saveRoster,
    exportHistory,
    backup,
    fbOn,
    encrypt,
    decrypt,
    exportEncrypted,
    getPass,
    setPass,
    clearPass,
    cached,
    gate,
  };
})();
