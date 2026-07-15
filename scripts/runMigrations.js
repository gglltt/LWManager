#!/usr/bin/env node
"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const { getMigrationConfig } = require("./migrationLib/config");
const { normalizeSchemaMigrations, dropLegacyIdIndex, ensureUniqueNameIndex, successfulNamesFromNormalizedDocs } = require("./migrationLib/schemaMigrations");

const migrationsDir = path.join(__dirname, "migrations");

function parseArgs(argv = process.argv.slice(2)) {
  return { dryRun: argv.includes("--dry-run"), resetDefaultPins: argv.includes("--reset-default-pins") };
}
function log(message) { console.log(message); }
function loadMigrations() {
  return fs.readdirSync(migrationsDir).filter((file) => /^\d+_.*\.js$/.test(file)).sort().map((file) => {
    const migration = require(path.join(migrationsDir, file));
    migration.file = migration.file || file;
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
    const normalization = await normalizeSchemaMigrations(db, { dryRun: args.dryRun });
    const legacyIdIndex = await dropLegacyIdIndex(db, { dryRun: args.dryRun });
    if (args.dryRun) {
      log(`Dry-run schema_migrations normalization: would normalize ${normalization.normalized} of ${normalization.inspected} document(s).`);
      log(`Dry-run schema_migrations legacy indexes: ${JSON.stringify(legacyIdIndex)}.`);
    } else {
      if (legacyIdIndex.droppedIndexes?.length) log(`schema_migrations dropped indexes: ${JSON.stringify(legacyIdIndex.droppedIndexes)}.`);
      await ensureUniqueNameIndex(db);
    }
    const dryRunSuccessNames = successfulNamesFromNormalizedDocs(normalization.normalizedDocs);
    log(args.dryRun ? "Running migrations in dry-run mode..." : "Running migrations...");
    let executed = 0;
    for (const { file, migration } of loadMigrations()) {
      if (!migration.name || typeof migration.name !== "string" || typeof migration.up !== "function") throw new Error(`Invalid migration file: ${file}`);
      const alreadyApplied = args.dryRun
        ? dryRunSuccessNames.has(migration.name)
        : await schemaMigrations.findOne({ name: migration.name, status: "success" });
      if (alreadyApplied) { log(`Skipping ${migration.name}: already applied.`); continue; }
      log(`${args.dryRun ? "Dry-run" : "Applying"} ${migration.name}: ${migration.description || file}`);
      const started = Date.now();
      try {
        const result = await invokeMigration(migration, db, { ...args, config: getMigrationConfig(), log });
        const durationMs = Date.now() - started;
        if (result) log(`  - result: ${JSON.stringify(result)}`);
        if (!args.dryRun) await schemaMigrations.updateOne(
          { name: migration.name },
          { $set: { name: migration.name, file, description: migration.description || "", status: "success", executedAt: new Date(), summary: result || null, durationMs }, $unset: { error: "", appliedAt: "" } },
          { upsert: true }
        );
      } catch (err) {
        const durationMs = Date.now() - started;
        if (!args.dryRun) await schemaMigrations.updateOne(
          { name: migration.name },
          { $set: { name: migration.name, file, description: migration.description || "", status: "failed", executedAt: new Date(), error: err.message, durationMs } },
          { upsert: true }
        );
        throw err;
      }
      executed += 1;
    }
    log(args.dryRun ? `Dry-run complete. Pending migrations inspected: ${executed}.` : `Migrations complete. Applied: ${executed}.`);
  } finally { await client.close(); }
}

if (require.main === module) runMigrations().catch((err) => { console.error(`Migration failed: ${err.message}`); process.exit(1); });
module.exports = { runMigrations, parseArgs };
