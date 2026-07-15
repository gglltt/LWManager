"use strict";

const bcrypt = require("bcryptjs");
const { defaults, collectionsWithAllianceId } = require("../migrationConfig");

const now = () => new Date();

function accountDocs(passwordHashes) {
  const base = {
    allianceId: defaults.allianceId,
    allianceCode: defaults.allianceCode,
    serverNumber: defaults.serverNumber,
    allianceKey: `${defaults.allianceCode}#${defaults.serverNumber}`,
    isVerified: true
  };

  return [
    {
      email: "master@biss833.local",
      nickname: "Master BISS",
      passwordHash: passwordHashes.master,
      authLevel: 5,
      role: "master",
      ...base
    },
    {
      email: "admin@biss833.local",
      nickname: "Admin BISS",
      passwordHash: passwordHashes.admin,
      authLevel: 5,
      role: "admin",
      ...base
    },
    {
      email: "supervisor@biss833.local",
      nickname: "Supervisor BISS",
      passwordHash: passwordHashes.supervisor,
      authLevel: 3,
      role: "supervisor",
      ...base
    }
  ];
}

async function countMissingAllianceId(db, collectionName) {
  const exists = await db.listCollections({ name: collectionName }).hasNext();
  if (!exists) return 0;
  return db.collection(collectionName).countDocuments({ allianceId: { $exists: false } });
}

async function up(db, { dryRun, log }) {
  const allianceKey = `${defaults.allianceCode}#${defaults.serverNumber}`;
  const summary = [];

  const alliance = {
    allianceId: defaults.allianceId,
    code: defaults.allianceCode,
    server: defaults.serverNumber,
    allianceCode: defaults.allianceCode,
    serverNumber: defaults.serverNumber,
    allianceKey,
    name: defaults.allianceCode,
    createdAt: now(),
    updatedAt: now()
  };

  if (dryRun) {
    const existingAlliance = await db.collection("alliances").findOne({ allianceId: defaults.allianceId });
    summary.push(existingAlliance ? "alliance BISS#833 already exists" : "would create alliance BISS#833");
  } else {
    await db.createCollection("alliances").catch((err) => {
      if (err.codeName !== "NamespaceExists") throw err;
    });
    await db.collection("alliances").updateOne(
      { allianceId: defaults.allianceId },
      {
        $setOnInsert: alliance,
        $set: { updatedAt: now() }
      },
      { upsert: true }
    );
    await db.collection("alliances").createIndex({ allianceId: 1 }, { unique: true });
    await db.collection("alliances").createIndex({ allianceKey: 1 }, { unique: true });
    summary.push("ensured alliance BISS#833 exists");
  }

  for (const collectionName of collectionsWithAllianceId) {
    const missing = await countMissingAllianceId(db, collectionName);
    if (missing === 0) continue;
    if (dryRun) {
      summary.push(`would set allianceId=1 on ${missing} document(s) in ${collectionName}`);
    } else {
      await db.collection(collectionName).updateMany(
        { allianceId: { $exists: false } },
        { $set: { allianceId: defaults.allianceId, updatedAt: now() } }
      );
      summary.push(`set allianceId=1 on ${missing} document(s) in ${collectionName}`);
    }
  }

  const passwordHashes = dryRun
    ? { master: "<bcrypt hash>", admin: "<bcrypt hash>", supervisor: "<bcrypt hash>" }
    : {
        master: await bcrypt.hash(defaults.pins.master, 12),
        admin: await bcrypt.hash(defaults.pins.admin, 12),
        supervisor: await bcrypt.hash(defaults.pins.supervisor, 12)
      };

  for (const account of accountDocs(passwordHashes)) {
    const existing = await db.collection("users").findOne({ email: account.email });
    if (existing) {
      summary.push(`account ${account.email} already exists`);
      continue;
    }
    if (dryRun) {
      summary.push(`would create account ${account.email} with hashed PIN`);
    } else {
      await db.collection("users").insertOne({ ...account, createdAt: now(), updatedAt: now() });
      summary.push(`created account ${account.email} with hashed PIN`);
    }
  }

  for (const item of summary) log(`  - ${item}`);
}

module.exports = {
  id: "001_production_alliance_seed",
  description: "Seed production BISS#833 alliance, add default allianceId, and create required privileged accounts.",
  up
};
