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
    return migration.name;
  });
}
async function collectionExists(db, name) { return db.listCollections({ name }, { nameOnly: true }).hasNext(); }
function authCodeUsesAccounts() {
  const authPath = path.join(__dirname, "..", "routes", "auth.js");
  const source = fs.readFileSync(authPath, "utf8");
  return source.includes('require("../models/account")') && !source.includes('require("../models/user') && !/collection\(["']users["']\)/.test(source);
}

function runnerUsesCanonicalNameOnly() {
  const source = fs.readFileSync(path.join(__dirname, "runMigrations.js"), "utf8");
  return source.includes("{ name: migration.name }")
    && source.includes("findOne({ name: migration.name, status: \"success\" })")
    && !/findOne\s*\(\s*\{\s*id\s*:/.test(source)
    && !/updateOne\s*\(\s*\{\s*id\s*:/.test(source)
    && !/createIndex\s*\(\s*\{\s*id\s*:/.test(source)
    && !/migration\.id/.test(source);
}

function sameKeys(actual, expected) { return JSON.stringify(actual) === JSON.stringify(expected); }
function hasUniqueIndex(indexes, keys) { return indexes.some((index) => sameKeys(index.key, keys) && index.unique === true); }
function allianceCreateRouteUsesCanonicalKey() {
  const adminPath = path.join(__dirname, "..", "routes", "admin.js");
  const source = fs.readFileSync(adminPath, "utf8");
  const createRoute = source.match(/router\.post\("\/alliances"[\s\S]*?\n\}\);/);
  if (!createRoute) return false;
  const route = createRoute[0];
  const beforeCatch = route.split("} catch (err)")[0] || route;
  return beforeCatch.includes("Alliance.findOne({ serverNumber, codeNormalized })")
    && beforeCatch.includes("codeNormalized")
    && beforeCatch.includes("serverNumber")
    && !beforeCatch.includes("allianceKey");
}
function allianceModelDoesNotDefineAllianceKeyUnique() {
  const modelPath = path.join(__dirname, "..", "models", "alliance.js");
  const source = fs.readFileSync(modelPath, "utf8");
  return !/allianceKey\s*:[\s\S]*?unique\s*:\s*true/.test(source)
    && !/index\s*\(\s*\{\s*allianceKey\s*:\s*1\s*\}\s*,\s*\{[\s\S]*?unique\s*:\s*true/.test(source);
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
      const alliances = db.collection("alliances");
      const alliance = await alliances.findOne({ allianceId: config.allianceId });
      if (!alliance) failures.push("allianceId=1 is missing");
      else {
        if (alliance.code !== config.allianceCode || alliance.codeNormalized !== config.codeNormalized || Number(alliance.serverNumber) !== config.serverNumber) failures.push("allianceId=1 is not BISS#833 with codeNormalized/serverNumber");
        if (alliance.isActive !== true) failures.push("allianceId=1 is not active");
      }

      const allianceIndexes = await alliances.indexes();
      if (allianceIndexes.some((index) => index.name === "allianceKey_1")) failures.push("Legacy index alliances.allianceKey_1 still exists and must be dropped.");
      if (!hasUniqueIndex(allianceIndexes, { allianceId: 1 })) failures.push("missing alliances unique allianceId index");
      if (!hasUniqueIndex(allianceIndexes, { serverNumber: 1, codeNormalized: 1 })) failures.push("missing alliances unique serverNumber/codeNormalized index");
      const nullAllianceIds = await alliances.countDocuments({ $or: [{ allianceId: null }, { allianceId: { $exists: false } }] });
      if (nullAllianceIds) failures.push(`${nullAllianceIds} alliance(s) have null/missing allianceId`);
      const missingCodeNormalized = await alliances.countDocuments({ $or: [{ codeNormalized: null }, { codeNormalized: { $exists: false } }, { codeNormalized: "" }] });
      if (missingCodeNormalized) failures.push(`${missingCodeNormalized} alliance(s) have missing codeNormalized`);
      const missingServerNumber = await alliances.countDocuments({ $or: [{ serverNumber: null }, { serverNumber: { $exists: false } }] });
      if (missingServerNumber) failures.push(`${missingServerNumber} alliance(s) have missing serverNumber`);
      const duplicateAllianceKeys = await alliances.aggregate([
        { $match: { serverNumber: { $ne: null, $exists: true }, codeNormalized: { $type: "string", $ne: "" } } },
        { $group: { _id: { serverNumber: "$serverNumber", codeNormalized: "$codeNormalized" }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
      ]).toArray();
      for (const duplicate of duplicateAllianceKeys) failures.push(`duplicate alliance key: serverNumber=${duplicate._id.serverNumber}, codeNormalized=${duplicate._id.codeNormalized} (${duplicate.count} records)`);
      if (!allianceCreateRouteUsesCanonicalKey()) failures.push("admin alliance creation route must use serverNumber/codeNormalized and must not depend on allianceKey");
      if (!allianceModelDoesNotDefineAllianceKeyUnique()) failures.push("Alliance model must not define allianceKey as unique");
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
    if (!runnerUsesCanonicalNameOnly()) failures.push("scripts/runMigrations.js must use canonical name tracking only and must not use id");
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
      const uniqueNameIndex = indexes.find((index) => index.name === "name_1" && JSON.stringify(index.key) === JSON.stringify({ name: 1 }) && index.unique === true);
      if (!uniqueNameIndex) failures.push("schema_migrations is missing unique index name_1 on name");
      const uniqueIdIndex = indexes.find((index) => index.name === "id_1" && JSON.stringify(index.key) === JSON.stringify({ id: 1 }) && index.unique === true);
      if (uniqueIdIndex) failures.push("schema_migrations still has legacy unique index id_1");
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
