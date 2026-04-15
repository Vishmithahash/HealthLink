const dotenv = require("dotenv");

dotenv.config();

const required = ["PORT", "MONGODB_URI", "JWT_ACCESS_SECRET"];
const missing = required.filter((k) => !process.env[k]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT),
  mongoUri: process.env.MONGODB_URI,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  corsOrigin: process.env.CORS_ORIGIN || "*",
  allowDoctorFallback: process.env.ALLOW_DOCTOR_FALLBACK === "true",
  doctorServiceUrl: process.env.DOCTOR_SERVICE_URL || "http://localhost:4002",
  telemedicineServiceUrl: process.env.TELEMEDICINE_SERVICE_URL || "http://localhost:4004",
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || "http://localhost:4006",
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:3005",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 5000)
};
