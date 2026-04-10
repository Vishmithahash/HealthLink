const mongoose = require("mongoose");

const medicalHistoryItemSchema = new mongoose.Schema(
  {
    condition: {
      type: String,
      required: true,
      trim: true
    },
    diagnosisDate: {
      type: Date,
      default: null
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },
    ongoing: {
      type: Boolean,
      default: false
    }
  },
  { _id: false }
);

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

const prescriptionItemSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: String,
      trim: true,
      default: null
    },
    doctorId: {
      type: String,
      trim: true,
      default: null
    },
    issuedAt: {
      type: Date,
      default: Date.now
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
    medicines: {
      type: [medicineSchema],
      default: []
    }
  },
  { _id: true }
);

const patientSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 140
    },
    dob: {
      type: Date,
      default: null
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say"],
      default: "prefer_not_to_say"
    },
    phone: {
      type: String,
      trim: true,
      default: ""
    },
    address: {
      type: String,
      trim: true,
      maxlength: 400,
      default: ""
    },
    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"],
      default: "UNKNOWN"
    },
    medicalHistory: {
      type: [medicalHistoryItemSchema],
      default: []
    },
    uploadedReports: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Report"
      }
    ],
    prescriptions: {
      type: [prescriptionItemSchema],
      default: []
    },
    allergies: {
      type: [String],
      default: []
    },
    emergencyContact: {
      name: {
        type: String,
        trim: true,
        default: ""
      },
      relationship: {
        type: String,
        trim: true,
        default: ""
      },
      phone: {
        type: String,
        trim: true,
        default: ""
      }
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
      index: true
    }
  },
  {
    timestamps: true
  }
);

patientSchema.index({ fullName: 1 });

module.exports = mongoose.model("Patient", patientSchema);
