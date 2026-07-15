"use strict";

const COLLECTION = "schema_migrations";

function stripJs(file) {
  return String(file || "").replace(/\.js$/i, "");
}

function baseNameFor(doc) {
  const candidates = [doc.name, doc.id, doc.file ? stripJs(doc.file) : null];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return `legacy-migration-${doc._id}`;
}

function uniqueName(base, used) {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

async function collectionExists(db) {
  return db.listCollections({ name: COLLECTION }, { nameOnly: true }).hasNext();
}

async function ensureSchemaMigrationsCollection(db, { dryRun = false } = {}) {
  if (await collectionExists(db)) return false;
  if (!dryRun) await db.createCollection(COLLECTION);
  return true;
}

function buildNormalizationPlan(docs) {
  const used = new Set();
  const actions = [];
  for (const doc of docs) {
    const base = baseNameFor(doc);
    const name = uniqueName(base, used);
    const set = {};
    const unset = {};

    if (doc.name !== name) set.name = name;
    if (!doc.file && doc.file !== "" && typeof doc.id === "string" && doc.id.trim()) set.file = `${doc.id.trim()}.js`;
    if (!doc.status) set.status = "success";
    if (!doc.executedAt && doc.appliedAt) set.executedAt = doc.appliedAt;
    if (doc.appliedAt) unset.appliedAt = "";

    if (Object.keys(set).length || Object.keys(unset).length) {
      const update = {};
      if (Object.keys(set).length) update.$set = set;
      if (Object.keys(unset).length) update.$unset = unset;
      actions.push({ _id: doc._id, from: doc.name ?? doc.id ?? doc.file ?? null, to: name, update });
    }
  }
  return actions;
}

async function normalizeSchemaMigrations(db, { dryRun = false } = {}) {
  const created = await ensureSchemaMigrationsCollection(db, { dryRun });
  const docs = await db.collection(COLLECTION).find({}).sort({ _id: 1 }).toArray();
  const actions = buildNormalizationPlan(docs);
  if (!dryRun) {
    for (const action of actions) {
      await db.collection(COLLECTION).updateOne({ _id: action._id }, action.update);
    }
  }
  const normalizedDocs = docs.map((doc) => {
    const action = actions.find((item) => String(item._id) === String(doc._id));
    return action ? { ...doc, ...action.update.$set, appliedAt: undefined } : doc;
  });
  return { created, inspected: docs.length, normalized: actions.length, actions, normalizedDocs };
}

async function ensureUniqueNameIndex(db, { dryRun = false } = {}) {
  if (dryRun) return { collection: COLLECTION, keys: { name: 1 }, options: { unique: true }, dryRun: true };
  const collection = db.collection(COLLECTION);
  const indexes = await collection.indexes();
  for (const index of indexes) {
    if (JSON.stringify(index.key) === JSON.stringify({ name: 1 }) && index.unique === true && !index.partialFilterExpression) {
      return { collection: COLLECTION, name: index.name, keys: index.key, alreadyExists: true };
    }
    if (index.name === "name_1" || JSON.stringify(index.key) === JSON.stringify({ name: 1 })) {
      await collection.dropIndex(index.name);
    }
  }
  const name = await collection.createIndex({ name: 1 }, { unique: true });
  return { collection: COLLECTION, name, keys: { name: 1 }, unique: true };
}

function successfulNamesFromNormalizedDocs(docs) {
  return new Set(docs.filter((doc) => doc.name && doc.status === "success").map((doc) => doc.name));
}

module.exports = {
  COLLECTION,
  normalizeSchemaMigrations,
  ensureSchemaMigrationsCollection,
  ensureUniqueNameIndex,
  successfulNamesFromNormalizedDocs
};
