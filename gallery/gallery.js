const CATS = [
  { id: "all",            label: "All" },
  { id: "classes",        label: "Classes" },
  { id: "commissions",    label: "Commissions" },
  { id: "lore",           label: "Lore" },
  { id: "warchief-fangs", label: "Fangs" },
  { id: "warchiefs",      label: "Warchiefs" },
  { id: "banners",        label: "Banners" },
  { id: "wallpaper",      label: "Wallpapers" },
  { id: "icons",          label: "Icons" }
];

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const enc = s => encodeURI(String(s == null ? "" : s)); // URL-safe path (handles spaces in filenames)
const grid = document.getElementById("grid");
const tabsEl = document.getElementById("tabs");
let ITEMS = [], view = [], filter = "all", cur = 0;

// --- tabs ---
tabsEl.innerHTML = CATS.map(c => `<div class="tab${c.id === "all" ? " active" : ""}" data-cat="${c.id}">${esc(c.label)}</div>`).join("");
tabsEl.addEventListener("click", e => {
  const t = e.target.closest(".tab"); if (!t) return;
  filter = t.dataset.cat;
  [...tabsEl.children].forEach(x => x.classList.toggle("active", x === t));
  render();
});

const GAP = 14, MINCOL = 220;

function render() {
  view = filter === "all" ? ITEMS : ITEMS.filter(i => i.cat === filter);
  if (!view.length) {
    grid.classList.add("empty-state");
    grid.style.height = "";
    grid.innerHTML = `<div class="empty"><div class="big">🖼🐀</div><p>Nothing here yet — art coming soon.</p></div>`;
    return;
  }
  grid.classList.remove("empty-state");
  grid.innerHTML = view.map((it, i) => `<div class="tile${it.wide ? " wide" : ""}" data-i="${i}">
    <img src="${esc(enc(it.file))}" alt="${esc(it.title)}"
         onerror="this.closest('.tile').style.display='none';window.__relayout&&window.__relayout()" />
    <div class="meta">
      <div class="t">${esc(it.title || "")}</div>
      ${it.caption ? `<div class="c">${esc(it.caption)}</div>` : ""}
    </div>
  </div>`).join("");
  // re-layout as each image learns its size, then settle
  grid.querySelectorAll("img").forEach(img => {
    if (!img.complete) img.addEventListener("load", layout, { once: true });
  });
  layout();
}

function layout() {
  const cards = [...grid.querySelectorAll(".tile")].filter(c => c.style.display !== "none");
  if (!cards.length) return;
  const W = grid.clientWidth;
  const cols = Math.max(1, Math.floor((W + GAP) / (MINCOL + GAP)));
  const colW = (W - GAP * (cols - 1)) / cols;
  const heights = new Array(cols).fill(0);
  for (const card of cards) {
    if (card.classList.contains("wide")) {           // full-row banner
      const top = Math.max(...heights);
      card.style.left = "0px"; card.style.top = top + "px"; card.style.width = W + "px";
      const h = card.offsetHeight;
      heights.fill(top + h + GAP);
    } else {
      card.style.width = colW + "px";
      let c = 0; for (let k = 1; k < cols; k++) if (heights[k] < heights[c]) c = k; // shortest column
      card.style.left = c * (colW + GAP) + "px";
      card.style.top = heights[c] + "px";
      heights[c] += card.offsetHeight + GAP;
    }
  }
  grid.style.height = (Math.max(...heights) - GAP) + "px";
}

window.__relayout = layout;
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(layout, 120); });

grid.addEventListener("click", e => {
  const card = e.target.closest(".tile"); if (!card) return;
  open(+card.dataset.i);
});

// --- lightbox ---
const lb = document.getElementById("lb");
const lbImg = document.getElementById("lbImg"), lbTitle = document.getElementById("lbTitle"),
  lbCap = document.getElementById("lbCap"), lbDl = document.getElementById("lbDl"),
  lbCount = document.getElementById("lbCount");

function open(i) {
  cur = i; const it = view[cur]; if (!it) return;
  lbImg.src = enc(it.file); lbImg.alt = it.title || "";
  lbTitle.textContent = it.title || "";
  lbCap.textContent = it.caption || "";
  lbDl.href = enc(it.file);
  lbDl.setAttribute("download", (it.file.split("/").pop()) || "rats-art");
  lbCount.textContent = `${cur + 1} / ${view.length}`;
  if (!lb.open) lb.showModal();
}
const step = d => open((cur + d + view.length) % view.length);

document.getElementById("lbClose").onclick = () => lb.close();
document.getElementById("lbPrev").onclick = () => step(-1);
document.getElementById("lbNext").onclick = () => step(1);
lb.addEventListener("click", e => { if (e.target === lb) lb.close(); }); // ::backdrop click
document.getElementById("lbStage").addEventListener("click", e => { if (e.target.id === "lbStage") lb.close(); }); // click empty area
document.addEventListener("keydown", e => {
  if (!lb.open) return;
  if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
});

// --- load manifest ---
fetch("../gallery.json", { cache: "no-cache" })
  .then(r => r.ok ? r.json() : [])
  .then(d => { ITEMS = (Array.isArray(d) ? d : []).map(it => ({ ...it, file: "../" + it.file })); render(); })
  .catch(() => { ITEMS = []; render(); });
