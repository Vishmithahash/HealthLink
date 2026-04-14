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
  port: Number(process.env.PORT || 4003),
  mongoUri: process.env.MONGODB_URI,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || null,
  jwtSecret: process.env.JWT_SECRET || null,
  corsOrigin: process.env.CORS_ORIGIN || "*",
  internalServiceApiKey: process.env.INTERNAL_SERVICE_API_KEY || "healthlink-internal-key",
  authServiceUrl: process.env.AUTH_SERVICE_URL || "http://localhost:4000",
  maxReportSizeMb: Number(process.env.MAX_REPORT_SIZE_MB || 10)
};
