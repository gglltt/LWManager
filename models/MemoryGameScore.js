const mongoose = require("mongoose");

const MemoryGameScoreSchema = new mongoose.Schema({
  playerName: { type: String, required: true, trim: true, maxlength: 30 },
  score: { type: Number, required: true, min: 0, index: true },
  levelsCompleted: { type: Number, required: true, min: 0, max: 10 },
  levelReached: { type: Number, required: true, min: 1, max: 10 },
  pairsFound: { type: Number, required: true, min: 0 },
  mistakes: { type: Number, required: true, min: 0 },
  totalTimeMs: { type: Number, required: true, min: 1, index: true },
  totalTimeSeconds: { type: Number, required: true, min: 0 },
  allianceId: { type: Number, default: null, index: true },
  serverNumber: { type: Number, default: null },
  allianceCode: { type: String, default: null, trim: true, maxlength: 20 }
}, { timestamps: { createdAt: true, updatedAt: false } });

MemoryGameScoreSchema.index({ allianceId: 1, score: -1, levelsCompleted: -1, totalTimeMs: 1, createdAt: 1 });
MemoryGameScoreSchema.index({ score: -1, levelsCompleted: -1, totalTimeMs: 1, createdAt: 1 });

module.exports = mongoose.model("MemoryGameScore", MemoryGameScoreSchema);
