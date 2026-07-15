const { ensureCollection, ensureIndex } = require('../migrationLib/db');
module.exports = {
  name: '002_create_alliances_default',
  async up({ db, dryRun, config }) {
    await ensureCollection(db, 'alliances', { dryRun });
    const alliances = db.collection('alliances');
    const existingById = await alliances.findOne({ allianceId: config.allianceId });
    if (existingById && (existingById.codeNormalized !== config.codeNormalized || Number(existingById.serverNumber) !== config.serverNumber)) {
      throw new Error(`Grave: allianceId ${config.allianceId} esiste ma non corrisponde a ${config.codeNormalized}#${config.serverNumber}`);
    }
    const existingByKey = await alliances.findOne({ serverNumber: config.serverNumber, codeNormalized: config.codeNormalized });
    if (existingByKey && Number(existingByKey.allianceId) !== config.allianceId) {
      throw new Error(`Grave: ${config.codeNormalized}#${config.serverNumber} esiste con allianceId ${existingByKey.allianceId}`);
    }
    const doc = { allianceId: config.allianceId, code: config.allianceCode, codeNormalized: config.codeNormalized, serverNumber: config.serverNumber, displayName: config.allianceCode, isActive: true };
    const wouldUpsert = !existingById && !existingByKey;
    if (!dryRun) {
      await alliances.updateOne(
        { allianceId: config.allianceId },
        { $setOnInsert: { createdAt: new Date() }, $set: { ...doc, updatedAt: new Date() } },
        { upsert: true }
      );
      await alliances.createIndex({ allianceId: 1 }, { unique: true });
      await alliances.createIndex({ serverNumber: 1, codeNormalized: 1 }, { unique: true });
    }
    return { alliance: doc, wouldCreate: wouldUpsert, indexes: dryRun ? [] : ['allianceId_1', 'serverNumber_1_codeNormalized_1'] };
  }
};
