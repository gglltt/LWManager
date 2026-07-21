const test = require("node:test");
const assert = require("node:assert/strict");
const { findPreviousRowForPeriod, buildLastDaysForChart } = require("../public/js/power-history-series");

const NOW = new Date("2026-07-20T12:00:00Z");
const previous = { date: "2026-06-10", t1: 64.1, t2: 44.9, t3: 41.9, t4: 2, total: 150.9 };
const inside = { date: "2026-07-09", t1: 66.4, t2: 45.6, t3: 42.5, t4: 3, total: 154.5 };

test("monthly chart carries the latest pre-range values into rangeStart", () => {
  const baseline = findPreviousRowForPeriod([previous, inside], "2026-06-20", null);
  const points = buildLastDaysForChart([inside], 30, baseline, NOW);
  assert.deepEqual(points[0], { date: "2026-06-20", t1: 64.1, t2: 44.9, t3: 41.9, t4: 2, total: 150.9, _real: false });
  assert.equal(points.find((point) => point.date === "2026-07-09")._real, true);
});

test("chart retains zero before the first absolute record when no baseline exists", () => {
  const points = buildLastDaysForChart([inside], 30, null, NOW);
  assert.equal(points[0].t1, 0);
  assert.equal(points.find((point) => point.date === "2026-07-09").t1, 66.4);
});

test("baseline selection works for month, three months, six months and year", () => {
  for (const days of [30, 90, 180, 365]) {
    const start = new Date(NOW);
    start.setUTCDate(start.getUTCDate() - days);
    const startIso = start.toISOString().slice(0, 10);
    const fallback = { ...previous, date: "2025-01-01" };
    const baseline = findPreviousRowForPeriod([previous, inside], startIso, fallback);
    const inRange = [previous, inside].filter((row) => row.date >= startIso);
    const points = buildLastDaysForChart(inRange, days, baseline, NOW);
    assert.equal(points.length, days + 1);
    assert.equal(points[0].date, startIso);
    if (baseline) assert.equal(points[0].t1, baseline.t1);
  }
});
