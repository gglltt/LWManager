#!/usr/bin/env node
"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");
const { getMigrationConfig } = require("./migrationLib/config");

const migrationsDir = path.join(__dirname, "migrations");
const config = getMigrationConfig();
const requiredAccounts = [
  { username: config.masterUsername, pin: config.masterPin, role: "master", allianceId: null },
  { username: config.standardUsername, pin: config.standardPin, role: "standard", allianceId: config.allianceId },
  { username: config.supervisorUsername, pin: config.supervisorPin, role: "supervisor", allianceId: config.allianceId }
];

function migrationNames() {
  return fs.readdirSync(migrationsDir).filter((file) => /^\d+_.*\.js$/.test(file)).sort().map((file) => {
    const migration = require(path.join(migrationsDir, file));
    return migration.name || migration.id;
  });
}
async function collectionExists(db, name) { return db.listCollections({ name }, { nameOnly: true }).hasNext(); }
function authCodeUsesAccounts() {
  const authPath = path.join(__dirname, "..", "routes", "auth.js");
  const source = fs.readFileSync(authPath, "utf8");
  return source.includes('require("../models/account")') && !source.includes('require("../models/user') && !/collection\(["']users["']\)/.test(source);
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI in environment variables.");
  const client = new MongoClient(uri);
  await client.connect();
  const failures = [];
  const warnings = [];
  try {
    const db = client.db();

    if (!(await collectionExists(db, "alliances"))) failures.push("collection alliances does not exist");
    else {
      const alliance = await db.collection("alliances").findOne({ allianceId: config.allianceId });
      if (!alliance) failures.push("allianceId=1 is missing");
      else {
        if (alliance.code !== config.allianceCode || alliance.codeNormalized !== config.codeNormalized || Number(alliance.serverNumber) !== config.serverNumber) failures.push("allianceId=1 is not BISS#833 with codeNormalized/serverNumber");
        if (alliance.isActive !== true) failures.push("allianceId=1 is not active");
      }
    }

    if (!(await collectionExists(db, "accounts"))) failures.push("collection accounts does not exist");
    else {
      const accounts = db.collection("accounts");
      const nullUsernames = await accounts.countDocuments({ $or: [{ username: null }, { username: { $exists: false } }, { username: "" }] });
      if (nullUsernames) failures.push(`${nullUsernames} account(s) have null/missing/empty username`);
      const plainSecrets = await accounts.countDocuments({ $or: [{ pin: { $exists: true } }, { password: { $exists: true } }, { plainPin: { $exists: true } }] });
      if (plainSecrets) failures.push(`${plainSecrets} account(s) contain plain PIN/password fields`);
      const adminAccounts = await accounts.countDocuments({ role: { $in: ["admin", "alliance_admin"] } });
      if (adminAccounts) failures.push(`${adminAccounts} admin account(s) found; only master, supervisor and standard are allowed`);

      for (const expected of requiredAccounts) {
        const account = await accounts.findOne({ username: expected.username });
        if (!account) { failures.push(`missing account ${expected.username}`); continue; }
        if (account.role !== expected.role) failures.push(`${expected.username} role is ${account.role}, expected ${expected.role}`);
        if ((account.allianceId ?? null) !== expected.allianceId) failures.push(`${expected.username} allianceId is ${account.allianceId}, expected ${expected.allianceId}`);
        const hash = account.pinHash || account.passwordHash;
        if (!hash) failures.push(`${expected.username} does not have pinHash/passwordHash`);
        if (hash === expected.pin) failures.push(`${expected.username} PIN is stored in clear text`);
        if (hash && !(await bcrypt.compare(expected.pin, hash))) failures.push(`${expected.username} PIN hash does not match expected default PIN`);
      }
    }

    if (!authCodeUsesAccounts()) failures.push("routes/auth.js must use accounts/Account and must not use users/User for login");
    if (await collectionExists(db, "users")) warnings.push("Collection users rilevata ma non usata dal sistema di autenticazione. Gli account ufficiali sono in accounts.");

    if (await collectionExists(db, "schema_migrations")) {
      const schemaMigrations = db.collection("schema_migrations");
      const missingNames = await schemaMigrations.countDocuments({ $or: [{ name: null }, { name: { $exists: false } }, { name: "" }] });
      if (missingNames) failures.push(`${missingNames} schema_migrations document(s) have null/missing/empty name`);
      const idOnly = await schemaMigrations.countDocuments({ id: { $exists: true }, $or: [{ name: null }, { name: { $exists: false } }, { name: "" }] });
      if (idOnly) failures.push(`${idOnly} schema_migrations document(s) have id but no canonical name`);
      const duplicateNames = await schemaMigrations.aggregate([
        { $match: { name: { $type: "string", $ne: "" } } },
        { $group: { _id: "$name", count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
      ]).toArray();
      for (const duplicate of duplicateNames) failures.push(`schema_migrations duplicate name: ${duplicate._id} (${duplicate.count} records)`);
      const indexes = await schemaMigrations.indexes();
      const uniqueNameIndex = indexes.find((index) => JSON.stringify(index.key) === JSON.stringify({ name: 1 }) && index.unique === true);
      if (!uniqueNameIndex) failures.push("schema_migrations is missing a unique index on name");
      const fileNames = migrationNames();
      for (const name of fileNames) {
        const record = await schemaMigrations.findOne({ name, status: "success" });
        if (!record) warnings.push(`migration ${name} is not recorded as success in schema_migrations`);
      }
      const known = new Set(fileNames);
      const applied = await schemaMigrations.find({ status: "success", name: { $type: "string" } }).project({ name: 1 }).toArray();
      for (const record of applied) if (!known.has(record.name)) warnings.push(`applied migration ${record.name} has no matching file in scripts/migrations`);
    } else failures.push("schema_migrations collection does not exist");

    for (const warning of warnings) console.warn(`Warning: ${warning}`);
    if (failures.length) {
      console.error("Migration check failed:");
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exit(1);
    }
    console.log("Migration check passed. Official authentication collection: accounts.");
  } finally { await client.close(); }
}
main().catch((err) => { console.error(`Migration check failed: ${err.message}`); process.exit(1); });
