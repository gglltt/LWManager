const mongoose = require("mongoose");

const EVENT_TYPES = ["VS"];

const PerformanceVsEventSchema = new mongoose.Schema(
  {
    allianceCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    serverNumber: { type: Number, required: true, index: true },
    allianceKey: { type: String, required: true, uppercase: true, trim: true, index: true },
    year: { type: Number, required: true, min: 2000, max: 2100 },
    week: { type: Number, required: true, min: 1, max: 53 },
    eventType: { type: String, required: true, enum: EVENT_TYPES, default: "VS" },
    weekStartDate: { type: Date, required: true },
    weekEndDate: { type: Date, required: true },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null }
  },
  { timestamps: true }
);

PerformanceVsEventSchema.index({ allianceKey: 1, year: 1, week: 1, eventType: 1 }, { unique: true });

module.exports = mongoose.model("PerformanceVsEvent", PerformanceVsEventSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
