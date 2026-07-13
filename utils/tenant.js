const DEFAULT_ALLIANCE_CODE = String(process.env.DEFAULT_ALLIANCE_CODE || "BISS").trim().toUpperCase();
const DEFAULT_SERVER_NUMBER = Number(process.env.DEFAULT_SERVER_NUMBER || 833);
const DEFAULT_ALLIANCE_ID = Number(process.env.DEFAULT_ALLIANCE_ID || 1);
const GLOBAL_ALLIANCE_KEY = "GLOBAL";

function normalizeAllianceCode(v) { return String(v || "").trim().toUpperCase(); }
function normalizeServerNumber(v) { const n = Number(String(v ?? "").trim()); return Number.isInteger(n) ? n : null; }
function buildAllianceKey(allianceCode, serverNumber) { const code = normalizeAllianceCode(allianceCode); const server = normalizeServerNumber(serverNumber); return code && server ? `${code}#${server}` : null; }
function parseAllianceInput(allianceCodeRaw, serverNumberRaw) { const raw = String(allianceCodeRaw || "").trim(); if (raw.includes("#") && !String(serverNumberRaw || "").trim()) { const [code, server] = raw.split("#"); return { allianceCode: normalizeAllianceCode(code), serverNumber: normalizeServerNumber(server), allianceKey: buildAllianceKey(code, server) }; } return { allianceCode: normalizeAllianceCode(raw), serverNumber: normalizeServerNumber(serverNumberRaw), allianceKey: buildAllianceKey(raw, serverNumberRaw) }; }
function isValidAllianceCode(code) { return /^[A-Z0-9]{2,12}$/.test(normalizeAllianceCode(code)); }
function isValidServerNumber(server) { const n = normalizeServerNumber(server); return Number.isInteger(n) && n >= 1 && n <= 9999; }
function tenantFields(allianceId) { const id = Number(allianceId); return Number.isInteger(id) ? { allianceId: id } : {}; }
function scopeFilter(user, base = {}) { if (user?.isMaster) return { ...base }; return { ...base, allianceId: Number.isInteger(Number(user?.allianceId)) ? Number(user.allianceId) : -1 }; }
function selectedTenantFromRequest(req) { if (!req.user?.isMaster) return Number.isInteger(Number(req.user?.allianceId)) ? { allianceId: Number(req.user.allianceId) } : {}; const id = Number(req.query?.allianceId || req.body?.allianceId || ""); return Number.isInteger(id) && id > 0 ? { allianceId: id } : {}; }
module.exports = { DEFAULT_ALLIANCE_CODE, DEFAULT_SERVER_NUMBER, DEFAULT_ALLIANCE_ID, GLOBAL_ALLIANCE_KEY, normalizeAllianceCode, normalizeServerNumber, buildAllianceKey, parseAllianceInput, isValidAllianceCode, isValidServerNumber, tenantFields, scopeFilter, selectedTenantFromRequest };
