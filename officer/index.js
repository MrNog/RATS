if (window.RatsData) RatsData.gate();

// A line of live state on two cards, read from what this browser already cached (no network).
(function () {
  const U = window.RatsUtils;
  const show = (id, html) => {
    const el = document.getElementById(id);
    if (el && html) {
      el.innerHTML = html;
      el.hidden = false;
    }
  };
  const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

  try {
    const g = JSON.parse(localStorage.getItem("ratsGuild") || "null");
    if (g && Array.isArray(g.roster) && g.roster.length) {
      const when = g.exportedAt ? " · imported " + U.fmtDate(isoDay(g.exportedAt * 1000)) : "";
      show("metaRoster", `<b>${g.roster.length}</b> characters${when}`);
    }
  } catch (e) {}

  const raids = window.RatsData ? RatsData.cachedHistory().raids : [];
  const dates = raids.map((r) => r.date).filter(Boolean).sort();
  if (dates.length) {
    show(
      "metaHistory",
      `<b>${raids.length}</b> raid${raids.length !== 1 ? "s" : ""} saved · last ${U.esc(U.fmtDate(dates[dates.length - 1]))}`
    );
  }
})();
