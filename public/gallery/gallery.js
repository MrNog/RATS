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

// --- tabs ---
tabsEl.innerHTML = CATS.map(
  (c) => `<div class="tab${c.id === "all" ? " active" : ""}" data-cat="${c.id}">${esc(c.label)}</div>`
).join("");
tabsEl.addEventListener("click", (e) => {
  const t = e.target.closest(".tab");
  if (!t) return;
  filter = t.dataset.cat;
  [...tabsEl.children].forEach((x) => x.classList.toggle("active", x === t));
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

const GAP = 14,
  MINCOL = 220;

function render() {
  // "classes" = generic class-rat art (not real characters) — hidden from "All"; only shows on its own tab.
  view = ITEMS.filter((i) => {
    if (filter === "all") {
      if (i.cat === "classes") return false;
    } else if (i.cat !== filter) return false;
    return matchesQuery(i);
  });
  if (!view.length) {
    grid.classList.add("empty-state");
    grid.style.height = "";
    grid.innerHTML = q
      ? `<div class="empty"><div class="big">🔍🐀</div><p>No art matches "${esc(searchEl.value.trim())}".</p></div>`
      : `<div class="empty"><div class="big">🖼🐀</div><p>Nothing here yet — art coming soon.</p></div>`;
    return;
  }
  grid.classList.remove("empty-state");
  grid.innerHTML = view
    .map(
      (it, i) => `<div class="tile${it.wide ? " wide" : ""}" data-i="${i}">
    <img src="${esc(enc(it.file))}" alt="${esc(it.title)}"
         onerror="this.closest('.tile').style.display='none';window.__relayout&&window.__relayout()" />
    <div class="meta">
      <div class="t">${esc(it.title || "")}</div>
      ${it.caption ? `<div class="c">${esc(it.caption)}</div>` : ""}
    </div>
  </div>`
    )
    .join("");
  // re-layout as each image learns its size, then settle
  grid.querySelectorAll("img").forEach((img) => {
    if (!img.complete) img.addEventListener("load", layout, { once: true });
  });
  layout();
}

function layout() {
  const cards = [...grid.querySelectorAll(".tile")].filter((c) => c.style.display !== "none");
  if (!cards.length) return;
  const W = grid.clientWidth;
  const cols = Math.max(1, Math.floor((W + GAP) / (MINCOL + GAP)));
  const colW = (W - GAP * (cols - 1)) / cols;
  const heights = new Array(cols).fill(0);
  for (const card of cards) {
    if (card.classList.contains("wide")) {
      // wide banner: spans 2 columns (full row if only 1 col)
      const span = Math.min(2, cols);
      // find the starting column of the span whose tallest column is lowest (keeps banners packed)
      let best = 0,
        bestTop = Infinity;
      for (let s = 0; s <= cols - span; s++) {
        const top = Math.max(...heights.slice(s, s + span));
        if (top < bestTop) {
          bestTop = top;
          best = s;
        }
      }
      const w = colW * span + GAP * (span - 1);
      card.style.left = best * (colW + GAP) + "px";
      card.style.top = bestTop + "px";
      card.style.width = w + "px";
      const bottom = bestTop + card.offsetHeight + GAP;
      for (let k = best; k < best + span; k++) heights[k] = bottom; // level the spanned columns
    } else {
      card.style.width = colW + "px";
      let c = 0;
      for (let k = 1; k < cols; k++) if (heights[k] < heights[c]) c = k; // shortest column
      card.style.left = c * (colW + GAP) + "px";
      card.style.top = heights[c] + "px";
      heights[c] += card.offsetHeight + GAP;
    }
  }
  grid.style.height = Math.max(...heights) - GAP + "px";
}

window.__relayout = layout;
let rt;
addEventListener("resize", () => {
  clearTimeout(rt);
  rt = setTimeout(layout, 120);
});

grid.addEventListener("click", (e) => {
  const card = e.target.closest(".tile");
  if (!card) return;
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
    render();
  })
  .catch(() => {
    ITEMS = [];
    render();
  });
