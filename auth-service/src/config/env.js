const dotenv = require("dotenv");

dotenv.config();

const requiredEnv = [
  "PORT",
  "MONGODB_URI",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "ACCESS_TOKEN_EXPIRES_IN",
  "REFRESH_TOKEN_EXPIRES_IN",
  "BCRYPT_SALT_ROUNDS"
];

const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT),
  mongoUri: process.env.MONGODB_URI,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN,
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN,
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  internalServiceApiKey: process.env.INTERNAL_SERVICE_API_KEY || "",
  doctorServiceUrl: process.env.DOCTOR_SERVICE_URL || "http://localhost:4002",
  patientServiceUrl: process.env.PATIENT_SERVICE_URL || "http://localhost:4003",
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4007",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 5000)
};
