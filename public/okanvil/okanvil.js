// Officers only until launch: the same guild-key gate the officer tools use.
// Delete this line (and the data.js include in index.html) to go public.
if (window.RatsData) RatsData.gate();

// Okanvil landing page: click a screenshot to see it full size; click again or
// press Esc to close.
(function () {
  var box = null;

  function close() {
    if (box) { box.remove(); box = null; }
  }

  document.addEventListener("click", function (e) {
    if (box && e.target.closest(".lb")) { close(); return; }
    var fig = e.target.closest(".shot");
    if (!fig) return;
    var img = fig.querySelector("img");
    box = document.createElement("div");
    box.className = "lb";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", img.alt);
    var big = document.createElement("img");
    big.src = img.src;
    big.alt = img.alt;
    box.appendChild(big);
    document.body.appendChild(box);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });
})();
