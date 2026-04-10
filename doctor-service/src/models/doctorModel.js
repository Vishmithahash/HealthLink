const mongoose = require("mongoose");

const availabilitySlotSchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: Number,
      min: 0,
      max: 6,
      default: null
    },
    startTime: {
      type: String,
      trim: true,
      default: null
    },
    endTime: {
      type: String,
      trim: true,
      default: null
    },
    startAt: {
      type: Date,
      default: null
    },
    endAt: {
      type: Date,
      default: null
    },
    mode: {
      type: String,
      enum: ["in_person", "online", "both"],
      default: "both"
    }
  },
  { _id: false }
);

const unavailablePeriodSchema = new mongoose.Schema(
  {
    from: {
      type: Date,
      required: true
    },
    to: {
      type: Date,
      required: true
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: ""
    }
  },
  { _id: false }
);

const doctorSchema = new mongoose.Schema(
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
    specialization: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    licenseNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    qualification: {
      type: String,
      trim: true,
      maxlength: 400,
      default: ""
    },
    experienceYears: {
      type: Number,
      min: 0,
      max: 80,
      default: 0
    },
    consultationFee: {
      type: Number,
      min: 0,
      default: 0
    },
    workingHours: {
      start: {
        type: String,
        trim: true,
        default: "09:00"
      },
      end: {
        type: String,
        trim: true,
        default: "17:00"
      },
      timezone: {
        type: String,
        trim: true,
        default: "UTC"
      }
    },
    availabilitySlots: {
      type: [availabilitySlotSchema],
      default: []
    },
    unavailablePeriods: {
      type: [unavailablePeriodSchema],
      default: []
    },
    status: {
      type: String,
      enum: ["active", "inactive", "verified", "suspended"],
      default: "inactive",
      index: true
    },
    verified: {
      type: Boolean,
      default: false,
      index: true
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 1500,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

doctorSchema.index({ specialization: 1, status: 1, verified: 1 });

module.exports = mongoose.model("Doctor", doctorSchema);
