const axios = require("axios");
const mongoose = require("mongoose");
const Doctor = require("../models/doctorModel");
const Prescription = require("../models/prescriptionModel");
const env = require("../config/env");

class ServiceError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const normalizeRole = (role) => String(role || "").trim().toLowerCase();

const requestClient = axios.create({
  timeout: env.requestTimeoutMs
});

const asData = (response) => {
  if (!response || !response.data) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(response.data, "data")) {
    return response.data.data;
  }

  return response.data;
};

const mapAxiosError = (error, fallbackMessage) => {
  if (error.response) {
    const status = Number(error.response.status) || 502;
    const message = error.response.data?.message || fallbackMessage;
    const details = error.response.data?.details || null;
    return new ServiceError(status, message, details);
  }

  if (error.request) {
    return new ServiceError(502, fallbackMessage, { reason: "upstream service not reachable" });
  }

  return new ServiceError(500, fallbackMessage, { reason: error.message });
};

const ensureDoctor = async (userId) => {
  const doctor = await Doctor.findOne({ userId });

  if (!doctor) {
    throw new ServiceError(404, "Doctor profile not found");
  }

  return doctor;
};

const assertDoctorOrAdmin = (user) => {
  const role = normalizeRole(user.role);

  if (role !== "doctor" && role !== "admin") {
    throw new ServiceError(403, "Forbidden");
  }
};

const isIsoTime = (value) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);

const validateAvailabilityPayload = (payload) => {
  const slots = payload.availabilitySlots;

  if (slots && !Array.isArray(slots)) {
    throw new ServiceError(400, "availabilitySlots must be an array");
  }

  if (slots) {
    slots.forEach((slot, index) => {
      if (slot.dayOfWeek != null) {
        const dayOfWeek = Number(slot.dayOfWeek);
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
          throw new ServiceError(400, `availabilitySlots[${index}].dayOfWeek must be between 0 and 6`);
        }
      }

      if (slot.startTime && !isIsoTime(slot.startTime)) {
        throw new ServiceError(400, `availabilitySlots[${index}].startTime must be HH:mm`);
      }

      if (slot.endTime && !isIsoTime(slot.endTime)) {
        throw new ServiceError(400, `availabilitySlots[${index}].endTime must be HH:mm`);
      }

      if (slot.startTime && slot.endTime && slot.startTime >= slot.endTime) {
        throw new ServiceError(400, `availabilitySlots[${index}] startTime must be earlier than endTime`);
      }

      if (slot.startAt || slot.endAt) {
        const startAt = slot.startAt ? new Date(slot.startAt) : null;
        const endAt = slot.endAt ? new Date(slot.endAt) : null;

        if (!startAt || !endAt || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
          throw new ServiceError(400, `availabilitySlots[${index}] startAt and endAt must be valid dates`);
        }

        if (startAt >= endAt) {
          throw new ServiceError(400, `availabilitySlots[${index}] startAt must be earlier than endAt`);
        }
      }
    });
  }

  const unavailablePeriods = payload.unavailablePeriods;
  if (unavailablePeriods && !Array.isArray(unavailablePeriods)) {
    throw new ServiceError(400, "unavailablePeriods must be an array");
  }

  if (unavailablePeriods) {
    unavailablePeriods.forEach((period, index) => {
      const from = new Date(period.from);
      const to = new Date(period.to);

      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new ServiceError(400, `unavailablePeriods[${index}] has invalid date format`);
      }

      if (from >= to) {
        throw new ServiceError(400, `unavailablePeriods[${index}].from must be earlier than to`);
      }
    });
  }
};

const getHeaders = (authHeader) => ({
  Authorization: authHeader || ""
});

const registerDoctor = async ({ payload, actor }) => {
  const required = ["userId", "fullName", "specialization", "licenseNumber"];
  const missing = required.filter((key) => !payload[key]);

  if (missing.length > 0) {
    throw new ServiceError(400, `Missing required fields: ${missing.join(", ")}`);
  }

  const exists = await Doctor.findOne({
    $or: [{ userId: payload.userId }, { licenseNumber: payload.licenseNumber.toUpperCase() }]
  });

  if (exists) {
    throw new ServiceError(409, "Doctor profile already exists for user or license number");
  }

  const actorRole = normalizeRole(actor?.role);
  const isAdmin = actorRole === "admin";

  const doctor = await Doctor.create({
    userId: String(payload.userId),
    fullName: payload.fullName,
    specialization: payload.specialization,
    licenseNumber: payload.licenseNumber,
    qualification: payload.qualification || "",
    experienceYears: payload.experienceYears || 0,
    consultationFee: payload.consultationFee || 0,
    workingHours: payload.workingHours || undefined,
    availabilitySlots: Array.isArray(payload.availabilitySlots) ? payload.availabilitySlots : [],
    status: isAdmin ? payload.status || "active" : "inactive",
    verified: isAdmin ? Boolean(payload.verified ?? true) : false
  });

  return doctor;
};

const getDoctorProfile = async ({ user }) => {
  assertDoctorOrAdmin(user);
  return ensureDoctor(user.id);
};

const updateDoctorProfile = async ({ user, payload }) => {
  if (normalizeRole(user.role) !== "doctor") {
    throw new ServiceError(403, "Only doctors can update their profile");
  }

  const doctor = await ensureDoctor(user.id);

  const allowedFields = [
    "fullName",
    "specialization",
    "qualification",
    "experienceYears",
    "consultationFee",
    "workingHours",
    "bio"
  ];

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      doctor[field] = payload[field];
    }
  });

  await doctor.save();
  return doctor;
};

const getAllDoctors = async ({ query, user }) => {
  const filters = {};

  if (query.specialization) {
    filters.specialization = { $regex: query.specialization, $options: "i" };
  }

  if (query.name) {
    filters.fullName = { $regex: query.name, $options: "i" };
  }

  const isAdmin = normalizeRole(user?.role) === "admin";

  if (isAdmin && query.status) {
    filters.status = query.status;
  }

  if (isAdmin && query.verified != null) {
    filters.verified = String(query.verified).toLowerCase() === "true";
  }

  if (!isAdmin) {
    filters.status = "active";
    filters.verified = true;
  }

  return Doctor.find(filters)
    .sort({ rating: -1, createdAt: -1 })
    .lean();
};

const getDoctorById = async ({ id, user }) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ServiceError(400, "Invalid doctor id");
  }

  const doctor = await Doctor.findById(id);

  if (!doctor) {
    throw new ServiceError(404, "Doctor not found");
  }

  const isAdmin = normalizeRole(user?.role) === "admin";
  if (!isAdmin && (doctor.status !== "active" || !doctor.verified)) {
    throw new ServiceError(404, "Doctor not found");
  }

  return doctor;
};

const updateAvailability = async ({ user, payload }) => {
  if (normalizeRole(user.role) !== "doctor") {
    throw new ServiceError(403, "Only doctors can update availability");
  }

  validateAvailabilityPayload(payload);

  const doctor = await ensureDoctor(user.id);

  if (payload.availabilitySlots) {
    doctor.availabilitySlots = payload.availabilitySlots;
  }

  if (payload.unavailablePeriods) {
    doctor.unavailablePeriods = payload.unavailablePeriods;
  }

  await doctor.save();
  return doctor;
};

const getDoctorAppointments = async ({ user, authHeader }) => {
  if (normalizeRole(user.role) !== "doctor") {
    throw new ServiceError(403, "Only doctors can view doctor appointments");
  }

  await ensureDoctor(user.id);

  try {
    const response = await requestClient.get(
      `${env.appointmentServiceUrl}/api/appointments/doctor/${encodeURIComponent(user.id)}`,
      {
        headers: getHeaders(authHeader)
      }
    );

    return asData(response);
  } catch (error) {
    throw mapAxiosError(error, "Failed to fetch appointments from Appointment Service");
  }
};

const fetchAppointmentForDoctor = async ({ appointmentId, user, authHeader }) => {
  try {
    const response = await requestClient.get(
      `${env.appointmentServiceUrl}/api/appointments/${encodeURIComponent(appointmentId)}`,
      {
        headers: getHeaders(authHeader)
      }
    );

    const appointment = asData(response);

    if (!appointment) {
      throw new ServiceError(404, "Appointment not found");
    }

    const isAdmin = normalizeRole(user.role) === "admin";

    if (!isAdmin && String(appointment.doctorId) !== String(user.id)) {
      throw new ServiceError(403, "Appointment does not belong to this doctor");
    }

    return appointment;
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }
    throw mapAxiosError(error, "Failed to fetch appointment details");
  }
};

const notifyAppointmentDecision = async ({ appointmentId, status, reason, user, authHeader }) => {
  try {
    await requestClient.post(
      `${env.notificationServiceUrl}/api/notifications/send`,
      {
        type: "APPOINTMENT_STATUS_UPDATED",
        recipientRole: "patient",
        data: {
          appointmentId,
          status,
          reason: reason || "",
          actorId: user.id
        }
      },
      {
        headers: getHeaders(authHeader)
      }
    );
  } catch (error) {
    // Best-effort notification; appointment status update should not fail because of this.
  }
};

const updateAppointmentDecision = async ({ appointmentId, action, reason, user, authHeader }) => {
  if (normalizeRole(user.role) !== "doctor") {
    throw new ServiceError(403, "Only doctors can accept or reject appointments");
  }

  await ensureDoctor(user.id);
  await fetchAppointmentForDoctor({ appointmentId, user, authHeader });

  const status = action === "accept" ? "confirmed" : "rejected";

  try {
    const response = await requestClient.patch(
      `${env.appointmentServiceUrl}/api/appointments/${encodeURIComponent(appointmentId)}/status`,
      {
        status
      },
      {
        headers: getHeaders(authHeader)
      }
    );

    await notifyAppointmentDecision({ appointmentId, status, reason, user, authHeader });

    return asData(response);
  } catch (error) {
    throw mapAxiosError(error, `Failed to ${action} appointment`);
  }
};

const getPatientReports = async ({ patientId, user, authHeader }) => {
  if (!["doctor", "admin"].includes(normalizeRole(user.role))) {
    throw new ServiceError(403, "Forbidden");
  }

  if (normalizeRole(user.role) === "doctor") {
    const appointments = await getDoctorAppointments({ user, authHeader });

    const hasLinkedAppointment = Array.isArray(appointments)
      ? appointments.some((appointment) => String(appointment.patientId) === String(patientId))
      : false;

    if (!hasLinkedAppointment) {
      throw new ServiceError(403, "No linked appointments found for this patient");
    }
  }

  try {
    const response = await requestClient.get(
      `${env.patientServiceUrl}/api/patients/${encodeURIComponent(patientId)}/reports`,
      {
        headers: getHeaders(authHeader),
        params: { doctorId: user.id }
      }
    );

    return asData(response);
  } catch (error) {
    throw mapAxiosError(error, "Failed to fetch patient reports from Patient Service");
  }
};

const getTelemedicineSession = async ({ appointmentId, user, authHeader }) => {
  if (!["doctor", "admin"].includes(normalizeRole(user.role))) {
    throw new ServiceError(403, "Forbidden");
  }

  const appointment = await fetchAppointmentForDoctor({ appointmentId, user, authHeader });

  try {
    const response = await requestClient.get(
      `${env.telemedicineServiceUrl}/api/telemedicine/session/appointment/${encodeURIComponent(appointmentId)}`,
      {
        headers: getHeaders(authHeader)
      }
    );

    return {
      appointment,
      session: asData(response)
    };
  } catch (error) {
    if (error.response?.status === 404) {
      try {
        const createResponse = await requestClient.post(
          `${env.telemedicineServiceUrl}/api/telemedicine/session`,
          {
            appointmentId,
            patientId: appointment.patientId,
            doctorId: appointment.doctorId
          },
          {
            headers: getHeaders(authHeader)
          }
        );

        return {
          appointment,
          session: asData(createResponse)
        };
      } catch (creationError) {
        // Fall through to fallback response below.
      }
    }

    return {
      appointment,
      session: {
        provider: "fallback",
        joinUrl: `${env.telemedicineJoinBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(appointmentId)}`,
        note: "Telemedicine service did not return session details; fallback link generated"
      }
    };
  }
};

const validateMedicines = (medicines) => {
  if (!Array.isArray(medicines) || medicines.length === 0) {
    throw new ServiceError(400, "medicines must be a non-empty array");
  }

  medicines.forEach((medicine, index) => {
    if (!medicine.name || !medicine.dosage) {
      throw new ServiceError(400, `medicines[${index}] requires name and dosage`);
    }
  });
};

const createPrescription = async ({ payload, user, authHeader }) => {
  if (normalizeRole(user.role) !== "doctor") {
    throw new ServiceError(403, "Only doctors can issue prescriptions");
  }

  const doctor = await ensureDoctor(user.id);

  const { appointmentId, patientId, medicines, instructions, followUpDate } = payload;

  if (!appointmentId) {
    throw new ServiceError(400, "appointmentId is required");
  }

  validateMedicines(medicines);

  const appointment = await fetchAppointmentForDoctor({ appointmentId, user, authHeader });

  if (!["confirmed", "completed"].includes(String(appointment.status))) {
    throw new ServiceError(400, "Prescription can be issued only for confirmed or completed appointments");
  }

  const resolvedPatientId = patientId || appointment.patientId;
  if (!resolvedPatientId) {
    throw new ServiceError(400, "patientId is required");
  }

  const exists = await Prescription.findOne({ appointmentId });
  if (exists) {
    throw new ServiceError(409, "Prescription already exists for this appointment");
  }

  const prescription = await Prescription.create({
    appointmentId,
    doctorId: doctor._id,
    doctorUserId: doctor.userId,
    patientId: String(resolvedPatientId),
    medicines,
    instructions: instructions || "",
    followUpDate: followUpDate || null,
    issuedAt: new Date()
  });

  try {
    await requestClient.post(
      `${env.patientServiceUrl}/api/patients/${encodeURIComponent(String(resolvedPatientId))}/prescriptions`,
      {
        appointmentId,
        doctorId: doctor.userId,
        medicines,
        instructions: instructions || "",
        followUpDate: followUpDate || null,
        issuedAt: prescription.issuedAt
      },
      {
        headers: getHeaders(authHeader)
      }
    );
  } catch (syncError) {
    await Prescription.deleteOne({ _id: prescription._id });
    throw mapAxiosError(syncError, "Failed to sync prescription to Patient Service");
  }

  try {
    await requestClient.post(
      `${env.notificationServiceUrl}/api/notifications/send`,
      {
        type: "PRESCRIPTION_ISSUED",
        recipientId: String(resolvedPatientId),
        data: {
          appointmentId,
          prescriptionId: prescription._id.toString(),
          doctorId: doctor.userId
        }
      },
      {
        headers: getHeaders(authHeader)
      }
    );
  } catch (error) {
    // Best-effort notification only.
  }

  return prescription;
};

const getPrescriptionByAppointment = async ({ appointmentId, user }) => {
  const role = normalizeRole(user.role);

  if (!["doctor", "admin"].includes(role)) {
    throw new ServiceError(403, "Forbidden");
  }

  let prescription;

  if (role === "admin") {
    prescription = await Prescription.findOne({ appointmentId });
  } else {
    prescription = await Prescription.findOne({ appointmentId, doctorUserId: user.id });
  }

  if (!prescription) {
    throw new ServiceError(404, "Prescription not found");
  }

  return prescription;
};

const updatePrescription = async ({ prescriptionId, payload, user }) => {
  if (normalizeRole(user.role) !== "doctor") {
    throw new ServiceError(403, "Only doctors can update prescriptions");
  }

  const prescription = await Prescription.findOne({ _id: prescriptionId, doctorUserId: user.id });

  if (!prescription) {
    throw new ServiceError(404, "Prescription not found");
  }

  if (payload.medicines) {
    validateMedicines(payload.medicines);
    prescription.medicines = payload.medicines;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "instructions")) {
    prescription.instructions = payload.instructions || "";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "followUpDate")) {
    prescription.followUpDate = payload.followUpDate || null;
  }

  await prescription.save();
  return prescription;
};

const updateDoctorStatus = async ({ doctorId, status, user }) => {
  if (normalizeRole(user.role) !== "admin") {
    throw new ServiceError(403, "Only admins can update doctor status");
  }

  const allowedStatuses = ["active", "inactive", "verified", "suspended"];
  if (!allowedStatuses.includes(status)) {
    throw new ServiceError(400, `status must be one of: ${allowedStatuses.join(", ")}`);
  }

  const doctor = await getDoctorById({ id: doctorId, user });
  doctor.status = status;
  if (status === "verified") {
    doctor.verified = true;
  }

  await doctor.save();
  return doctor;
};

const verifyDoctor = async ({ doctorId, verified, user }) => {
  if (normalizeRole(user.role) !== "admin") {
    throw new ServiceError(403, "Only admins can verify doctors");
  }

  const doctor = await getDoctorById({ id: doctorId, user });
  doctor.verified = Boolean(verified);

  if (doctor.verified && doctor.status === "inactive") {
    doctor.status = "active";
  }

  await doctor.save();
  return doctor;
};

module.exports = {
  ServiceError,
  registerDoctor,
  getDoctorProfile,
  updateDoctorProfile,
  getAllDoctors,
  getDoctorById,
  updateAvailability,
  getDoctorAppointments,
  updateAppointmentDecision,
  getPatientReports,
  getTelemedicineSession,
  createPrescription,
  getPrescriptionByAppointment,
  updatePrescription,
  updateDoctorStatus,
  verifyDoctor
};
