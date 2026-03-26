const mongoose = require("mongoose");
const { TEAM_TYPE_OPTIONS } = require("../config/i18n");

const TYPE_ENUM = TEAM_TYPE_OPTIONS;
const ROLE_ENUM = ["R1", "R2", "R3", "R4", "R5"];

const decimalField = {
  type: Number,
  default: null,
  min: 0,
  set: (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (Number.isNaN(n)) return null;
    return Math.round(n * 100) / 100; // 2 decimali
  }
};

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

    powerT1: decimalField,
    typeT1: { type: String, enum: TYPE_ENUM, default: null },

    powerT2: decimalField,
    typeT2: { type: String, enum: TYPE_ENUM, default: null },

    powerT3: decimalField,
    typeT3: { type: String, enum: TYPE_ENUM, default: null },

    powerT4: decimalField,
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