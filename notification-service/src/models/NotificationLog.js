const mongoose = require("mongoose");

const recipientSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true
    },
    role: {
      type: String,
      default: "general"
    },
    status: {
      type: String,
      enum: ["sent", "failed"],
      required: true
    },
    error: {
      type: String,
      default: null
    },
    messageId: {
      type: String,
      default: null
    }
  },
  { _id: false }
);

const notificationLogSchema = new mongoose.Schema(
  {
    templateType: {
      type: String,
      required: true
    },
    subject: {
      type: String,
      required: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    recipients: {
      type: [recipientSchema],
      default: []
    },
    sentCount: {
      type: Number,
      default: 0
    },
    failedCount: {
      type: Number,
      default: 0
    },
    sms: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports = mongoose.model("NotificationLog", notificationLogSchema);
