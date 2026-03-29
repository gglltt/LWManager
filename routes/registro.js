const express = require("express");
const { requireAuth, requireLevel } = require("../middleware/auth");
const { EventLog, EVENT_TYPES } = require("../models/eventLog");
const { rebuildSnapshotsFromEventLog } = require("../utils/playerPowerHistory");

const router = express.Router();
const PAGE_SIZE = 50;

router.get("/", requireAuth, requireLevel(5), async (req, res) => {
  try {
    const pageRaw = Number.parseInt(req.query.page, 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const eventType = String(req.query.eventType || "").trim();

    const filter = {};
    if (eventType && EVENT_TYPES.includes(eventType)) {
      filter.eventType = eventType;
    }

    const [total, events] = await Promise.all([
      EventLog.countDocuments(filter),
      EventLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean()
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return res.render("registro/index", {
      user: req.user,
      events,
      eventTypes: EVENT_TYPES,
      selectedEventType: eventType,
      trackingMessage: String(req.query.trackingMessage || "").trim(),
      page,
      totalPages,
      total
    });
  } catch (err) {
    console.error(err);
    const t = res.locals.t || ((k) => k);
    return res.render("registro/index", {
      user: req.user,
      events: [],
      eventTypes: EVENT_TYPES,
      selectedEventType: "",
      trackingMessage: "",
      page: 1,
      totalPages: 1,
      total: 0,
      error: t("err_load_event_log")
    });
  }
});

router.post("/tracking/rebuild", requireAuth, requireLevel(5), async (req, res) => {
  try {
    const stats = await rebuildSnapshotsFromEventLog();
    const message = `Tracking aggiornato: eventi totali ${stats.totalEvents}, validi ${stats.processedEvents}, snapshot scritti ${stats.importedSnapshots}.`;
    return res.redirect(`/registro?trackingMessage=${encodeURIComponent(message)}`);
  } catch (err) {
    console.error(err);
    const t = res.locals.t || ((k) => k);
    return res.redirect(`/registro?trackingMessage=${encodeURIComponent(t("err_internal"))}`);
  }
});

module.exports = router;
