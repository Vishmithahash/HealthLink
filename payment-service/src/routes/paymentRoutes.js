const express = require("express");
const { body, param, validationResult } = require("express-validator");
const paymentController = require("../controllers/paymentController");
const { authMiddleware, allowRoles } = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const { uploadSlipMiddleware } = require("../middlewares/uploadMiddleware");

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    success: false,
    message: "Validation failed",
    details: errors.array().map((error) => ({
      field: error.path,
      message: error.msg
    }))
  });
};

const paymentBaseValidation = [
  body("appointmentId")
    .notEmpty()
    .withMessage("appointmentId is required")
    .isString()
    .withMessage("appointmentId must be a string"),
  body("amount")
    .notEmpty()
    .withMessage("amount is required")
    .isFloat({ gt: 0 })
    .withMessage("amount must be greater than 0"),
  body("currency")
    .notEmpty()
    .withMessage("currency is required")
    .isIn(["USD", "LKR", "usd", "lkr"])
    .withMessage("currency must be either USD or LKR")
];

router.post("/webhook", paymentController.handleStripeWebhook);

router.use(authMiddleware);

router.post(
  "/requests",
  [
    body("orderId").notEmpty().withMessage("orderId is required"),
    body("customerId").optional().isString().withMessage("customerId must be a string"),
    body("amount")
      .notEmpty()
      .withMessage("amount is required")
      .isFloat({ gt: 0 })
      .withMessage("amount must be greater than 0"),
    body("currency")
      .optional()
      .isIn(["USD", "LKR", "usd", "lkr"])
      .withMessage("currency must be either USD or LKR"),
    validate
  ],
  paymentController.createPaymentRequest
);

router.post(
  "/create-intent",
  allowRoles("patient"),
  paymentBaseValidation,
  validate,
  paymentController.createIntent
);

router.post(
  "/verify",
  allowRoles("patient", "admin"),
  [
    body("paymentId").optional().isMongoId().withMessage("paymentId must be a valid Mongo ID"),
    body("paymentIntentId").optional().isString().withMessage("paymentIntentId must be a string"),
    body().custom((value) => {
      if (!value.paymentId && !value.paymentIntentId) {
        throw new Error("Either paymentId or paymentIntentId is required");
      }
      return true;
    }),
    validate
  ],
  paymentController.verifyStripePayment
);

router.post(
  "/upload-slip",
  allowRoles("patient"),
  uploadSlipMiddleware,
  [
    ...paymentBaseValidation,
    body("appointmentId").notEmpty().withMessage("appointmentId is required"),
    validate
  ],
  paymentController.uploadBankSlip
);

router.post(
  "/verify-slip",
  adminMiddleware,
  [
    body("paymentId")
      .notEmpty()
      .withMessage("paymentId is required")
      .isMongoId()
      .withMessage("paymentId must be a valid Mongo ID"),
    body("action")
      .notEmpty()
      .withMessage("action is required")
      .isIn(["approve", "reject"])
      .withMessage("action must be approve or reject"),
    validate
  ],
  paymentController.verifySlip
);

router.get(
  "/appointment/:appointmentId",
  allowRoles("patient", "doctor", "admin"),
  [param("appointmentId").notEmpty().withMessage("appointmentId is required"), validate],
  paymentController.getByAppointment
);

router.get(
  "/status/:paymentId",
  allowRoles("patient", "doctor", "admin"),
  [param("paymentId").isMongoId().withMessage("paymentId must be a valid Mongo ID"), validate],
  paymentController.getPaymentStatus
);

router.get(
  "/:id",
  allowRoles("patient", "doctor", "admin"),
  [param("id").isMongoId().withMessage("id must be a valid Mongo ID"), validate],
  paymentController.getPaymentById
);

module.exports = router;
