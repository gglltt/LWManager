const mongoose = require("mongoose");

const CounterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, required: true, default: 0 }
  },
  { versionKey: false }
);

module.exports = mongoose.model("Counter", CounterSchema);
