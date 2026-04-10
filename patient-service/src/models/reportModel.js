const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true
    },
    patientUserId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    documentType: {
      type: String,
      trim: true,
      default: "general"
    },
    title: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ""
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1200,
      default: ""
    },
    fileName: {
      type: String,
      required: true,
      trim: true
    },
    originalName: {
      type: String,
      required: true,
      trim: true
    },
    mimeType: {
      type: String,
      required: true,
      trim: true
    },
    fileSize: {
      type: Number,
      required: true
    },
    filePath: {
      type: String,
      required: true,
      trim: true
    },
    uploadedByUserId: {
      type: String,
      required: true,
      trim: true
    },
    uploadedByRole: {
      type: String,
      required: true,
      trim: true
    },
    consultationId: {
      type: String,
      trim: true,
      default: null
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

reportSchema.index({ patientUserId: 1, uploadedAt: -1 });

module.exports = mongoose.model("Report", reportSchema);
