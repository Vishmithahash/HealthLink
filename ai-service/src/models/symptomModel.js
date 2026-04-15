const mongoose = require("mongoose");
const { DOCTOR_SPECIALTIES } = require("../constants/doctorSpecialties");

const symptomSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    userRole: {
      type: String,
      required: true
    },
    symptoms: {
      type: String,
      required: true,
      trim: true
    },
    age: {
      type: Number,
      min: 0,
      max: 120,
      default: null
    },
    gender: {
      type: String,
      default: null
    },
    duration: {
      type: String,
      default: null
    },
    severity: {
      type: String,
      default: null
    },
    notes: {
      type: String,
      default: null
    },
    possibleConcerns: {
      type: [String],
      default: []
    },
    recommendedSpecialty: {
      type: String,
      required: true,
      enum: DOCTOR_SPECIALTIES,
      trim: true
    },
    advice: {
      type: String,
      required: true
    },
    urgency: {
      type: String,
      enum: ["low", "medium", "high"],
      required: true
    },
    disclaimer: {
      type: String,
      required: true
    },
    emergencyDetected: {
      type: Boolean,
      default: false
    },
    rawResponse: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("SymptomAnalysis", symptomSchema);
