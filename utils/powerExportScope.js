function normalizeAllianceId(value) {
  const allianceId = Number(value);
  return Number.isInteger(allianceId) && allianceId > 0 ? allianceId : null;
}

function canExportPowers(user) {
  return Boolean(user && (user.isMaster || user.role === "supervisor" || user.authLevel >= 5));
}

function buildPowerExportFilter(user, requestedAllianceId) {
  if (!canExportPowers(user)) return null;

  if (user.isMaster) {
    const selectedAllianceId = normalizeAllianceId(requestedAllianceId);
    return selectedAllianceId ? { allianceId: selectedAllianceId } : {};
  }

  const sessionAllianceId = normalizeAllianceId(user.allianceId);
  return { allianceId: sessionAllianceId || -1 };
}

module.exports = { canExportPowers, buildPowerExportFilter };
