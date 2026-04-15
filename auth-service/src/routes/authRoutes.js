const express = require("express");
const { body } = require("express-validator");

const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { DOCTOR_SPECIALTIES, resolveDoctorSpecialty } = require("../constants/doctorSpecialties");

const router = express.Router();

const registerValidation = [
  body("fullName")
    .trim()
    .notEmpty()
    .withMessage("Full name is required")
    .isLength({ min: 3, max: 120 })
    .withMessage("Full name must be between 3 and 120 characters"),
  body("nic")
    .trim()
    .notEmpty()
    .withMessage("NIC is required")
    .matches(/^[A-Za-z0-9-]{10,20}$/)
    .withMessage("NIC must be 10 to 20 characters and can contain only letters, numbers, and hyphen"),
  body("phoneNumber")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required")
    .matches(/^\+?[0-9]{9,15}$/)
    .withMessage("Phone number must be 9 to 15 digits and may start with +"),
  body("username")
    .trim()
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ min: 3, max: 40 })
    .withMessage("Username must be between 3 and 40 characters"),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Email must be valid"),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isString()
    .withMessage("Password must be a string")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters"),
  body("role")
    .optional()
    .isIn(["patient", "Doctor", "Admin"])
    .withMessage("Role must be one of: patient, Doctor, Admin"),
  body("specialty")
    .optional()
    .isString()
    .withMessage("specialty must be a string")
    .bail()
    .trim()
    .custom((specialty, { req }) => {
      const role = req.body.role || "patient";

      if (role !== "Doctor") {
        return true;
      }

      if (!specialty) {
        throw new Error("specialty is required when role is Doctor");
      }

      const resolvedSpecialty = resolveDoctorSpecialty(specialty);
      if (!resolvedSpecialty) {
        throw new Error(`specialty must be one of: ${DOCTOR_SPECIALTIES.join(", ")}`);
      }

      req.body.specialty = resolvedSpecialty;

      return true;
    }),
  validateRequest
];

const loginValidation = [
  body("username")
    .trim()
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ min: 3, max: 100 })
    .withMessage("Username must be between 3 and 100 characters"),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isString()
    .withMessage("Password must be a string")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters"),
  validateRequest
];

const refreshValidation = [
  body("refreshToken")
    .notEmpty()
    .withMessage("Refresh token is required")
    .isString()
    .withMessage("Refresh token must be a string"),
  validateRequest
];

router.post("/register", registerValidation, authController.register);
router.post("/login", loginValidation, authController.login);
router.post("/refresh", refreshValidation, authController.refresh);
router.post("/logout", authMiddleware, authController.logout);
router.get("/me", authMiddleware, authController.me);
router.get("/validate-token", authMiddleware, authController.validateToken);

router.get("/patient-only", authMiddleware, roleMiddleware("patient"), (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Patient route access granted"
  });
});

router.get("/doctor-only", authMiddleware, roleMiddleware("Doctor"), (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Doctor route access granted"
  });
});

router.get("/admin-only", authMiddleware, roleMiddleware("Admin"), (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Admin route access granted"
  });
});

module.exports = router;
