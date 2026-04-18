const env = require("../config/env");

const normalizePhone = (value) => String(value || "").trim().replace(/\s+/g, "");

const trimTrailingSlash = (value) => String(value || "").trim().replace(/\/+$/, "");

const hasSmsApiConfig = () => {
  return Boolean(env.smsBaseUrl && env.smsAuthToken && env.smsSenderId);
};

const buildEndpoints = () => {
  const baseUrl = trimTrailingSlash(env.smsBaseUrl);
  const configuredPath = String(env.smsSendPath || "").trim();

  if (!baseUrl) {
    return [];
  }

  if (configuredPath) {
    if (/^https?:\/\//i.test(configuredPath)) {
      return [configuredPath];
    }

    return [`${baseUrl}/${configuredPath.replace(/^\/+/, "")}`];
  }

  return [
    `${baseUrl}/sms/send`,
    `${baseUrl}/sms`,
    `${baseUrl}/messages/sms`
  ];
};

const buildPayloadVariants = ({ to, body }) => {
  const variants = [
    {
      recipient: to,
      sender_id: env.smsSenderId,
      message: body
    },
    {
      to,
      sender_id: env.smsSenderId,
      message: body
    },
    {
      recipient: to,
      sender: env.smsSenderId,
      message: body
    },
    {
      to,
      sender: env.smsSenderId,
      message: body
    }
  ];

  const seen = new Set();
  return variants.filter((variant) => {
    const key = JSON.stringify(variant);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const parseResponseBody = async (response) => {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return { raw: text };
  }
};

const getNestedValue = (obj, keys) => {
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }

  return null;
};

const extractMessageId = (responseBody) => {
  if (!responseBody || typeof responseBody !== "object") {
    return null;
  }

  const direct = getNestedValue(responseBody, ["message_id", "messageId", "id", "sid", "reference", "ref"]);
  if (direct) {
    return String(direct);
  }

  if (responseBody.data && typeof responseBody.data === "object") {
    const nested = getNestedValue(responseBody.data, ["message_id", "messageId", "id", "sid", "reference", "ref"]);
    if (nested) {
      return String(nested);
    }
  }

  if (responseBody.result && typeof responseBody.result === "object") {
    const nested = getNestedValue(responseBody.result, ["message_id", "messageId", "id", "sid", "reference", "ref"]);
    if (nested) {
      return String(nested);
    }
  }

  return null;
};

const isProviderSuccess = (responseBody) => {
  if (!responseBody || typeof responseBody !== "object") {
    return false;
  }

  if (responseBody.success === true) {
    return true;
  }

  const status = String(responseBody.status || responseBody.state || "").toLowerCase();
  return ["success", "ok", "accepted", "queued"].includes(status);
};

const buildErrorMessage = ({ statusCode, responseBody, endpoint }) => {
  if (responseBody && typeof responseBody === "object") {
    const providerMessage =
      getNestedValue(responseBody, ["message", "error", "detail", "description"]) ||
      (responseBody.data && typeof responseBody.data === "object"
        ? getNestedValue(responseBody.data, ["message", "error", "detail", "description"])
        : null);

    if (providerMessage) {
      return `smsAPI.lk request failed: ${providerMessage} (status ${statusCode}, endpoint ${endpoint})`;
    }
  }

  return `smsAPI.lk request failed with status ${statusCode} (endpoint ${endpoint})`;
};

const sendSms = async ({ to, body }) => {
  if (!hasSmsApiConfig()) {
    throw new Error("smsAPI.lk is not configured");
  }

  const normalizedTo = normalizePhone(to);
  const endpoints = buildEndpoints();

  if (!normalizedTo) {
    throw new Error("SMS recipient phone is required");
  }

  if (endpoints.length === 0) {
    throw new Error("smsAPI.lk base URL is not configured");
  }

  const payloadVariants = buildPayloadVariants({
    to: normalizedTo,
    body
  });

  let lastError = null;

  for (const endpoint of endpoints) {
    for (const payload of payloadVariants) {
      try {
        const controller = new AbortController();
        const timeout = Number(env.smsRequestTimeoutMs || 10000);
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.smsAuthToken}`,
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));

        const responseBody = await parseResponseBody(response);

        if (response.status === 401 || response.status === 403) {
          throw new Error("smsAPI.lk authentication failed. Check SMS_AUTH_TOKEN.");
        }

        if (response.ok && (isProviderSuccess(responseBody) || responseBody === null)) {
          return {
            provider: "smsapi.lk",
            messageId: extractMessageId(responseBody),
            statusCode: response.status,
            response: responseBody
          };
        }

        lastError = new Error(
          buildErrorMessage({
            statusCode: response.status,
            responseBody,
            endpoint
          })
        );
      } catch (error) {
        lastError = error;

        if (String(error.message || "").toLowerCase().includes("authentication failed")) {
          throw error;
        }
      }
    }
  }

  throw lastError || new Error("smsAPI.lk request failed");
};

module.exports = {
  normalizePhone,
  hasSmsApiConfig,
  sendSms
};
