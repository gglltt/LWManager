"use strict";

const bcrypt = require("bcryptjs");
const { ensureCollection } = require("../migrationLib/db");

const DEFAULT_ROUNDS = 10;

function hasResetFlag(options) {
  return Boolean(options?.resetDefaultPins || process.argv.includes("--reset-default-pins"));
}

function requiredSpecs(config) {
  return [
    { username: config.masterUsername, role: "master", allianceId: null, pin: config.masterPin },
    { username: config.standardUsername, role: "standard", allianceId: config.allianceId, pin: config.standardPin },
    { username: config.supervisorUsername, role: "supervisor", allianceId: config.allianceId, pin: config.supervisorPin }
  ];
}

function legacyUserFilters(spec, config) {
  const filters = [{ username: spec.username }];
  if (spec.role === "master") filters.push({ email: "master@biss833.local" }, { role: "master" });
  if (spec.role === "standard") filters.push({ email: "standard@biss833.local" }, { email: "admin@biss833.local" }, { role: { $in: ["standard", "admin", "alliance_admin"] }, allianceId: config.allianceId });
  if (spec.role === "supervisor") filters.push({ email: "supervisor@biss833.local" }, { role: "supervisor", allianceId: config.allianceId });
  return filters;
}

async function findLegacyUser(db, spec, config) {
  const exists = await db.listCollections({ name: "users" }, { nameOnly: true }).hasNext();
  if (!exists) return null;
  for (const filter of legacyUserFilters(spec, config)) {
    const user = await db.collection("users").findOne(filter);
    if (user) return user;
  }
  return null;
}

async function ensureAlliance(db, config, dryRun) {
  await ensureCollection(db, "alliances", { dryRun });
  const alliances = db.collection("alliances");
  const doc = {
    allianceId: config.allianceId,
    code: config.allianceCode,
    codeNormalized: config.codeNormalized,
    serverNumber: config.serverNumber,
    displayName: config.allianceCode,
    isActive: true
  };
  if (dryRun) return { action: (await alliances.findOne({ allianceId: config.allianceId })) ? "would update" : "would create", doc };
  await alliances.updateOne(
    { allianceId: config.allianceId },
    { $set: { ...doc, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  await alliances.createIndex({ allianceId: 1 }, { unique: true });
  await alliances.createIndex({ serverNumber: 1, codeNormalized: 1 }, { unique: true });
  return { action: "ensured", doc };
}

async function ensureAccount(db, spec, config, dryRun, resetPins) {
  const accounts = db.collection("accounts");
  const existing = await accounts.findOne({ username: spec.username });
  const legacy = existing ? null : await findLegacyUser(db, spec, config);
  const legacyHash = legacy?.pinHash || legacy?.passwordHash;
  const shouldSetHash = resetPins || !existing || !(existing.pinHash || existing.passwordHash);
  const pinHash = shouldSetHash ? (legacyHash && !resetPins ? legacyHash : await bcrypt.hash(spec.pin, DEFAULT_ROUNDS)) : null;
  const update = {
    $set: { role: spec.role, allianceId: spec.allianceId, isActive: true, updatedAt: new Date() },
    $unset: { pin: "", password: "", plainPin: "" },
    $setOnInsert: { username: spec.username, createdAt: new Date() }
  };
  if (pinHash) update.$set.pinHash = pinHash;
  if (dryRun) return { username: spec.username, action: existing ? "would update" : "would create", copiedFromUsers: Boolean(legacy), wouldSetPinHash: Boolean(pinHash) };
  await accounts.updateOne({ username: spec.username }, update, { upsert: true });
  return { username: spec.username, action: existing ? "updated" : "created", copiedFromUsers: Boolean(legacy), pinHashChanged: Boolean(pinHash) };
}

async function warnUsers(db, log) {
  const exists = await db.listCollections({ name: "users" }, { nameOnly: true }).hasNext();
  if (!exists) return;
  const count = await db.collection("users").estimatedDocumentCount();
  log(`  - WARNING: Collection users rilevata ma non usata dal sistema di autenticazione. Gli account ufficiali sono in accounts. Documenti rilevati: ${count}.`);
}

module.exports = {
  id: "006_fix_accounts_collection",
  description: "Ensure authentication uses accounts, seed default master/standard/supervisor accounts, and migrate useful legacy users without deleting users.",
  async up({ db, dryRun = false, log = console.log, config, options = {} }) {
    if (!db || typeof db.collection !== "function") {
      throw new Error("Invalid migration db context");
    }
    if (typeof db.listCollections !== "function") {
      throw new Error("Invalid MongoDB db object: listCollections unavailable");
    }

    const resetPins = hasResetFlag(options);
    const summary = [];

    summary.push({ alliance: await ensureAlliance(db, config, dryRun) });
    await ensureCollection(db, "accounts", { dryRun });
    for (const spec of requiredSpecs(config)) summary.push(await ensureAccount(db, spec, config, dryRun, resetPins));

    if (!dryRun) {
      const accounts = db.collection("accounts");
      await accounts.createIndex({ username: 1 }, { unique: true });
      await accounts.createIndex({ allianceId: 1, role: 1 });
      await accounts.updateMany({ role: { $in: ["admin", "alliance_admin"] } }, { $set: { role: "standard", isActive: false, updatedAt: new Date() } });
    }

    for (const item of summary) log(`  - ${JSON.stringify(item)}`);
    await warnUsers(db, log);
  }
};
