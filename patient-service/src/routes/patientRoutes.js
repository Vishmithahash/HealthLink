const express = require("express");
const { body, param } = require("express-validator");
const patientController = require("../controllers/patientController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleMiddleware");
const { internalOnly } = require("../middlewares/internalAuthMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const { upload } = require("../middlewares/uploadMiddleware");

const router = express.Router();

router.post(
  "/register",
  internalOnly,
  [
    body("userId").notEmpty().withMessage("userId is required").isString(),
    body("fullName")
      .notEmpty()
      .withMessage("fullName is required")
      .isLength({ min: 3, max: 140 })
      .withMessage("fullName must be between 3 and 140 characters"),
    body("dob").optional().isISO8601().withMessage("dob must be a valid date"),
    body("gender").optional().isIn(["male", "female", "other", "prefer_not_to_say"]),
    body("phone").optional().isString(),
    body("address").optional().isString(),
    body("bloodGroup").optional().isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"]),
    validateRequest
  ],
  patientController.registerPatient
);

router.get("/profile", protect, authorize("patient", "admin"), patientController.getMyProfile);

router.put(
  "/profile",
  protect,
  authorize("patient"),
  [
    body("fullName").optional().isLength({ min: 3, max: 140 }),
    body("dob").optional().isISO8601().withMessage("dob must be a valid date"),
    body("gender").optional().isIn(["male", "female", "other", "prefer_not_to_say"]),
    body("phone").optional().isString(),
    body("address").optional().isString(),
    body("bloodGroup").optional().isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"]),
    body("medicalHistory").optional().isArray(),
    body("allergies").optional().isArray(),
    body("emergencyContact").optional().isObject(),
    validateRequest
  ],
  patientController.updateMyProfile
);

router.post(
  "/reports",
  protect,
  authorize("patient"),
  upload.single("report"),
  [
    body("documentType").optional().isString(),
    body("title").optional().isString(),
    body("notes").optional().isString(),
    body("consultationId").optional().isString(),
    validateRequest
  ],
  patientController.uploadReport
);

router.get("/reports", protect, authorize("patient"), patientController.listMyReports);
router.get("/history", protect, authorize("patient"), patientController.getMyHistory);
router.get("/prescriptions", protect, authorize("patient"), patientController.getMyPrescriptions);

router.get(
  "/:id/reports",
  protect,
  authorize("patient", "admin", "doctor"),
  [param("id").notEmpty().isString(), validateRequest],
  patientController.listPatientReportsById
);

router.get(
  "/:id/prescriptions",
  protect,
  authorize("patient", "admin", "doctor"),
  [param("id").notEmpty().isString(), validateRequest],
  patientController.getPatientPrescriptionsById
);

router.post(
  "/:id/prescriptions",
  protect,
  authorize("doctor", "admin"),
  [
    param("id").notEmpty().isString(),
    body("medicines").isArray({ min: 1 }).withMessage("medicines must be a non-empty array"),
    body("instructions").optional().isString(),
    body("appointmentId").optional().isString(),
    body("doctorId").optional().isString(),
    body("followUpDate").optional().isISO8601().withMessage("followUpDate must be a valid date"),
    validateRequest
  ],
  patientController.addPrescriptionForPatient
);

router.patch(
  "/:id/status",
  protect,
  authorize("admin"),
  [
    param("id").notEmpty().isString(),
    body("status").isIn(["active", "inactive", "suspended"]),
    validateRequest
  ],
  patientController.updatePatientStatus
);

router.delete(
  "/reports/:reportId",
  protect,
  authorize("patient", "admin"),
  [param("reportId").isMongoId().withMessage("reportId must be a valid Mongo ID"), validateRequest],
  patientController.deleteReport
);

router.get(
  "/:id",
  protect,
  authorize("patient", "admin", "doctor"),
  [param("id").notEmpty().isString(), validateRequest],
  patientController.getPatientById
);

module.exports = router;
