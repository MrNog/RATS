/* RATS — raider banner art, shared by every card that shows a raider's picture
   (Rankings podium + Fun & shame, Loot's By player).

   RatsBanner.html(name, cls, className) -> an <img> of the raider's own banner, falling
   back to their class's banner, and removed when neither exists.

   The banners are framed for the profile page (rat on the right, dark left for the name),
   so each one carries a window that holds the rat: images/profile-bg/focus.json, built and
   hand-checked by scripts/banner-focus.py (z = zoom, x/y = where the window sits, 0..1).
   No zoom here: the card always shows the banner's full height, so a head is never cut.
   The banner is only slid sideways until the rat's centre sits in the middle of the
   picture, worked out from the picture's real size, since that changes with the screen. */
(function () {
  "use strict";
  // images/ sits two folders above this script (assets/js/), whatever page loads it
  var ROOT = new URL("../../images/", document.currentScript.src).href;
  var BASE = ROOT + "_thumb/profile-bg/";

  var CLASS_SLUG = {
    "Death Knight": "deathknight", DK: "deathknight", Druid: "druid", Hunter: "hunter",
    Mage: "mage", Paladin: "paladin", Priest: "priest", Rogue: "rogue", Shaman: "shaman",
    Warlock: "warlock", Warrior: "warrior",
  };

  var FOCUS = {};
  function frameAll() {
    document.querySelectorAll("img.rb-art[data-key]").forEach(frame);
  }
  fetch(ROOT + "profile-bg/focus.json")
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (j) { FOCUS = j || {}; frameAll(); })
    .catch(function () {});
  window.addEventListener("resize", frameAll);

  function frame(img) {
    var f = FOCUS[img.dataset.key];
    if (!f || !img.naturalWidth || !img.clientWidth) return;
    var cx = (1 - 1 / f.z) * f.x + 1 / (2 * f.z); // rat centre, as a share of the banner width
    var shown = (img.naturalWidth / img.naturalHeight) * (img.clientHeight / img.clientWidth); // banner width / box width
    var p = shown > 1 ? (cx * shown - 0.5) / (shown - 1) : 0.5;
    img.style.objectPosition = (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + "% 20%";
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // `main` (optional): the player's main. An alt's art sits in the main's folder
  // (profile-bg/<main>/<alt>), so that is tried first, then <name>/<name>, then the class banner.
  function html(name, cls, className, main) {
    var lc = String(name).toLowerCase();
    var mf = main ? String(main).toLowerCase() : lc;
    var src = function (folder) {
      return BASE + encodeURIComponent(folder) + "/" + encodeURIComponent(lc) + ".webp";
    };
    var slug = CLASS_SLUG[cls] || String(cls || "").toLowerCase().replace(/\s+/g, "");
    var chain = [];
    if (mf !== lc) chain.push(src(lc) + "~" + lc + "/" + lc + ".png");
    if (slug) chain.push(BASE + "_class/" + slug + ".webp~");
    // each step: "url~focus key"; the class banner has no window of its own, so its key is empty
    return (
      '<img class="rb-art ' + (className || "") + '" src="' + src(mf) + '" data-key="' + esc(mf + "/" + lc + ".png") +
      '" data-fb="' + esc(chain.join("|")) + '" alt="" loading="lazy" onload="RatsBanner.frame(this)" ' +
      'onerror="RatsBanner.next(this)">'
    );
  }
  function next(img) {
    var c = (img.dataset.fb || "").split("|").filter(Boolean);
    if (!c.length) return img.remove();
    img.dataset.fb = c.slice(1).join("|");
    var step = c[0].split("~");
    img.removeAttribute("style");
    if (step[1]) img.dataset.key = step[1];
    else img.removeAttribute("data-key");
    img.src = step[0];
  }

  window.RatsBanner = { html: html, frame: frame, next: next };
})();
