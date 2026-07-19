const mongoose = require("mongoose");

const WordGameScoreSchema = new mongoose.Schema({
  playerName: { type: String, required: true, trim: true, maxlength: 30 },
  levelReached: { type: Number, required: true, min: 1, index: true },
  wordsFound: { type: Number, required: true, min: 0, index: true },
  totalTimeMs: { type: Number, required: true, min: 1, index: true },
  totalTimeSeconds: { type: Number, required: true, min: 0 },
  language: { type: String, required: true, enum: ["it", "en", "fr"] },
  allianceId: { type: Number, default: null, index: true },
  serverNumber: { type: Number, default: null },
  allianceCode: { type: String, default: null, trim: true, maxlength: 20 }
}, { timestamps: true, collection: "wordgamescores" });

WordGameScoreSchema.index({ allianceId: 1, levelReached: -1, wordsFound: -1, totalTimeMs: 1, createdAt: 1 });
WordGameScoreSchema.index({ levelReached: -1, wordsFound: -1, totalTimeMs: 1, createdAt: 1 });

module.exports = mongoose.model("WordGameScore", WordGameScoreSchema);
