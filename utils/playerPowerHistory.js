const mongoose = require("mongoose");
const PlayerPowerHistory = require("../models/playerPowerHistory");
const Counter = require("../models/counter");
const Player = require("../models/player");
const { EventLog } = require("../models/eventLog");

function toDayString(date) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayStartUtc(dayString) {
  return new Date(`${dayString}T00:00:00.000Z`);
}

function toNumber(v) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

async function savePlayerPowerSnapshot(player) {
  if (!player || !player.nickname) return;

  const day = toDayString(new Date());
  const snapshotDate = dayStartUtc(day);

  const existing = await PlayerPowerHistory.findOne({
    player: player.nickname,
    snapshotDay: day
  });

  if (existing) {
    existing.t1 = toNumber(player.powerT1);
    existing.t2 = toNumber(player.powerT2);
    existing.t3 = toNumber(player.powerT3);
    existing.t4 = toNumber(player.powerT4);
    existing.snapshotDate = snapshotDate;
    await existing.save();
    return;
  }

  await PlayerPowerHistory.create({
    player: player.nickname,
    snapshotDay: day,
    snapshotDate,
    t1: toNumber(player.powerT1),
    t2: toNumber(player.powerT2),
    t3: toNumber(player.powerT3),
    t4: toNumber(player.powerT4)
  });
}

function parsePlayerDetails(details) {
  const result = {};
  const raw = String(details || "").trim();
  if (!raw) return result;

  raw.split("|").forEach((chunk) => {
    const [key, ...rest] = chunk.split("=");
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return;
    result[normalizedKey] = rest.join("=").trim();
  });

  return result;
}

async function rebuildSnapshotsFromEventLog() {
  const players = await Player.find({})
    .select("nickname powerT1 powerT2 powerT3 powerT4 updatedAt")
    .sort({ updatedAt: 1, _id: 1 })
    .lean();

  const events = await EventLog.find({
    eventType: { $in: ["nuovo_player", "modifica_player"] }
  })
    .sort({ createdAt: 1, _id: 1 })
    .select("details createdAt")
    .lean();

  let processedPlayers = 0;
  let processedEvents = 0;
  const snapshotsByKey = new Map();

  // 1) Seed tracking with current player powers.
  for (const player of players) {
    const nickname = String(player?.nickname || "").trim();
    if (!nickname) continue;
    processedPlayers += 1;

    const day = toDayString(player.updatedAt || new Date());
    const key = `${nickname}::${day}`;
    snapshotsByKey.set(key, {
      player: nickname,
      snapshotDay: day,
      snapshotDate: dayStartUtc(day),
      t1: toNumber(player.powerT1),
      t2: toNumber(player.powerT2),
      t3: toNumber(player.powerT3),
      t4: toNumber(player.powerT4)
    });
  }

  // 2) Backfill history from event log without replacing seeded snapshots.
  for (const event of events) {
    const fields = parsePlayerDetails(event?.details);
    const nickname = String(fields.nickname || "").trim();
    if (!nickname) continue;

    processedEvents += 1;
    const day = toDayString(event.createdAt || new Date());
    const key = `${nickname}::${day}`;

    if (snapshotsByKey.has(key)) continue;

    snapshotsByKey.set(key, {
      player: nickname,
      snapshotDay: day,
      snapshotDate: dayStartUtc(day),
      t1: toNumber(fields.powerT1),
      t2: toNumber(fields.powerT2),
      t3: toNumber(fields.powerT3),
      t4: toNumber(fields.powerT4)
    });
  }

  const snapshots = Array.from(snapshotsByKey.values()).sort((a, b) => {
    const dateDiff = a.snapshotDate.getTime() - b.snapshotDate.getTime();
    if (dateDiff !== 0) return dateDiff;
    const playerDiff = a.player.localeCompare(b.player, "it");
    if (playerDiff !== 0) return playerDiff;
    return a.snapshotDay.localeCompare(b.snapshotDay);
  });

  const docs = snapshots.map((snapshot, index) => ({
    ...snapshot,
    seqId: index + 1
  }));

  const db = mongoose.connection.db;
  const mainCollectionName = PlayerPowerHistory.collection.name;
  const tempCollectionName = `${mainCollectionName}_rebuild_tmp`;
  const dbName = mongoose.connection.name;

  const existingCollections = await db.listCollections({ name: tempCollectionName }).toArray();
  if (existingCollections.length > 0) {
    await db.collection(tempCollectionName).drop();
  }

  if (docs.length > 0) {
    await db.collection(tempCollectionName).insertMany(docs, { ordered: true });
  } else {
    await db.createCollection(tempCollectionName);
  }

  await db.collection(tempCollectionName).createIndex({ seqId: 1 }, { unique: true });
  await db.collection(tempCollectionName).createIndex({ player: 1 });
  await db.collection(tempCollectionName).createIndex({ snapshotDate: 1 });
  await db.collection(tempCollectionName).createIndex({ player: 1, snapshotDay: 1 }, { unique: true });

  await db.admin().command({
    renameCollection: `${dbName}.${tempCollectionName}`,
    to: `${dbName}.${mainCollectionName}`,
    dropTarget: true
  });

  await Counter.findOneAndUpdate(
    { key: "player_power_history" },
    { $set: { seq: docs.length } },
    { upsert: true, new: true }
  );

  return {
    totalPlayers: players.length,
    processedPlayers,
    totalEvents: events.length,
    processedEvents,
    importedSnapshots: docs.length
  };
}


module.exports = {
  savePlayerPowerSnapshot,
  rebuildSnapshotsFromEventLog
};
