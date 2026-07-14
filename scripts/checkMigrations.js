#!/usr/bin/env node
"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");
const { defaults, collectionsWithAllianceId } = require("./migrationConfig");

const migrationsDir = path.join(__dirname, "migrations");
const requiredAccounts = [
  { email: "master@biss833.local", pin: defaults.pins.master, global: true },
  { email: "admin@biss833.local", pin: defaults.pins.admin, allianceScoped: true },
  { email: "supervisor@biss833.local", pin: defaults.pins.supervisor, allianceScoped: true },
  { email: "standard@biss833.local", pin: defaults.pins.standard, allianceScoped: true }
];

function migrationIds() {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d+_.*\.js$/.test(file))
    .sort()
    .map((file) => require(path.join(migrationsDir, file)).id);
}

async function collectionExists(db, name) {
  return db.listCollections({ name }).hasNext();
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI in environment variables.");

  const client = new MongoClient(uri);
  await client.connect();
  const failures = [];

  try {
    const db = client.db();

    if (!(await collectionExists(db, "alliances"))) {
      failures.push("collection alliances does not exist");
    } else {
      const alliance = await db.collection("alliances").findOne({ allianceId: defaults.allianceId });
      if (!alliance) failures.push("allianceId=1 is missing");
      if (alliance && (alliance.code !== defaults.allianceCode || Number(alliance.server) !== defaults.serverNumber)) {
        failures.push("allianceId=1 is not BISS#833");
      }
    }

    for (const collectionName of collectionsWithAllianceId) {
      if (!(await collectionExists(db, collectionName))) continue;
      const missingFilter = { allianceId: { $exists: false } };
      if (collectionName === "users") missingFilter.email = { $ne: "master@biss833.local" };
      const missing = await db.collection(collectionName).countDocuments(missingFilter);
      if (missing > 0) failures.push(`${collectionName} has ${missing} document(s) without allianceId`);
    }

    for (const account of requiredAccounts) {
      const user = await db.collection("users").findOne({ email: account.email });
      if (!user) {
        failures.push(`missing account ${account.email}`);
        continue;
      }
      if (!user.passwordHash || user.passwordHash === account.pin) failures.push(`${account.email} does not have a hashed PIN`);
      if (user.passwordHash && !(await bcrypt.compare(account.pin, user.passwordHash))) failures.push(`${account.email} PIN hash does not match expected production PIN`);
      if (account.global) {
        const globalFields = ["allianceId", "allianceCode", "serverNumber", "allianceKey"];
        for (const field of globalFields) {
          if (Object.prototype.hasOwnProperty.call(user, field)) failures.push(`${account.email} must be global and must not have ${field}`);
        }
      }
      if (account.allianceScoped && user.allianceId !== defaults.allianceId) failures.push(`${account.email} does not have allianceId=1`);
    }


    for (const id of migrationIds()) {
      const applied = await db.collection("schema_migrations").findOne({ id });
      if (!applied) failures.push(`migration ${id} is not recorded in schema_migrations`);
    }

    if (failures.length) {
      console.error("Migration check failed:");
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exit(1);
    }

    console.log("Migration check passed.");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`Migration check failed: ${err.message}`);
  process.exit(1);
});
