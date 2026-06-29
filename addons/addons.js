// dl = direct "always latest" download; gh = source page. Edit freely.
const ADDONS = [
  {
    name: "WeakAuras",
    emoji: "✨",
    desc: "Shared raid auras.",
    dl: "https://github.com/NoM0Re/WeakAuras-WotLK/archive/refs/heads/master.zip",
    gh: "https://github.com/NoM0Re/WeakAuras-WotLK",
  },
  {
    name: "Deadly Boss Mods (DBM)",
    emoji: "💀",
    desc: "Boss timers & warnings.",
    dl: "https://github.com/Zidras/DBM-Warmane/archive/refs/heads/main.zip",
    gh: "https://github.com/Zidras/DBM-Warmane",
  },
  {
    name: "RCLootCouncil",
    emoji: "🎲",
    desc: "Loot distribution.",
    dl: "https://github.com/MrNog/RCLlootCouncil---WARMANE---3.3.5/archive/refs/heads/main.zip",
    gh: "https://github.com/MrNog/RCLlootCouncil---WARMANE---3.3.5",
  },
  {
    name: "PallyPower (Improved)",
    emoji: "🛡️",
    paladin: true,
    desc: "Blessing assignments.",
    dl: "https://github.com/NoM0Re/PallyPower-Improved-3.3.5/archive/refs/heads/main.zip",
    gh: "https://github.com/NoM0Re/PallyPower-Improved-3.3.5",
  },
];

// Optional / fun addons — separate group below the mandatory list.
const OPTIONAL = [
  {
    name: "Rats-Redeemer",
    emoji: "⚰️",
    desc: "Battle-res flavour lines. /redeemer",
    dl: "https://github.com/MrNog/Rats-Redeemer/releases/latest/download/Rats-Redeemer.zip",
    gh: "https://github.com/MrNog/Rats-Redeemer",
  },
];

// WeakAura tier packs — imported in-game from wago.io (not downloaded).
const WA_PACKS = [
  { name: "T7 Pack", raid: "Naxxramas · Obsidian Sanctum · Eye of Eternity", url: "https://wago.io/Dic_mszCj" },
  { name: "T8 Pack", raid: "Ulduar", url: "https://wago.io/wIeM-Q6Qh" },
  { name: "T9 Pack", raid: "Trial of the Crusader", url: "https://wago.io/ZGexKRmOL" },
  { name: "T10 Pack", raid: "Icecrown Citadel", url: "https://wago.io/OQP0SKedt" },
];

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

function renderList(arr) {
  return arr
    .map((a) => {
      const repo = repoOf(a) || "";
      return `<div class="item" data-repo="${esc(repo)}">
    <span class="ic">${a.emoji || ""}</span>
    <span class="nm">${esc(a.name)}</span>
    ${a.paladin ? '<span class="tag">Paladins only</span>' : ""}
    <span class="new" style="display:none">⬆ UPDATE</span>
    <span class="desc">${esc(a.desc)}</span>
    <span class="acts">
      <a class="primary" href="${a.dl}" onclick="markSeen(this)">⬇ Download (latest)</a>
      <a href="${a.gh}" target="_blank" rel="noopener">Source ↗</a>
    </span>
  </div>`;
    })
    .join("");
}

// ---- "new version" badge: ask GitHub for the latest version, badge until you Download ----
window.__latest = {};
window.__kind = {};
const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:";
const HUB_URL = "https://mrnog.github.io/rats/addons/";
function repoOf(a) {
  const m = /github\.com\/([^/]+\/[^/]+?)(?:\.git|\/|$)/.exec(a.gh || "");
  return m ? m[1] : null;
}
function branchOf(a) {
  const m = /\/heads\/([^/.]+)/.exec(a.dl || "");
  return m ? m[1] : null;
}
function seenMap() {
  try {
    return JSON.parse(localStorage.getItem("ratsAddonSeen") || "{}");
  } catch (e) {
    return {};
  }
}
function setSeen(repo, ver) {
  const m = seenMap();
  m[repo] = ver;
  try {
    localStorage.setItem("ratsAddonSeen", JSON.stringify(m));
  } catch (e) {}
}
function markSeen(a) {
  // called on Download click — clears the badge for that addon
  const item = a.closest(".item");
  if (!item) return;
  const repo = item.dataset.repo;
  if (repo) setSeen(repo, window.__latest[repo] || "seen");
  const b = item.querySelector(".new");
  if (b) b.style.display = "none";
  item.classList.remove("has-update");
}
async function gh(url) {
  try {
    const r = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    return r.ok ? await r.json() : null;
  } catch (e) {
    return null;
  }
}
async function latestVersion(a) {
  const repo = repoOf(a);
  if (!repo) return null;
  const rel = await gh("https://api.github.com/repos/" + repo + "/releases/latest");
  if (rel && rel.tag_name) return { ver: rel.tag_name, kind: "release" }; // release-based
  const br = branchOf(a) || "master"; // branch-zip -> latest commit
  const c = await gh("https://api.github.com/repos/" + repo + "/commits/" + br);
  return c && c.sha ? { ver: c.sha.slice(0, 7), kind: "commit" } : null;
}
async function checkUpdates() {
  const seen = seenMap();
  for (const a of [...ADDONS, ...OPTIONAL]) {
    const repo = repoOf(a);
    if (!repo) continue;
    const info = await latestVersion(a);
    if (!info) continue;
    window.__latest[repo] = info.ver;
    window.__kind[repo] = info.kind;
    if (seen[repo] !== info.ver) {
      // you haven't downloaded this version yet
      const item = document.querySelector('.item[data-repo="' + repo + '"]');
      if (item) {
        const b = item.querySelector(".new");
        if (b) b.style.display = "";
        item.classList.add("has-update");
      }
    }
  }
  renderAlertPreview();
}

// ---- admin/dev preview: the exact #okanor-logs card the GitHub Action posts on an update ----
function buildAddonEmbed(a, ver, kind) {
  return {
    author: { name: "RATS • Addon updates" },
    title: "📦 " + a.name + " — new update",
    url: HUB_URL,
    description:
      "New " + kind + " `" + ver + "` is out for **" + a.name + "**.\n🔗 [Open the RATS hub →](" + HUB_URL + ")",
    color: 0xc19a3a,
    footer: { text: repoOf(a) || "" },
  };
}
function renderEmbedCard(embed) {
  const hex = "#" + (embed.color || 0).toString(16).padStart(6, "0");
  const md = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(
        /`([^`]+)`/g,
        '<span style="background:#1e1f22;border-radius:3px;padding:0 4px;font-family:monospace">$1</span>'
      )
      .replace(
        /\[(.+?)\]\((https?:[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener" style="color:#00a8fc">$1</a>'
      )
      .replace(/\n/g, "<br>");
  return `<div style="border-left:4px solid ${hex};background:#2b2d31;border-radius:4px;padding:11px 15px;max-width:440px;font-family:'gg sans','Segoe UI',sans-serif;text-align:left">
    <div style="font-size:12px;font-weight:600;color:#fff;margin-bottom:6px">${esc(embed.author.name)}</div>
    <div style="font-size:16px;font-weight:700;color:#00a8fc;margin-bottom:8px">${esc(embed.title)}</div>
    <div style="font-size:14px;color:#dbdee1;line-height:1.5">${md(embed.description)}</div>
    <div style="font-size:12px;color:#949ba4;margin-top:10px">${esc(embed.footer.text)}</div>
  </div>`;
}
function renderAlertPreview() {
  const box = document.getElementById("alertPreview");
  if (!box || !DEV) return;
  // external mandatory addons only (the ones the Action actually watches)
  const ext = ADDONS.filter((a) => {
    const r = repoOf(a);
    return r && !/^MrNog\//i.test(r);
  });
  box.innerHTML =
    '<div class="sec"><h2>🧪 Dev · #okanor-logs alert preview</h2></div>' +
    '<p class="sechint">Only visible on localhost — exactly the card the notifier posts when an external addon updates.</p>' +
    '<div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:center;margin-top:8px">' +
    ext
      .map((a) => {
        const r = repoOf(a);
        return renderEmbedCard(buildAddonEmbed(a, window.__latest[r] || "a1b2c3d", window.__kind[r] || "commit"));
      })
      .join("") +
    "</div>";
}

document.getElementById("list").innerHTML = renderList(ADDONS);
document.getElementById("listOptional").innerHTML = renderList(OPTIONAL);
document.getElementById("listPatch").innerHTML = `<div class="item">
  <span class="ic">🧩</span>
  <span class="nm">patch-y.mpq</span>
  <span class="desc">Optional visual patch (non-HD). Drop it in <code>World of Warcraft\\Data\\</code> and restart.</span>
  <span class="acts">
    <a class="primary" href="../downloads/patch-y.mpq" download>⬇ Download (27 MB)</a>
  </span>
</div>`;
document.getElementById("listWA").innerHTML = WA_PACKS.map(
  (w) => `<div class="item">
  <span class="ic">✨</span>
  <span class="nm">${esc(w.name)}</span>
  <span class="desc">${esc(w.raid)}</span>
  <span class="acts">
    <a class="primary" href="${w.url}" target="_blank" rel="noopener">Import ↗</a>
  </span>
</div>`
).join("");

checkUpdates(); // flag addons with a newer version on GitHub
