const express = require("express");
const { body, param, query } = require("express-validator");
const authMiddleware = require("../middlewares/authMiddleware");
const appointmentController = require("../controllers/appointmentController");

const router = express.Router();

const validate = (req, res, next) => {
  const { validationResult } = require("express-validator");
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    success: false,
    message: "Validation failed",
    details: errors.array().map((e) => ({ field: e.path, message: e.msg }))
  });
};

router.use(authMiddleware);

router.get(
  "/doctors",
  [
    query("specialty").optional().isString(),
    query("name").optional().isString(),
    query("availability").optional().isISO8601().withMessage("availability must be a valid ISO date"),
    validate
  ],
  appointmentController.getDoctors
);

router.post(
  "/doctors/:doctorId/availability",
  [
    param("doctorId").notEmpty().isString(),
    body("startAt")
      .notEmpty()
      .withMessage("startAt is required")
      .isISO8601()
      .withMessage("startAt must be a valid ISO date"),
    body("endAt")
      .notEmpty()
      .withMessage("endAt is required")
      .isISO8601()
      .withMessage("endAt must be a valid ISO date"),
    validate
  ],
  appointmentController.setDoctorAvailability
);

router.get(
  "/doctors/:doctorId/availability",
  [
    param("doctorId").notEmpty().isString(),
    query("from").optional().isISO8601().withMessage("from must be a valid ISO date"),
    query("to").optional().isISO8601().withMessage("to must be a valid ISO date"),
    validate
  ],
  appointmentController.listDoctorAvailability
);

router.post(
  "/",
  [
    body("patientId").optional().isString(),
    body("doctorId").notEmpty().withMessage("doctorId is required").isString(),
    body("specialty").notEmpty().withMessage("specialty is required").isString(),
    body("scheduledAt")
      .notEmpty()
      .withMessage("scheduledAt is required")
      .isISO8601()
      .withMessage("scheduledAt must be a valid ISO date"),
    body("durationMinutes").optional().isInt({ min: 10, max: 180 }),
    body("reason").optional().isString(),
    body("status").optional().isIn(["pending", "confirmed"]),
    validate
  ],
  appointmentController.createAppointment
);

router.get(
  "/:id",
  [param("id").isMongoId().withMessage("id must be a valid Mongo ID"), validate],
  appointmentController.getAppointmentById
);

router.patch(
  "/:id",
  [
    param("id").isMongoId().withMessage("id must be a valid Mongo ID"),
    body("scheduledAt")
      .notEmpty()
      .withMessage("scheduledAt is required")
      .isISO8601()
      .withMessage("scheduledAt must be a valid ISO date"),
    body("durationMinutes").optional().isInt({ min: 10, max: 180 }),
    validate
  ],
  appointmentController.rescheduleAppointment
);

router.delete(
  "/:id",
  [
    param("id").isMongoId().withMessage("id must be a valid Mongo ID"),
    body("cancelledReason").optional().isString(),
    validate
  ],
  appointmentController.cancelAppointment
);

router.get(
  "/patient/:patientId",
  [param("patientId").notEmpty().isString(), validate],
  appointmentController.listPatientAppointments
);

router.get(
  "/doctor/:doctorId",
  [param("doctorId").notEmpty().isString(), validate],
  appointmentController.listDoctorAppointments
);

router.patch(
  "/:id/status",
  [
    param("id").isMongoId().withMessage("id must be a valid Mongo ID"),
    body("status")
      .notEmpty()
      .withMessage("status is required")
      .isIn(["pending", "confirmed", "cancelled", "completed", "rejected"]),
    validate
  ],
  appointmentController.updateStatus
);

module.exports = router;
