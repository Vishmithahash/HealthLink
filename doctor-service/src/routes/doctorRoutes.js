const express = require("express");
const router = express.Router();
const {
  registerDoctor,
  getDoctorProfile,
  updateDoctorProfile,
  getAllDoctors,
  getDoctorById,
  updateAvailability,
  getDoctorAppointments,
  acceptAppointment,
  rejectAppointment,
  getPatientReports,
  getTelemedicineSession,
  createPrescription,
  getPrescriptionByAppointment,
  updatePrescription,
  updateDoctorStatus,
  verifyDoctor
} = require("../controllers/doctorController");
const { protect, optionalProtect } = require("../middlewares/authMiddleware");
const { internalOnly } = require("../middlewares/internalAuthMiddleware");
const { authorize } = require("../middlewares/roleMiddleware");

// Public routes
router.post("/register", internalOnly, registerDoctor);
router.get("/", optionalProtect, getAllDoctors);

// Protected routes
router.get("/profile", protect, authorize("doctor", "admin"), getDoctorProfile);
router.put("/profile", protect, authorize("doctor"), updateDoctorProfile);
router.put("/availability", protect, authorize("doctor"), updateAvailability);
router.get("/appointments", protect, authorize("doctor"), getDoctorAppointments);
router.patch("/appointments/:id/accept", protect, authorize("doctor"), acceptAppointment);
router.patch("/appointments/:id/reject", protect, authorize("doctor"), rejectAppointment);
router.get("/appointments/:id/telemedicine", protect, authorize("doctor", "admin"), getTelemedicineSession);
router.get("/patient-reports/:patientId", protect, authorize("doctor", "admin"), getPatientReports);

router.post("/prescriptions", protect, authorize("doctor"), createPrescription);
router.get("/prescriptions/:appointmentId", protect, authorize("doctor", "admin"), getPrescriptionByAppointment);
router.put("/prescriptions/:id", protect, authorize("doctor"), updatePrescription);

router.patch("/:id/status", protect, authorize("admin"), updateDoctorStatus);
router.patch("/:id/verify", protect, authorize("admin"), verifyDoctor);

// Keep this dynamic route last to avoid matching static paths.
router.get("/:id", optionalProtect, getDoctorById);

module.exports = router;
