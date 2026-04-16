const { body, validationResult } = require("express-validator");
const { allowedTemplateTypes } = require("../services/templateService");

const phoneRegex = /^\+?[1-9]\d{7,14}$/;

const validateEmailList = (value) => {
  if (typeof value === "string") {
    const email = value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return value.every((entry) => typeof entry === "string" && emailRegex.test(entry.trim()));
  }

  return false;
};

const hasAtLeastOneRecipient = (payload) => {
  const recipients = [];

  if (payload.to) {
    recipients.push(payload.to);
  }

  if (payload.patientEmail) {
    recipients.push(payload.patientEmail);
  }

  if (payload.doctorEmail) {
    recipients.push(payload.doctorEmail);
  }

  if (payload.patient && payload.patient.email) {
    recipients.push(payload.patient.email);
  }

  if (payload.doctor && payload.doctor.email) {
    recipients.push(payload.doctor.email);
  }

  if (payload.toPhone) {
    recipients.push(payload.toPhone);
  }

  if (payload.patientPhone) {
    recipients.push(payload.patientPhone);
  }

  if (payload.doctorPhone) {
    recipients.push(payload.doctorPhone);
  }

  if (payload.patient && payload.patient.phone) {
    recipients.push(payload.patient.phone);
  }

  if (payload.doctor && payload.doctor.phone) {
    recipients.push(payload.doctor.phone);
  }

  return recipients.length > 0;
};

const validatePhoneList = (value) => {
  if (typeof value === "string") {
    return phoneRegex.test(value.trim());
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return false;
    }

    return value.every((entry) => typeof entry === "string" && phoneRegex.test(entry.trim()));
  }

  return false;
};

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    success: false,
    message: "Validation failed",
    details: errors.array()
  });
};

const validateSendEmailRequest = [
  body("to")
    .exists({ checkFalsy: true })
    .withMessage("to is required")
    .bail()
    .custom(validateEmailList)
    .withMessage("to must be a valid email or a non-empty array of valid emails"),
  body("subject")
    .exists({ checkFalsy: true })
    .withMessage("subject is required")
    .bail()
    .isString()
    .withMessage("subject must be a string"),
  body("templateType")
    .exists({ checkFalsy: true })
    .withMessage("templateType is required")
    .bail()
    .isIn(allowedTemplateTypes)
    .withMessage(`templateType must be one of: ${allowedTemplateTypes.join(", ")}`),
  body("message").optional().isString().withMessage("message must be a string"),
  handleValidationErrors
];

const validateTemplateEndpointRequest = [
  body().custom((payload) => {
    if (!hasAtLeastOneRecipient(payload)) {
      throw new Error("At least one recipient is required (email or phone)");
    }

    return true;
  }),
  body("to")
    .optional()
    .custom(validateEmailList)
    .withMessage("to must be a valid email or a non-empty array of valid emails"),
  body("patientEmail").optional().isEmail().withMessage("patientEmail must be a valid email"),
  body("doctorEmail").optional().isEmail().withMessage("doctorEmail must be a valid email"),
  body("toPhone")
    .optional()
    .custom(validatePhoneList)
    .withMessage("toPhone must be a valid phone number or non-empty array of valid phone numbers"),
  body("patientPhone")
    .optional()
    .matches(phoneRegex)
    .withMessage("patientPhone must be a valid phone number in E.164 format"),
  body("doctorPhone")
    .optional()
    .matches(phoneRegex)
    .withMessage("doctorPhone must be a valid phone number in E.164 format"),
  body("subject").optional().isString().withMessage("subject must be a string")
];

const validateAppointmentConfirmationRequest = [
  ...validateTemplateEndpointRequest,
  body("patientName")
    .exists({ checkFalsy: true })
    .withMessage("patientName is required")
    .bail()
    .isString()
    .withMessage("patientName must be a string"),
  body("doctorName")
    .exists({ checkFalsy: true })
    .withMessage("doctorName is required")
    .bail()
    .isString()
    .withMessage("doctorName must be a string"),
  body("consultationDate")
    .exists({ checkFalsy: true })
    .withMessage("consultationDate is required")
    .bail()
    .isString()
    .withMessage("consultationDate must be a string"),
  handleValidationErrors
];

const validatePaymentSuccessRequest = [
  ...validateTemplateEndpointRequest,
  body("amount")
    .exists({ checkFalsy: true })
    .withMessage("amount is required")
    .bail()
    .custom((value) => {
      const numericValue = Number(value);
      return !Number.isNaN(numericValue) && numericValue > 0;
    })
    .withMessage("amount must be a positive number"),
  body("paymentId")
    .exists({ checkFalsy: true })
    .withMessage("paymentId is required")
    .bail()
    .isString()
    .withMessage("paymentId must be a string"),
  handleValidationErrors
];

const validateConsultationCompletedRequest = [
  ...validateTemplateEndpointRequest,
  body("patientName")
    .exists({ checkFalsy: true })
    .withMessage("patientName is required")
    .bail()
    .isString()
    .withMessage("patientName must be a string"),
  body("doctorName")
    .exists({ checkFalsy: true })
    .withMessage("doctorName is required")
    .bail()
    .isString()
    .withMessage("doctorName must be a string"),
  body("consultationDate")
    .exists({ checkFalsy: true })
    .withMessage("consultationDate is required")
    .bail()
    .isString()
    .withMessage("consultationDate must be a string"),
  handleValidationErrors
];

const validatePaymentVerificationRequest = [
  ...validateTemplateEndpointRequest,
  body("paymentId").optional().isString().withMessage("paymentId must be a string"),
  handleValidationErrors
];

module.exports = {
  validateSendEmailRequest,
  validateAppointmentConfirmationRequest,
  validatePaymentSuccessRequest,
  validateConsultationCompletedRequest,
  validatePaymentVerificationRequest
};
