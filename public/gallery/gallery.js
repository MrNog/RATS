const CATS = [
  { id: "all", label: "All" },
  { id: "classes", label: "Classes" },
  { id: "commissions", label: "Commissions" },
  { id: "lore", label: "Lore" },
  { id: "warchief-fangs", label: "Fangs" },
  { id: "warchiefs", label: "Warchiefs" },
  { id: "banners", label: "Banners" },
  { id: "profile-bg", label: "Hero Banners" },
  { id: "wallpaper", label: "Wallpapers" },
  { id: "icons", label: "Icons" },
];

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const enc = (s) => encodeURI(String(s == null ? "" : s)); // URL-safe path (handles spaces in filenames)

// grid thumbnail path for an item: images/<cat>/<name>.ext -> images/_thumb/<cat>/<name>.webp
// (built by scripts/thumbs.mjs). The lightbox + download still use the full original (it.file).
// If a thumb is missing (new art not yet processed), onerror in the template falls back to the original.
const thumbFor = (file) => String(file || "").replace(/\/images\//, "/images/_thumb/").replace(/\.[a-z0-9]+$/i, ".webp");

const grid = document.getElementById("grid");
const tabsEl = document.getElementById("tabs");
const searchEl = document.getElementById("search");
const searchClear = document.getElementById("searchClear");
let ITEMS = [],
  view = [],
  filter = "all",
  q = "",
  cur = 0;

// normalize for matching: lowercase, strip anything but a-z0-9 so "Val'anyr" ~ "valanyr"
const norm = (s) =>
  String(s == null ? "" : s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
// searchable part of a file path: drop the "../../" prefix, the leading "images/" folder, and the
// extension — otherwise the literal "images" makes "mage" match every item (mage in iMAGEs).
const fileHay = (f) =>
  norm(
    String(f || "")
      .replace(/^(\.\.\/)+/, "")
      .replace(/^images\//i, "")
      .replace(/\.[a-z0-9]+$/i, "")
  );

// alt -> main map: profile-bg art is grouped as profile-bg/<main>/<toon>.png, so every toon in a
// <main>/ folder belongs to that player. Built from the manifest so "okanata" (an alt) also finds
// Okanor's art everywhere (Warchief shot, commissions, wallpaper). Populated by buildAltMap().
let ALT2MAIN = {};
function buildAltMap(items) {
  ALT2MAIN = {};
  for (const it of items) {
    const m = /profile-bg\/([^/]+)\/([^/]+)\.[a-z0-9]+$/i.exec(String(it.file || ""));
    if (!m) continue;
    const main = norm(m[1]).replace(/ /g, ""),
      toon = norm(m[2]).replace(/ /g, "");
    if (toon && main && toon !== main) ALT2MAIN[toon] = main; // record the alt's player
  }
}
// expand a query token to also include the player's main when the token is a known alt.
function expandToken(tok) {
  const t = tok.replace(/ /g, "");
  return ALT2MAIN[t] ? [tok, ALT2MAIN[t]] : [tok];
}

// does an item match the current query? searches title + caption + cleaned filename + the hand-tagged
// "people" list (who's in the art — makes group shots findable by every member). An alt name also
// matches its player's art via ALT2MAIN, so each query word matches if the word OR the player's main
// appears in that haystack.
function matchesQuery(it) {
  if (!q) return true;
  const hay = norm(it.title) + " " + norm(it.caption) + " " + fileHay(it.file) + " " + norm(it.people);
  return q.split(" ").every((tok) => expandToken(tok).some((alias) => hay.includes(alias)));
}

// --- tabs (buttons so they're keyboard-focusable & operable) ---
tabsEl.innerHTML = CATS.map(
  (c) =>
    `<button type="button" class="tab${c.id === "all" ? " active" : ""}" data-cat="${c.id}"${c.id === "all" ? ' aria-pressed="true"' : ' aria-pressed="false"'}>${esc(c.label)}</button>`
).join("");
tabsEl.addEventListener("click", (e) => {
  const t = e.target.closest(".tab");
  if (!t) return;
  filter = t.dataset.cat;
  [...tabsEl.children].forEach((x) => {
    const on = x === t;
    x.classList.toggle("active", on);
    x.setAttribute("aria-pressed", on ? "true" : "false");
  });
  render();
});

// --- search ---
searchEl.addEventListener("input", () => {
  q = norm(searchEl.value);
  searchClear.hidden = !searchEl.value;
  render();
});
searchClear.addEventListener("click", () => {
  searchEl.value = "";
  q = "";
  searchClear.hidden = true;
  searchEl.focus();
  render();
});
// Esc clears the search (only when the lightbox isn't open, so Esc there still closes it)
searchEl.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && searchEl.value) {
    e.stopPropagation();
    searchEl.value = "";
    q = "";
    searchClear.hidden = true;
    render();
  }
});

// how much art each tab holds, and the total in the header. "All" leaves out the generic
// class art, same as the grid does.
const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.id, c.label]));
function showCounts() {
  const n = {};
  const art = ITEMS.filter(isArt);
  art.forEach((i) => (n[i.cat] = (n[i.cat] || 0) + 1));
  const all = art.filter((i) => i.cat !== "classes").length;
  [...tabsEl.children].forEach((t) => {
    const c = t.dataset.cat === "all" ? all : n[t.dataset.cat] || 0;
    t.innerHTML = esc(CAT_LABEL[t.dataset.cat]) + `<i class="tn">${c}</i>`;
  });
  const total = document.getElementById("gtotal");
  if (total) total.innerHTML = `<b>${all}</b> pieces of guild art`;
}

// images/icons/ also holds the bots' and tools' avatars (the Discord webhooks, the hub's own tools)
// and the guild's emblems (Guild RATS 1/2/ICC/ToC/Ulduar). Neither is guild art: the gallery's
// Icons are the players' own.
const NOT_ART = /\/icons\/(ratlogs|ratroster|ratloremaster|rankings rat|okanor-logs|vacation rat|guild rats[^/]*)\.[a-z0-9]+$/i;
const isArt = (i) => !NOT_ART.test(i.file);

// "All" is a spotlight + one shelf per category, in this order. "classes" = generic class-rat
// art (not real characters): it only shows on its own tab.
const SHELVES = ["lore", "warchiefs", "profile-bg", "warchief-fangs", "commissions", "banners", "wallpaper", "icons"];
// the spotlight cycles through the newest big story pieces. The page's band is already Grunho
// Charge, so that one stays on its shelf instead of showing twice at the top.
const SPOT_CATS = ["lore", "warchiefs", "wallpaper"];
const SPOT_MAX = 8;
const BAND_ART = /\/lore\/grunho charge\./i;
let spot = [],
  spotI = 0;

const byNewest = (a, b) => String(b.date || "").localeCompare(String(a.date || ""));

function tileHtml(it, i) {
  return `<div class="tile${it.cat === "icons" ? " sq" : ""}" data-i="${i}" role="button" tabindex="0"
       aria-label="View ${esc(it.title || "art")}">
    <img src="${esc(enc(thumbFor(it.file)))}" data-full="${esc(enc(it.file))}" alt="${esc(it.title)}"
         loading="lazy" decoding="async"
         onerror="if(this.src!==this.dataset.full){this.src=this.dataset.full;}else{this.closest('.tile').remove();}" />
    ${q && CAT_LABEL[it.cat] ? `<span class="tcat">${esc(CAT_LABEL[it.cat])}</span>` : ""}
    <div class="meta">
      <div class="t">${esc(it.title || "")}</div>
      ${it.caption ? `<div class="c">${esc(it.caption)}</div>` : ""}
    </div>
  </div>`;
}

function emptyHtml() {
  return q
    ? `<div class="empty"><div class="big">🔍🐀</div><p>No art matches "${esc(searchEl.value.trim())}".</p></div>`
    : `<div class="empty"><div class="big">🖼🐀</div><p>Nothing here yet — art coming soon.</p></div>`;
}

function spotHtml() {
  const it = spot[spotI];
  if (!it) return "";
  const i = view.indexOf(it);
  const dots = spot
    .map((_, k) => `<button class="spot-dot${k === spotI ? " on" : ""}" data-spot="${k}" aria-label="Piece ${k + 1}"></button>`)
    .join("");
  return `<section class="spot" style="--thumb:url('${esc(enc(thumbFor(it.file)))}')">
    <img class="spot-img" src="${esc(enc(it.file))}" alt="${esc(it.title)}" decoding="async" />
    <div class="spot-txt">
      <span class="spot-cat">★ ${esc(CAT_LABEL[it.cat] || "")}</span>
      <h2 class="spot-t">${esc(it.title || "")}</h2>
      ${it.caption ? `<p class="spot-c">${esc(it.caption)}</p>` : ""}
      <div class="spot-acts">
        <button type="button" class="spot-view" data-i="${i}">View full size</button>
        <a class="btn" href="${esc(enc(it.file))}" download="${esc(it.file.split("/").pop())}">⬇ Download</a>
      </div>
    </div>
    <button type="button" class="spot-nav prev" data-step="-1" aria-label="Previous piece">‹</button>
    <button type="button" class="spot-nav next" data-step="1" aria-label="Next piece">›</button>
    <div class="spot-dots">${dots}</div>
  </section>`;
}

function render() {
  const art = ITEMS.filter(isArt);
  // one tidy grid: a single category, or a search across everything
  if (filter !== "all" || q) {
    view = art.filter((i) => (filter === "all" ? i.cat !== "classes" : i.cat === filter) && matchesQuery(i));
    grid.className = "grid ugrid" + (filter === "icons" ? " sq" : "");
    grid.innerHTML = view.length ? view.map(tileHtml).join("") : emptyHtml();
    return;
  }
  // All: the spotlight, then a shelf per category. `view` is every piece in page order, so the
  // lightbox arrows walk the page the way it reads.
  view = [];
  const shelves = SHELVES.map((cat) => {
    const items = art.filter((i) => i.cat === cat).sort(byNewest);
    if (!items.length) return "";
    const start = view.length;
    view.push(...items);
    return `<section class="shelf" data-cat="${cat}">
      <div class="sh-hd">
        <h2>${esc(CAT_LABEL[cat])}</h2><i class="tn">${items.length}</i>
        <button type="button" class="sh-all" data-cat="${cat}">See all ›</button>
      </div>
      <div class="sh-wrap">
        <button type="button" class="sh-nav prev" aria-label="Scroll left">‹</button>
        <div class="sh-row${cat === "icons" ? " sq" : ""}">${items.map((it, k) => tileHtml(it, start + k)).join("")}</div>
        <button type="button" class="sh-nav next" aria-label="Scroll right">›</button>
      </div>
    </section>`;
  }).join("");
  spot = art
    .filter((i) => SPOT_CATS.includes(i.cat) && !BAND_ART.test(i.file))
    .sort(byNewest)
    .slice(0, SPOT_MAX);
  if (spotI >= spot.length) spotI = 0;
  grid.className = "grid shelves";
  grid.innerHTML = view.length ? spotHtml() + shelves : emptyHtml();
}

function setFilter(cat) {
  filter = cat;
  [...tabsEl.children].forEach((x) => {
    const on = x.dataset.cat === cat;
    x.classList.toggle("active", on);
    x.setAttribute("aria-pressed", on ? "true" : "false");
  });
  render();
  scrollTo({ top: tabsEl.getBoundingClientRect().top + scrollY - 90, behavior: "smooth" });
}

grid.addEventListener("click", (e) => {
  const t = e.target;
  const all = t.closest(".sh-all");
  if (all) return setFilter(all.dataset.cat);
  const nav = t.closest(".sh-nav");
  if (nav) {
    const row = nav.parentNode.querySelector(".sh-row");
    row.scrollBy({ left: (nav.classList.contains("prev") ? -1 : 1) * row.clientWidth * 0.85, behavior: "smooth" });
    return;
  }
  const sn = t.closest(".spot-nav, .spot-dot");
  if (sn) {
    spotI = sn.dataset.spot != null ? +sn.dataset.spot : (spotI + +sn.dataset.step + spot.length) % spot.length;
    const old = grid.querySelector(".spot");
    if (old) old.outerHTML = spotHtml();
    return;
  }
  const v = t.closest(".spot-view");
  if (v) return open(+v.dataset.i);
  const card = t.closest(".tile");
  if (card) open(+card.dataset.i);
});
// keyboard: tiles are role=button + tabindex, so Enter/Space open the lightbox too
grid.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const card = e.target.closest(".tile");
  if (!card) return;
  e.preventDefault();
  open(+card.dataset.i);
});

// --- lightbox ---
const lb = document.getElementById("lb");
const lbImg = document.getElementById("lbImg"),
  lbTitle = document.getElementById("lbTitle"),
  lbCap = document.getElementById("lbCap"),
  lbDl = document.getElementById("lbDl"),
  lbCount = document.getElementById("lbCount");

function open(i) {
  cur = i;
  const it = view[cur];
  if (!it) return;
  lbImg.src = enc(it.file);
  lbImg.alt = it.title || "";
  lbTitle.textContent = it.title || "";
  lbCap.textContent = it.caption || "";
  lbDl.href = enc(it.file);
  lbDl.setAttribute("download", it.file.split("/").pop() || "rats-art");
  lbCount.textContent = `${cur + 1} / ${view.length}`;
  if (!lb.open) lb.showModal();
}
const step = (d) => open((cur + d + view.length) % view.length);

document.getElementById("lbClose").onclick = () => lb.close();
document.getElementById("lbPrev").onclick = () => step(-1);
document.getElementById("lbNext").onclick = () => step(1);
lb.addEventListener("click", (e) => {
  if (e.target === lb) lb.close();
}); // ::backdrop click
document.getElementById("lbStage").addEventListener("click", (e) => {
  if (e.target.id === "lbStage") lb.close();
}); // click empty area
document.addEventListener("keydown", (e) => {
  if (!lb.open) return;
  if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
});

// --- load manifest ---
fetch("../../gallery.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : []))
  .then((d) => {
    ITEMS = (Array.isArray(d) ? d : []).map((it) => ({ ...it, file: "../../" + it.file }));
    buildAltMap(ITEMS);
    showCounts();
    render();
  })
  .catch(() => {
    ITEMS = [];
    render();
  });
