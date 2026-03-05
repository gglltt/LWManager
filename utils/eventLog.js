const { EventLog } = require("../models/eventLog");

const PLAYER_FIELDS = [
  "nickname",
  "role",
  "powerT1",
  "typeT1",
  "powerT2",
  "typeT2",
  "powerT3",
  "typeT3",
  "powerT4",
  "typeT4",
  "notes"
];

function getSourceIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return String(req.ip || req.connection?.remoteAddress || "unknown").trim();
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value).replace(/\|/g, "/");
}

function buildPlayerDetails(player) {
  return PLAYER_FIELDS.map((field) => `${field}=${formatValue(player[field])}`).join("|");
}

async function createEventLog(req, eventType, details = "") {
  try {
    await EventLog.create({
      eventType,
      sourceIp: getSourceIp(req),
      details: String(details || "")
    });
  } catch (err) {
    console.error("EventLog create error:", err.message);
  }
}

async function cleanupOldEventLogs() {
  const retentionDays = Number(process.env.EVENT_LOG_RETENTION_DAYS || 7);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    console.warn("Invalid EVENT_LOG_RETENTION_DAYS value. Skipping cleanup.");
    return;
  }

  const threshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  await EventLog.deleteMany({ createdAt: { $lt: threshold } });
}

module.exports = {
  buildPlayerDetails,
  cleanupOldEventLogs,
  createEventLog
};
