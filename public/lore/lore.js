// Chronicles of the Sewer — the guild's tales on the site.
// Two sources, merged: the chronicles committed in chronicles.json (built from
// docs/art/chronicles/ by scripts/build-chronicles.py) and the tales officers publish from the
// Lore tool, in the Firebase `lore` node (read once per visit, TTL cache in RatsData.loadLore).
// A tale opens in the reader at #<id>, so every tale has a link that can be shared.

const esc = RatsMD.esc;
const fmtDate = (s) => (s ? RatsUtils.fmtDate(s) : "");
const NEW_DAYS = 14; // a tale this young gets a NEW mark on the list

let TALES = [];

// Repo paths in the data are relative to the site root; this page sits two folders down.
function artUrl(p) {
  return p ? "../../" + p.split("/").map(encodeURIComponent).join("/") : "";
}

// The list's teaser: the first real paragraph of the tale (not the dateline, not a heading),
// stripped of markup and cut at a word.
function teaser(body, max) {
  const blocks = RatsMD.emojify(String(body || ""))
    .replace(/<@[&!]?\d+>/g, "")
    .replace(/@(everyone|here)\b/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b && !/^#/.test(b) && !/^\*[^*].*\*$/.test(b) && b.replace(/[*_]/g, "").length > 60);
  const t = (blocks[0] || "").replace(/[*_~`>#]/g, "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, t.lastIndexOf(" ", max)) + "…";
}

// A Discord post opens with its own "# heading", which the reader already shows as the page
// title: drop that heading when it names the same tale, so the title is not printed twice.
function bare(s) {
  return RatsMD.emojify(String(s || ""))
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function withoutTitle(body, title) {
  const m = String(body || "").match(/^((?:\s*[^\n#][^\n]*\n)*?)\s*#{1,3}\s+([^\n]+)\n?/);
  if (!m) return body;
  const head = bare(m[2]), name = bare(title);
  if (!head || !(name.includes(head) || head.includes(name))) return body;
  return body.replace(m[0], m[1] + "\n");
}

function isNew(t) {
  return t.date && Date.now() - new Date(t.date).getTime() < NEW_DAYS * 864e5;
}

function artHtml(t) {
  return t.image
    ? `<div class="art"><img src="${artUrl(t.image)}" alt="" loading="lazy"></div>`
    : '<div class="art"><span class="rat">🐀</span></div>';
}

// A special tale carries a label ("Kingslayer") and heads the page whatever its date.
function specialLabel(t) {
  return t.special ? "👑 Special chronicle" + (t.special.label ? " · " + t.special.label : "") : "";
}

function renderList() {
  const [first, ...rest] = TALES;
  document.getElementById("featured").innerHTML = first
    ? `<a class="featured${first.special ? " is-special" : ""}" href="#${encodeURIComponent(first.id)}">
        ${artHtml(first)}
        <div class="copy">
          <span class="chip">${esc(specialLabel(first) || "Latest tale")}</span>
          <h2>${esc(first.title)}</h2>
          <span class="date">${esc(fmtDate(first.date))}</span>
          <p class="teaser">${esc(teaser(first.body, 260))}</p>
          <span class="read">Read the tale</span>
        </div>
      </a>`
    : "";
  document.getElementById("grid").innerHTML = rest
    .map(
      (t) => `<a class="tale" href="#${encodeURIComponent(t.id)}">
        ${artHtml(t)}
        <div class="t-body">
          <span class="date">${esc(fmtDate(t.date))}${isNew(t) ? '<span class="new">New</span>' : ""}</span>
          <h3>${esc(t.title)}</h3>
          <p class="teaser">${esc(teaser(t.body, 150))}</p>
          <span class="read">Read</span>
        </div>
      </a>`
    )
    .join("");
}

// Pictures inside the tale: each follows the paragraph that holds its "after" phrase, or closes the
// tale when there is none (or the phrase is not found).
function placeExtraArt(box, images) {
  for (const im of images || []) {
    if (!im || !im.src) continue;
    const fig = document.createElement("figure");
    fig.className = "inline-art";
    fig.innerHTML = `<img src="${artUrl(im.src)}" alt="" loading="lazy">` +
      (im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : "");
    const phrase = String(im.after || "").toLowerCase();
    const anchor = phrase && [...box.querySelectorAll(":scope > p")].find((p) => p.textContent.toLowerCase().includes(phrase));
    if (anchor) anchor.after(fig);
    else box.append(fig);
  }
}

// The roll at the end of a special tale: the raiders it belongs to, each on their profile banner.
// It stands in for the post's own line of names, so the paragraph naming most of them goes.
function renderRoll(t, box) {
  const el = document.getElementById("rRoll");
  const roll = (t.special && t.special.roll) || [];
  el.hidden = !roll.length;
  if (roll.length) {
    const names = roll.map((n) => String(n).toLowerCase());
    const line = [...box.querySelectorAll(":scope > p")].find((p) => {
      const text = p.textContent.toLowerCase();
      return names.filter((n) => text.includes(n)).length > names.length / 2;
    });
    if (line) line.remove();
  }
  el.innerHTML = roll.length
    ? `<h2>${esc(t.special.rollTitle || "The raiders")}</h2>
       ${t.special.rollSub ? `<p class="roll-sub">${esc(t.special.rollSub)}</p>` : ""}
       <div class="roll-grid">${roll
         .map((n) => {
           const k = String(n).toLowerCase();
           const bg = artUrl(`images/_thumb/profile-bg/${k}/${k}.webp`);
           return `<div class="roll-card" style="background-image:url('${bg}')"><span>${esc(n)}</span></div>`;
         })
         .join("")}</div>`
    : "";
}

// ---- officer: send a tale to Discord ----
// Posts through the lore webhook saved in this browser by the Admin console, with the tale's art
// attached. Committed tales carry `discord` (the post with its pings); Lore-tool tales only have
// the site body, so they go out with names instead of pings.
const WH_RE = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/\S+/;
const LORE_HOOK_RE = /loremaster|lore|stor|tale|chronicle|legend/i;

function loreHook() {
  let hooks = [];
  try {
    hooks = JSON.parse(localStorage.getItem("ratsWebhooks") || "[]") || [];
  } catch (e) {}
  return hooks.find((h) => h && LORE_HOOK_RE.test(h.name) && WH_RE.test(h.url)) || null;
}

function postMsg(t, c) {
  const e = document.getElementById("rMsg");
  e.style.color = c || "#7CFC8A";
  e.textContent = t || "";
}

async function postTale(t) {
  const hook = loreHook();
  if (!hook) return postMsg("❌ No lore webhook in this browser. Add one named “LoreMaster” in the Admin console.", "#ff6b6b");
  const content = RatsMD.emojify(t.discord || t.body);
  if (content.length > 2000) return postMsg("❌ Too long for Discord (" + content.length + " / 2000).", "#ff6b6b");
  if (!confirm("Post “" + t.title + "” to Discord (" + hook.name + ")? It pings everyone it mentions.")) return;

  const btn = document.getElementById("rPost");
  btn.disabled = true;
  postMsg("⏳ Posting…", "#9aa0a6");
  try {
    const fd = new FormData();
    fd.append("payload_json", JSON.stringify({ content, allowed_mentions: { parse: ["users", "roles", "everyone"] } }));
    if (t.image) {
      const img = await fetch(artUrl(t.image));
      if (img.ok) fd.append("files[0]", await img.blob(), t.image.split("/").pop());
    }
    const r = await fetch(hook.url, { method: "POST", body: fd });
    if (r.ok) postMsg("✅ Posted to “" + hook.name + "”.");
    else postMsg("❌ Discord rejected it (HTTP " + r.status + ").", "#ff6b6b");
  } catch (e) {
    postMsg("❌ Post blocked (" + e.message + "). Works on the hosted https site.", "#ff6b6b");
  }
  btn.disabled = false;
}

function navLink(t, label) {
  return t ? `${label}<b>${esc(t.title)}</b>` : "";
}

function openTale(id) {
  const i = TALES.findIndex((t) => t.id === id);
  if (i < 0) return showList();
  const t = TALES[i];
  document.getElementById("rArt").innerHTML = t.image ? `<img src="${artUrl(t.image)}" alt="">` : "";
  document.getElementById("rDate").textContent = fmtDate(t.date);
  document.getElementById("rTitle").textContent = t.title;
  document.getElementById("rBody").innerHTML = RatsMD.render(withoutTitle(t.body, t.title));
  placeExtraArt(document.getElementById("rBody"), t.images);
  const special = document.getElementById("rSpecial");
  special.hidden = !t.special;
  special.textContent = specialLabel(t);
  renderRoll(t, document.getElementById("rBody"));
  const post = document.getElementById("rPost");
  post.hidden = !RatsData.isOfficer();
  post.disabled = false;
  post.onclick = () => postTale(t);
  postMsg("");
  // newer to the left, older to the right, like turning back through the book
  const newer = TALES[i - 1], older = TALES[i + 1];
  const prev = document.getElementById("rPrev"), next = document.getElementById("rNext");
  prev.href = newer ? "#" + encodeURIComponent(newer.id) : "#";
  prev.innerHTML = navLink(newer, "← Newer");
  next.href = older ? "#" + encodeURIComponent(older.id) : "#";
  next.innerHTML = navLink(older, "Older →");

  document.getElementById("list").hidden = true;
  document.getElementById("reader").hidden = false;

  // the drop cap goes on the first paragraph that is prose, not the dateline. It needs at least two
  // lines beside it: a one-line opening takes in the next paragraph (measured now the reader is shown).
  const paras = [...document.querySelectorAll("#rBody > p")];
  const opening = paras.find((p, n) => n > 0 && p.textContent.trim().length > 60) || paras[0];
  if (opening) {
    const lh = parseFloat(getComputedStyle(opening).lineHeight) || 30;
    const next = opening.nextElementSibling;
    if (opening.offsetHeight < lh * 1.5 && next && next.tagName === "P") {
      opening.append(" ", ...next.childNodes);
      next.remove();
    }
    opening.classList.add("opening");
  }

  document.title = "RATS — " + t.title;
  window.scrollTo(0, 0);
}

function showList() {
  document.getElementById("reader").hidden = true;
  document.getElementById("list").hidden = false;
  document.title = "RATS — Chronicles of the Sewer";
}

function route() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id) openTale(id);
  else showList();
}

async function load() {
  const status = document.getElementById("status");
  const [committed, published] = await Promise.all([
    fetch("chronicles.json")
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
    RatsData.loadLore().catch(() => []),
  ]);
  // A tale sent from the Lore tool and later committed exists in both; the committed copy wins.
  // Titles are compared as plain words (the tool's title keeps the heading's emoji).
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const have = new Set(committed.map((t) => norm(t.title)));
  const fromFb = published
    .filter((t) => !have.has(norm(t.title)))
    .map((t) => Object.assign({}, t, { id: "t-" + t.key }));
  TALES = [...committed, ...fromFb]
    .filter((t) => t && t.body)
    .sort((a, b) => (b.special ? 1 : 0) - (a.special ? 1 : 0) || String(b.date || "").localeCompare(String(a.date || "")));
  status.textContent = TALES.length ? "" : "No tales yet. The Loremaster is sharpening his quill.";
  renderList();
  route();
}

window.addEventListener("hashchange", route);
load();
