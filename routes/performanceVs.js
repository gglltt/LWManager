const express = require("express");
const mongoose = require("mongoose");
const Player = require("../models/player");
const PerformanceVsEvent = require("../models/performanceVsEvent");
const PerformanceVsRow = require("../models/performanceVsRow");
const { requireAuth, requireSupervisor } = require("../middleware/auth");
const { getIsoWeekRange } = require("../utils/isoWeek");
const { createEventLog } = require("../utils/eventLog");

const router = express.Router();
const EVENT_TYPES = ["VS"];
const MAX_SCORE = 999999999;

function escapeRegex(v) { return String(v || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function parseIntField(v) { const n = Number(v); return Number.isInteger(n) ? n : null; }
function actor(req) { return req.user?.role || "unknown"; }
function formatWeekRangeForView(event) {
  return { start: event.weekStartDate?.toISOString().slice(0, 10), end: event.weekEndDate?.toISOString().slice(0, 10) };
}
function validateHeader(body, t) {
  const year = parseIntField(body.year);
  const week = parseIntField(body.week);
  const eventType = String(body.eventType || "VS").trim().toUpperCase();
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { ok: false, error: t("perf_invalid_year") };
  if (!Number.isInteger(week) || week < 1 || week > 53) return { ok: false, error: t("perf_invalid_week") };
  if (!EVENT_TYPES.includes(eventType)) return { ok: false, error: t("perf_invalid_event") };
  try { return { ok: true, year, week, eventType, range: getIsoWeekRange(year, week) }; }
  catch { return { ok: false, error: t("perf_invalid_week") }; }
}
function normalizeRows(rawRows) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  return rows.map((row) => ({
    rowId: String(row.rowId || "").trim(),
    playerId: String(row.playerId || "").trim(),
    position: parseIntField(row.position),
    score: parseIntField(row.score)
  })).filter((row) => row.playerId || row.position !== null || row.score !== null);
}
async function loadEventWithRows(query) {
  const event = await PerformanceVsEvent.findOne(query).lean();
  if (!event) return { event: null, rows: [] };
  const rows = await PerformanceVsRow.find({ eventId: event._id }).populate("playerId", "nickname").sort({ position: 1 }).lean();
  return { event, rows };
}
function renderEdit(res, req, data) {
  return res.render("performance-vs/edit", { user: req.user, eventTypes: EVENT_TYPES, ...data });
}

router.use(requireAuth, requireSupervisor);

router.get("/", (req, res) => res.render("performance-vs/index", { user: req.user }));

router.get("/edit", async (req, res) => {
  const now = new Date();
  const form = { year: req.query.year || now.getUTCFullYear(), week: req.query.week || "", eventType: req.query.eventType || "VS" };
  if (form.year && form.week) {
    const header = validateHeader(form, res.locals.t || ((k) => k));
    if (header.ok) {
      const loaded = await loadEventWithRows({ year: header.year, week: header.week, eventType: header.eventType });
      return renderEdit(res, req, { error: null, message: null, form, ...loaded });
    }
  }
  return renderEdit(res, req, { error: null, message: null, form, event: null, rows: [] });
});

router.get("/view", async (req, res) => {
  const t = res.locals.t;
  const form = { year: req.query.year || "", week: req.query.week || "", eventType: req.query.eventType || "VS" };
  let data = { event: null, rows: [], error: null };
  if (form.year && form.week) {
    const header = validateHeader(form, t);
    if (!header.ok) data.error = header.error;
    else data = { ...(await loadEventWithRows({ year: header.year, week: header.week, eventType: header.eventType })), error: null };
  }
  return res.render("performance-vs/view", { user: req.user, eventTypes: EVENT_TYPES, form, message: req.query.deleted ? t("perf_row_deleted") : null, ...data });
});

router.get("/players/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 1) return res.json({ ok: true, players: [] });
  const players = await Player.find({ nickname: { $regex: escapeRegex(q), $options: "i" } }).select("nickname").sort({ nickname: 1 }).limit(20).lean();
  return res.json({ ok: true, players: players.map((p) => ({ id: p._id, nickname: p.nickname })) });
});

router.get("/events", async (req, res) => {
  const t = res.locals.t;
  const header = validateHeader(req.query, t);
  if (!header.ok) return res.status(400).json({ ok: false, error: header.error });
  const { event, rows } = await loadEventWithRows({ year: header.year, week: header.week, eventType: header.eventType });
  return res.json({ ok: true, event, rows, weekRange: { start: header.range.start.toISOString(), end: header.range.end.toISOString() } });
});

router.post("/events", async (req, res) => {
  const t = res.locals.t;
  const header = validateHeader(req.body, t);
  const form = { year: req.body.year, week: req.body.week, eventType: req.body.eventType || "VS" };
  if (!header.ok) return renderEdit(res, req, { error: header.error, message: null, form, event: null, rows: [] });

  const rows = normalizeRows(req.body.rows);
  const playerIds = rows.map((r) => r.playerId);
  if (rows.some((r) => !mongoose.Types.ObjectId.isValid(r.playerId))) return renderEdit(res, req, { error: t("perf_valid_player_required"), message: null, form, event: null, rows: [] });
  if (new Set(playerIds).size !== playerIds.length) return renderEdit(res, req, { error: t("perf_duplicate_player"), message: null, form, event: null, rows: [] });
  const positions = rows.map((r) => r.position).filter((v) => v !== null);
  if (new Set(positions).size !== positions.length) return renderEdit(res, req, { error: t("perf_duplicate_position"), message: null, form, event: null, rows: [] });
  if (rows.some((r) => !Number.isInteger(r.position) || r.position < 1 || r.position > 1000)) return renderEdit(res, req, { error: t("perf_invalid_position"), message: null, form, event: null, rows: [] });
  if (rows.some((r) => !Number.isInteger(r.score) || r.score < 1 || r.score > MAX_SCORE)) return renderEdit(res, req, { error: t("perf_invalid_score"), message: null, form, event: null, rows: [] });

  const existingPlayers = await Player.find({ _id: { $in: playerIds } }).select("_id").lean();
  if (existingPlayers.length !== playerIds.length) return renderEdit(res, req, { error: t("perf_valid_player_required"), message: null, form, event: null, rows: [] });

  try {
    const event = await PerformanceVsEvent.findOneAndUpdate(
      { year: header.year, week: header.week, eventType: header.eventType },
      { $setOnInsert: { createdBy: actor(req) }, $set: { weekStartDate: header.range.start, weekEndDate: header.range.end, updatedBy: actor(req) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const keepIds = [];
    for (const row of rows) {
      const doc = row.rowId && mongoose.Types.ObjectId.isValid(row.rowId) ? await PerformanceVsRow.findOne({ _id: row.rowId, eventId: event._id }) : null;
      const payload = { eventId: event._id, playerId: row.playerId, position: row.position, score: row.score, updatedBy: actor(req) };
      const saved = doc ? await PerformanceVsRow.findByIdAndUpdate(doc._id, payload, { new: true }) : await PerformanceVsRow.create({ ...payload, createdBy: actor(req) });
      keepIds.push(saved._id);
    }
    await PerformanceVsRow.deleteMany({ eventId: event._id, _id: { $nin: keepIds } });
    await createEventLog(req, "performance_vs_save", `Performance VS ${header.year}-W${header.week}: ${rows.length} righe`);
    const loaded = await loadEventWithRows({ _id: event._id });
    return renderEdit(res, req, { error: null, message: t("perf_save_success"), form, ...loaded });
  } catch (err) {
    console.error(err);
    return renderEdit(res, req, { error: err?.code === 11000 ? t("perf_duplicate_player") : t("perf_save_error"), message: null, form, event: null, rows: [] });
  }
});

router.post("/events/:eventId/rows/:rowId/delete", async (req, res) => {
  await PerformanceVsRow.deleteOne({ _id: req.params.rowId, eventId: req.params.eventId });
  await createEventLog(req, "performance_vs_row_delete", `Riga Performance VS eliminata: ${req.params.rowId}`);
  const event = await PerformanceVsEvent.findById(req.params.eventId).lean();
  const qs = event ? `?year=${event.year}&week=${event.week}&eventType=${event.eventType}&deleted=1` : "?deleted=1";
  return res.redirect(`/performance-vs/view${qs}`);
});

module.exports = router;
