const { EventLog } = require("../models/eventLog");
const { getDebugRequestHeaders, getRequestInfo } = require("./requestInfo");

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

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value).replace(/\|/g, "/");
}

function buildPlayerDetails(player) {
  return PLAYER_FIELDS.map((field) => `${field}=${formatValue(player[field])}`).join("|");
}

async function createEventLog(req, eventType, details = "") {
  try {
    const requestInfo = getRequestInfo(req);

    if (process.env.NODE_ENV !== "production") {
      console.log("REQUEST HEADERS DEBUG:", getDebugRequestHeaders(req));
    }

    await EventLog.create({
      eventType,
      sourceIp: requestInfo.ip,
      browserType: requestInfo.browser,
      sourceMachine: requestInfo.forwardedHost || requestInfo.host,
      sourceCity: requestInfo.city,
      sourceRegion: requestInfo.region,
      sourceCountry: requestInfo.country,
      userAgent: requestInfo.userAgent,
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
