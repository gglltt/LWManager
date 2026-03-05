const mongoose = require("mongoose");

const EVENT_TYPES = [
  "login_page_view",
  "login_success",
  "login_failed",
  "nuovo_player",
  "modifica_player",
  "cancellazione_player"
];

const EventLogSchema = new mongoose.Schema(
  {
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

module.exports = {
  EventLog: mongoose.model("EventLog", EventLogSchema),
  EVENT_TYPES
};
