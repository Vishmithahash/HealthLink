const axios = require("axios");
const { Payment } = require("../models/paymentModel");
const env = require("../config/env");
const {
  toMinorUnits,
  createPaymentIntent,
  retrievePaymentIntent,
  constructWebhookEvent,
  mapStripeIntentStatus
} = require("../services/stripeService");
const { buildSlipUrl, removeFileIfExists } = require("../services/uploadService");

class ServiceError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const httpClient = axios.create({ timeout: env.requestTimeoutMs });
const ALLOWED_CURRENCIES = ["USD", "LKR"];
const ACTIVE_PENDING_STATUSES = ["pending", "pending_verification"];

const normalizeRole = (value) => String(value || "").trim().toLowerCase();
const normalizeCurrency = (value) => String(value || "").trim().toUpperCase();

const parseAmount = (amount) => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new ServiceError(400, "amount must be a positive number");
  }

  return Number(numeric.toFixed(2));
};

const parseCurrency = (currency) => {
  const normalized = normalizeCurrency(currency);
  if (!ALLOWED_CURRENCIES.includes(normalized)) {
    throw new ServiceError(400, `currency must be one of: ${ALLOWED_CURRENCIES.join(", ")}`);
  }

  return normalized;
};

const extractData = (response) => {
  if (!response || !response.data) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(response.data, "data")) {
    return response.data.data;
  }

  return response.data;
};

const mapUpstreamAppointmentError = (error) => {
  const status = Number(error.response?.status || 0);

  if (status === 404) {
    return new ServiceError(404, "Appointment not found");
  }

  if (status === 401 || status === 403) {
    return new ServiceError(403, "Forbidden: appointment access denied");
  }

  return new ServiceError(502, "Failed to validate appointment with appointment-service", {
    reason: error.response?.data?.message || error.message
  });
};

const fetchAppointment = async ({ appointmentId, authHeader }) => {
  try {
    const response = await httpClient.get(
      `${env.appointmentServiceUrl}/api/appointments/${encodeURIComponent(appointmentId)}`,
      {
        headers: {
          Authorization: authHeader || ""
        }
      }
    );

    const appointment = extractData(response);

    if (!appointment) {
      throw new ServiceError(404, "Appointment not found");
    }

    return appointment;
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }
    throw mapUpstreamAppointmentError(error);
  }
};

const ensureAppointmentOwner = (appointment, user) => {
  const role = normalizeRole(user.role);

  if (role === "admin") {
    return;
  }

  if (role === "patient" && String(appointment.patientId) === String(user.id)) {
    return;
  }

  throw new ServiceError(403, "Forbidden: appointment does not belong to this patient");
};

const extractExpectedAmountFromAppointment = (appointment) => {
  const candidates = [
    appointment.consultationFee,
    appointment.fee,
    appointment.amount,
    appointment.appointmentFee
  ];

  const resolved = candidates
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value) && value > 0);

  return resolved || null;
};

const fetchDoctorConsultationFee = async ({ doctorId, authHeader }) => {
  if (!doctorId) {
    return null;
  }

  try {
    const response = await httpClient.get(
      `${env.doctorServiceUrl}/api/doctors/${encodeURIComponent(doctorId)}`,
      {
        headers: {
          Authorization: authHeader || ""
        }
      }
    );

    const doctor = extractData(response);
    const fee = Number(doctor?.consultationFee);

    if (!Number.isFinite(fee) || fee <= 0) {
      return null;
    }

    return fee;
  } catch (error) {
    // appointment.doctorId is usually auth-user id (userId), while /api/doctors/:id expects
    // doctor document ObjectId. Fall back to list endpoint and match by userId.
    try {
      const listResponse = await httpClient.get(`${env.doctorServiceUrl}/api/doctors`, {
        headers: {
          Authorization: authHeader || ""
        }
      });

      const doctors = extractData(listResponse);
      const doctor = Array.isArray(doctors)
        ? doctors.find((item) => String(item?.userId || "") === String(doctorId))
        : null;

      const fee = Number(doctor?.consultationFee);
      if (!Number.isFinite(fee) || fee <= 0) {
        return null;
      }

      return fee;
    } catch (fallbackError) {
      return null;
    }
  }
};

const resolveExpectedAmount = async ({ appointment, authHeader }) => {
  const doctorAmount = await fetchDoctorConsultationFee({
    doctorId: appointment.doctorId,
    authHeader
  });

  if (doctorAmount) {
    return Number(doctorAmount.toFixed(2));
  }

  const appointmentAmount = extractExpectedAmountFromAppointment(appointment);
  if (appointmentAmount) {
    return Number(appointmentAmount.toFixed(2));
  }

  if (Number.isFinite(env.defaultConsultationFee) && env.defaultConsultationFee > 0) {
    return Number(env.defaultConsultationFee.toFixed(2));
  }

  return null;
};

const ensureCorrectPaymentAmount = async ({ appointment, amount, authHeader }) => {
  const expectedAmount = await resolveExpectedAmount({ appointment, authHeader });

  if (expectedAmount == null) {
    return;
  }

  const delta = Math.abs(Number(amount) - Number(expectedAmount));
  if (delta > 0.009) {
    throw new ServiceError(400, `Incorrect payment amount. Expected ${expectedAmount.toFixed(2)}`);
  }
};

const assertNoDuplicateActivePayment = async (appointmentId) => {
  const paidPayment = await Payment.findOne({ appointmentId, status: "succeeded" });
  if (paidPayment) {
    throw new ServiceError(409, "Payment already completed for this appointment");
  }

  const activePendingPayment = await Payment.findOne({
    appointmentId,
    status: { $in: ACTIVE_PENDING_STATUSES }
  });

  if (activePendingPayment) {
    throw new ServiceError(409, "A pending payment already exists for this appointment");
  }
};

const ensurePaymentAccess = (payment, user) => {
  const role = normalizeRole(user.role);

  if (role === "admin") {
    return;
  }

  if (role === "patient" && String(payment.patientId) === String(user.id)) {
    return;
  }

  if (role === "doctor" && String(payment.doctorId) === String(user.id)) {
    return;
  }

  throw new ServiceError(403, "Forbidden: you cannot access this payment");
};

const applyPaymentStatus = (payment, status) => {
  payment.status = status;
  if (status === "succeeded") {
    payment.paidAt = new Date();
  }

  if (status === "failed" || status === "rejected") {
    payment.paidAt = null;
  }
};

const sendSuccess = (res, statusCode, message, data) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

const sendError = (res, error) => {
  const statusCode = error.statusCode || 500;

  return res.status(statusCode).json({
    success: false,
    message: error.message || "Internal server error",
    details: error.details || null
  });
};

const withErrorHandling = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    return sendError(res, error);
  }
};

const createIntent = withErrorHandling(async (req, res) => {
  const appointmentId = String(req.body.appointmentId || "").trim();
  const amount = parseAmount(req.body.amount);
  const currency = parseCurrency(req.body.currency);

  const appointment = await fetchAppointment({
    appointmentId,
    authHeader: req.headers.authorization
  });

  ensureAppointmentOwner(appointment, req.user);
  await ensureCorrectPaymentAmount({
    appointment,
    amount,
    authHeader: req.headers.authorization
  });

  await assertNoDuplicateActivePayment(appointmentId);

  const intent = await createPaymentIntent(amount, currency, {
    appointmentId,
    patientId: String(appointment.patientId),
    doctorId: String(appointment.doctorId)
  });

  const payment = await Payment.create({
    appointmentId,
    patientId: String(appointment.patientId),
    doctorId: String(appointment.doctorId),
    paymentMethod: "stripe_card",
    stripePaymentIntentId: intent.id,
    amount,
    currency,
    status: "pending"
  });

  return sendSuccess(res, 201, "Stripe payment intent created successfully", {
    paymentId: payment._id,
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    status: payment.status
  });
});

const verifyStripePayment = withErrorHandling(async (req, res) => {
  const paymentId = String(req.body.paymentId || "").trim();
  const paymentIntentId = String(req.body.paymentIntentId || "").trim();

  let payment;

  if (paymentId) {
    payment = await Payment.findById(paymentId);
  } else if (paymentIntentId) {
    payment = await Payment.findOne({ stripePaymentIntentId: paymentIntentId });
  }

  if (!payment) {
    throw new ServiceError(404, "Payment not found");
  }

  ensurePaymentAccess(payment, req.user);

  if (payment.paymentMethod !== "stripe_card") {
    throw new ServiceError(400, "Only stripe_card payments can be verified using this endpoint");
  }

  const intent = await retrievePaymentIntent(payment.stripePaymentIntentId);
  const expectedMinorAmount = toMinorUnits(payment.amount);

  if (Number(intent.amount) !== Number(expectedMinorAmount)) {
    throw new ServiceError(400, "Stripe amount mismatch for this payment");
  }

  if (String(intent.currency || "").toUpperCase() !== payment.currency) {
    throw new ServiceError(400, "Stripe currency mismatch for this payment");
  }

  const mappedStatus = mapStripeIntentStatus(intent.status);
  applyPaymentStatus(payment, mappedStatus);
  await payment.save();

  return sendSuccess(res, 200, "Stripe payment verified", {
    paymentId: payment._id,
    status: payment.status,
    paidAt: payment.paidAt,
    stripePaymentIntentId: payment.stripePaymentIntentId
  });
});

const handleStripeWebhook = withErrorHandling(async (req, res) => {
  const signature = req.headers["stripe-signature"];

  if (!signature) {
    throw new ServiceError(400, "Missing stripe-signature header");
  }

  let event;

  try {
    event = constructWebhookEvent(req.body, signature);
  } catch (error) {
    throw new ServiceError(400, "Invalid Stripe webhook signature", { reason: error.message });
  }

  const intent = event.data?.object;
  const paymentIntentId = intent?.id;

  if (!paymentIntentId) {
    return sendSuccess(res, 200, "Webhook received", { received: true });
  }

  const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntentId });

  if (!payment) {
    return sendSuccess(res, 200, "Webhook received", { received: true, ignored: true });
  }

  if (event.type === "payment_intent.succeeded") {
    applyPaymentStatus(payment, "succeeded");
    await payment.save();
  }

  if (event.type === "payment_intent.payment_failed") {
    applyPaymentStatus(payment, "failed");
    await payment.save();
  }

  return sendSuccess(res, 200, "Webhook received", { received: true });
});

const uploadBankSlip = withErrorHandling(async (req, res) => {
  const appointmentId = String(req.body.appointmentId || "").trim();
  const amount = parseAmount(req.body.amount);
  const currency = parseCurrency(req.body.currency);

  if (!req.file) {
    throw new ServiceError(400, "slip is required for bank transfer");
  }

  try {
    const appointment = await fetchAppointment({
      appointmentId,
      authHeader: req.headers.authorization
    });

    ensureAppointmentOwner(appointment, req.user);
    await ensureCorrectPaymentAmount({
      appointment,
      amount,
      authHeader: req.headers.authorization
    });

    await assertNoDuplicateActivePayment(appointmentId);

    const payment = await Payment.create({
      appointmentId,
      patientId: String(appointment.patientId),
      doctorId: String(appointment.doctorId),
      paymentMethod: "bank_transfer",
      amount,
      currency,
      slipUrl: buildSlipUrl(req.file.filename),
      status: "pending_verification"
    });

    return sendSuccess(res, 201, "Bank transfer slip uploaded successfully", {
      paymentId: payment._id,
      status: payment.status,
      slipUrl: payment.slipUrl
    });
  } catch (error) {
    removeFileIfExists(req.file.path);
    throw error;
  }
});

const verifySlip = withErrorHandling(async (req, res) => {
  const paymentId = String(req.body.paymentId || "").trim();
  const action = String(req.body.action || "").trim().toLowerCase();

  const payment = await Payment.findById(paymentId);

  if (!payment) {
    throw new ServiceError(404, "Payment not found");
  }

  if (payment.paymentMethod !== "bank_transfer") {
    throw new ServiceError(400, "Only bank transfer payments can be verified here");
  }

  if (payment.status !== "pending_verification") {
    throw new ServiceError(400, "Only pending_verification payments can be verified");
  }

  if (action === "approve") {
    applyPaymentStatus(payment, "succeeded");
  } else {
    applyPaymentStatus(payment, "rejected");
  }

  payment.verifiedBy = req.user.id;
  payment.verifiedAt = new Date();

  await payment.save();

  return sendSuccess(res, 200, "Bank transfer verification completed", {
    paymentId: payment._id,
    status: payment.status,
    verifiedBy: payment.verifiedBy,
    verifiedAt: payment.verifiedAt
  });
});

const getPaymentById = withErrorHandling(async (req, res) => {
  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    throw new ServiceError(404, "Payment not found");
  }

  ensurePaymentAccess(payment, req.user);

  return sendSuccess(res, 200, "Payment fetched successfully", payment);
});

const getByAppointment = withErrorHandling(async (req, res) => {
  const payments = await Payment.find({ appointmentId: String(req.params.appointmentId) })
    .sort({ createdAt: -1 });

  if (payments.length === 0) {
    throw new ServiceError(404, "No payments found for appointment");
  }

  ensurePaymentAccess(payments[0], req.user);

  return sendSuccess(res, 200, "Payments fetched successfully", payments);
});

const getPaymentStatus = withErrorHandling(async (req, res) => {
  const payment = await Payment.findById(req.params.paymentId);

  if (!payment) {
    throw new ServiceError(404, "Payment not found");
  }

  ensurePaymentAccess(payment, req.user);

  return sendSuccess(res, 200, "Payment status fetched successfully", {
    paymentId: payment._id,
    appointmentId: payment.appointmentId,
    paymentMethod: payment.paymentMethod,
    status: payment.status,
    paidAt: payment.paidAt,
    updatedAt: payment.updatedAt
  });
});

const getAdminTransactions = withErrorHandling(async (req, res) => {
  const status = String(req.query.status || "").trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));

  const filter = {};
  if (status) {
    filter.status = status;
  }

  const transactions = await Payment.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const summary = transactions.reduce(
    (acc, item) => {
      const amount = Number(item.amount || 0);
      acc.totalAmount += amount;

      if (item.status === "succeeded") {
        acc.succeededAmount += amount;
        acc.succeededCount += 1;
      }

      if (item.status === "pending_verification") {
        acc.pendingVerificationCount += 1;
      }

      return acc;
    },
    {
      totalCount: transactions.length,
      totalAmount: 0,
      succeededCount: 0,
      succeededAmount: 0,
      pendingVerificationCount: 0
    }
  );

  return sendSuccess(res, 200, "Transactions fetched successfully", {
    transactions,
    summary
  });
});

const createPaymentRequest = withErrorHandling(async (req, res) => {
  const appointmentId = String(req.body.orderId || "").trim();
  const customerId = String(req.body.customerId || "").trim();
  const amount = parseAmount(req.body.amount || 0);
  const currency = parseCurrency(req.body.currency || "LKR");

  const appointment = await fetchAppointment({
    appointmentId,
    authHeader: req.headers.authorization
  });

  if (customerId && String(appointment.patientId) !== customerId) {
    throw new ServiceError(400, "customerId does not match appointment patient");
  }

  return sendSuccess(res, 202, "Payment request accepted", {
    appointmentId,
    patientId: String(appointment.patientId),
    doctorId: String(appointment.doctorId),
    amount,
    currency,
    status: "pending"
  });
});

module.exports = {
  createPaymentRequest,
  createIntent,
  verifyStripePayment,
  handleStripeWebhook,
  uploadBankSlip,
  verifySlip,
  getPaymentById,
  getByAppointment,
  getPaymentStatus,
  getAdminTransactions
};
