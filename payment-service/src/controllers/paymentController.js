const axios = require("axios");
const crypto = require("crypto");
const { Payment } = require("../models/paymentModel");
const env = require("../config/env");
const {
  toMinorUnits,
  createPaymentIntent,
  retrievePaymentIntent,
  confirmPaymentIntentForDemo,
  retrievePaymentMethod,
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
const OTP_REGEX = /^\d{6}$/;
const ALLOWED_CARD_BRANDS = new Set(["visa", "mastercard"]);

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

const assertNoDuplicateActivePayment = async (appointmentId, options = {}) => {
  const { replacePendingCard = false } = options;
  const paidPayment = await Payment.findOne({ appointmentId, status: "succeeded" });
  if (paidPayment) {
    throw new ServiceError(409, "Payment already completed for this appointment");
  }

  const activePendingPayment = await Payment.findOne({
    appointmentId,
    status: { $in: ACTIVE_PENDING_STATUSES }
  });

  if (activePendingPayment) {
    if (
      replacePendingCard &&
      activePendingPayment.paymentMethod === "stripe_card" &&
      activePendingPayment.status === "pending"
    ) {
      applyPaymentStatus(activePendingPayment, "failed");
      await activePendingPayment.save();
      return;
    }

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

const notifyNotificationService = async ({ endpoint, payload, authHeader }) => {
  try {
    await httpClient.post(`${env.notificationServiceUrl}${endpoint}`, payload, {
      headers: {
        Authorization: authHeader || ""
      }
    });
  } catch (error) {
    const reason = error.response?.data?.message || error.message;
    console.error(`Notification dispatch failed for ${endpoint}: ${reason}`);
  }
};

const hashOtp = ({ otp, paymentId }) => {
  return crypto
    .createHash("sha256")
    .update(`${String(otp)}:${String(paymentId)}:${env.paymentOtpSecret}`)
    .digest("hex");
};

const generateOtpCode = () => {
  const value = Math.floor(100000 + Math.random() * 900000);
  return String(value);
};

const maskEmail = (email) => {
  const [local, domain] = String(email || "").split("@");
  if (!local || !domain) {
    return "";
  }

  if (local.length <= 2) {
    return `${local[0] || "*"}*@${domain}`;
  }

  return `${local[0]}${"*".repeat(Math.max(1, local.length - 2))}${local[local.length - 1]}@${domain}`;
};

const maskPhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  if (digits.length <= 4) {
    return `***${digits}`;
  }

  return `${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
};

const fetchUserContactFromAuth = async (userId) => {
  if (!userId || !env.authServiceUrl || !env.internalServiceApiKey) {
    return null;
  }

  try {
    const response = await httpClient.get(
      `${env.authServiceUrl}/api/auth/internal/users/${encodeURIComponent(String(userId))}`,
      {
        headers: {
          "x-internal-api-key": env.internalServiceApiKey
        }
      }
    );

    return extractData(response);
  } catch (error) {
    return null;
  }
};

const sendPaymentOtpNotification = async ({ email, phoneNumber, fullName, otpCode }) => {
  const expiryMinutes = Math.max(1, env.paymentOtpExpiryMinutes);
  const message =
    `Hello ${fullName || "there"}, your HealthLink payment OTP is ${otpCode}. ` +
    `This code expires in ${expiryMinutes} minute(s).`;

  const normalizedEmail = String(email || "").trim();
  const normalizedPhone = String(phoneNumber || "").trim();

  if (!normalizedEmail && !normalizedPhone) {
    return {
      sent: false,
      reason: "No email or phone available for OTP notification"
    };
  }

  try {
    await httpClient.post(`${env.notificationServiceUrl}/api/notifications/send`, {
      type: "APPOINTMENT_STATUS_UPDATED",
      to: normalizedEmail || undefined,
        data: {
        toPhone: normalizedPhone || undefined,
          to: normalizedEmail || undefined,
          patientEmail: normalizedEmail || undefined,
        patientPhone: normalizedPhone || undefined,
        patientName: fullName || "there",
        message,
        subject: "HealthLink Payment OTP",
        templateType: "custom"
      }
    });
    return {
      sent: true,
      reason: null
    };
  } catch (error) {
    return {
      sent: false,
      reason: error.response?.data?.message || error.message
    };
  }
};

const issueOtpForStripePayment = async ({ payment, userContact }) => {
  if (!userContact?.email && !userContact?.phoneNumber) {
    throw new ServiceError(400, "Valid user phone number or email is required to send OTP for card payments");
  }

  const otpCode = generateOtpCode();
  const expiryMs = Math.max(1, env.paymentOtpExpiryMinutes) * 60 * 1000;

  payment.otpCodeHash = hashOtp({
    otp: otpCode,
    paymentId: payment._id.toString()
  });
  payment.otpExpiresAt = new Date(Date.now() + expiryMs);
  payment.otpVerifiedAt = null;
  payment.otpAttempts = 0;
  await payment.save();

  const otpDispatch = await sendPaymentOtpNotification({
    email: userContact.email,
    phoneNumber: userContact.phoneNumber,
    fullName: userContact.fullName,
    otpCode
  });

  const otpMaskedDestination = userContact.phoneNumber
    ? maskPhone(userContact.phoneNumber)
    : maskEmail(userContact.email);

  return {
    otpDispatch,
    otpMaskedDestination,
    otpExpiresAt: payment.otpExpiresAt
  };
};

const validateOtpAgainstPayment = async ({ payment, otp }) => {
  const normalizedOtp = String(otp || "").trim();

  if (!OTP_REGEX.test(normalizedOtp)) {
    throw new ServiceError(400, "otp must be a 6-digit code");
  }

  if (payment.otpVerifiedAt) {
    return {
      alreadyVerified: true
    };
  }

  if (!payment.otpCodeHash || !payment.otpExpiresAt) {
    throw new ServiceError(400, "No active OTP found for this payment");
  }

  if (new Date(payment.otpExpiresAt).getTime() <= Date.now()) {
    throw new ServiceError(400, "OTP expired. Please request a new card payment intent");
  }

  if (payment.otpAttempts >= env.paymentOtpMaxAttempts) {
    throw new ServiceError(429, "Maximum OTP attempts reached for this payment");
  }

  const candidateHash = hashOtp({
    otp: normalizedOtp,
    paymentId: payment._id.toString()
  });

  if (candidateHash !== payment.otpCodeHash) {
    payment.otpAttempts += 1;

    if (payment.otpAttempts >= env.paymentOtpMaxAttempts) {
      payment.otpCodeHash = null;
      payment.otpExpiresAt = null;
    }

    await payment.save();

    throw new ServiceError(400, "Invalid OTP code");
  }

  payment.otpVerifiedAt = new Date();
  payment.otpAttempts = 0;
  payment.otpCodeHash = null;
  payment.otpExpiresAt = null;
  await payment.save();

  return {
    alreadyVerified: false
  };
};

const ensureOtpVerifiedForStripePayment = async ({ payment, otp }) => {
  if (payment.otpVerifiedAt) {
    return;
  }

  if (!otp) {
    throw new ServiceError(400, "OTP verification required before confirming Stripe payment");
  }

  await validateOtpAgainstPayment({ payment, otp });
};

const ensureAllowedCardBrand = async (paymentIntentId) => {
  const intent = await retrievePaymentIntent(paymentIntentId);
  const paymentMethodId = intent.payment_method;

  if (!paymentMethodId) {
    throw new ServiceError(400, "Only Visa or Mastercard card payments are allowed");
  }

  const paymentMethod = await retrievePaymentMethod(paymentMethodId);
  const brand = String(paymentMethod?.card?.brand || "").toLowerCase();

  if (!ALLOWED_CARD_BRANDS.has(brand)) {
    throw new ServiceError(400, "Only Visa or Mastercard card payments are allowed");
  }

  return intent;
};

const resolveNotificationContacts = async ({ payment, payload = {} }) => {
  const patientNeedsLookup = !payload.patientEmail || !payload.patientName || !payload.patientPhone;
  const doctorNeedsLookup = !payload.doctorEmail || !payload.doctorName || !payload.doctorPhone;

  const [patientContact, doctorContact] = await Promise.all([
    patientNeedsLookup ? fetchUserContactFromAuth(payment.patientId) : Promise.resolve(null),
    doctorNeedsLookup ? fetchUserContactFromAuth(payment.doctorId) : Promise.resolve(null)
  ]);

  return {
    ...payload,
    patientEmail: payload.patientEmail || patientContact?.email || null,
    patientPhone: payload.patientPhone || patientContact?.phoneNumber || null,
    patientName: payload.patientName || patientContact?.fullName || "Patient",
    doctorEmail: payload.doctorEmail || doctorContact?.email || null,
    doctorPhone: payload.doctorPhone || doctorContact?.phoneNumber || null,
    doctorName: payload.doctorName || doctorContact?.fullName || "Doctor"
  };
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

  await assertNoDuplicateActivePayment(appointmentId, { replacePendingCard: true });

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
    status: payment.status,
    otpRequired: true,
    otpExpiresAt: null,
    otpSentTo: null,
    otpDispatched: false,
    otpDispatchReason: "OTP is sent only after you click Send OTP"
  });
});

const sendStripeOtp = withErrorHandling(async (req, res) => {
  const paymentId = String(req.body.paymentId || "").trim();
  const payment = await Payment.findById(paymentId).select("+otpCodeHash");

  if (!payment) {
    throw new ServiceError(404, "Payment not found");
  }

  ensurePaymentAccess(payment, req.user);

  if (payment.paymentMethod !== "stripe_card") {
    throw new ServiceError(400, "OTP dispatch is available only for stripe_card payments");
  }

  if (String(payment.status || "").toLowerCase() !== "pending") {
    throw new ServiceError(400, "OTP can only be sent for pending stripe_card payments");
  }

  const userContact = await fetchUserContactFromAuth(payment.patientId);
  const otpInfo = await issueOtpForStripePayment({ payment, userContact });

  return sendSuccess(res, 200, "Payment OTP dispatched", {
    paymentId: payment._id,
    otpRequired: true,
    otpExpiresAt: otpInfo.otpExpiresAt,
    otpSentTo: otpInfo.otpMaskedDestination,
    otpDispatched: otpInfo.otpDispatch.sent,
    otpDispatchReason: otpInfo.otpDispatch.reason
  });
});

const verifyStripeOtp = withErrorHandling(async (req, res) => {
  const paymentId = String(req.body.paymentId || "").trim();
  const otp = String(req.body.otp || "").trim();

  const payment = await Payment.findById(paymentId).select("+otpCodeHash");

  if (!payment) {
    throw new ServiceError(404, "Payment not found");
  }

  ensurePaymentAccess(payment, req.user);

  if (payment.paymentMethod !== "stripe_card") {
    throw new ServiceError(400, "OTP verification is available only for stripe_card payments");
  }

  await validateOtpAgainstPayment({ payment, otp });

  return sendSuccess(res, 200, "OTP verified successfully", {
    paymentId: payment._id,
    otpVerifiedAt: payment.otpVerifiedAt
  });
});

const verifyStripePayment = withErrorHandling(async (req, res) => {
  const paymentId = String(req.body.paymentId || "").trim();
  const paymentIntentId = String(req.body.paymentIntentId || "").trim();
  const demoSuccess = req.body.demoSuccess === true || String(req.body.demoSuccess || "").toLowerCase() === "true";
  const requestedCardType = String(req.body.cardType || "").trim().toLowerCase();

  let payment;

  if (paymentId) {
    payment = await Payment.findById(paymentId).select("+otpCodeHash");
  } else if (paymentIntentId) {
    payment = await Payment.findOne({ stripePaymentIntentId: paymentIntentId }).select("+otpCodeHash");
  }

  if (!payment) {
    throw new ServiceError(404, "Payment not found");
  }

  ensurePaymentAccess(payment, req.user);

  if (payment.paymentMethod !== "stripe_card") {
    throw new ServiceError(400, "Only stripe_card payments can be verified using this endpoint");
  }

  // Development-only shortcut used by the custom frontend OTP demo flow.
  if (demoSuccess) {
    if (String(env.nodeEnv || "").toLowerCase() === "production") {
      throw new ServiceError(400, "demoSuccess verification is not allowed in production");
    }

    if (requestedCardType && !ALLOWED_CARD_BRANDS.has(requestedCardType)) {
      throw new ServiceError(400, "Only Visa or Mastercard card payments are allowed");
    }

    const intent = await confirmPaymentIntentForDemo(payment.stripePaymentIntentId, requestedCardType || "visa");
    const expectedMinorAmount = toMinorUnits(payment.amount);

    if (Number(intent.amount) !== Number(expectedMinorAmount)) {
      throw new ServiceError(400, "Stripe amount mismatch for this payment");
    }

    if (String(intent.currency || "").toUpperCase() !== payment.currency) {
      throw new ServiceError(400, "Stripe currency mismatch for this payment");
    }

    const mappedStatus = mapStripeIntentStatus(intent.status);
    if (mappedStatus !== "succeeded") {
      throw new ServiceError(400, `Demo confirmation failed with Stripe status: ${intent.status}`);
    }

    applyPaymentStatus(payment, mappedStatus);
    await payment.save();

    if (mappedStatus === "succeeded") {
      const notificationPayload = await resolveNotificationContacts({
        payment,
        payload: {
          to: req.body.to,
          toPhone: req.body.toPhone,
          patientEmail: req.body.patientEmail,
          patientPhone: req.body.patientPhone,
          doctorEmail: req.body.doctorEmail,
          doctorPhone: req.body.doctorPhone,
          patientName: req.body.patientName,
          doctorName: req.body.doctorName,
          amount: String(payment.amount),
          paymentId: payment._id.toString(),
          appointmentId: payment.appointmentId,
          message: req.body.message || ""
        }
      });

      await notifyNotificationService({
        endpoint: "/api/notifications/payment-success",
        payload: notificationPayload,
        authHeader: req.headers.authorization
      });
    }

    return sendSuccess(res, 200, "Demo payment verified", {
      paymentId: payment._id,
      status: payment.status,
      paidAt: payment.paidAt,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      demo: true
    });
  }

  await ensureOtpVerifiedForStripePayment({
    payment,
    otp: req.body.otp
  });

  const intent = await ensureAllowedCardBrand(payment.stripePaymentIntentId);
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

  if (mappedStatus === "succeeded") {
    const notificationPayload = await resolveNotificationContacts({
      payment,
      payload: {
        to: req.body.to,
        toPhone: req.body.toPhone,
        patientEmail: req.body.patientEmail,
        patientPhone: req.body.patientPhone,
        doctorEmail: req.body.doctorEmail,
        doctorPhone: req.body.doctorPhone,
        patientName: req.body.patientName,
        doctorName: req.body.doctorName,
        amount: String(payment.amount),
        paymentId: payment._id.toString(),
        appointmentId: payment.appointmentId,
        message: req.body.message || ""
      }
    });

    await notifyNotificationService({
      endpoint: "/api/notifications/payment-success",
      payload: notificationPayload,
      authHeader: req.headers.authorization
    });
  }

  return sendSuccess(res, 200, "Stripe payment verified", {
    paymentId: payment._id,
    status: payment.status,
    paidAt: payment.paidAt,
    otpVerifiedAt: payment.otpVerifiedAt,
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
    if (payment.paymentMethod === "stripe_card" && !payment.otpVerifiedAt) {
      return sendSuccess(res, 200, "Webhook received", {
        received: true,
        pendingOtp: true
      });
    }

    if (payment.paymentMethod === "stripe_card") {
      const paymentMethodId = intent?.payment_method;

      if (!paymentMethodId) {
        applyPaymentStatus(payment, "failed");
        await payment.save();
        return sendSuccess(res, 200, "Webhook received", {
          received: true,
          rejectedCardBrand: true,
          reason: "Missing card details"
        });
      }

      const paymentMethod = await retrievePaymentMethod(paymentMethodId);
      const brand = String(paymentMethod?.card?.brand || "").toLowerCase();

      if (!ALLOWED_CARD_BRANDS.has(brand)) {
        applyPaymentStatus(payment, "failed");
        await payment.save();
        return sendSuccess(res, 200, "Webhook received", {
          received: true,
          rejectedCardBrand: true,
          reason: "Only Visa or Mastercard is supported"
        });
      }
    }

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

    const notificationPayload = await resolveNotificationContacts({
      payment,
      payload: {
        to: req.body.to,
        toPhone: req.body.toPhone,
        patientEmail: req.body.patientEmail,
        patientPhone: req.body.patientPhone,
        patientName: req.body.patientName,
        doctorName: req.body.doctorName,
        amount: String(payment.amount),
        paymentId: payment._id.toString(),
        appointmentId: payment.appointmentId,
        message: req.body.message || "Your payment is under review."
      }
    });

    await notifyNotificationService({
      endpoint: "/api/notifications/payment-verification",
      payload: notificationPayload,
      authHeader: req.headers.authorization
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

  if (action === "approve") {
    const notificationPayload = await resolveNotificationContacts({
      payment,
      payload: {
        to: req.body.to,
        toPhone: req.body.toPhone,
        patientEmail: req.body.patientEmail,
        patientPhone: req.body.patientPhone,
        doctorEmail: req.body.doctorEmail,
        doctorPhone: req.body.doctorPhone,
        patientName: req.body.patientName,
        doctorName: req.body.doctorName,
        amount: String(payment.amount),
        paymentId: payment._id.toString(),
        appointmentId: payment.appointmentId,
        message: req.body.message || "Your payment has been approved successfully."
      }
    });

    await notifyNotificationService({
      endpoint: "/api/notifications/payment-success",
      payload: notificationPayload,
      authHeader: req.headers.authorization
    });
  }

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
    return sendSuccess(res, 200, "No payments found for appointment", []);
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
  sendStripeOtp,
  verifyStripeOtp,
  verifyStripePayment,
  handleStripeWebhook,
  uploadBankSlip,
  verifySlip,
  getPaymentById,
  getByAppointment,
  getPaymentStatus,
  getAdminTransactions
};
