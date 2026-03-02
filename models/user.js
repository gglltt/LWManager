const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    nickname: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 40
    },
    passwordHash: {
      type: String,
      required: true
    },
    authLevel: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      default: 1
    },
    isVerified: {
      type: Boolean,
      default: false
    },

    // Email verification token (hashed) + expiry
    emailVerifyTokenHash: { type: String, default: null },
    emailVerifyTokenExpiresAt: { type: Date, default: null },

    // Password reset token (hashed) + expiry
    passwordResetTokenHash: { type: String, default: null },
    passwordResetTokenExpiresAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);