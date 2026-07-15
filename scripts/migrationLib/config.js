const normalizeCode = (value) => String(value || '').trim().toUpperCase();
function getMigrationConfig() {
  const allianceCode = normalizeCode(process.env.DEFAULT_ALLIANCE_CODE || 'BISS');
  const serverNumber = Number(process.env.DEFAULT_SERVER_NUMBER || 833);
  const allianceId = Number(process.env.DEFAULT_ALLIANCE_ID || 1);
  return {
    allianceCode,
    codeNormalized: normalizeCode(allianceCode),
    serverNumber,
    allianceId,
    standardPin: String(process.env.DEFAULT_STANDARD_PIN || '111111'),
    supervisorPin: String(process.env.DEFAULT_SUPERVISOR_PIN || '151515'),
    masterPin: String(process.env.DEFAULT_MASTER_PIN || '550130'),
    adminUsername: `${allianceCode}#${serverNumber}:admin`,
    supervisorUsername: `${allianceCode}#${serverNumber}:supervisor`,
    masterUsername: 'master'
  };
}
module.exports = { getMigrationConfig, normalizeCode };
