const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Patient = require("../models/patientModel");
const Report = require("../models/reportModel");
const env = require("../config/env");

class ServiceError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const normalizeRole = (role) => String(role || "").trim().toLowerCase();

const resolvePatientByIdentifier = async (identifier) => {
  let patient = null;

  if (mongoose.Types.ObjectId.isValid(identifier)) {
    patient = await Patient.findById(identifier);
  }

  if (!patient) {
    patient = await Patient.findOne({ userId: String(identifier) });
  }

  if (!patient) {
    throw new ServiceError(404, "Patient profile not found");
  }

  return patient;
};

const assertOwnerOrAdminOrDoctor = (patient, user) => {
  const role = normalizeRole(user.role);

  if (role === "admin" || role === "doctor") {
    return;
  }

  if (role === "patient" && String(patient.userId) === String(user.id)) {
    return;
  }

  throw new ServiceError(403, "Forbidden");
};

const sanitizePatient = (patientDoc) => {
  const patient = patientDoc.toObject ? patientDoc.toObject() : patientDoc;
  return patient;
};

const syncAuthUserProfile = async ({ userId, fullName, phone }) => {
  if (!userId || !env.authServiceUrl || !env.internalServiceApiKey) {
    return;
  }

  const payload = {};

  if (typeof fullName === "string" && fullName.trim()) {
    payload.fullName = fullName.trim();
  }

  if (typeof phone === "string" && phone.trim()) {
    payload.phoneNumber = phone.trim();
  }

  if (Object.keys(payload).length === 0) {
    return;
  }

  const response = await fetch(`${env.authServiceUrl}/api/auth/internal/users/${encodeURIComponent(String(userId))}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": env.internalServiceApiKey
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(env.requestTimeoutMs)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ServiceError(502, "Failed to sync patient profile with auth service", {
      reason: errorText || response.statusText
    });
  }
};

const registerPatient = async ({ payload, actor }) => {
  const required = ["userId", "fullName"];
  const missing = required.filter((key) => !payload[key]);

  if (missing.length > 0) {
    throw new ServiceError(400, `Missing required fields: ${missing.join(", ")}`);
  }

  if (actor && normalizeRole(actor.role) === "patient" && String(actor.id) !== String(payload.userId)) {
    throw new ServiceError(403, "Patients can only register their own profile");
  }

  const existing = await Patient.findOne({ userId: String(payload.userId) });
  if (existing) {
    throw new ServiceError(409, "Patient profile already exists for this userId");
  }

  const patient = await Patient.create({
    userId: String(payload.userId),
    fullName: payload.fullName,
    dob: payload.dob || null,
    gender: payload.gender || "prefer_not_to_say",
    phone: payload.phone || "",
    address: payload.address || "",
    bloodGroup: payload.bloodGroup || "UNKNOWN",
    medicalHistory: Array.isArray(payload.medicalHistory) ? payload.medicalHistory : [],
    allergies: Array.isArray(payload.allergies) ? payload.allergies : [],
    emergencyContact: payload.emergencyContact || undefined,
    prescriptions: Array.isArray(payload.prescriptions) ? payload.prescriptions : []
  });

  return sanitizePatient(patient);
};

const getMyProfile = async ({ user }) => {
  const role = normalizeRole(user.role);

  if (role !== "patient" && role !== "admin") {
    throw new ServiceError(403, "Forbidden");
  }

  if (role === "admin") {
    throw new ServiceError(400, "Admin must use GET /api/patients/:id to view a profile");
  }

  const patient = await Patient.findOne({ userId: user.id }).populate("uploadedReports");
  if (!patient) {
    throw new ServiceError(404, "Patient profile not found");
  }

  return sanitizePatient(patient);
};

const updateMyProfile = async ({ user, payload }) => {
  if (normalizeRole(user.role) !== "patient") {
    throw new ServiceError(403, "Only patients can update their profile");
  }

  const patient = await Patient.findOne({ userId: user.id });
  if (!patient) {
    throw new ServiceError(404, "Patient profile not found");
  }

  const fields = [
    "fullName",
    "dob",
    "gender",
    "phone",
    "address",
    "bloodGroup",
    "medicalHistory",
    "allergies",
    "emergencyContact"
  ];

  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      patient[field] = payload[field];
    }
  });

  const shouldSyncAuthProfile =
    Object.prototype.hasOwnProperty.call(payload, "phone") ||
    Object.prototype.hasOwnProperty.call(payload, "fullName");

  if (shouldSyncAuthProfile) {
    await syncAuthUserProfile({
      userId: user.id,
      fullName: patient.fullName,
      phone: patient.phone
    });
  }

  await patient.save();
  return sanitizePatient(patient);
};

const getPatientById = async ({ id, user }) => {
  const patient = await resolvePatientByIdentifier(id);
  assertOwnerOrAdminOrDoctor(patient, user);
  return sanitizePatient(patient);
};

const uploadReport = async ({ user, file, payload }) => {
  if (normalizeRole(user.role) !== "patient") {
    throw new ServiceError(403, "Only patients can upload reports");
  }

  if (!file) {
    throw new ServiceError(400, "Report file is required");
  }

  const patient = await Patient.findOne({ userId: user.id });
  if (!patient) {
    throw new ServiceError(404, "Patient profile not found");
  }

  const report = await Report.create({
    patientId: patient._id,
    patientUserId: patient.userId,
    documentType: payload.documentType || "general",
    title: payload.title || file.originalname,
    notes: payload.notes || "",
    fileName: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    fileSize: file.size,
    filePath: file.path,
    uploadedByUserId: user.id,
    uploadedByRole: normalizeRole(user.role),
    consultationId: payload.consultationId || null
  });

  patient.uploadedReports.push(report._id);
  await patient.save();

  return report.toObject();
};

const listMyReports = async ({ user }) => {
  if (normalizeRole(user.role) !== "patient") {
    throw new ServiceError(403, "Only patients can view their reports");
  }

  const reports = await Report.find({ patientUserId: user.id }).sort({ uploadedAt: -1 });
  return reports.map((r) => r.toObject());
};

const listPatientReportsById = async ({ patientId, user }) => {
  const patient = await resolvePatientByIdentifier(patientId);
  assertOwnerOrAdminOrDoctor(patient, user);

  const reports = await Report.find({ patientUserId: patient.userId }).sort({ uploadedAt: -1 });
  return reports.map((r) => r.toObject());
};

const getMyHistory = async ({ user }) => {
  if (normalizeRole(user.role) !== "patient") {
    throw new ServiceError(403, "Only patients can view medical history");
  }

  const patient = await Patient.findOne({ userId: user.id });
  if (!patient) {
    throw new ServiceError(404, "Patient profile not found");
  }

  return patient.medicalHistory;
};

const getMyPrescriptions = async ({ user }) => {
  if (normalizeRole(user.role) !== "patient") {
    throw new ServiceError(403, "Only patients can view prescriptions");
  }

  const patient = await Patient.findOne({ userId: user.id });
  if (!patient) {
    throw new ServiceError(404, "Patient profile not found");
  }

  return patient.prescriptions;
};

const getPatientPrescriptionsById = async ({ id, user }) => {
  const patient = await resolvePatientByIdentifier(id);
  assertOwnerOrAdminOrDoctor(patient, user);

  return patient.prescriptions;
};

const addPrescriptionForPatient = async ({ id, payload, user }) => {
  const role = normalizeRole(user.role);
  if (role !== "doctor" && role !== "admin") {
    throw new ServiceError(403, "Only doctor or admin can add prescriptions");
  }

  const patient = await resolvePatientByIdentifier(id);

  const medicines = Array.isArray(payload.medicines) ? payload.medicines : [];
  if (medicines.length === 0) {
    throw new ServiceError(400, "medicines must be a non-empty array");
  }

  patient.prescriptions.push({
    appointmentId: payload.appointmentId || null,
    doctorId: payload.doctorId || user.id,
    issuedAt: payload.issuedAt || new Date(),
    instructions: payload.instructions || "",
    followUpDate: payload.followUpDate || null,
    medicines
  });

  await patient.save();
  return patient.prescriptions[patient.prescriptions.length - 1];
};

const updatePatientStatus = async ({ id, status, user }) => {
  if (normalizeRole(user.role) !== "admin") {
    throw new ServiceError(403, "Only admin can update patient status");
  }

  const allowed = ["active", "inactive", "suspended"];
  if (!allowed.includes(status)) {
    throw new ServiceError(400, `status must be one of: ${allowed.join(", ")}`);
  }

  const patient = await resolvePatientByIdentifier(id);
  patient.status = status;
  await patient.save();

  return sanitizePatient(patient);
};

const listPatientsForAdmin = async ({ user }) => {
  if (normalizeRole(user.role) !== "admin") {
    throw new ServiceError(403, "Only admin can list patient records");
  }

  const patients = await Patient.find({})
    .sort({ updatedAt: -1 })
    .limit(500);

  return patients.map((patient) => sanitizePatient(patient));
};

const removeReport = async ({ reportId, user }) => {
  const report = await Report.findById(reportId);
  if (!report) {
    throw new ServiceError(404, "Report not found");
  }

  const role = normalizeRole(user.role);
  if (role !== "admin" && String(report.patientUserId) !== String(user.id)) {
    throw new ServiceError(403, "Forbidden");
  }

  await Report.deleteOne({ _id: report._id });
  await Patient.updateOne({ _id: report.patientId }, { $pull: { uploadedReports: report._id } });

  if (report.filePath && fs.existsSync(report.filePath)) {
    fs.unlinkSync(path.resolve(report.filePath));
  }

  return { reportId: report._id.toString() };
};

module.exports = {
  ServiceError,
  registerPatient,
  getMyProfile,
  updateMyProfile,
  getPatientById,
  uploadReport,
  listMyReports,
  listPatientReportsById,
  getMyHistory,
  getMyPrescriptions,
  getPatientPrescriptionsById,
  addPrescriptionForPatient,
  updatePatientStatus,
  listPatientsForAdmin,
  removeReport
};
