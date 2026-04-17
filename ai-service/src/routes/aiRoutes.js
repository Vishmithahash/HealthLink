const express = require("express");
const { body, query, param } = require("express-validator");
const authMiddleware = require("../middlewares/authMiddleware");
const { allowRoles } = require("../middlewares/roleMiddleware");
const { userRateLimiter } = require("../middlewares/rateLimiter");
const { validateRequest } = require("../middlewares/validationMiddleware");
const aiController = require("../controllers/aiController");

const router = express.Router();

router.use(authMiddleware);

router.post(
  "/symptoms/analyze",
  allowRoles("patient"),
  userRateLimiter,
  [
    body("symptoms")
      .exists({ checkFalsy: true })
      .withMessage("symptoms is required")
      .trim()
      .isString()
      .withMessage("symptoms must be a string")
      .isLength({ min: 10, max: 500 })
      .withMessage("symptoms must be between 10 and 500 characters"),
    body("age")
      .optional({ nullable: true })
      .isInt({ min: 0, max: 120 })
      .withMessage("age must be between 0 and 120"),
    body("gender")
      .optional({ nullable: true })
      .isIn(["male", "female", "other", "prefer_not_to_say"])
      .withMessage("gender must be one of male, female, other, prefer_not_to_say"),
    body("duration")
      .optional({ nullable: true })
      .isString()
      .withMessage("duration must be a string")
      .isLength({ max: 100 })
      .withMessage("duration cannot exceed 100 characters"),
    body("severity")
      .optional({ nullable: true })
      .isIn(["mild", "moderate", "severe"])
      .withMessage("severity must be mild, moderate, or severe"),
    body("notes")
      .optional({ nullable: true })
      .isString()
      .withMessage("notes must be a string")
      .isLength({ max: 1000 })
      .withMessage("notes cannot exceed 1000 characters"),
    validateRequest({ errorMessage: "Invalid symptom input" })
  ],
  aiController.analyzeSymptoms
);

router.get(
  "/symptoms/history",
  allowRoles("patient", "doctor", "admin"),
  [
    query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive integer"),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be between 1 and 100"),
    query("userId").optional().isString().withMessage("userId must be a string"),
    validateRequest()
  ],
  aiController.getHistory
);

router.get(
  "/symptoms/:id",
  allowRoles("patient", "doctor", "admin"),
  [param("id").isMongoId().withMessage("id must be a valid Mongo ID"), validateRequest()],
  aiController.getRecordById
);

module.exports = router;
