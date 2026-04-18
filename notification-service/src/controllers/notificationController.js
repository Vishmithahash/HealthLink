const { sendEmail } = require("../services/mailerService");
const { renderTemplate, getDefaultSubject, renderSmsTemplate } = require("../services/templateService");
const {
  normalizePhone,
  hasSmsApiConfig,
  sendSms
} = require("../services/smsApiService");
const { withSendProtection } = require("../services/sendProtectionService");
const NotificationLog = require("../models/NotificationLog");

const legacyTypeToTemplate = {
  APPOINTMENT_CONFIRMATION: "appointment-confirmation",
  APPOINTMENT_STATUS_UPDATED: "custom",
  PRESCRIPTION_ISSUED: "custom",
  PAYMENT_SUCCESS: "payment-success",
  PAYMENT_VERIFICATION: "payment-verification",
  CONSULTATION_COMPLETED: "consultation-completed"
};

const extractRecipients = (payload) => {
  const recipients = [];

  const addRecipient = (email, role, name) => {
    if (!email || typeof email !== "string") {
      return;
    }

    recipients.push({
      email: email.trim(),
      role,
      name: name || ""
    });
  };

  if (typeof payload.to === "string") {
    addRecipient(payload.to, "general", payload.recipientName || payload.patientName || "");
  }

  if (Array.isArray(payload.to)) {
    payload.to.forEach((entry) => {
      addRecipient(entry, "general", payload.recipientName || payload.patientName || "");
    });
  }

  addRecipient(payload.patientEmail, "patient", payload.patientName || "");
  addRecipient(payload.doctorEmail, "doctor", payload.doctorName || "");

  if (payload.patient && typeof payload.patient === "object") {
    addRecipient(payload.patient.email, "patient", payload.patient.name || payload.patientName || "");
  }

  if (payload.doctor && typeof payload.doctor === "object") {
    addRecipient(payload.doctor.email, "doctor", payload.doctor.name || payload.doctorName || "");
  }

  const deduplicated = new Map();

  recipients.forEach((recipient) => {
    const key = recipient.email.toLowerCase();
    const existing = deduplicated.get(key);

    if (!existing) {
      deduplicated.set(key, recipient);
      return;
    }

    if (existing.role === "general" && recipient.role !== "general") {
      deduplicated.set(key, recipient);
      return;
    }

    if (!existing.name && recipient.name) {
      deduplicated.set(key, recipient);
    }
  });

  return Array.from(deduplicated.values());
};

const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;

const extractSmsRecipients = (payload) => {
  const recipients = [];

  const addPhone = (phone, role, name) => {
    const normalized = normalizePhone(phone);
    if (!PHONE_REGEX.test(normalized)) {
      return;
    }

    recipients.push({
      phone: normalized,
      role,
      name: name || ""
    });
  };

  if (typeof payload.toPhone === "string") {
    addPhone(payload.toPhone, "general", payload.recipientName || payload.patientName || "");
  }

  if (Array.isArray(payload.toPhone)) {
    payload.toPhone.forEach((entry) => {
      addPhone(entry, "general", payload.recipientName || payload.patientName || "");
    });
  }

  if (typeof payload.to === "string") {
    addPhone(payload.to, "general", payload.recipientName || payload.patientName || "");
  }

  if (Array.isArray(payload.to)) {
    payload.to.forEach((entry) => {
      addPhone(entry, "general", payload.recipientName || payload.patientName || "");
    });
  }

  addPhone(payload.patientPhone, "patient", payload.patientName || "");
  addPhone(payload.doctorPhone, "doctor", payload.doctorName || "");

  if (payload.patient && typeof payload.patient === "object") {
    addPhone(payload.patient.phone, "patient", payload.patient.name || payload.patientName || "");
  }

  if (payload.doctor && typeof payload.doctor === "object") {
    addPhone(payload.doctor.phone, "doctor", payload.doctor.name || payload.doctorName || "");
  }

  const deduplicated = new Map();

  recipients.forEach((recipient) => {
    const existing = deduplicated.get(recipient.phone);
    if (!existing) {
      deduplicated.set(recipient.phone, recipient);
      return;
    }

    if (existing.role === "general" && recipient.role !== "general") {
      deduplicated.set(recipient.phone, recipient);
      return;
    }

    if (!existing.name && recipient.name) {
      deduplicated.set(recipient.phone, recipient);
    }
  });

  return Array.from(deduplicated.values());
};

const dispatchSmsNotification = async ({ payload, templateType }) => {
  if (!hasSmsApiConfig()) {
    return {
      enabled: false,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
      results: []
    };
  }

  const recipients = extractSmsRecipients(payload);

  if (recipients.length === 0) {
    return {
      enabled: true,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
      results: []
    };
  }

  const results = await Promise.allSettled(
    recipients.map(async (recipient) => {
      const body = renderSmsTemplate(templateType, payload, recipient);
      const protectedSend = await withSendProtection({
        channel: "sms",
        recipient: recipient.phone,
        sendFn: async () =>
          sendSms({
            to: recipient.phone,
            body
          })
      });

      if (protectedSend.status === "skipped") {
        return {
          phone: recipient.phone,
          role: recipient.role,
          status: "skipped",
          reason: protectedSend.reason
        };
      }

      const message = protectedSend.result;

      console.info(
        `[notification-service] Sent ${templateType} sms to ${recipient.phone} as ${recipient.role}. messageId=${
          message.messageId || "n/a"
        }`
      );

      return {
        phone: recipient.phone,
        role: recipient.role,
        status: "sent",
        messageId: message.messageId || null
      };
    })
  );

  const normalizedResults = results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    return {
      phone: recipients[index].phone,
      role: recipients[index].role,
      status: "failed",
      error: result.reason && result.reason.message ? result.reason.message : "SMS send failed"
    };
  });

  return {
    enabled: true,
    sentCount: normalizedResults.filter((entry) => entry.status === "sent").length,
    skippedCount: normalizedResults.filter((entry) => entry.status === "skipped").length,
    failedCount: normalizedResults.filter((entry) => entry.status === "failed").length,
    results: normalizedResults
  };
};

const dispatchNotification = async (payload, forcedTemplateType) => {
  const templateType = forcedTemplateType || payload.templateType;
  const subject = payload.subject || getDefaultSubject(templateType);
  const recipients = extractRecipients(payload);
  const smsResult = await dispatchSmsNotification({ payload, templateType });

  if (recipients.length === 0) {
    const hasSmsActivity =
      smsResult.sentCount > 0 || smsResult.failedCount > 0 || smsResult.skippedCount > 0;

    if (hasSmsActivity) {
      try {
        await NotificationLog.create({
          templateType,
          subject,
          payload,
          recipients: [],
          sentCount: 0,
          failedCount: 0,
          sms: smsResult
        });
      } catch (error) {
        console.error(`[notification-service] Failed to persist notification log: ${error.message}`);
      }

      return {
        sentCount: 0,
        failedCount: 0,
        results: [],
        sms: smsResult
      };
    }

    return {
      failedCount: 1,
      sentCount: 0,
      results: [],
      error: "No valid recipients provided",
      sms: smsResult
    };
  }

  const results = await Promise.allSettled(
    recipients.map(async (recipient) => {
      const html = renderTemplate(templateType, payload, recipient);

      const protectedSend = await withSendProtection({
        channel: "email",
        recipient: recipient.email,
        sendFn: async () => sendEmail(recipient.email, subject, html)
      });

      if (protectedSend.status === "skipped") {
        return {
          email: recipient.email,
          role: recipient.role,
          status: "skipped",
          error: protectedSend.reason,
          messageId: null
        };
      }

      const info = protectedSend.result;

      console.info(
        `[notification-service] Sent ${templateType} email to ${recipient.email} as ${recipient.role}. messageId=${
          info.messageId || "n/a"
        }`
      );

      return {
        email: recipient.email,
        role: recipient.role,
        status: "sent",
        messageId: info.messageId || null
      };
    })
  );

  const normalizedResults = results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    return {
      email: recipients[index].email,
      role: recipients[index].role,
      status: "failed",
      error: result.reason && result.reason.message ? result.reason.message : "SMTP send failed"
    };
  });

  const failedCount = normalizedResults.filter((entry) => entry.status === "failed").length;

  try {
    await NotificationLog.create({
      templateType,
      subject,
      payload,
      recipients: normalizedResults,
      sentCount: normalizedResults.length - failedCount,
      failedCount,
      sms: smsResult
    });
  } catch (error) {
    console.error(`[notification-service] Failed to persist notification log: ${error.message}`);
  }

  return {
    sentCount: normalizedResults.length - failedCount,
    failedCount,
    results: normalizedResults,
    sms: smsResult
  };
};

const mapLegacyPayload = (payload) => {
  const templateType = legacyTypeToTemplate[String(payload.type || "").toUpperCase()] || "custom";

  const data = payload.data && typeof payload.data === "object" ? payload.data : {};

  const to = payload.to || payload.recipientEmail || data.to || data.email || null;
  const toPhone = payload.toPhone || payload.recipientPhone || data.toPhone || data.phone || null;

  return {
    to,
    toPhone,
    templateType,
    subject: payload.subject || getDefaultSubject(templateType),
    message:
      payload.message ||
      data.message ||
      `Notification event ${String(payload.type || "UNKNOWN").toUpperCase()} received from upstream service.`,
    ...data
  };
};

const buildResponse = (res, templateType, notificationResult) => {
  if (notificationResult.error) {
    return res.status(400).json({
      success: false,
      message: notificationResult.error,
      details: null
    });
  }

  if (notificationResult.failedCount > 0) {
    return res.status(502).json({
      success: false,
      message: `Some ${templateType} emails failed to send`,
      data: notificationResult
    });
  }

  return res.status(200).json({
    success: true,
    message: `${templateType} email notifications sent successfully`,
    data: notificationResult
  });
};

const sendEmailNotification = async (req, res, next) => {
  try {
    const templateType = req.body.templateType;
    const notificationResult = await dispatchNotification(req.body, templateType);
    return buildResponse(res, templateType, notificationResult);
  } catch (error) {
    error.statusCode = 500;
    return next(error);
  }
};

const sendLegacyNotification = async (req, res, next) => {
  try {
    const mappedPayload = mapLegacyPayload(req.body || {});

    const templateType = mappedPayload.templateType;
    const notificationResult = await dispatchNotification(mappedPayload, templateType);
    return buildResponse(res, templateType, notificationResult);
  } catch (error) {
    error.statusCode = 500;
    return next(error);
  }
};

const sendAppointmentConfirmation = async (req, res, next) => {
  try {
    const templateType = "appointment-confirmation";
    const notificationResult = await dispatchNotification(req.body, templateType);
    return buildResponse(res, templateType, notificationResult);
  } catch (error) {
    error.statusCode = 500;
    return next(error);
  }
};

const sendPaymentSuccess = async (req, res, next) => {
  try {
    const templateType = "payment-success";
    const notificationResult = await dispatchNotification(req.body, templateType);
    return buildResponse(res, templateType, notificationResult);
  } catch (error) {
    error.statusCode = 500;
    return next(error);
  }
};

const sendConsultationCompleted = async (req, res, next) => {
  try {
    const templateType = "consultation-completed";
    const notificationResult = await dispatchNotification(req.body, templateType);
    return buildResponse(res, templateType, notificationResult);
  } catch (error) {
    error.statusCode = 500;
    return next(error);
  }
};

const sendPaymentVerification = async (req, res, next) => {
  try {
    const templateType = "payment-verification";
    const notificationResult = await dispatchNotification(req.body, templateType);
    return buildResponse(res, templateType, notificationResult);
  } catch (error) {
    error.statusCode = 500;
    return next(error);
  }
};

module.exports = {
  sendLegacyNotification,
  sendEmailNotification,
  sendAppointmentConfirmation,
  sendPaymentSuccess,
  sendConsultationCompleted,
  sendPaymentVerification
};
