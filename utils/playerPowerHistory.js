const PlayerPowerHistory = require("../models/playerPowerHistory");
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

function parseEventDetails(detailsRaw) {
  const details = String(detailsRaw || "").trim();
  if (!details) return null;

  const tokens = details.split("|");
  const data = {};
  for (const token of tokens) {
    const sep = token.indexOf("=");
    if (sep <= 0) continue;
    const key = token.slice(0, sep).trim();
    const value = token.slice(sep + 1).trim();
    if (!key) continue;
    data[key] = value;
  }

  const nickname = String(data.nickname || "").trim();
  if (!nickname) return null;

  return {
    nickname,
    t1: toNumber(data.powerT1),
    t2: toNumber(data.powerT2),
    t3: toNumber(data.powerT3),
    t4: toNumber(data.powerT4)
  };
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
  const trackedEvents = ["nuovo_player", "modifica_player"];
  const events = await EventLog.find({
    eventType: { $in: trackedEvents }
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  let processedEvents = 0;
  let importedSnapshots = 0;

  for (const event of events) {
    const parsed = parseEventDetails(event.details);
    if (!parsed) continue;
    processedEvents += 1;

    const day = toDayString(event.createdAt || new Date());
    const snapshotDate = dayStartUtc(day);

    const updated = await PlayerPowerHistory.findOneAndUpdate(
      {
        player: parsed.nickname,
        snapshotDay: day
      },
      {
        $set: {
          snapshotDate,
          t1: parsed.t1,
          t2: parsed.t2,
          t3: parsed.t3,
          t4: parsed.t4
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    if (updated) importedSnapshots += 1;
  }

  return {
    totalEvents: events.length,
    processedEvents,
    importedSnapshots
  };
}

module.exports = {
  savePlayerPowerSnapshot,
  rebuildSnapshotsFromEventLog
};
