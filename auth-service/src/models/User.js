const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const env = require("../config/env");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 120
    },
    nic: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      minlength: 10,
      maxlength: 20
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 9,
      maxlength: 20
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 40,
      lowercase: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      enum: ["patient", "Doctor", "Admin"],
      required: true,
      default: "patient"
    },
    specialty: {
      type: String,
      enum: [
        "General Physician",
        "Cardiologist",
        "Dermatologist",
        "Neurologist",
        "Orthopedic",
        "Pediatrician",
        "Gynecologist",
        "Psychiatrist",
        "ENT Specialist",
        "Ophthalmologist"
      ],
      required: function requiredSpecialty() {
        return this.role === "Doctor";
      },
      default: null,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    refreshTokenHash: {
      type: String,
      default: null,
      select: false
    }
  },
  {
    timestamps: true
  }
);

userSchema.pre("save", async function hashPasswordIfNeeded(next) {
  if (!this.isModified("passwordHash")) {
    return next();
  }

  if (this.passwordHash.startsWith("$2a$") || this.passwordHash.startsWith("$2b$") || this.passwordHash.startsWith("$2y$")) {
    return next();
  }

  this.passwordHash = await bcrypt.hash(this.passwordHash, env.bcryptSaltRounds);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id,
    fullName: this.fullName,
    nic: this.nic,
    phoneNumber: this.phoneNumber,
    username: this.username,
    email: this.email,
    role: this.role,
    specialty: this.specialty,
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

module.exports = mongoose.model("User", userSchema);
