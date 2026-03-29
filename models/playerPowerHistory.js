const mongoose = require("mongoose");
const Counter = require("./counter");

const decimalField = {
  type: Number,
  default: 0,
  min: 0,
  set: (v) => {
    const n = Number(v);
    if (Number.isNaN(n)) return 0;
    return Math.round(n * 100) / 100;
  }
};

const PlayerPowerHistorySchema = new mongoose.Schema(
  {
    seqId: { type: Number, unique: true, index: true },
    player: { type: String, required: true, trim: true, index: true },
    snapshotDate: { type: Date, required: true, index: true },
    snapshotDay: { type: String, required: true },
    t1: decimalField,
    t2: decimalField,
    t3: decimalField,
    t4: decimalField
  },
  { timestamps: true }
);

PlayerPowerHistorySchema.index({ player: 1, snapshotDay: 1 }, { unique: true });

PlayerPowerHistorySchema.pre("save", async function assignSeqId(next) {
  if (!this.isNew || this.seqId) return next();
  try {
    const counter = await Counter.findOneAndUpdate({ key: "player_power_history" }, { $inc: { seq: 1 } }, { new: true, upsert: true });
    this.seqId = counter.seq;
    return next();
  } catch (err) {
    return next(err);
  }
});

module.exports = mongoose.model("PlayerPowerHistory", PlayerPowerHistorySchema);
