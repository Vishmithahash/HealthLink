const SymptomAnalysis = require("../models/symptomModel");
const { DEFAULT_DISCLAIMER, DEFAULT_SPECIALTY, generateSymptomAnalysis } = require("../services/cohereService");

const EMERGENCY_KEYWORDS = [
  "chest pain",
  "breathing difficulty",
  "severe bleeding",
  "unconsciousness"
];

const normalizeRole = (role) => String(role || "").trim().toLowerCase();

const containsEmergencyKeyword = (symptoms) => {
  const lowerSymptoms = String(symptoms || "").toLowerCase();
  return EMERGENCY_KEYWORDS.some((keyword) => lowerSymptoms.includes(keyword));
};

const buildEmergencyResult = () => {
  return {
    possibleConcerns: ["Possible medical emergency"],
    urgency: "high",
    recommendedSpecialty: "Emergency Medicine Specialist",
    advice: "Seek immediate emergency medical attention.",
    disclaimer: DEFAULT_DISCLAIMER,
    rawResponse: "EMERGENCY_OVERRIDE"
  };
};

const canAccessRecord = (user, recordUserId) => {
  const role = normalizeRole(user.role);
  if (role === "admin" || role === "doctor") {
    return true;
  }

  return String(user.id) === String(recordUserId);
};

const analyzeSymptoms = async (req, res) => {
  try {
    const { symptoms, age, gender, duration, severity, notes } = req.body;

    let analysis;
    let emergencyDetected = false;

    if (containsEmergencyKeyword(symptoms)) {
      emergencyDetected = true;
      analysis = buildEmergencyResult();
    } else {
      try {
        analysis = await generateSymptomAnalysis({ symptoms, age, gender, duration, severity, notes });
      } catch (error) {
        console.error("AI analysis upstream failure", {
          message: error.message,
          status: error.status || null,
          upstream: error.upstream || null
        });
        return res.status(503).json({
          message: "AI service temporarily unavailable. Please consult a doctor."
        });
      }
    }

    const record = await SymptomAnalysis.create({
      userId: req.user.id,
      userRole: req.user.role,
      symptoms,
      age: age ?? null,
      gender: gender || null,
      duration: duration || null,
      severity: severity || null,
      notes: notes || null,
      possibleConcerns: analysis.possibleConcerns,
      recommendedSpecialty: analysis.recommendedSpecialty || DEFAULT_SPECIALTY,
      advice: analysis.advice,
      urgency: analysis.urgency,
      disclaimer: analysis.disclaimer || DEFAULT_DISCLAIMER,
      emergencyDetected,
      rawResponse: analysis.rawResponse || ""
    });

    return res.status(200).json({
      message: "Symptom analysis completed successfully",
      symptoms: record.symptoms,
      possibleConcerns: record.possibleConcerns,
      recommendedSpecialty: record.recommendedSpecialty,
      advice: record.advice,
      urgency: record.urgency,
      disclaimer: record.disclaimer,
      result: {
        symptoms: record.symptoms,
        possibleConcerns: record.possibleConcerns,
        recommendedSpecialty: record.recommendedSpecialty,
        advice: record.advice,
        urgency: record.urgency,
        disclaimer: record.disclaimer
      },
      recordId: record._id
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to analyze symptoms",
      details: null
    });
  }
};

const getHistory = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const skip = (page - 1) * limit;

    const role = normalizeRole(req.user.role);
    let filter = { userId: req.user.id };
    if (role === "admin") {
      filter = req.query.userId ? { userId: String(req.query.userId) } : {};
    } else if (role === "doctor") {
      filter = req.query.userId ? { userId: String(req.query.userId) } : { userId: req.user.id };
    }

    const [items, total] = await Promise.all([
      SymptomAnalysis.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      SymptomAnalysis.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      message: "History fetched successfully",
      data: {
        items,
        page,
        limit,
        total
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch history",
      details: null
    });
  }
};

const getRecordById = async (req, res) => {
  try {
    const record = await SymptomAnalysis.findById(req.params.id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Record not found",
        details: null
      });
    }

    if (!canAccessRecord(req.user, record.userId)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: insufficient access",
        details: null
      });
    }

    return res.status(200).json({
      success: true,
      message: "Record fetched successfully",
      data: record
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch record",
      details: null
    });
  }
};

module.exports = {
  analyzeSymptoms,
  getHistory,
  getRecordById
};
