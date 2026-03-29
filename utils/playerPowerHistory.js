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

async function upsertSnapshot(player, snapshotDay, values, { overwriteExisting = true } = {}) {
  if (!player || !snapshotDay) return false;

  const query = { player, snapshotDay };
  const existing = await PlayerPowerHistory.findOne(query).select("_id").lean();
  if (existing && !overwriteExisting) return false;

  const payload = {
    snapshotDate: dayStartUtc(snapshotDay),
    t1: toNumber(values.t1),
    t2: toNumber(values.t2),
    t3: toNumber(values.t3),
    t4: toNumber(values.t4)
  };

  if (existing) {
    await PlayerPowerHistory.updateOne({ _id: existing._id }, { $set: payload });
    return true;
  }

  await PlayerPowerHistory.create({
    player,
    snapshotDay,
    ...payload
  });
  return true;
}

async function rebuildSnapshotsFromEventLog() {
  await PlayerPowerHistory.deleteMany({});
  await Counter.findOneAndUpdate(
    { key: "player_power_history" },
    { $set: { seq: 0 } },
    { upsert: true, new: true }
  );

  const players = await Player.find({})
    .select("nickname powerT1 powerT2 powerT3 powerT4 updatedAt")
    .sort({ updatedAt: 1, _id: 1 })
    .lean();

  let processedPlayers = 0;
  let importedSnapshots = 0;

  // 1) Seed tracking with current player powers (at least one snapshot per player).
  for (const player of players) {
    const nickname = String(player?.nickname || "").trim();
    if (!nickname) continue;
    processedPlayers += 1;

    const day = toDayString(new Date());
    const inserted = await upsertSnapshot(
      nickname,
      day,
      {
        t1: player.powerT1,
        t2: player.powerT2,
        t3: player.powerT3,
        t4: player.powerT4
      },
      { overwriteExisting: true }
    );
    if (inserted) importedSnapshots += 1;
  }

  // 2) Backfill history from event log without replacing already seeded current-day snapshots.
  const events = await EventLog.find({
    eventType: { $in: ["nuovo_player", "modifica_player"] }
  })
    .sort({ createdAt: 1, _id: 1 })
    .select("details createdAt")
    .lean();

  let processedEvents = 0;
  for (const event of events) {
    const fields = parsePlayerDetails(event?.details);
    const nickname = String(fields.nickname || "").trim();
    if (!nickname) continue;

    processedEvents += 1;
    const day = toDayString(event.createdAt || new Date());

    const inserted = await upsertSnapshot(
      nickname,
      day,
      {
        t1: fields.powerT1,
        t2: fields.powerT2,
        t3: fields.powerT3,
        t4: fields.powerT4
      },
      { overwriteExisting: false }
    );

    if (inserted) {
      importedSnapshots += 1;
    }
  }

  return {
    totalPlayers: players.length,
    processedPlayers,
    totalEvents: events.length,
    processedEvents,
    importedSnapshots
  };
}

module.exports = {
  savePlayerPowerSnapshot,
  rebuildSnapshotsFromEventLog
};
