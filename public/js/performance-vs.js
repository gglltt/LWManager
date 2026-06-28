(() => {
  const i18n = window.PERF_I18N || {};
  const pad = (n) => String(n).padStart(2, "0");
  function isoWeekRange(year, week) {
    year = Number(year); week = Number(week);
    if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) return null;
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - day + 1 + ((week - 1) * 7));
    const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
    const fmt = (d) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    return `${i18n.weekPeriod || "Week period"}: ${fmt(monday)} - ${fmt(sunday)}`;
  }
  function refreshWeekRange(root = document) {
    const y = root.querySelector("[data-week-year]");
    const w = root.querySelector("[data-week-number]");
    const out = root.querySelector("[data-week-range]");
    if (!y || !w || !out) return;
    out.textContent = isoWeekRange(y.value, w.value) || "";
  }
  document.querySelectorAll("[data-week-year],[data-week-number]").forEach((el) => el.addEventListener("input", () => refreshWeekRange(document)));
  refreshWeekRange(document);

  const rowsEl = document.querySelector("[data-rows]");
  if (!rowsEl) return;

  function reindexRows() {
    rowsEl.querySelectorAll("[data-row]").forEach((row, index) => {
      row.querySelector("[data-row-id-name]").name = `rows[${index}][rowId]`;
      row.querySelector("[data-player-id]").name = `rows[${index}][playerId]`;
      row.querySelector("[data-position-name]").name = `rows[${index}][position]`;
      row.querySelector("[data-score-name]").name = `rows[${index}][score]`;
    });
  }
  function makeRow() {
    const row = document.createElement("div");
    row.className = "perfRow"; row.dataset.row = "";
    row.innerHTML = `<input type="hidden" value="" data-row-id-name><input type="hidden" value="" data-player-id><div class="field autocomplete"><label>Player</label><input type="text" autocomplete="off" required data-player-search><div class="autocompleteMenu" data-player-results></div></div><div class="field"><label>Position</label><input type="number" min="1" max="1000" required data-position-name></div><div class="field"><label>Score</label><input type="number" min="1" max="999999999" required data-score-name></div><button type="button" class="button danger" data-remove-row>×</button>`;
    rowsEl.appendChild(row); attachAutocomplete(row); reindexRows();
  }
  document.querySelector("[data-add-row]")?.addEventListener("click", makeRow);
  rowsEl.addEventListener("click", (e) => {
    if (!e.target.closest("[data-remove-row]")) return;
    if (confirm(i18n.confirmDelete || "Confirm delete?")) e.target.closest("[data-row]").remove();
    reindexRows();
  });

  function attachAutocomplete(row) {
    const input = row.querySelector("[data-player-search]");
    const hidden = row.querySelector("[data-player-id]");
    const menu = row.querySelector("[data-player-results]");
    let timer;
    input.addEventListener("input", () => {
      hidden.value = ""; clearTimeout(timer);
      const q = input.value.trim();
      if (!q) { menu.innerHTML = ""; return; }
      timer = setTimeout(async () => {
        const res = await fetch(`/performance-vs/players/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        menu.innerHTML = (data.players || []).map((p) => `<button type="button" data-id="${p.id}" data-name="${p.nickname.replace(/"/g, '&quot;')}">${p.nickname}</button>`).join("");
      }, 180);
    });
    menu.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-id]");
      if (!btn) return;
      hidden.value = btn.dataset.id; input.value = btn.dataset.name; menu.innerHTML = "";
    });
  }
  rowsEl.querySelectorAll("[data-row]").forEach(attachAutocomplete);
  document.querySelector("[data-performance-form]")?.addEventListener("submit", (e) => {
    reindexRows();
    const invalid = [...rowsEl.querySelectorAll("[data-row]")].some((row) => !row.querySelector("[data-player-id]").value);
    if (invalid) { e.preventDefault(); alert(i18n.selectPlayer || "Select a valid player"); }
  });
})();
