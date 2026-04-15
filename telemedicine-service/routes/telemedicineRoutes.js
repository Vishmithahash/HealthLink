const express = require("express");
const { body, param, validationResult } = require("express-validator");
const authMiddleware = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleMiddleware");
const telemedicineController = require("../controllers/telemedicineController");

const router = express.Router();

const validate = (req, res, next) => {
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
router.use(authorize("doctor", "patient"));

router.post(
  "/session",
  [
    body("appointmentId").notEmpty().withMessage("appointmentId is required").isString(),
    body("patientId").notEmpty().withMessage("patientId is required").isString(),
    body("doctorId").notEmpty().withMessage("doctorId is required").isString(),
    validate
  ],
  telemedicineController.createSession
);

router.get(
  "/session/appointment/:appointmentId",
  [param("appointmentId").notEmpty().isString(), validate],
  telemedicineController.getSessionByAppointment
);

router.get(
  "/session/:id",
  [param("id").isMongoId().withMessage("id must be a valid Mongo ID"), validate],
  telemedicineController.getSessionById
);

router.get(
  "/room/:roomName",
  [param("roomName").notEmpty().isString(), validate],
  telemedicineController.getRoomDetails
);

router.patch(
  "/session/:id/start",
  [param("id").isMongoId().withMessage("id must be a valid Mongo ID"), validate],
  telemedicineController.startSession
);

router.patch(
  "/session/:id/end",
  [param("id").isMongoId().withMessage("id must be a valid Mongo ID"), validate],
  telemedicineController.endSession
);

module.exports = router;
