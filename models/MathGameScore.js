const mongoose = require("mongoose");

const MathGameScoreSchema = new mongoose.Schema({
  playerName: { type: String, required: true, trim: true, maxlength: 30 },
  levelsCompleted: { type: Number, required: true, min: 0, index: true },
  reachedLevel: { type: Number, required: true, min: 1 },
  totalTimeMs: { type: Number, required: true, min: 1, index: true },
  totalTimeSeconds: { type: Number, required: true, min: 0 },
  allianceId: { type: Number, default: null, index: true },
  serverNumber: { type: Number, default: null },
  allianceCode: { type: String, default: null, trim: true, maxlength: 20 }
}, { timestamps: { createdAt: true, updatedAt: false } });

MathGameScoreSchema.index({ allianceId: 1, levelsCompleted: -1, totalTimeMs: 1, createdAt: 1 });
MathGameScoreSchema.index({ levelsCompleted: -1, totalTimeMs: 1, createdAt: 1 });

module.exports = mongoose.model("MathGameScore", MathGameScoreSchema);
