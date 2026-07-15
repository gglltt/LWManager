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
async function ensureIndex(db, name, keys, options, { dryRun } = {}) {
  if (dryRun) return { collection: name, keys, options, dryRun: true };
  const indexName = await db.collection(name).createIndex(keys, options || {});
  return { collection: name, name: indexName, keys };
}
module.exports = { collectionExists, getExistingCollectionNames, ensureCollection, safeUpdateMany, ensureIndex };
