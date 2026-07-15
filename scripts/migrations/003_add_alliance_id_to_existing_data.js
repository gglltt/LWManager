const collections = require('../migrationLib/appCollections');
const { getExistingCollectionNames, safeUpdateMany } = require('../migrationLib/db');
module.exports = {
  name: '003_add_alliance_id_to_existing_data',
  async up({ db, dryRun, config }) {
    const existing = await getExistingCollectionNames(db);
    const summary = {};
    for (const name of collections) {
      if (!existing.has(name)) { summary[name] = { skipped: 'collection missing' }; continue; }
      const filter = { $or: [{ allianceId: { $exists: false } }, { allianceId: null }] };
      if (name === 'eventlogs') {
        filter.$and = [{ $or: [{ eventType: { $nin: ['password_reset'] } }, { eventType: { $exists: false } }] }];
      }
      const res = await safeUpdateMany(db, name, filter, { $set: { allianceId: config.allianceId } }, { dryRun });
      summary[name] = { matched: res.matchedCount, modified: res.modifiedCount };
    }
    return summary;
  }
};
