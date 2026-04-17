const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: String,
      required: true,
      trim: true,
      index: true,
      unique: true
    },
    patientId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    doctorId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    roomName: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true
    },
    meetingUrl: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ["scheduled", "ongoing", "completed"],
      default: "scheduled",
      index: true
    },
    startedAt: {
      type: Date,
      default: null
    },
    endedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("TelemedicineSession", sessionSchema);
