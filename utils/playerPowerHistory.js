const PlayerPowerHistory = require("../models/playerPowerHistory");
const Counter = require("../models/counter");
const Player = require("../models/player");

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

async function rebuildSnapshotsFromEventLog() {
  const players = await Player.find({})
    .select("nickname powerT1 powerT2 powerT3 powerT4 updatedAt")
    .sort({ updatedAt: 1, _id: 1 })
    .lean();

  let processedEvents = 0;
  let importedSnapshots = 0;

  for (const player of players) {
    const nickname = String(player?.nickname || "").trim();
    if (!nickname) continue;
    processedEvents += 1;

    const day = toDayString(player.updatedAt || new Date());
    const snapshotDate = dayStartUtc(day);

    const query = {
      player: nickname,
      snapshotDay: day
    };

    const update = {
      $set: {
        snapshotDate,
        t1: toNumber(player.powerT1),
        t2: toNumber(player.powerT2),
        t3: toNumber(player.powerT3),
        t4: toNumber(player.powerT4)
      }
    };

    let updated = await PlayerPowerHistory.findOneAndUpdate(query, update, {
      new: true
    });

    if (!updated) {
      const counter = await Counter.findOneAndUpdate(
        { key: "player_power_history" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );

      updated = await PlayerPowerHistory.findOneAndUpdate(
        query,
        {
          ...update,
          $setOnInsert: {
            seqId: counter.seq
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
    }

    if (updated) importedSnapshots += 1;
  }

  return {
    totalEvents: players.length,
    processedEvents,
    importedSnapshots
  };
}

module.exports = {
  savePlayerPowerSnapshot,
  rebuildSnapshotsFromEventLog
};
