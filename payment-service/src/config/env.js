const dotenv = require("dotenv");

dotenv.config();

const required = ["PORT", "MONGO_URI", "STRIPE_SECRET_KEY"];
const missing = required.filter((key) => !process.env[key]);

if (!process.env.JWT_SECRET && !process.env.JWT_ACCESS_SECRET) {
  missing.push("JWT_SECRET (or JWT_ACCESS_SECRET)");
}

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4006),
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  uploadPath: process.env.UPLOAD_PATH || "uploads",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  appointmentServiceUrl: process.env.APPOINTMENT_SERVICE_URL || "http://localhost:4001",
  authServiceUrl: process.env.AUTH_SERVICE_URL || "http://localhost:4000",
  internalServiceApiKey: process.env.INTERNAL_SERVICE_API_KEY || "",
  doctorServiceUrl: process.env.DOCTOR_SERVICE_URL || "http://localhost:4002",
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4007",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 5000),
  defaultConsultationFee: Number(process.env.DEFAULT_CONSULTATION_FEE || 0),
  paymentOtpExpiryMinutes: Number(process.env.PAYMENT_OTP_EXPIRY_MINUTES || 10),
  paymentOtpMaxAttempts: Number(process.env.PAYMENT_OTP_MAX_ATTEMPTS || 5),
  paymentOtpSecret:
    process.env.PAYMENT_OTP_SECRET ||
    process.env.JWT_SECRET ||
    process.env.JWT_ACCESS_SECRET ||
    "healthlink-payment-otp-secret"
};
