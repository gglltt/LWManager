require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Player = require("../models/player");
const PlayerPowerHistory = require("../models/playerPowerHistory");
const PerformanceVsEvent = require("../models/performanceVsEvent");
const PerformanceVsRow = require("../models/performanceVsRow");
const { EventLog } = require("../models/eventLog");
const Account = require("../models/account");
const { DEFAULT_ALLIANCE_CODE, DEFAULT_SERVER_NUMBER, tenantFields, GLOBAL_ALLIANCE_KEY } = require("../utils/tenant");

function masterUsername() {
  return "master";
}

function accountUsername(allianceKey, role) {
  return `${allianceKey}:${role === "alliance_admin" ? "admin" : role}`;
}

async function pinHash(pin) {
  return bcrypt.hash(String(pin), 12);
}

async function accountExists(username, excludeId) {
  return Account.exists({ username, _id: { $ne: excludeId } });
}

function expectedUsername(account, tf) {
  if (account.role === "master") return masterUsername();
  const allianceKey = account.allianceKey || (account.allianceCode && account.serverNumber ? `${account.allianceCode}#${account.serverNumber}` : null);
  if (allianceKey === tf.allianceKey && ["alliance_admin", "supervisor", "standard"].includes(account.role)) {
    return accountUsername(tf.allianceKey, account.role);
  }
  return null;
}

async function cleanupNullUsernames(tf) {
  const corrected = [];
  const warnings = [];
  const accounts = await Account.find({ $or: [{ username: null }, { username: { $exists: false } }] });

  for (const account of accounts) {
    const username = expectedUsername(account, tf);
    if (username && !(await accountExists(username, account._id))) {
      await Account.updateOne({ _id: account._id }, { $set: { username, updatedAt: new Date() } });
      corrected.push(`${account._id}->${username}`);
      continue;
    }

    const fallback = `migrated:${account._id}`;
    await Account.updateOne({ _id: account._id }, { $set: { username: fallback, updatedAt: new Date() } });
    const reason = username
      ? `username canonico ${username} già presente`
      : `account non riconoscibile role=${account.role || "unknown"} allianceKey=${account.allianceKey || "unknown"}`;
    warnings.push(`${account._id}->${fallback} (${reason})`);
  }

  return { corrected, warnings };
}

async function upsertAccount({ username, doc, pin }) {
  const now = new Date();
  const existing = await Account.findOne({ username }).lean();
  const result = await Account.updateOne(
    { username },
    {
      $setOnInsert: {
        pinHash: await pinHash(pin),
        createdAt: now
      },
      $set: {
        ...doc,
        username,
        updatedAt: now
      }
    },
    { upsert: true }
  );

  let pinUpdated = false;
  if (existing && !existing.pinHash) {
    await Account.updateOne({ _id: existing._id }, { $set: { pinHash: await pinHash(pin), updatedAt: new Date() } });
    pinUpdated = true;
  }

  return {
    username,
    status: result.upsertedCount ? "created" : "existing",
    pinUpdated
  };
}

async function main() {
  await connectDB();
  const tf = tenantFields(process.env.DEFAULT_ALLIANCE_CODE || DEFAULT_ALLIANCE_CODE, process.env.DEFAULT_SERVER_NUMBER || DEFAULT_SERVER_NUMBER);
  const missing = { $or: [{ allianceKey: { $exists: false } }, { allianceKey: null }, { allianceKey: "" }] };
  const models = [Player, PlayerPowerHistory, PerformanceVsEvent, PerformanceVsRow, EventLog];
  const tenantSummary = [];

  for (const M of models) {
    const r = await M.updateMany(missing, { $set: { ...tf } });
    tenantSummary.push(`${M.modelName}: matched=${r.matchedCount} modified=${r.modifiedCount}`);
    console.log(tenantSummary[tenantSummary.length - 1]);
  }

  const cleanup = await cleanupNullUsernames(tf);
  const accountSummary = [];
  accountSummary.push(await upsertAccount({
    username: masterUsername(),
    doc: { role: "master", allianceKey: GLOBAL_ALLIANCE_KEY, isActive: true },
    pin: process.env.MASTER_PIN || "550130"
  }));
  accountSummary.push(await upsertAccount({
    username: accountUsername(tf.allianceKey, "alliance_admin"),
    doc: { ...tf, role: "alliance_admin", isActive: true },
    pin: process.env.DEFAULT_ALLIANCE_ADMIN_PIN || "111111"
  }));
  accountSummary.push(await upsertAccount({
    username: accountUsername(tf.allianceKey, "supervisor"),
    doc: { ...tf, role: "supervisor", isActive: true },
    pin: process.env.DEFAULT_ALLIANCE_SUPERVISOR_PIN || "151515"
  }));
  accountSummary.push(await upsertAccount({
    username: accountUsername(tf.allianceKey, "standard"),
    doc: { ...tf, role: "standard", isActive: true },
    pin: process.env.DEFAULT_ALLIANCE_STANDARD_PIN || process.env.APP_PIN_STANDARD || "000000"
  }));

  console.log("setup_tenants_summary:");
  console.log(`tenant_updates=${tenantSummary.join("; ")}`);
  for (const account of accountSummary) {
    console.log(`account ${account.username}: ${account.status}${account.pinUpdated ? ", pinHash updated" : ""}`);
  }
  console.log(`username_null_corrected=${cleanup.corrected.join(",") || "none"}`);
  if (cleanup.warnings.length) console.warn(`username_null_warnings=${cleanup.warnings.join(",")}`);

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
