#!/usr/bin/env node
"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const dryRun = process.argv.includes("--dry-run");
const migrationsDir = path.join(__dirname, "migrations");

function log(message) {
  console.log(message);
}

async function loadMigrations() {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d+_.*\.js$/.test(file))
    .sort()
    .map((file) => ({ file, migration: require(path.join(migrationsDir, file)) }));
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI in environment variables.");

  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db();
    const schemaMigrations = db.collection("schema_migrations");
    if (!dryRun) {
      await schemaMigrations.createIndex({ id: 1 }, { unique: true });
    }

    log(dryRun ? "Running migrations in dry-run mode..." : "Running migrations...");

    let executed = 0;
    for (const { file, migration } of await loadMigrations()) {
      if (!migration.id || typeof migration.up !== "function") {
        throw new Error(`Invalid migration file: ${file}`);
      }

      const alreadyApplied = await schemaMigrations.findOne({ id: migration.id });
      if (alreadyApplied) {
        log(`Skipping ${migration.id}: already applied.`);
        continue;
      }

      log(`${dryRun ? "Dry-run" : "Applying"} ${migration.id}: ${migration.description || file}`);
      await migration.up(db, { dryRun, log });

      if (!dryRun) {
        await schemaMigrations.insertOne({
          id: migration.id,
          file,
          description: migration.description || "",
          appliedAt: new Date()
        });
      }
      executed += 1;
    }

    log(dryRun ? `Dry-run complete. Pending migrations inspected: ${executed}.` : `Migrations complete. Applied: ${executed}.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
});
