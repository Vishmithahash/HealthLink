const mongoose = require("mongoose");

const PAYMENT_METHODS = ["stripe_card", "bank_transfer"];
const PAYMENT_STATUSES = [
  "pending",
  "succeeded",
  "failed",
  "pending_verification",
  "rejected"
];

const paymentSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    patientId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    doctorId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: PAYMENT_METHODS,
      index: true
    },
    stripePaymentIntentId: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01
    },
    currency: {
      type: String,
      required: true,
      enum: ["USD", "LKR"],
      uppercase: true,
      trim: true
    },
    slipUrl: {
      type: String,
      default: null,
      trim: true
    },
    status: {
      type: String,
      required: true,
      enum: PAYMENT_STATUSES,
      index: true
    },
    verifiedBy: {
      type: String,
      default: null
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    paidAt: {
      type: Date,
      default: null
    },
    otpCodeHash: {
      type: String,
      default: null,
      select: false
    },
    otpExpiresAt: {
      type: Date,
      default: null
    },
    otpVerifiedAt: {
      type: Date,
      default: null
    },
    otpAttempts: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

paymentSchema.index({ appointmentId: 1, status: 1 });
paymentSchema.index({ appointmentId: 1, createdAt: -1 });

module.exports = {
  Payment: mongoose.model("Payment", paymentSchema),
  PAYMENT_METHODS,
  PAYMENT_STATUSES
};
