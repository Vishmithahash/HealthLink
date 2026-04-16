const twilio = require("twilio");
const env = require("../config/env");

const normalizePhone = (value) => String(value || "").trim().replace(/\s+/g, "");

const hasTwilioConfig = () => {
  return Boolean(env.twilioAccountSid && env.twilioAuthToken && env.twilioPhoneNumber);
};

const getTwilioClient = () => {
  if (!hasTwilioConfig()) {
    return null;
  }

  return twilio(env.twilioAccountSid, env.twilioAuthToken);
};

const isVerifiedTwilioRecipient = (phone) => {
  const normalized = normalizePhone(phone);
  const verified = normalizePhone(env.twilioVerifiedTo);

  if (!verified) {
    return true;
  }

  return normalized === verified;
};

const sendSms = async ({ to, body }) => {
  const client = getTwilioClient();

  if (!client) {
    throw new Error("Twilio is not configured");
  }

  return client.messages.create({
    to: normalizePhone(to),
    from: normalizePhone(env.twilioPhoneNumber),
    body
  });
};

module.exports = {
  normalizePhone,
  hasTwilioConfig,
  isVerifiedTwilioRecipient,
  sendSms
};
