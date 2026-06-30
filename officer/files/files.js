// Each entry: a folder with files. `file` is the path in the repo (relative to this page).
// Add new files by appending to a folder's `files` array.
const FILES = [
  {
    folder: "Loot & Sheets", emoji: "📊",
    files: [
      { name: "WOTLK Phase 3 — Loot Prio Sheet", file: "files/WOTLK Phase 3 Loot Prio Sheet.xlsx",
        type: "XLSX", size: "2.3 MB", date: "2026-06",
        // `open`: optional Google Sheets / Drive link — "Open" goes here (the live editable sheet).
        // Download still serves the .xlsx copy from the repo. Paste your share link below:
        open: "https://drive.google.com/drive/folders/1ZSwHcTLGL7cEK7kKNBdOTV0F2PklTYf5",
        desc: "Loot priority spreadsheet for Phase 3 (ICC). The master copy — keep it here." }
    ]
  }
];

function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function enc(s) { return encodeURI(String(s == null ? "" : s)); } // handle spaces in filenames
function icoFor(f) {
  const ext = (f.type || (f.file.split(".").pop() || "")).toLowerCase();
  if (/xls/.test(ext)) return "📗";
  if (/docx?|odt/.test(ext)) return "📘";
  if (/pdf/.test(ext)) return "📕";
  if (/csv|txt|json/.test(ext)) return "📄";
  if (/zip|rar|7z/.test(ext)) return "🗜️";
  if (/png|jpe?g|gif|webp/.test(ext)) return "🖼️";
  return "📄";
}

function render() {
  const tree = document.getElementById("tree");
  if (!FILES.length || !FILES.some(f => f.files && f.files.length)) {
    tree.innerHTML = '<div class="empty">No files yet.</div>'; return;
  }
  tree.innerHTML = FILES.map((folder, fi) => {
    const files = folder.files || [];
    const rows = files.map(f => {
      const meta = [f.type, f.size, f.date].filter(Boolean).join(" · ");
      const dl = enc(f.file);                                   // direct download (relative, spaces handled)
      const ext = (f.file.split(".").pop() || "").toLowerCase();
      const viewable = /^(xlsx?|csv|docx?|pptx?|pdf)$/.test(ext); // office/pdf -> Google viewer
      const absUrl = new URL(f.file, location.href).href;        // public URL Google can fetch
      // Prefer an explicit Google/Drive link; else Google viewer for office/pdf; else just open the file.
      const openHref = f.open ? f.open
        : (viewable ? "https://docs.google.com/viewer?url=" + encodeURIComponent(absUrl) : dl);
      const openLabel = (f.open || viewable) ? "Open in Google ↗" : "Open ↗";
      return `<div class="ftree">
        <span class="dico">${icoFor(f)}</span>
        <div class="dinfo">
          <div><span class="dnm">${esc(f.name)}</span>${meta ? `<span class="dmeta">${esc(meta)}</span>` : ""}</div>
          ${f.desc ? `<div class="ddesc">${esc(f.desc)}</div>` : ""}
        </div>
        <div class="acts">
          <a class="primary" href="${dl}" download>⬇ Download</a>
          <a href="${openHref}" target="_blank" rel="noopener">${openLabel}</a>
        </div>
      </div>`;
    }).join("");
    return `<div class="folder">
      <div class="ftoggle" onclick="toggleFolder(${fi})">
        <span class="arw" id="arw${fi}">▾</span>
        <span class="fico">${esc(folder.emoji || "📂")}</span>
        <span class="fnm">${esc(folder.folder)}</span>
        <span class="fcount">${files.length} file${files.length === 1 ? "" : "s"}</span>
      </div>
      <div class="files" id="files${fi}">${rows || '<div class="empty">Empty.</div>'}</div>
    </div>`;
  }).join("");
}
function toggleFolder(i) {
  const collapsed = document.getElementById("files" + i).classList.toggle("collapsed");
  const arw = document.getElementById("arw" + i);
  if (arw) arw.style.transform = collapsed ? "rotate(-90deg)" : "";
}
render();

if (window.RatsData) RatsData.gate();
