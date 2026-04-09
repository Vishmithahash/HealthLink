const mongoose = require("mongoose");

const doctorAvailabilitySchema = new mongoose.Schema(
  {
    doctorId: {
      type: String,
      required: true,
      index: true
    },
    startAt: {
      type: Date,
      required: true,
      index: true
    },
    endAt: {
      type: Date,
      required: true,
      index: true
    },
    setBy: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

doctorAvailabilitySchema.index({ doctorId: 1, startAt: 1, endAt: 1 });

module.exports = mongoose.model("DoctorAvailability", doctorAvailabilitySchema);
