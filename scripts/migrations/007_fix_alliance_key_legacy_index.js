const { ensureCollection } = require('../migrationLib/db');

const ALLIANCES = 'alliances';
const LEGACY_ALLIANCE_KEY_INDEX = 'allianceKey_1';
const REQUIRED_INDEXES = [
  { keys: { allianceId: 1 }, options: { unique: true }, name: 'allianceId_1' },
  { keys: { serverNumber: 1, codeNormalized: 1 }, options: { unique: true }, name: 'serverNumber_1_codeNormalized_1' }
];

module.exports = {
  name: '007_fix_alliance_key_legacy_index',
  description: 'Remove legacy unique allianceKey index and ensure canonical alliances indexes.',
  async up({ db, dryRun }) {
    await ensureCollection(db, ALLIANCES, { dryRun });
    const alliances = db.collection(ALLIANCES);
    const indexes = await alliances.indexes().catch((err) => {
      if (err.codeName === 'NamespaceNotFound') return [];
      throw err;
    });
    const existingIndexNames = new Set(indexes.map((index) => index.name));
    const wouldDropIndexes = existingIndexNames.has(LEGACY_ALLIANCE_KEY_INDEX) ? [LEGACY_ALLIANCE_KEY_INDEX] : [];
    const wouldEnsureIndexes = REQUIRED_INDEXES.map(({ keys, options, name }) => ({ name, keys, options }));
    const wouldCreateIndexes = REQUIRED_INDEXES
      .filter(({ name }) => !existingIndexNames.has(name))
      .map(({ keys, options, name }) => ({ name, keys, options }));

    if (dryRun) return { wouldDropIndexes, wouldCreateIndexes, wouldEnsureIndexes };

    const droppedIndexes = [];
    if (existingIndexNames.has(LEGACY_ALLIANCE_KEY_INDEX)) {
      await alliances.dropIndex(LEGACY_ALLIANCE_KEY_INDEX);
      droppedIndexes.push(LEGACY_ALLIANCE_KEY_INDEX);
    }

    const ensuredIndexes = [];
    for (const { keys, options } of REQUIRED_INDEXES) {
      ensuredIndexes.push(await alliances.createIndex(keys, options));
    }

    return { droppedIndexes, ensuredIndexes };
  }
};
