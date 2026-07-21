(function exposePowerHistorySeries(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LWPowerHistorySeries = api;
})(typeof window !== "undefined" ? window : globalThis, function createPowerHistorySeries() {
  const DAY_MS = 24 * 60 * 60 * 1000;

  function toIsoDayUTC(dateObj) {
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function normalizeChartPoint(row, date, real = false) {
    if (!row) return null;
    return {
      date,
      t1: Number(row.t1 || 0),
      t2: Number(row.t2 || 0),
      t3: Number(row.t3 || 0),
      t4: Number(row.t4 || 0),
      total: Number(row.total || 0),
      _real: real
    };
  }

  function findPreviousRowForPeriod(allRows, periodStart, fallbackBaseline) {
    const previousRows = (allRows || [])
      .filter((row) => row?.date && String(row.date) < periodStart)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return previousRows.at(-1)
      || (fallbackBaseline?.date && String(fallbackBaseline.date) < periodStart ? fallbackBaseline : null);
  }

  function buildLastDaysForChart(realRows, daysCount, previousRow = null, nowValue = new Date()) {
    const count = Number.isFinite(daysCount) ? Math.max(1, Math.floor(daysCount) + 1) : 366;
    const rowsByDay = new Map((realRows || []).filter((row) => row?.date).map((row) => [String(row.date), row]));
    const now = new Date(nowValue);
    const startUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (count - 1), 0, 0, 0, 0));
    const result = [];
    let lastKnown = previousRow ? normalizeChartPoint(previousRow, toIsoDayUTC(startUTC), false) : null;

    for (let index = 0; index < count; index += 1) {
      const isoDay = toIsoDayUTC(new Date(startUTC.getTime() + index * DAY_MS));
      const realRow = rowsByDay.get(isoDay);
      if (realRow) {
        lastKnown = normalizeChartPoint(realRow, isoDay, true);
        result.push(lastKnown);
      } else if (lastKnown) {
        result.push({ ...lastKnown, date: isoDay, _real: false });
      } else {
        result.push({ date: isoDay, t1: 0, t2: 0, t3: 0, t4: 0, total: 0, _real: false });
      }
    }
    return result;
  }

  return { toIsoDayUTC, normalizeChartPoint, findPreviousRowForPeriod, buildLastDaysForChart };
});
