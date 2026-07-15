#!/usr/bin/env node
"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const { getMigrationConfig } = require("./migrationLib/config");

const migrationsDir = path.join(__dirname, "migrations");

function parseArgs(argv = process.argv.slice(2)) {
  return { dryRun: argv.includes("--dry-run"), resetDefaultPins: argv.includes("--reset-default-pins") };
}
function log(message) { console.log(message); }
function loadMigrations() {
  return fs.readdirSync(migrationsDir).filter((file) => /^\d+_.*\.js$/.test(file)).sort().map((file) => {
    const migration = require(path.join(migrationsDir, file));
    migration.id = migration.id || migration.name;
    return { file, migration };
  });
}
async function invokeMigration(migration, db, options) {
  if (migration.up.length >= 2) return migration.up(db, options);
  return migration.up({ db, dryRun: options.dryRun, config: options.config, options, log: options.log });
}
async function runMigrations(args = parseArgs()) {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI in environment variables.");
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db();
    const schemaMigrations = db.collection("schema_migrations");
    if (!args.dryRun) await schemaMigrations.createIndex({ id: 1 }, { unique: true });
    log(args.dryRun ? "Running migrations in dry-run mode..." : "Running migrations...");
    let executed = 0;
    for (const { file, migration } of loadMigrations()) {
      if (!migration.id || typeof migration.up !== "function") throw new Error(`Invalid migration file: ${file}`);
      const alreadyApplied = await schemaMigrations.findOne({ id: migration.id });
      if (alreadyApplied) { log(`Skipping ${migration.id}: already applied.`); continue; }
      log(`${args.dryRun ? "Dry-run" : "Applying"} ${migration.id}: ${migration.description || file}`);
      const result = await invokeMigration(migration, db, { ...args, config: getMigrationConfig(), log });
      if (result) log(`  - result: ${JSON.stringify(result)}`);
      if (!args.dryRun) await schemaMigrations.updateOne({ id: migration.id }, { $setOnInsert: { id: migration.id, file, description: migration.description || "", appliedAt: new Date() } }, { upsert: true });
      executed += 1;
    }
    log(args.dryRun ? `Dry-run complete. Pending migrations inspected: ${executed}.` : `Migrations complete. Applied: ${executed}.`);
  } finally { await client.close(); }
}

if (require.main === module) runMigrations().catch((err) => { console.error(`Migration failed: ${err.message}`); process.exit(1); });
module.exports = { runMigrations, parseArgs };
