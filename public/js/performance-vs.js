(() => {
  const i18n = window.PERF_I18N || {};
  const pad = (n) => String(n).padStart(2, "0");
  const rowsEl = document.querySelector("[data-rows]");
  const emptyRowsEl = document.querySelector("[data-empty-rows]");
  const loadMessageEl = document.querySelector("[data-load-message]");
  const loadErrorEl = document.querySelector("[data-load-error]");
  const addRowButton = document.querySelector("[data-add-row]");
  const deleteEventForm = document.querySelector("[data-delete-event-form]");
  let loadTimer;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }
  function isoWeekRange(year, week) {
    year = Number(year); week = Number(week);
    if (!Number.isInteger(year) || !/^\d{4}$/.test(String(year)) || !Number.isInteger(week) || week < 1 || week > 53) return null;
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - day + 1 + ((week - 1) * 7));
    const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
    const fmt = (d) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    return `${fmt(monday)} - ${fmt(sunday)}`;
  }
  function refreshWeekRange(root = document) {
    const y = root.querySelector("[data-week-year]");
    const w = root.querySelector("[data-week-number]");
    const out = root.querySelector("[data-week-range]");
    if (!y || !w || !out) return;
    out.textContent = isoWeekRange(y.value, w.value) || "";
  }
  function showAlert(el, text) {
    if (!el) return;
    el.textContent = text || "";
    el.hidden = !text;
  }
  function reindexRows() {
    if (!rowsEl) return;
    rowsEl.querySelectorAll("[data-row]").forEach((row, index) => {
      row.querySelector("[data-row-id-name]").name = `rows[${index}][rowId]`;
      row.querySelector("[data-player-id]").name = `rows[${index}][playerId]`;
      row.querySelector("[data-position-name]").name = `rows[${index}][position]`;
      row.querySelector("[data-score-name]").name = `rows[${index}][score]`;
    });
    if (emptyRowsEl) emptyRowsEl.hidden = rowsEl.querySelectorAll("[data-row]").length > 0;
    updateAddRowState();
  }
  function hasEmptyDraftRow() {
    if (!rowsEl) return false;
    return [...rowsEl.querySelectorAll("[data-row]")].some((row) => {
      if (row.dataset.savedRow === "1") return false;
      return !row.querySelector("[data-player-id]").value && !row.querySelector("[data-position-name]").value && !row.querySelector("[data-score-name]").value;
    });
  }
  function updateAddRowState() {
    if (addRowButton) addRowButton.disabled = hasEmptyDraftRow();
  }
  function rowTemplate(row = {}) {
    const rowId = row._id || "";
    const player = row.playerId || {};
    const playerId = player._id || row.playerId || "";
    const nickname = player.nickname || "";
    const savedAttr = rowId ? ' data-saved-row="1"' : "";
    return `<div class="perfRow" data-row${savedAttr}>
      <input type="hidden" value="${escapeHtml(rowId)}" data-row-id-name>
      <input type="hidden" value="${escapeHtml(playerId)}" data-player-id>
      <div class="field autocomplete"><label>${escapeHtml(i18n.player || "Player")}</label><input type="text" value="${escapeHtml(nickname)}" autocomplete="off" required data-player-search><div class="autocompleteMenu" data-player-results></div></div>
      <div class="field"><label>${escapeHtml(i18n.position || "Position")}</label><input type="number" min="1" max="1000" required value="${escapeHtml(row.position || "")}" data-position-name></div>
      <div class="field"><label>${escapeHtml(i18n.score || "Score")}</label><input type="number" min="1" max="999999999" required value="${escapeHtml(row.score || "")}" data-score-name></div>
      <button type="button" class="button danger" data-remove-row>${escapeHtml(i18n.delete || "Delete")}</button>
    </div>`;
  }
  function attachAutocomplete(row) {
    const input = row.querySelector("[data-player-search]");
    const hidden = row.querySelector("[data-player-id]");
    const menu = row.querySelector("[data-player-results]");
    let timer;
    input.addEventListener("input", () => {
      hidden.value = ""; clearTimeout(timer); updateAddRowState();
      const q = input.value.trim();
      if (!q) { menu.innerHTML = ""; return; }
      timer = setTimeout(async () => {
        const res = await fetch(`/performance-vs/players/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        menu.innerHTML = (data.players || []).map((p) => `<button type="button" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.nickname)}">${escapeHtml(p.nickname)}</button>`).join("");
      }, 180);
    });
    ["input", "change"].forEach((eventName) => row.querySelectorAll("input").forEach((el) => el.addEventListener(eventName, updateAddRowState)));
    menu.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-id]");
      if (!btn) return;
      hidden.value = btn.dataset.id; input.value = btn.dataset.name; menu.innerHTML = ""; updateAddRowState();
    });
  }
  function makeRow() {
    if (!rowsEl) return;
    if (hasEmptyDraftRow()) { alert(i18n.emptyRowExists || "A row is already being added."); return; }
    rowsEl.insertAdjacentHTML("beforeend", rowTemplate());
    attachAutocomplete(rowsEl.lastElementChild); reindexRows();
  }
  function renderLoadedRows(rows) {
    if (!rowsEl) return;
    rowsEl.innerHTML = (rows || []).map(rowTemplate).join("");
    rowsEl.querySelectorAll("[data-row]").forEach(attachAutocomplete);
    reindexRows();
  }
  async function autoLoadEvent() {
    const form = document.querySelector("[data-autoload-event]");
    if (!form) return;
    const year = form.querySelector("[data-week-year]")?.value.trim();
    const week = form.querySelector("[data-week-number]")?.value.trim();
    const eventType = form.querySelector("[data-event-type]")?.value || "VS";
    if (!/^\d{4}$/.test(year) || !week || Number(week) < 1 || Number(week) > 53) return;
    try {
      showAlert(loadErrorEl, ""); showAlert(loadMessageEl, "");
      const res = await fetch(`/performance-vs/events?year=${encodeURIComponent(year)}&week=${encodeURIComponent(week)}&eventType=${encodeURIComponent(eventType)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || i18n.loadError);
      renderLoadedRows(data.rows || []);
      if (deleteEventForm) {
        if (data.event?._id) {
          deleteEventForm.hidden = false;
          deleteEventForm.action = `/performance-vs/events/${data.event._id}/delete`;
          deleteEventForm.onsubmit = () => confirm((i18n.confirmDeleteEventTemplate || "Confirm delete {event} {week}/{year}?").replace("{event}", data.event.eventType).replace("{week}", data.event.week).replace("{year}", data.event.year));
        } else {
          deleteEventForm.hidden = true;
        }
      }
      showAlert(loadMessageEl, data.event ? (i18n.dataLoaded || data.message) : (i18n.noData || data.message));
    } catch (err) {
      showAlert(loadErrorEl, err.message || i18n.loadError || "Load error");
    }
  }

  document.querySelectorAll("[data-week-year],[data-week-number],[data-event-type]").forEach((el) => el.addEventListener("input", () => {
    refreshWeekRange(document);
    clearTimeout(loadTimer);
    loadTimer = setTimeout(autoLoadEvent, 300);
  }));
  document.querySelector("[data-event-type]")?.addEventListener("change", () => { clearTimeout(loadTimer); loadTimer = setTimeout(autoLoadEvent, 100); });
  refreshWeekRange(document);
  addRowButton?.addEventListener("click", makeRow);
  if (rowsEl) {
    rowsEl.addEventListener("click", (e) => {
      if (!e.target.closest("[data-remove-row]")) return;
      if (confirm(i18n.confirmDelete || "Confirm delete?")) e.target.closest("[data-row]").remove();
      reindexRows();
    });
    rowsEl.querySelectorAll("[data-row]").forEach(attachAutocomplete);
    reindexRows();
  }
  document.querySelector("[data-performance-form]")?.addEventListener("submit", (e) => {
    reindexRows();
    const invalid = [...rowsEl.querySelectorAll("[data-row]")].some((row) => !row.querySelector("[data-player-id]").value);
    if (invalid) { e.preventDefault(); alert(i18n.selectPlayer || "Select a valid player"); }
  });
})();
