// RATS — the shared sticky bar, drawn in one place for every made-over page.
// A page puts an empty <header class="site-bar" data-root="../.." data-page="loot"></header>
// at the top of <body> and loads this script. data-root is the path back to the site root
// (links stay relative, so the site works on file://, a local server and GitHub Pages);
// data-page marks the current link; data-area="officer" switches to the officer tools.
(function () {
  const DISCORD_URL = "https://discord.gg/v7Unzr7tUZ"; // the button hides when this is empty

  const PUBLIC = [
    ["addons", "Addons", "public/addons/index.html"],
    ["rankings", "Rankings", "public/rankings/index.html"],
    ["loot", "Loot", "public/loot/index.html"],
    ["lore", "Chronicles", "public/lore/index.html"],
    ["gallery", "Gallery", "public/gallery/index.html"],
    ["vacations", "Vacations", "public/vacations/index.html"],
    ["profile", "Profile", "public/profile/index.html"],
  ];
  const OFFICER = [
    ["tools", "Tools", "officer/index.html"],
    ["guild", "Guild", "officer/guild/index.html"],
    ["comp", "Comp", "officer/comp/index.html"],
    ["history", "Attendance", "officer/history/index.html"],
    ["loot-prio", "Loot Prio", "public/loot/index.html?tab=priority"],
    ["lore-post", "Lore", "officer/lore/index.html"],
    ["admin", "Admin", "officer/admin/index.html"],
  ];

  const SVG = {
    discord:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"/><path d="M14 12a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"/><path d="M15.5 17c0 1 1.5 3 2 3c1.5 0 2.833 -1.667 3.5 -3c.667 -1.667 .5 -5.833 -1.5 -11.5c-1.457 -1.015 -3 -1.34 -4.5 -1.5l-.972 1.923a11.913 11.913 0 0 0 -4.053 0l-.975 -1.923c-1.5 .16 -3.043 .485 -4.5 1.5c-2 5.667 -2.167 9.833 -1.5 11.5c.667 1.333 2 3 3.5 3c.5 0 2 -2 2 -3"/><path d="M7 16.5c3.5 1 6.5 1 10 0"/></svg>',
    key:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>',
    menu:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  };

  const bar = document.querySelector("header.site-bar");
  if (!bar) return;
  const root = (bar.dataset.root || ".").replace(/\/+$/, "");
  const url = (p) => root + "/" + p;
  const officer = bar.dataset.area === "officer";
  const current = bar.dataset.page || "";

  // officers only: the guild key this browser was unlocked with is what marks an officer
  let isOfficer = false;
  try {
    isOfficer = window.RatsData && RatsData.isOfficer ? RatsData.isOfficer() : !!localStorage.getItem("ratsGuildKey");
  } catch (e) {}

  const links =
    (officer ? OFFICER : PUBLIC)
      .map(([key, label, path]) => {
        const cur = key === current ? ' aria-current="page"' : "";
        return `<a href="${url(path)}"${cur}>${label}</a>`;
      })
      .join("") +
    (!officer && isOfficer ? `<a class="sb-officer" href="${url("officer/index.html")}">${SVG.key}Officers</a>` : "");

  bar.innerHTML =
    '<div class="sb-in">' +
    `<a class="sb-logo" href="${url("index.html")}" aria-label="RATS guild hub">` +
    // the site mark (docs/art/hub/site-icon.md); the old guild icon until it exists
    `<img src="${url("images/_thumb/hub/logo.webp")}" alt=""` +
    ` onerror="this.onerror=null;this.src='${url("images/_thumb/icons/Guild RATS 2.webp")}'"><b>RATS</b></a>` +
    (officer ? `<a class="sb-crumb" href="${url("officer/index.html")}">Officer</a>` : "") +
    `<button class="sb-menu" type="button" aria-label="Menu" aria-expanded="false">${SVG.menu}</button>` +
    `<nav class="sb-nav" aria-label="Pages">${links}</nav>` +
    (DISCORD_URL
      ? `<a class="sb-discord" href="${DISCORD_URL}" target="_blank" rel="noopener" title="Join our Discord">${SVG.discord}Discord</a>`
      : "") +
    "</div>";

  const btn = bar.querySelector(".sb-menu");
  btn.addEventListener("click", () => {
    const open = bar.classList.toggle("open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
})();
