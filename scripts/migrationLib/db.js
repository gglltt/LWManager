async function collectionExists(db, name) {
  return (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
}
async function getExistingCollectionNames(db) {
  return new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
}
async function ensureCollection(db, name, { dryRun } = {}) {
  if (await collectionExists(db, name)) return false;
  if (!dryRun) await db.createCollection(name);
  return true;
}
async function safeUpdateMany(db, name, filter, update, { dryRun } = {}) {
  const col = db.collection(name);
  const matchedCount = await col.countDocuments(filter);
  if (dryRun) return { matchedCount, modifiedCount: 0, dryRun: true };
  const res = await col.updateMany(filter, update);
  return { matchedCount: res.matchedCount, modifiedCount: res.modifiedCount };
}

function defaultIndexName(keys) {
  return Object.entries(keys).map(([key, value]) => `${key}_${value}`).join("_");
}
function sameKeys(actual, expected) { return JSON.stringify(actual) === JSON.stringify(expected); }
function indexMatchesRequiredOptions(index, options = {}) {
  if (options.unique !== undefined && index.unique !== options.unique) return false;
  return true;
}
function indexSummary(index) {
  if (!index) return null;
  return { name: index.name, key: index.key, unique: index.unique === true, sparse: index.sparse === true, background: index.background === true };
}

async function ensureCompatibleIndex(collection, keys, options = {}, { dryRun = false, dropIncompatible = false, log } = {}) {
  const requestedName = options.name || defaultIndexName(keys);
  const indexes = await collection.indexes().catch((err) => {
    if (err.codeName === "NamespaceNotFound") return [];
    throw err;
  });
  const sameName = indexes.find((index) => index.name === requestedName);
  const sameKey = indexes.find((index) => sameKeys(index.key, keys));
  const existing = sameName || sameKey;
  const compatible = existing && sameKeys(existing.key, keys) && indexMatchesRequiredOptions(existing, options);

  if (compatible) {
    const message = `index ${existing.name} already exists and is compatible`;
    if (log) log(`  - ${message}`);
    return { action: "compatible", name: existing.name, keys, existing: indexSummary(existing), message };
  }

  if (existing) {
    const conflict = { action: "incompatible", name: requestedName, keys, options, existing: indexSummary(existing) };
    if (!dropIncompatible) {
      if (log) log(`  - index ${existing.name} exists but is incompatible; not recreating without explicit drop`);
      return { ...conflict, skipped: true };
    }
    if (dryRun) return { ...conflict, wouldDropIndex: existing.name, wouldCreateIndex: { keys, options } };
    if (log) log(`  - dropping incompatible index ${existing.name} before recreating ${requestedName}`);
    await collection.dropIndex(existing.name);
  }

  if (dryRun) return { action: "create", name: requestedName, keys, options, dryRun: true };
  const name = await collection.createIndex(keys, options);
  if (log) log(`  - index ${name} created`);
  return { action: "created", collection: collection.collectionName, name, keys };
}

async function ensureIndex(db, name, keys, options, { dryRun } = {}) {
  const result = await ensureCompatibleIndex(db.collection(name), keys, options || {}, { dryRun });
  return { collection: name, ...result };
}
module.exports = { collectionExists, getExistingCollectionNames, ensureCollection, safeUpdateMany, ensureIndex, ensureCompatibleIndex };
