const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  validateSendEmailRequest,
  validateAppointmentConfirmationRequest,
  validatePaymentSuccessRequest,
  validateConsultationCompletedRequest,
  validatePaymentVerificationRequest
} = require("../middlewares/validationMiddleware");
const {
  sendLegacyNotification,
  sendEmailNotification,
  sendAppointmentConfirmation,
  sendPaymentSuccess,
  sendConsultationCompleted,
  sendPaymentVerification
} = require("../controllers/notificationController");

const router = express.Router();

router.use(authMiddleware);

router.post("/send", sendLegacyNotification);
router.post("/send-email", validateSendEmailRequest, sendEmailNotification);
router.post(
  "/appointment-confirmation",
  validateAppointmentConfirmationRequest,
  sendAppointmentConfirmation
);
router.post("/payment-success", validatePaymentSuccessRequest, sendPaymentSuccess);
router.post(
  "/consultation-completed",
  validateConsultationCompletedRequest,
  sendConsultationCompleted
);
router.post(
  "/payment-verification",
  validatePaymentVerificationRequest,
  sendPaymentVerification
);

module.exports = router;
