const Stripe = require("stripe");
const env = require("../config/env");

const stripe = new Stripe(env.stripeSecretKey);

const toMinorUnits = (amount) => {
  const numericAmount = Number(amount);
  return Math.round(numericAmount * 100);
};

const createPaymentIntent = async (amount, currency, metadata = {}) => {
  return stripe.paymentIntents.create({
    amount: toMinorUnits(amount),
    currency: String(currency).toLowerCase(),
    metadata
  });
};

const retrievePaymentIntent = async (id) => {
  return stripe.paymentIntents.retrieve(id);
};

const retrievePaymentMethod = async (id) => {
  return stripe.paymentMethods.retrieve(id);
};

const constructWebhookEvent = (rawBody, signature) => {
  const webhookSecrets = String(env.stripeWebhookSecret || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (webhookSecrets.length === 0) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  let lastError = null;

  for (const webhookSecret of webhookSecrets) {
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Invalid Stripe webhook signature");
};

const mapStripeIntentStatus = (stripeStatus) => {
  if (stripeStatus === "succeeded") {
    return "succeeded";
  }

  if (["canceled", "requires_payment_method"].includes(stripeStatus)) {
    return "failed";
  }

  return "pending";
};

module.exports = {
  stripe,
  toMinorUnits,
  createPaymentIntent,
  retrievePaymentIntent,
  retrievePaymentMethod,
  constructWebhookEvent,
  mapStripeIntentStatus
};
