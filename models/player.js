const mongoose = require("mongoose");

const TYPE_ENUM = ["Carri", "Aerei", "Missili", "Misto"];
const ROLE_ENUM = ["R1", "R2", "R3", "R4", "R5"];

const PlayerSchema = new mongoose.Schema(
  {
    nickname: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 40
    },
    role: {
      type: String,
      enum: ROLE_ENUM,
      default: null
    },

    powerT1: { type: Number, default: null, min: 0 },
    typeT1: { type: String, enum: TYPE_ENUM, default: null },

    powerT2: { type: Number, default: null, min: 0 },
    typeT2: { type: String, enum: TYPE_ENUM, default: null },

    powerT3: { type: Number, default: null, min: 0 },
    typeT3: { type: String, enum: TYPE_ENUM, default: null },

    powerT4: { type: Number, default: null, min: 0 },
    typeT4: { type: String, enum: TYPE_ENUM, default: null },

    notes: {
      type: String,
      default: "",
      maxlength: 2000
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Player", PlayerSchema);