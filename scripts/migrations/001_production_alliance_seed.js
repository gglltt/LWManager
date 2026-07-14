"use strict";

const bcrypt = require("bcryptjs");
const { defaults, collectionsWithAllianceId } = require("../migrationConfig");

const now = () => new Date();
const allianceKey = () => `${defaults.allianceCode}#${defaults.serverNumber}`;

function allianceScopedFields() {
  return {
    allianceId: defaults.allianceId,
    allianceCode: defaults.allianceCode,
    serverNumber: defaults.serverNumber,
    allianceKey: allianceKey()
  };
}

function accountDocs(passwordHashes) {
  return [
    {
      email: "master@biss833.local",
      nickname: "Master Global",
      passwordHash: passwordHashes.master,
      authLevel: 5,
      role: "master",
      isGlobal: true,
      isVerified: true
    },
    {
      email: "supervisor@biss833.local",
      nickname: "Supervisor BISS",
      passwordHash: passwordHashes.supervisor,
      authLevel: 3,
      role: "supervisor",
      ...allianceScopedFields(),
      isVerified: true
    },
    {
      email: "standard@biss833.local",
      nickname: "Standard BISS",
      passwordHash: passwordHashes.standard,
      authLevel: 1,
      role: "standard",
      ...allianceScopedFields(),
      isVerified: true
    }
  ];
}

function missingAllianceIdFilter(collectionName) {
  const filter = { allianceId: { $exists: false } };
  if (collectionName === "users") filter.email = { $ne: "master@biss833.local" };
  return filter;
}

async function countMissingAllianceId(db, collectionName) {
  const exists = await db.listCollections({ name: collectionName }).hasNext();
  if (!exists) return 0;
  return db.collection(collectionName).countDocuments(missingAllianceIdFilter(collectionName));
}

async function up(db, { dryRun, log }) {
  const summary = [];

  const alliance = {
    allianceId: defaults.allianceId,
    code: defaults.allianceCode,
    server: defaults.serverNumber,
    allianceCode: defaults.allianceCode,
    serverNumber: defaults.serverNumber,
    allianceKey: allianceKey(),
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
        missingAllianceIdFilter(collectionName),
        { $set: { allianceId: defaults.allianceId, updatedAt: now() } }
      );
      summary.push(`set allianceId=1 on ${missing} document(s) in ${collectionName}`);
    }
  }

  const passwordHashes = dryRun
    ? { master: "<bcrypt hash>", supervisor: "<bcrypt hash>", standard: "<bcrypt hash>" }
    : {
        master: await bcrypt.hash(defaults.pins.master, 12),
        supervisor: await bcrypt.hash(defaults.pins.supervisor, 12),
        standard: await bcrypt.hash(defaults.pins.standard, 12)
      };

  const masterWithAllianceFields = await db.collection("users").findOne({
    email: "master@biss833.local",
    $or: [
      { allianceId: { $exists: true } },
      { allianceCode: { $exists: true } },
      { serverNumber: { $exists: true } },
      { allianceKey: { $exists: true } }
    ]
  });
  if (masterWithAllianceFields) {
    if (dryRun) {
      summary.push("would make master@biss833.local global by removing alliance/server fields");
    } else {
      await db.collection("users").updateOne(
        { email: "master@biss833.local" },
        {
          $set: { isGlobal: true, role: "master", updatedAt: now() },
          $unset: { allianceId: "", allianceCode: "", serverNumber: "", allianceKey: "" }
        }
      );
      summary.push("made master@biss833.local global by removing alliance/server fields");
    }
  }

  const adminAccount = await db.collection("users").findOne({ email: "admin@biss833.local" });
  if (adminAccount) {
    if (dryRun) {
      summary.push("would remove obsolete account admin@biss833.local");
    } else {
      await db.collection("users").deleteOne({ email: "admin@biss833.local" });
      summary.push("removed obsolete account admin@biss833.local");
    }
  }

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
  description: "Seed production BISS#833 alliance, add default allianceId, and create master, supervisor, and standard accounts.",
  up
};
