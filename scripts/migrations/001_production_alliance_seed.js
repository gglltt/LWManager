"use strict";

const { defaults } = require("../migrationConfig");

const now = () => new Date();

async function up(db, { dryRun, log }) {
  const alliance = {
    allianceId: defaults.allianceId,
    code: defaults.allianceCode,
    codeNormalized: defaults.allianceCode,
    serverNumber: defaults.serverNumber,
    displayName: defaults.allianceCode,
    isActive: true
  };
  if (dryRun) {
    log("  - legacy users seed disabled; default authentication accounts are managed in accounts by 006_fix_accounts_collection");
    return;
  }
  await db.createCollection("alliances").catch((err) => { if (err.codeName !== "NamespaceExists") throw err; });
  await db.collection("alliances").updateOne(
    { allianceId: defaults.allianceId },
    { $set: { ...alliance, updatedAt: now() }, $setOnInsert: { createdAt: now() } },
    { upsert: true }
  );
  await db.collection("alliances").createIndex({ allianceId: 1 }, { unique: true });
  await db.collection("alliances").createIndex({ serverNumber: 1, codeNormalized: 1 }, { unique: true });
  log("  - ensured alliance BISS#833 exists; did not create legacy users accounts");
}

module.exports = {
  id: "001_production_alliance_seed",
  description: "Legacy production seed retained for migration history; users account seeding disabled in favor of accounts.",
  up
};
