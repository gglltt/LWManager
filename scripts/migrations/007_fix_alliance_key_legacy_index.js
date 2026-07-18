const { ensureCollection, ensureCompatibleIndex } = require('../migrationLib/db');

const ALLIANCES = 'alliances';
const LEGACY_ALLIANCE_KEY_INDEX = 'allianceKey_1';
const REQUIRED_INDEXES = [
  { keys: { allianceId: 1 }, options: { unique: true, name: 'allianceId_1' }, name: 'allianceId_1' },
  { keys: { serverNumber: 1, codeNormalized: 1 }, options: { unique: true, name: 'serverNumber_1_codeNormalized_1' }, name: 'serverNumber_1_codeNormalized_1' }
];

function isMissing(value) { return value === undefined || value === null || value === ''; }
function normalizeCode(value) { return String(value || '').trim().toUpperCase(); }
function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function valuesEqual(a, b) { return a === b || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime()); }
function sameKeys(actual, expected) { return JSON.stringify(actual) === JSON.stringify(expected); }
function hasCompatibleUniqueIndex(indexes, keys, name) {
  return indexes.some((index) => (index.name === name || sameKeys(index.key, keys)) && sameKeys(index.key, keys) && index.unique === true);
}
function buildNormalization(doc, nextAllianceId) {
  const set = {};
  let code = doc.code;
  if (isMissing(code) && !isMissing(doc.allianceCode)) code = doc.allianceCode;
  if (isMissing(code) && !isMissing(doc.name)) code = doc.name;
  if (!isMissing(code)) {
    const trimmedCode = String(code).trim();
    if (!valuesEqual(doc.code, trimmedCode)) set.code = trimmedCode;
    const normalized = normalizeCode(trimmedCode);
    if (!valuesEqual(doc.codeNormalized, normalized)) set.codeNormalized = normalized;
    if (isMissing(doc.displayName)) set.displayName = !isMissing(doc.name) ? String(doc.name) : trimmedCode;
  }
  if (isMissing(doc.serverNumber) && !isMissing(doc.server)) {
    const serverNumber = numericOrNull(doc.server);
    if (serverNumber !== null) set.serverNumber = serverNumber;
  }
  if (isMissing(doc.isActive)) set.isActive = true;
  if (!Number.isFinite(Number(doc.allianceId))) set.allianceId = nextAllianceId.value++;
  return set;
}

async function normalizeAlliances(alliances, { dryRun }) {
  const docs = await alliances.find({}).sort({ allianceId: 1, _id: 1 }).toArray();
  const numericIds = docs.map((doc) => Number(doc.allianceId)).filter(Number.isFinite);
  const nextAllianceId = { value: numericIds.length ? Math.max(...numericIds) + 1 : 1 };
  const updates = [];
  for (const doc of docs) {
    const set = buildNormalization(doc, nextAllianceId);
    if (Object.keys(set).length) updates.push({ _id: doc._id, set });
  }
  if (!dryRun && updates.length) {
    await alliances.bulkWrite(updates.map(({ _id, set }) => ({ updateOne: { filter: { _id }, update: { $set: set } } })));
  }
  return { inspected: docs.length, normalized: updates.length, updates: updates.map(({ _id, set }) => ({ _id, set })) };
}

async function fixAllianceKeyLegacyIndex({ db, dryRun }) {
  await ensureCollection(db, ALLIANCES, { dryRun });
  const alliances = db.collection(ALLIANCES);
  const indexes = await alliances.indexes().catch((err) => {
    if (err.codeName === 'NamespaceNotFound') return [];
    throw err;
  });
  const existingIndexNames = new Set(indexes.map((index) => index.name));
  const wouldDropIndexes = existingIndexNames.has(LEGACY_ALLIANCE_KEY_INDEX) ? [LEGACY_ALLIANCE_KEY_INDEX] : [];
  const normalization = await normalizeAlliances(alliances, { dryRun });

  if (dryRun) {
    const wouldCreateIndexes = REQUIRED_INDEXES
      .filter(({ keys, name }) => !hasCompatibleUniqueIndex(indexes, keys, name))
      .map(({ keys, options, name }) => ({ name, keys, options }));
    return { wouldDropIndexes, wouldNormalizeAlliances: normalization.normalized, wouldCreateIndexes };
  }

  const droppedIndexes = [];
  if (existingIndexNames.has(LEGACY_ALLIANCE_KEY_INDEX)) {
    await alliances.dropIndex(LEGACY_ALLIANCE_KEY_INDEX);
    droppedIndexes.push(LEGACY_ALLIANCE_KEY_INDEX);
  }

  const ensuredIndexes = [];
  for (const { keys, options } of REQUIRED_INDEXES) {
    ensuredIndexes.push(await ensureCompatibleIndex(alliances, keys, options, { dryRun: false }));
  }

  return { droppedIndexes, normalizedAlliances: normalization.normalized, ensuredIndexes };
}

module.exports = {
  name: '007_fix_alliance_key_legacy_index',
  description: 'Remove legacy unique allianceKey index, normalize alliances, and ensure canonical alliances indexes.',
  up: fixAllianceKeyLegacyIndex,
  fixAllianceKeyLegacyIndex
};
