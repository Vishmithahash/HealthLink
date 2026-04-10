const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    dosage: {
      type: String,
      required: true,
      trim: true
    },
    frequency: {
      type: String,
      trim: true,
      default: ""
    },
    duration: {
      type: String,
      trim: true,
      default: ""
    },
    notes: {
      type: String,
      trim: true,
      default: ""
    }
  },
  { _id: false }
);

const prescriptionSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true
    },
    doctorUserId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    patientId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    medicines: {
      type: [medicineSchema],
      required: true,
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "At least one medicine is required"
      }
    },
    instructions: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },
    followUpDate: {
      type: Date,
      default: null
    },
    issuedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Prescription", prescriptionSchema);
