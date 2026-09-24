// Generate small WebP thumbnails for the gallery grid.
//
// Why: the gallery grid shows images ~220px wide but was downloading the full-res originals
// (up to 41 MB each). This makes a ~THUMB_W-wide WebP copy of each art file into images/_thumb/,
// mirroring the source path. The grid loads the thumb; the lightbox + download still use the
// full original (see gallery.js). Result: the "All" view drops from ~292 MB to a few MB.
//
// Run:  node scripts/thumbs.mjs          (from the repo root or the scripts/ folder)
//   or: npm --prefix scripts run thumbs
// One-time setup:  npm --prefix scripts install
//
// Idempotent: skips a thumb that's already newer than its source, so re-runs are fast.
// The SITE stays dependency-free — this tool + node_modules are local only (gitignored);
// only the produced images/_thumb/**.webp are committed.

import { readdir, stat, mkdir, utimes } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const THUMB_W = 500;       // thumbnail width in px (2x the ~220px grid cell for retina crispness)
const QUALITY = 80;        // WebP quality (visually lossless for this content)
const EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// The hub cards are far wider than a gallery cell (half of an 88vw page on a big screen), so a
// 500px thumb stretched there reads blurry. Hub art also gets a card-size copy in _thumb/hub-lg/,
// which the cards offer through srcset; small screens still take the 500px one.
const CARD_W = 1400;
const HUB_DIR = path.join("images", "hub");
// Hub cards whose art lives in a gallery folder instead of images/hub/ (repo-relative, no ext).
const HUB_EXTRA = new Set([path.join("images", "lore", "Grunho Charge")]);
// The Rankings podium shows a profile banner at full card height (~260px, so ~520px wide):
// the 500px thumb is upscaled there. Banners get a 1000px copy in _thumb/profile-bg-lg/.
const BANNER_W = 1000;
const BANNER_DIR = path.join("images", "profile-bg");

// The large copy for a source, or null when it has none: { out, width }.
function largeFor(rel, thumb) {
  const noExt = rel.slice(0, rel.length - path.extname(rel).length);
  if (path.dirname(rel) === HUB_DIR || HUB_EXTRA.has(noExt)) {
    return { out: path.join(THUMB_DIR, "hub-lg", path.basename(thumb)), width: CARD_W };
  }
  if (rel.startsWith(BANNER_DIR + path.sep)) {
    const sub = path.relative(BANNER_DIR, noExt);
    return { out: path.join(THUMB_DIR, "profile-bg-lg", sub + ".webp"), width: BANNER_W };
  }
  return null;
}

// repo root = parent of this scripts/ folder
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "images");
const THUMB_DIR = path.join(SRC_DIR, "_thumb");

// recursively collect art files under images/, skipping the _thumb output tree
async function collect(dir, out = []) {
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    if (full === THUMB_DIR) continue;              // never recurse into our own output
    const st = await stat(full);
    if (st.isDirectory()) await collect(full, out);
    else if (EXTS.has(path.extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

// thumb path mirrors the source path under images/_thumb/, always .webp
function thumbPathFor(src) {
  const rel = path.relative(SRC_DIR, src);
  const noExt = rel.slice(0, rel.length - path.extname(rel).length);
  return path.join(THUMB_DIR, noExt + ".webp");
}

// does the thumb exist and is it at least as new as the source? (skip work if so)
async function isFresh(src, thumb) {
  if (!existsSync(thumb)) return false;
  const [s, t] = await Promise.all([stat(src), stat(thumb)]);
  return t.mtimeMs >= s.mtimeMs;
}

async function run() {
  if (!existsSync(SRC_DIR)) {
    console.error("No images/ folder found at", SRC_DIR);
    process.exit(1);
  }
  const files = await collect(SRC_DIR);
  let made = 0, skipped = 0, failed = 0, savedBytes = 0;

  for (const src of files) {
    const thumb = thumbPathFor(src);
    const large = largeFor(path.relative(ROOT, src), thumb);
    if (large) {
      try {
        if (!(await isFresh(src, large.out))) {
          await mkdir(path.dirname(large.out), { recursive: true });
          await sharp(src).rotate()
            .resize({ width: large.width, withoutEnlargement: true })
            .webp({ quality: QUALITY })
            .toFile(large.out);
          console.log(`  + ${path.relative(ROOT, large.out).replace(/\\/g, "/")}  (large)`);
        }
      } catch (e) {
        failed++;
        console.warn(`  ! failed: ${path.relative(ROOT, large.out)} — ${e.message}`);
      }
    }
    try {
      if (await isFresh(src, thumb)) { skipped++; continue; }
      await mkdir(path.dirname(thumb), { recursive: true });
      const info = await sharp(src)
        .rotate()                                   // respect EXIF orientation
        .resize({ width: THUMB_W, withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toFile(thumb);
      const srcSize = (await stat(src)).size;
      savedBytes += Math.max(0, srcSize - info.size);
      made++;
      const rel = path.relative(ROOT, thumb).replace(/\\/g, "/");
      console.log(`  + ${rel}  (${(info.size / 1024).toFixed(0)} KB, from ${(srcSize / 1048576).toFixed(1)} MB)`);
    } catch (e) {
      failed++;
      console.warn(`  ! failed: ${path.relative(ROOT, src)} — ${e.message}`);
    }
  }

  console.log(
    `\nThumbnails: ${made} built, ${skipped} up-to-date` +
    (failed ? `, ${failed} failed` : "") +
    `  |  grid download saved ~${(savedBytes / 1048576).toFixed(0)} MB`
  );
}

run().catch((e) => { console.error(e); process.exit(1); });
