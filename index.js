// Set your Discord invite here (e.g. "https://discord.gg/xxxxxx"); the button hides until it's set.
const DISCORD_URL = "https://discord.gg/v7Unzr7tUZ";

(function () {
  var a = document.getElementById("discord");
  if (DISCORD_URL) { a.href = DISCORD_URL; } else { a.style.display = "none"; }
})();
