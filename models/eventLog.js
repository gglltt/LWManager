const mongoose = require("mongoose");

const EVENT_TYPES = [
  "login_page_view",
  "login_success",
  "login_failed",
  "login_rate_limited",
  "login_blocked",
  "logout",
  "admin_access_denied",
  "password_change",
  "password_change_failed",
  "password_change_denied",
  "password_reset",
  "performance_vs_save",
  "performance_vs_event_delete",
  "nuovo_player",
  "modifica_player",
  "cancellazione_player",
  "sync_prod_to_qa",
  "alliance_create",
  "alliance_deactivate"
];

const EventLogSchema = new mongoose.Schema(
  {
    allianceId: { type: Number, default: null, index: true },
    role: { type: String, default: null, trim: true },
    accountId: { type: String, default: null, trim: true },
    eventType: {
      type: String,
      enum: EVENT_TYPES,
      required: true,
      index: true
    },
    sourceIp: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    browserType: {
      type: String,
      default: "unknown",
      trim: true,
      maxlength: 120
    },
    sourceMachine: {
      type: String,
      default: "unknown",
      trim: true,
      maxlength: 120
    },
    sourceCity: {
      type: String,
      default: "unknown",
      trim: true,
      maxlength: 120
    },
    sourceRegion: {
      type: String,
      default: "unknown",
      trim: true,
      maxlength: 120
    },
    sourceCountry: {
      type: String,
      default: "unknown",
      trim: true,
      maxlength: 120
    },
    userAgent: {
      type: String,
      default: "unknown",
      trim: true,
      maxlength: 1000
    },
    details: {
      type: String,
      default: "",
      maxlength: 5000
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { versionKey: false }
);

EventLogSchema.index({ allianceId: 1, createdAt: -1 });
EventLogSchema.index({ eventType: 1, createdAt: -1 });
module.exports = {
  EventLog: mongoose.model("EventLog", EventLogSchema),
  EVENT_TYPES
};
