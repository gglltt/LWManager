const mongoose = require("mongoose");
const { normalizeAllianceCode } = require("../utils/tenant");

const AllianceSchema = new mongoose.Schema({
  allianceId: { type: Number, required: true, unique: true, index: true },
  code: { type: String, required: true, trim: true },
  codeNormalized: { type: String, required: true, uppercase: true, trim: true },
  serverNumber: { type: Number, required: true },
  displayName: { type: String, trim: true, default: null },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });

AllianceSchema.pre("validate", function normalize(next) {
  this.code = String(this.code || "").trim().toUpperCase();
  this.codeNormalized = normalizeAllianceCode(this.codeNormalized || this.code);
  if (!this.displayName) this.displayName = this.code;
  next();
});
AllianceSchema.index({ serverNumber: 1, codeNormalized: 1 }, { unique: true });

module.exports = mongoose.model("Alliance", AllianceSchema);
