const env = require("../config/env");

const inFlightByKey = new Map();
const lastSentAtByKey = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getSendKey = ({ channel, recipient }) => {
  return `${String(channel || "generic").toLowerCase()}:${String(recipient || "").trim().toLowerCase()}`;
};

const withSendProtection = async ({ channel, recipient, sendFn }) => {
  const key = getSendKey({ channel, recipient });

  if (!recipient) {
    return {
      status: "skipped",
      reason: "Missing notification recipient"
    };
  }

  if (inFlightByKey.get(key)) {
    return {
      status: "skipped",
      reason: "Duplicate request ignored while previous send is in progress"
    };
  }

  const now = Date.now();
  const minIntervalMs = Number(env.notificationMinIntervalMs || 5000);
  const lastSentAt = lastSentAtByKey.get(key) || 0;
  const elapsed = now - lastSentAt;

  if (elapsed < minIntervalMs) {
    return {
      status: "skipped",
      reason: `Rate limited: allow 1 message every ${Math.ceil(minIntervalMs / 1000)} seconds`
    };
  }

  inFlightByKey.set(key, true);

  try {
    const sendDelayMs = Number(env.notificationSendDelayMs || 0);
    if (sendDelayMs > 0) {
      await sleep(sendDelayMs);
    }

    const result = await sendFn();
    lastSentAtByKey.set(key, Date.now());
    return {
      status: "sent",
      result
    };
  } finally {
    inFlightByKey.delete(key);
  }
};

module.exports = {
  withSendProtection
};
