const mongoose = require("mongoose");

const AccountSchema = new mongoose.Schema({
  username: { type: String, trim: true, required: true },
  allianceId: { type: Number, default: null, index: true },
  role: { type: String, enum: ["master", "supervisor", "standard"], required: true, index: true },
  pinHash: { type: String, required: true },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });
AccountSchema.pre("validate", function(next) { if (this.role === "master") { this.username = this.username || "master"; this.allianceId = null; } next(); });
AccountSchema.index({ username: 1 }, { unique: true, sparse: true });
AccountSchema.index({ allianceId: 1, role: 1 });
module.exports = mongoose.model("Account", AccountSchema, "accounts");
