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

function renderList() {
  const [first, ...rest] = TALES;
  document.getElementById("featured").innerHTML = first
    ? `<a class="featured" href="#${encodeURIComponent(first.id)}">
        ${artHtml(first)}
        <div class="copy">
          <span class="chip">Latest tale</span>
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
  // the drop cap goes on the first paragraph that is prose, not the dateline
  const paras = [...document.querySelectorAll("#rBody > p")];
  const opening = paras.find((p, n) => n > 0 && p.textContent.trim().length > 60) || paras[0];
  if (opening) opening.classList.add("opening");

  // newer to the left, older to the right, like turning back through the book
  const newer = TALES[i - 1], older = TALES[i + 1];
  const prev = document.getElementById("rPrev"), next = document.getElementById("rNext");
  prev.href = newer ? "#" + encodeURIComponent(newer.id) : "#";
  prev.innerHTML = navLink(newer, "← Newer");
  next.href = older ? "#" + encodeURIComponent(older.id) : "#";
  next.innerHTML = navLink(older, "Older →");

  document.getElementById("list").hidden = true;
  document.getElementById("reader").hidden = false;
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
  const fromFb = published.map((t) => Object.assign({}, t, { id: "t-" + t.key }));
  TALES = [...committed, ...fromFb]
    .filter((t) => t && t.body)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  status.textContent = TALES.length ? "" : "No tales yet. The Loremaster is sharpening his quill.";
  renderList();
  route();
}

window.addEventListener("hashchange", route);
load();
