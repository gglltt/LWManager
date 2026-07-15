const DEFAULT_ALLIANCE_CODE = String(process.env.DEFAULT_ALLIANCE_CODE || "BISS").trim().toUpperCase();
const DEFAULT_SERVER_NUMBER = Number(process.env.DEFAULT_SERVER_NUMBER || 833);
const GLOBAL_ALLIANCE_KEY = "GLOBAL";

function normalizeAllianceCode(v) {
  return String(v || "").trim().toUpperCase();
}
function normalizeServerNumber(v) {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) ? n : null;
}
function buildAllianceKey(allianceCode, serverNumber) {
  const code = normalizeAllianceCode(allianceCode);
  const server = normalizeServerNumber(serverNumber);
  if (!code || !server) return null;
  return `${code}#${server}`;
}
function parseAllianceInput(allianceCodeRaw, serverNumberRaw) {
  const raw = String(allianceCodeRaw || "").trim();
  if (raw.includes("#") && !String(serverNumberRaw || "").trim()) {
    const [code, server] = raw.split("#");
    return { allianceCode: normalizeAllianceCode(code), serverNumber: normalizeServerNumber(server), allianceKey: buildAllianceKey(code, server) };
  }
  return { allianceCode: normalizeAllianceCode(raw), serverNumber: normalizeServerNumber(serverNumberRaw), allianceKey: buildAllianceKey(raw, serverNumberRaw) };
}
function isValidAllianceCode(code) { return /^[A-Z0-9]{2,12}$/.test(normalizeAllianceCode(code)); }
function isValidServerNumber(server) { const n = normalizeServerNumber(server); return Number.isInteger(n) && n >= 1 && n <= 9999; }
function tenantFields(allianceCode, serverNumber) {
  const key = buildAllianceKey(allianceCode, serverNumber);
  return { allianceCode: normalizeAllianceCode(allianceCode), serverNumber: normalizeServerNumber(serverNumber), allianceKey: key };
}
function scopeFilter(user, base = {}) {
  if (user?.isMaster) return { ...base };
  return { ...base, allianceKey: user?.allianceKey || "__NO_TENANT__" };
}
function selectedTenantFromRequest(req) {
  if (!req.user?.isMaster) return req.user?.allianceKey ? { allianceKey: req.user.allianceKey } : {};
  const parsed = parseAllianceInput(req.query.allianceCode || req.query.allianceKey || "", req.query.serverNumber || "");
  return parsed.allianceKey ? { allianceKey: parsed.allianceKey } : {};
}
module.exports = { DEFAULT_ALLIANCE_CODE, DEFAULT_SERVER_NUMBER, GLOBAL_ALLIANCE_KEY, normalizeAllianceCode, normalizeServerNumber, buildAllianceKey, parseAllianceInput, isValidAllianceCode, isValidServerNumber, tenantFields, scopeFilter, selectedTenantFromRequest };
