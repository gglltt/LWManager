const { ensureCollection } = require('../migrationLib/db');

function normalized(value) { return String(value || '').trim().toUpperCase(); }
function numberOrNull(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function isDefaultAlliance(doc, config) {
  if (!doc) return false;
  const code = normalized(doc.codeNormalized || doc.code || doc.allianceCode || doc.name || doc.displayName);
  const server = numberOrNull(doc.serverNumber ?? doc.server);
  return code === config.codeNormalized && server === config.serverNumber;
}

module.exports = {
  name: '002_create_alliances_default',
  async up({ db, dryRun, config }) {
    await ensureCollection(db, 'alliances', { dryRun });
    const alliances = db.collection('alliances');
    const existingById = await alliances.findOne({ allianceId: config.allianceId });
    const existingByKey = await alliances.findOne({ serverNumber: config.serverNumber, codeNormalized: config.codeNormalized });

    if (existingById && !isDefaultAlliance(existingById, config)) {
      throw new Error(`Grave: allianceId ${config.allianceId} esiste ma non sembra essere ${config.codeNormalized}#${config.serverNumber}`);
    }
    if (existingByKey && Number(existingByKey.allianceId) !== config.allianceId) {
      throw new Error(`Grave: ${config.codeNormalized}#${config.serverNumber} esiste con allianceId ${existingByKey.allianceId}`);
    }

    const doc = { allianceId: config.allianceId, code: config.allianceCode, codeNormalized: config.codeNormalized, serverNumber: config.serverNumber, displayName: config.allianceCode, isActive: true };
    const needsCreate = !existingById && !existingByKey;
    const needsNormalize = Boolean(existingById) && (
      existingById.code !== doc.code ||
      existingById.codeNormalized !== doc.codeNormalized ||
      Number(existingById.serverNumber) !== doc.serverNumber ||
      existingById.isActive !== true
    );

    if (!dryRun) {
      await alliances.updateOne(
        { allianceId: config.allianceId },
        { $setOnInsert: { createdAt: new Date() }, $set: { ...doc, updatedAt: new Date() } },
        { upsert: true }
      );
      await alliances.createIndex({ allianceId: 1 }, { unique: true });
      await alliances.createIndex({ serverNumber: 1, codeNormalized: 1 }, { unique: true });
    }
    return { alliance: doc, wouldCreate: needsCreate, wouldNormalizeExisting: dryRun && needsNormalize, indexes: dryRun ? [] : ['allianceId_1', 'serverNumber_1_codeNormalized_1'] };
  }
};
