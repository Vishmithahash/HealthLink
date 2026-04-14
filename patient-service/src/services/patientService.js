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
const normalizeIdentifier = (value) => String(value || "").trim().toLowerCase();
const normalizeNic = (value) => String(value || "").trim().toUpperCase();
const normalizePhone = (value) => String(value || "").trim();

const parseJsonSafely = async (response) => {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
};

const syncAuthUserProfile = async ({ userId, payload }) => {
  if (!payload || Object.keys(payload).length === 0) {
    return;
  }

  if (typeof globalThis.fetch !== "function") {
    throw new ServiceError(500, "Server runtime does not support fetch API");
  }

  let response;
  const timeoutSignal =
    globalThis.AbortSignal && typeof globalThis.AbortSignal.timeout === "function"
      ? globalThis.AbortSignal.timeout(5000)
      : undefined;

  try {
    response = await globalThis.fetch(
      `${env.authServiceUrl}/api/auth/internal/users/${encodeURIComponent(String(userId))}/profile`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-internal-api-key": env.internalServiceApiKey
        },
        body: JSON.stringify(payload),
        signal: timeoutSignal
      }
    );
  } catch (error) {
    throw new ServiceError(502, "Auth service is not reachable");
  }

  const body = await parseJsonSafely(response);

  if (!response.ok) {
    const message = body?.message || "Failed to sync user identity data";
    throw new ServiceError(response.status >= 500 ? 502 : response.status, message, body?.details || null);
  }
};

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
    nic: payload.nic ? normalizeNic(payload.nic) : "",
    username: payload.username ? normalizeIdentifier(payload.username) : "",
    email: payload.email ? normalizeIdentifier(payload.email) : "",
    dob: payload.dob || null,
    gender: payload.gender || "prefer_not_to_say",
    phone: payload.phone ? normalizePhone(payload.phone) : payload.phoneNumber ? normalizePhone(payload.phoneNumber) : "",
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

  const authPayload = {};

  if (Object.prototype.hasOwnProperty.call(payload, "fullName")) {
    authPayload.fullName = payload.fullName;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "nic")) {
    authPayload.nic = payload.nic;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "username")) {
    authPayload.username = payload.username;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "email")) {
    authPayload.email = payload.email;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "phone")) {
    authPayload.phoneNumber = payload.phone;
  }

  await syncAuthUserProfile({ userId: user.id, payload: authPayload });

  const fields = [
    "fullName",
    "nic",
    "username",
    "email",
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
      if (field === "username" || field === "email") {
        patient[field] = normalizeIdentifier(payload[field]);
      } else if (field === "nic") {
        patient[field] = normalizeNic(payload[field]);
      } else if (field === "phone") {
        patient[field] = normalizePhone(payload[field]);
      } else {
        patient[field] = payload[field];
      }
    }
  });

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
  removeReport
};
