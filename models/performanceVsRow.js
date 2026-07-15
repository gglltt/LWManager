const mongoose = require("mongoose");

const PerformanceVsRowSchema = new mongoose.Schema(
  {
    allianceId: { type: Number, required: true, index: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "PerformanceVsEvent", required: true, index: true },
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player", required: true },
    position: { type: Number, required: true, min: 1, max: 1000 },
    score: { type: Number, required: true, min: 1, max: 999999999 },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null }
  },
  { timestamps: true }
);

PerformanceVsRowSchema.index({ eventId: 1, playerId: 1 }, { unique: true });
PerformanceVsRowSchema.index({ eventId: 1, position: 1 }, { unique: true });
PerformanceVsRowSchema.index({ allianceId: 1, eventId: 1 });
PerformanceVsRowSchema.index({ allianceId: 1, playerId: 1 });

module.exports = mongoose.model("PerformanceVsRow", PerformanceVsRowSchema);
