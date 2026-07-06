const { MongoClient } = require("mongodb");

const BATCH_SIZE = Number.parseInt(process.env.SYNC_PROD_TO_QA_BATCH_SIZE || "500", 10);

function isEnabled() {
  return String(process.env.SYNC_PROD_TO_QA_ENABLED || "").toLowerCase() === "true";
}

function getConfig() {
  return {
    enabled: isEnabled(),
    prodUri: process.env.MONGO_PROD_URI,
    prodDb: process.env.MONGO_PROD_DB,
    qaUri: process.env.MONGO_QA_URI,
    qaDb: process.env.MONGO_QA_DB,
    allowNonQaTarget: String(process.env.SYNC_PROD_TO_QA_ALLOW_NON_QA_TARGET || "").toLowerCase() === "true"
  };
}

function validateConfig(config = getConfig()) {
  if (!config.enabled) return "sync_disabled";

  const missing = ["prodUri", "prodDb", "qaUri", "qaDb"].filter((key) => !config[key]);
  if (missing.length) return "sync_missing_config";

  if (config.prodDb === config.qaDb) return "sync_same_database";
  if (!config.allowNonQaTarget && String(config.qaDb).toLowerCase() !== "qa") return "sync_target_not_qa";

  return "";
}

function normalizeCollectionInfo(collection) {
  return typeof collection === "string" ? { name: collection } : collection;
}

function isAtlasNoTimeoutCursorError(err) {
  return err?.code === 8000 && String(err?.message || "").includes("noTimeout cursors are disallowed");
}

async function recreateIndexes(sourceCollection, targetCollection) {
  const indexes = await sourceCollection.indexes();
  for (const index of indexes) {
    if (index.name === "_id_") continue;
    const { key, name, v, ns, ...options } = index;
    delete options.weights;
    try {
      await targetCollection.createIndex(key, options);
    } catch (err) {
      console.warn(`Unable to recreate index ${name} on ${sourceCollection.collectionName}: ${err.message}`);
    }
  }
}

async function copyCollection(sourceCollection, targetCollection) {
  await targetCollection.drop().catch((err) => {
    if (err.codeName !== "NamespaceNotFound") throw err;
  });

  await recreateIndexes(sourceCollection, targetCollection);

  let copied = 0;
  let batch = [];
  const cursor = sourceCollection.find({}).batchSize(BATCH_SIZE);

  try {
    for await (const doc of cursor) {
      batch.push(doc);
      if (batch.length >= BATCH_SIZE) {
        await targetCollection.insertMany(batch, { ordered: true });
        copied += batch.length;
        batch = [];
      }
    }

    if (batch.length) {
      await targetCollection.insertMany(batch, { ordered: true });
      copied += batch.length;
    }
  } finally {
    await cursor.close().catch(() => {});
  }

  return copied;
}

async function syncProdToQa() {
  const config = getConfig();
  const validationError = validateConfig(config);
  if (validationError) {
    return { success: false, collections: [], documentsByCollection: {}, totalDocuments: 0, error: validationError };
  }

  let prodClient;
  let qaClient;
  const collections = [];
  const documentsByCollection = {};

  try {
    prodClient = new MongoClient(config.prodUri);
    qaClient = new MongoClient(config.qaUri);

    await prodClient.connect();
    await qaClient.connect();

    const prodDb = prodClient.db(config.prodDb);
    const qaDb = qaClient.db(config.qaDb);

    if (prodDb.databaseName === qaDb.databaseName) throw new Error("sync_same_database");
    if (!config.allowNonQaTarget && qaDb.databaseName.toLowerCase() !== "qa") throw new Error("sync_target_not_qa");

    const sourceCollections = await prodDb.listCollections({}, { nameOnly: true }).toArray();
    for (const infoRaw of sourceCollections) {
      const info = normalizeCollectionInfo(infoRaw);
      if (!info.name || info.name.startsWith("system.")) continue;

      const sourceCollection = prodDb.collection(info.name);
      const targetCollection = qaDb.collection(info.name);
      const copied = await copyCollection(sourceCollection, targetCollection);
      collections.push(info.name);
      documentsByCollection[info.name] = copied;
    }

    return {
      success: true,
      collections,
      documentsByCollection,
      totalDocuments: Object.values(documentsByCollection).reduce((sum, count) => sum + count, 0),
      error: ""
    };
  } catch (err) {
    return {
      success: false,
      collections,
      documentsByCollection,
      totalDocuments: Object.values(documentsByCollection).reduce((sum, count) => sum + count, 0),
      error: isAtlasNoTimeoutCursorError(err)
        ? "sync_cursor_no_timeout_unsupported"
        : (["sync_same_database", "sync_target_not_qa"].includes(err.message) ? err.message : "sync_failed")
    };
  } finally {
    if (prodClient) await prodClient.close().catch(() => {});
    if (qaClient) await qaClient.close().catch(() => {});
  }
}

module.exports = { getConfig, isEnabled, validateConfig, syncProdToQa };
