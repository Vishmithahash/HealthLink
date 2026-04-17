const dotenv = require("dotenv");

dotenv.config();

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return String(value).toLowerCase() === "true";
};

const parseNumber = (value, defaultValue) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const parseList = (value) => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const required = ["PORT", "EMAIL_USER", "EMAIL_PASS", "EMAIL_FROM"];
const missing = required.filter((key) => !process.env[key]);

const authRequired = parseBoolean(process.env.AUTH_REQUIRED, false);

if (authRequired && !process.env.JWT_SECRET) {
  missing.push("JWT_SECRET");
}

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 4007),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  emailService: process.env.EMAIL_SERVICE || "gmail",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: parseNumber(process.env.SMTP_PORT, 587),
  smtpSecure: parseBoolean(process.env.SMTP_SECURE, false),
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  emailFrom: process.env.EMAIL_FROM,
  emailUserFallback: process.env.EMAIL_USER_FALLBACK || "",
  emailPassFallback: process.env.EMAIL_PASS_FALLBACK || "",
  emailFromFallback: process.env.EMAIL_FROM_FALLBACK || "",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
  twilioVerifiedTo: process.env.TWILIO_VERIFIED_TO || "",
  notificationMinIntervalMs: parseNumber(process.env.NOTIFICATION_MIN_INTERVAL_MS, 5000),
  notificationSendDelayMs: parseNumber(process.env.NOTIFICATION_SEND_DELAY_MS, 0),
  authRequired,
  jwtSecret: process.env.JWT_SECRET || "",
  allowedServiceCallers: parseList(process.env.ALLOWED_SERVICE_CALLERS),
  mongoUri: process.env.MONGO_URI || ""
};
