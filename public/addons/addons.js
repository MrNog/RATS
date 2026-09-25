// dl = direct "always latest" download; gh = source page. Edit freely.
const ADDONS = [
  {
    name: "Okanvil",
    emoji: "⚒️",
    ours: true, // the guild's own — gets the big card with art
    art: "../../images/_thumb/hub/okanvil.webp",
    desc: "Our own: raid notes, loot council, invites, logs. /okanvil",
    dl: "https://github.com/MrNog/Okanvil/releases/latest/download/Okanvil.zip",
    gh: "https://github.com/MrNog/Okanvil",
  },
  {
    name: "WeakAuras",
    emoji: "✨",
    desc: "Custom alerts and trackers. The guild's tier packs below run on it.",
    dl: "https://github.com/NoM0Re/WeakAuras-WotLK/archive/refs/heads/master.zip",
    gh: "https://github.com/NoM0Re/WeakAuras-WotLK",
  },
  {
    name: "Deadly Boss Mods (DBM)",
    emoji: "💀",
    desc: "Boss timers and warnings for every fight, Warmane build.",
    dl: "https://github.com/Zidras/DBM-Warmane/archive/refs/heads/main.zip",
    gh: "https://github.com/Zidras/DBM-Warmane",
  },
  {
    name: "RCLootCouncil",
    hidden: true, // Okanvil's loot council replaces it
    emoji: "🎲",
    desc: "Loot council voting and distribution, Warmane 3.3.5 build.",
    dl: "https://github.com/MrNog/RCLlootCouncil---WARMANE---3.3.5/archive/refs/heads/main.zip",
    gh: "https://github.com/MrNog/RCLlootCouncil---WARMANE---3.3.5",
  },
  {
    name: "PallyPower (Improved)",
    emoji: "🛡️",
    paladin: true,
    desc: "Blessing assignments, so every paladin knows which buff is theirs.",
    dl: "https://github.com/NoM0Re/PallyPower-Improved-3.3.5/archive/refs/heads/main.zip",
    gh: "https://github.com/NoM0Re/PallyPower-Improved-3.3.5",
  },
];

// Optional / fun addons — separate group below the mandatory list.
// Set `hidden: true` to keep an addon out of the public list while it's still
// being tested. The entry stays here (URLs, description) so publishing it again
// is a one-line change: drop the flag.
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
// Each card shows its own art (images/hub/wa-t7.png …, prompts in docs/art/hub/wa-tiers.md);
// until that exists it falls back to `art`, the raid's banner, and with neither it stays dark.
const WA_PACKS = [
  { name: "T7 Pack", tier: "T7", raid: "Naxxramas · Obsidian Sanctum · Eye of Eternity", url: "https://wago.io/Dic_mszCj" },
  { name: "T8 Pack", tier: "T8", raid: "Ulduar", url: "https://wago.io/wIeM-Q6Qh", art: "Ulduar 25" },
  { name: "T9 Pack", tier: "T9", raid: "Trial of the Crusader", url: "https://wago.io/ZGexKRmOL", art: "ToC 25" },
  { name: "T10 Pack", tier: "T10", raid: "Icecrown Citadel", url: "https://wago.io/OQP0SKedt", art: "ICC 25", hot: true },
];
const bannerThumb = (name) => "../../images/_thumb/banners/" + encodeURIComponent(name) + ".webp";
const tierArt = (tier) => "../../images/_thumb/hub/wa-" + tier.toLowerCase() + ".webp";
// a tier image that fails to load tries the banner next, then gives up and hides
function tierArtFallback(img) {
  const next = img.dataset.fallback;
  img.dataset.fallback = "";
  if (next) img.src = next;
  else img.remove();
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

function renderList(arr) {
  return arr
    .filter((a) => !a.hidden) // addons still in testing never reach the public list
    .map((a) => {
      const repo = repoOf(a) || "";
      // .item + data-repo + .new are what the update check finds; the rest is layout
      return `<div class="item${a.ours ? " ours" : ""}" data-repo="${esc(repo)}">
    ${a.art ? `<div class="a-art"><img src="${a.art}" alt="" loading="lazy"></div>` : ""}
    <div class="a-main">
      <div class="a-top">
        <span class="ic">${a.emoji || ""}</span>
        <div class="a-id">
          <span class="nm">${esc(a.name)}</span>
          <span class="badges">
            ${a.ours ? '<span class="tag ours">Ours</span>' : ""}
            ${a.paladin ? '<span class="tag">Paladins only</span>' : ""}
            <span class="new" style="display:none">⬆ UPDATE</span>
          </span>
        </div>
      </div>
      <p class="desc">${esc(a.desc)}</p>
      <span class="acts">
        <a class="primary" href="${a.dl}" onclick="markSeen(this)">⬇ Download (latest)</a>
        <a href="${a.gh}" target="_blank" rel="noopener">Source ↗</a>
      </span>
    </div>
  </div>`;
    })
    .join("");
}

// ---- "new version" badge: ask GitHub for the latest version, badge until you Download ----
window.__latest = {};
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
    if (a.hidden) continue; // not rendered -> no row to badge, no API call to spend
    const repo = repoOf(a);
    if (!repo) continue;
    const info = await latestVersion(a);
    if (!info) continue;
    window.__latest[repo] = info.ver;
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
}

// A download that is a file on this site, not a GitHub addon: same card, no update check.
// `desc` is trusted HTML (it carries <code> paths).
function fileCard(f) {
  return `<div class="item">
    <div class="a-main">
      <div class="a-top">
        <span class="ic">${f.emoji}</span>
        <div class="a-id">
          <span class="nm">${esc(f.name)}</span>
          ${f.sub ? `<span class="badges"><span class="tag plain">${esc(f.sub)}</span></span>` : ""}
        </div>
      </div>
      <p class="desc">${f.desc}</p>
      <span class="acts"><a class="primary" href="${f.href}" download>⬇ ${esc(f.label)}</a></span>
    </div>
  </div>`;
}

document.getElementById("list").innerHTML = renderList(ADDONS);
document.getElementById("listOptional").innerHTML =
  renderList(OPTIONAL) +
  fileCard({
    emoji: "🧲",
    name: "client-HD.torrent",
    sub: "Full client",
    desc: "The HD 3.3.5a client via torrent. Open it with a torrent client (qBittorrent, etc.).",
    href: "../../downloads/client-HD.torrent",
    label: "Download torrent",
  });
document.getElementById("listPatch").innerHTML =
  fileCard({
    emoji: "🧩",
    name: "patch-y.mpq",
    sub: "Normal client",
    desc: "Drop it in <code>World of Warcraft\\Data\\</code> and restart.",
    href: "../../downloads/patch-y.mpq",
    label: "Download (27 MB)",
  }) +
  fileCard({
    emoji: "🧩",
    name: "patch-y-hd.mpq",
    sub: "HD client",
    desc: "Rename to <code>patch-y.mpq</code> (drop the <code>-hd</code>), put it in <code>Data\\</code>, restart.",
    href: "../../downloads/patch-y-hd.mpq",
    label: "Download (29 MB)",
  });
// tier cards: the raid's banner behind the tier number
document.getElementById("listWA").innerHTML = WA_PACKS.map(
  (w) => `<a class="tier${w.hot ? " hot" : ""}" href="${w.url}" target="_blank" rel="noopener">
    <img src="${tierArt(w.tier)}" data-fallback="${w.art ? bannerThumb(w.art) : ""}" alt="" loading="lazy"
      onerror="tierArtFallback(this)">
    <span class="t-in">
      ${w.hot ? '<span class="pill-hot">Current</span>' : ""}
      <b>${esc(w.tier)}</b>
      <span class="t-raid">${esc(w.raid)}</span>
      <span class="t-go">Import on wago ↗</span>
    </span>
  </a>`
).join("");

checkUpdates(); // flag addons with a newer version on GitHub
