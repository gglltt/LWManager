const mongoose = require("mongoose");
const { buildAllianceKey, normalizeAllianceCode, normalizeServerNumber } = require("../utils/tenant");

const AccountSchema = new mongoose.Schema({
  username: { type: String, trim: true, lowercase: true, default: null },
  allianceCode: { type: String, trim: true, uppercase: true, default: null },
  serverNumber: { type: Number, default: null },
  allianceKey: { type: String, trim: true, uppercase: true, default: null, index: true },
  role: { type: String, enum: ["master", "alliance_admin", "editor", "supervisor"], required: true, index: true },
  pinHash: { type: String, required: true },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });
AccountSchema.pre("validate", function(next) {
  if (this.role === "master") { this.username = this.username || "master"; this.allianceKey = "GLOBAL"; return next(); }
  this.allianceCode = normalizeAllianceCode(this.allianceCode);
  this.serverNumber = normalizeServerNumber(this.serverNumber);
  this.allianceKey = buildAllianceKey(this.allianceCode, this.serverNumber);
  next();
});
AccountSchema.index({ username: 1 }, { unique: true, sparse: true });
AccountSchema.index({ allianceKey: 1, role: 1 });
module.exports = mongoose.model("Account", AccountSchema);
