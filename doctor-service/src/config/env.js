const dotenv = require("dotenv");

dotenv.config();

const required = ["PORT", "MONGODB_URI"];
const missing = required.filter((key) => !process.env[key]);

if (!process.env.JWT_ACCESS_SECRET && !process.env.JWT_SECRET) {
  missing.push("JWT_ACCESS_SECRET (or JWT_SECRET)");
}

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4002),
  mongoUri: process.env.MONGODB_URI,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || null,
  jwtSecret: process.env.JWT_SECRET || null,
  corsOrigin: process.env.CORS_ORIGIN || "*",
  appointmentServiceUrl: process.env.APPOINTMENT_SERVICE_URL || "http://localhost:4001",
  patientServiceUrl: process.env.PATIENT_SERVICE_URL || "http://localhost:4003",
  telemedicineServiceUrl: process.env.TELEMEDICINE_SERVICE_URL || "http://localhost:4004",
  aiServiceUrl: process.env.AI_SERVICE_URL || "http://localhost:4005",
  telemedicineJoinBaseUrl: process.env.TELEMEDICINE_JOIN_BASE_URL || "https://telemedicine.healthlink.local/session",
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4005",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 5000)
};
