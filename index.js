// Set your Discord invite here (e.g. "https://discord.gg/xxxxxx"); the button hides until it's set.
const DISCORD_URL = "https://discord.gg/v7Unzr7tUZ";

// ---- FEATURE FLAGS ----------------------------------------------------------------------------
// One switch per not-yet-public feature. Set true to ship it to everyone; false = hidden on the live
// site but still visible in a dev context (a "?dev" URL flag, file://, or localhost) so you can test.
// Each key matches a hub card's data-feature attribute in index.html.
const FEATURES = {
  profile:  false,  // Raider Profile — officer/dev only until profile keys are handed out
  rankings: true,   // Rankings & Hall of Fame — LIVE (wow-logs API integrated)
};
(function () {
  var a = document.getElementById("discord");
  if (DISCORD_URL) { a.href = DISCORD_URL; } else { a.style.display = "none"; }
})();

// Reveal flagged hub cards. A card with [data-feature="x"] shows when:
//   - FEATURES.x is true (shipped to everyone), OR
//   - you're in DEV (running locally: file:// or localhost) AND toggled it on in the dev panel.
// Dev is deliberately LOCAL-ONLY — no URL trigger — so a public visitor can never unhide anything.
// The dev panel (⚙, only rendered in dev) lets you flip each feature without editing this file;
// your choices persist in localStorage.ratsDevFlags. Default in dev: on (so you see everything).
var IS_DEV = location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

function devFlags() {
  try { return JSON.parse(localStorage.getItem("ratsDevFlags") || "{}") || {}; } catch (e) { return {}; }
}
function setDevFlag(key, on) {
  var f = devFlags(); f[key] = on;
  try { localStorage.setItem("ratsDevFlags", JSON.stringify(f)); } catch (e) {}
}
// is this feature visible for the current viewer?
function featureOn(key) {
  if (FEATURES[key]) return true;            // shipped to everyone
  if (!IS_DEV) return false;                 // hidden for the public
  var f = devFlags();                        // dev: honor the toggle (default on)
  return f[key] !== false;
}
function applyFeatureFlags() {
  var cards = document.querySelectorAll("[data-feature]");
  for (var i = 0; i < cards.length; i++) {
    var key = cards[i].getAttribute("data-feature");
    cards[i].hidden = !featureOn(key);
  }
}
applyFeatureFlags();

// ---- dev toggle panel (only in dev) ----
(function devPanel() {
  if (!IS_DEV) return;
  var keys = [].map.call(document.querySelectorAll("[data-feature]"), function (c) { return c.getAttribute("data-feature"); });
  // de-dupe while keeping order
  keys = keys.filter(function (k, i) { return keys.indexOf(k) === i; });
  if (!keys.length) return;

  var box = document.createElement("div");
  box.id = "devPanel";
  box.innerHTML =
    '<div class="dp-hd">⚙ Dev — feature flags <span class="dp-tag">local only</span></div>' +
    keys.map(function (k) {
      var on = featureOn(k);
      return '<label class="dp-row"><input type="checkbox" data-flag="' + k + '"' + (on ? " checked" : "") + '> ' + k + "</label>";
    }).join("") +
    '<div class="dp-note">Visible only on localhost. Toggles persist in this browser.</div>';
  document.body.appendChild(box);

  box.addEventListener("change", function (e) {
    var cb = e.target.closest("input[data-flag]");
    if (!cb) return;
    setDevFlag(cb.getAttribute("data-flag"), cb.checked);
    applyFeatureFlags();
  });
})();
