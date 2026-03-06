const { EventLog } = require("../models/eventLog");
const dns = require("node:dns").promises;

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

function getHeaderValue(req, headerName) {
  const header = req.headers[headerName];
  if (Array.isArray(header)) {
    return String(header[0] || "").trim();
  }
  return String(header || "").trim();
}

function getSourceIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return String(req.ip || req.connection?.remoteAddress || "unknown").trim();
}

function getBrowserType(req) {
  const userAgent = getHeaderValue(req, "user-agent").toLowerCase();

  if (!userAgent) return "unknown";
  if (userAgent.includes("edg/")) return "Edge";
  if (userAgent.includes("opr/") || userAgent.includes("opera")) return "Opera";
  if (userAgent.includes("chrome/") && !userAgent.includes("edg/")) return "Chrome";
  if (userAgent.includes("safari/") && !userAgent.includes("chrome/")) return "Safari";
  if (userAgent.includes("firefox/")) return "Firefox";

  return "Other";
}

async function getSourceMachine(req) {
  const sourceIp = getSourceIp(req);
  if (!sourceIp || sourceIp === "unknown") {
    return "unknown";
  }

  try {
    const hostnames = await dns.reverse(sourceIp);
    if (Array.isArray(hostnames) && hostnames.length > 0) {
      return String(hostnames[0] || "").trim() || sourceIp;
    }
  } catch (_err) {
    // If reverse DNS is unavailable, keep the caller IP as source machine identifier.
  }

  return sourceIp;
}

function getSourceCity(req) {
  const candidateHeaders = [
    "x-vercel-ip-city",
    "cf-ipcity",
    "x-appengine-city",
    "x-city",
    "x-geo-city"
  ];

  for (const headerName of candidateHeaders) {
    const city = getHeaderValue(req, headerName);
    if (city) return city;
  }

  return "unknown";
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
    const sourceIp = getSourceIp(req);
    await EventLog.create({
      eventType,
      sourceIp,
      browserType: getBrowserType(req),
      sourceMachine: await getSourceMachine(req),
      sourceCity: getSourceCity(req),
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
