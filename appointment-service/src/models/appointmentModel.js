const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    patientId: {
      type: String,
      required: true,
      index: true
    },
    doctorId: {
      type: String,
      required: true,
      index: true
    },
    specialty: {
      type: String,
      required: true,
      trim: true
    },
    scheduledAt: {
      type: Date,
      required: true,
      index: true
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 10,
      max: 180,
      default: 30
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed", "rejected"],
      default: "pending",
      index: true
    },
    paymentStatus: {
      type: String,
      enum: ["not_required", "pending", "paid", "failed", "refunded"],
      default: "pending"
    },
    cancelledReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    createdBy: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

appointmentSchema.index({ doctorId: 1, scheduledAt: 1 });
appointmentSchema.index({ patientId: 1, scheduledAt: -1 });

module.exports = mongoose.model("Appointment", appointmentSchema);
