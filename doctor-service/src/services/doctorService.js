const axios = require("axios");
const mongoose = require("mongoose");
const Doctor = require("../models/doctorModel");
const Prescription = require("../models/prescriptionModel");
const env = require("../config/env");
const { DOCTOR_SPECIALTIES, resolveDoctorSpecialty } = require("../constants/doctorSpecialties");

class ServiceError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const normalizeRole = (role) => String(role || "").trim().toLowerCase();
const escapeRegexLiteral = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const normalizeDoctorSpecialization = (value) => {
  const resolved = resolveDoctorSpecialty(value);
  if (!resolved) {
    throw new ServiceError(400, `specialization must be one of: ${DOCTOR_SPECIALTIES.join(", ")}`);
  }

  return resolved;
};

const getHeaders = (authHeader) => ({
  Authorization: authHeader || ""
});

const buildTelemedicineJoinUrl = (appointmentId) => {
  const base = String(env.telemedicineJoinBaseUrl || "").replace(/\/$/, "");
  if (!base || !appointmentId) {
    return "";
  }

  return `${base}/${encodeURIComponent(String(appointmentId))}`;
};

const getInternalHeaders = () => ({
  "x-internal-api-key": env.internalServiceApiKey
});

const fetchUserContactFromAuth = async (userId) => {
  if (!userId || !env.authServiceUrl || !env.internalServiceApiKey) {
    return null;
  }

  try {
    const response = await requestClient.get(
      `${env.authServiceUrl}/api/auth/internal/users/${encodeURIComponent(String(userId))}`,
      {
        headers: getInternalHeaders()
      }
    );

    return asData(response);
  } catch (error) {
    return null;
  }
};

const syncAuthDoctorProfile = async ({ userId, fullName }) => {
  if (!userId || !env.authServiceUrl || !env.internalServiceApiKey) {
    return;
  }

  const nextFullName = String(fullName || "").trim();
  if (!nextFullName) {
    return;
  }

  try {
    await requestClient.patch(
      `${env.authServiceUrl}/api/auth/internal/users/${encodeURIComponent(String(userId))}`,
      {
        fullName: nextFullName
      },
      {
        headers: getInternalHeaders()
      }
    );
  } catch (error) {
    throw mapAxiosError(error, "Failed to sync doctor profile with auth service");
  }
};

const normalizeDoctorTimezone = async (doctor) => {
  const currentTimezone = String(doctor?.workingHours?.timezone || "").trim();
  if (!currentTimezone || currentTimezone.toUpperCase() === "UTC") {
    doctor.workingHours = {
      ...doctor.workingHours,
      timezone: "Asia/Colombo"
    };
    await doctor.save();
  }

  return doctor;
};

const normalizeDoctorTimezoneView = (doctor) => {
  const plainDoctor = doctor?.toObject ? doctor.toObject() : doctor;
  const timezone = String(plainDoctor?.workingHours?.timezone || "").trim();

  if (!timezone || timezone.toUpperCase() === "UTC") {
    return {
      ...plainDoctor,
      workingHours: {
        ...(plainDoctor?.workingHours || {}),
        timezone: "Asia/Colombo"
      }
    };
  }

  return plainDoctor;
};

const fetchPatientProfileFromPatientService = async ({ patientId, authHeader }) => {
  if (!patientId || !env.patientServiceUrl) {
    return null;
  }

  try {
    const response = await requestClient.get(
      `${env.patientServiceUrl}/api/patients/${encodeURIComponent(String(patientId))}`,
      {
        headers: getHeaders(authHeader)
      }
    );

    return asData(response);
  } catch {
    return null;
  }
};

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

  await syncAuthDoctorProfile({
    userId: payload.userId,
    fullName: payload.fullName
  });

  const doctor = await Doctor.create({
    userId: String(payload.userId),
    fullName: payload.fullName,
    specialization: normalizeDoctorSpecialization(payload.specialization),
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
  const doctor = await ensureDoctor(user.id);
  await normalizeDoctorTimezone(doctor);
  return doctor;
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

  if (Object.prototype.hasOwnProperty.call(payload, "specialization")) {
    payload.specialization = normalizeDoctorSpecialization(payload.specialization);
  }

  const nextFullName = Object.prototype.hasOwnProperty.call(payload, "fullName")
    ? String(payload.fullName || "").trim()
    : null;

  if (nextFullName) {
    await syncAuthDoctorProfile({
      userId: user.id,
      fullName: nextFullName
    });
  }

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
    filters.specialization = { $regex: escapeRegexLiteral(query.specialization), $options: "i" };
  }

  if (query.name) {
    filters.fullName = { $regex: escapeRegexLiteral(query.name), $options: "i" };
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

  const doctors = await Doctor.find(filters)
    .sort({ rating: -1, createdAt: -1 })
    .lean();

  return doctors.map((doctor) => normalizeDoctorTimezoneView(doctor));
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

  return normalizeDoctorTimezoneView(doctor);
};

const getDoctorDocumentById = async ({ id }) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ServiceError(400, "Invalid doctor id");
  }

  const doctor = await Doctor.findById(id);
  if (!doctor) {
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

const notifyAppointmentDecision = async ({
  appointmentId,
  patientId,
  doctorId,
  status,
  reason,
  appointment,
  telemedicineJoinUrl,
  user,
  authHeader,
  notificationContext = {}
}) => {
  const [patientContact, doctorContact] = await Promise.all([
    fetchUserContactFromAuth(patientId),
    fetchUserContactFromAuth(doctorId)
  ]);

  const recipient = notificationContext.patientEmail || notificationContext.to || patientContact?.email;

  if (String(status).toLowerCase() === "confirmed") {
    const patientName = notificationContext.patientName || patientContact?.fullName || "Patient";
    const doctorName = notificationContext.doctorName || doctorContact?.fullName || user?.fullName || "Doctor";

    const messageParts = [];
    if (telemedicineJoinUrl) {
      messageParts.push(`Telemedicine link: ${telemedicineJoinUrl}`);
    }
    if (reason) {
      messageParts.push(`Reason: ${reason}`);
    }

    try {
      await requestClient.post(
        `${env.notificationServiceUrl}/api/notifications/appointment-confirmation`,
        {
          patientEmail: notificationContext.patientEmail || patientContact?.email,
          patientPhone: notificationContext.patientPhone || patientContact?.phoneNumber || null,
          doctorEmail: notificationContext.doctorEmail || doctorContact?.email || null,
          doctorPhone: notificationContext.doctorPhone || doctorContact?.phoneNumber || null,
          patientName,
          doctorName,
          appointmentId,
          consultationDate: appointment?.scheduledAt
            ? new Date(appointment.scheduledAt).toISOString()
            : new Date().toISOString(),
          joinUrl: telemedicineJoinUrl || "",
          message: messageParts.join(". "),
          actorId: user.id
        },
        {
          headers: getHeaders(authHeader)
        }
      );
      return;
    } catch (error) {
      // Continue to fallback email flow below.
    }
  }

  if (!recipient) {
    return;
  }

  try {
    await requestClient.post(
      `${env.notificationServiceUrl}/api/notifications/send-email`,
      {
        to: recipient,
        patientPhone: notificationContext.patientPhone || patientContact?.phoneNumber || null,
        subject: notificationContext.subject || "Appointment Status Update",
        templateType: "custom",
        message:
          notificationContext.message ||
          `Hello ${patientContact?.fullName || "Patient"}, your appointment ${appointmentId} has been ${status}${
            reason ? `. Reason: ${reason}` : ""
          }.`,
        appointmentId,
        status,
        reason: reason || "",
        actorId: user.id
      },
      {
        headers: getHeaders(authHeader)
      }
    );
  } catch (error) {
    // Best-effort notification; appointment status update should not fail because of this.
  }
};

const getOrCreateTelemedicineSession = async ({ appointmentId, patientId, doctorId, authHeader }) => {
  try {
    const response = await requestClient.get(
      `${env.telemedicineServiceUrl}/api/telemedicine/session/appointment/${encodeURIComponent(appointmentId)}`,
      {
        headers: getHeaders(authHeader)
      }
    );

    return asData(response);
  } catch (error) {
    if (error.response?.status !== 404) {
      return null;
    }
  }

  try {
    const createResponse = await requestClient.post(
      `${env.telemedicineServiceUrl}/api/telemedicine/session`,
      {
        appointmentId,
        patientId,
        doctorId
      },
      {
        headers: getHeaders(authHeader)
      }
    );

    return asData(createResponse);
  } catch (error) {
    return null;
  }
};

const updateAppointmentDecision = async ({ appointmentId, action, reason, user, authHeader, notificationContext }) => {
  if (normalizeRole(user.role) !== "doctor") {
    throw new ServiceError(403, "Only doctors can accept or reject appointments");
  }

  await ensureDoctor(user.id);
  const appointment = await fetchAppointmentForDoctor({ appointmentId, user, authHeader });

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

    let telemedicineJoinUrl = "";
    if (status === "confirmed") {
      const telemedicineSession = await getOrCreateTelemedicineSession({
        appointmentId,
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        authHeader
      });

      telemedicineJoinUrl =
        buildTelemedicineJoinUrl(appointmentId) ||
        telemedicineSession?.joinUrl ||
        telemedicineSession?.meetingUrl ||
        "";
    }

    await notifyAppointmentDecision({
      appointmentId,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      status,
      reason,
      appointment,
      telemedicineJoinUrl,
      user,
      authHeader,
      notificationContext
    });

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

  const session = await getOrCreateTelemedicineSession({
    appointmentId,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    authHeader
  });

  if (session) {
    return {
      appointment,
      session
    };
  }

  return {
    appointment,
    session: {
      provider: "fallback",
      joinUrl: buildTelemedicineJoinUrl(appointmentId),
      note: "Telemedicine service did not return session details; fallback link generated"
    }
  };
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

const escapeHtml = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const formatPrescriptionDate = (value) => {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(date);
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

  let patientContact = await fetchUserContactFromAuth(resolvedPatientId);

  if (!patientContact) {
    patientContact = await fetchUserContactFromAuth(appointment.patientId);
  }

  if (!patientContact) {
    const patientProfile = await fetchPatientProfileFromPatientService({
      patientId: resolvedPatientId,
      authHeader
    });

    if (patientProfile?.userId) {
      patientContact = await fetchUserContactFromAuth(patientProfile.userId);
    }
  }

  const prescriptionRecipient = payload.patientEmail || payload.to || patientContact?.email;

  const medicineSummary = medicines
    .map((medicine) => {
      const segments = [
        `${medicine.name} (${medicine.dosage})`,
        medicine.frequency ? `Frequency: ${medicine.frequency}` : "",
        medicine.duration ? `Duration: ${medicine.duration}` : "",
        medicine.notes ? `Notes: ${medicine.notes}` : ""
      ].filter(Boolean);

      return segments.join(" | ");
    })
    .join("; ");

  const followUpLabel = formatPrescriptionDate(followUpDate || prescription.followUpDate);
  const issuedAtLabel = formatPrescriptionDate(prescription.issuedAt);
  const patientLabel = patientContact?.fullName || "Patient";

  const prescriptionMessage =
    payload.message ||
    `Hello ${patientLabel}, your prescription has been issued. Appointment ID: ${appointmentId}. Prescription ID: ${prescription._id.toString()}. Medicines: ${medicineSummary}. Instructions: ${instructions || "N/A"}. Follow-up: ${followUpLabel}.`;

  const prescriptionHtml = `
    <p>Hello ${escapeHtml(patientLabel)},</p>
    <p>Your prescription has been issued successfully.</p>
    <p><strong>Appointment ID:</strong> ${escapeHtml(appointmentId)}</p>
    <p><strong>Prescription ID:</strong> ${escapeHtml(prescription._id.toString())}</p>
    <p><strong>Issued At:</strong> ${escapeHtml(issuedAtLabel)} (Asia/Colombo)</p>
    <p><strong>Doctor:</strong> ${escapeHtml(doctor.fullName || "Doctor")}</p>
    <p><strong>Instructions:</strong> ${escapeHtml(instructions || "N/A")}</p>
    <p><strong>Follow-up:</strong> ${escapeHtml(followUpLabel)}</p>
    <p><strong>Medicines:</strong></p>
    <ul>
      ${medicines
        .map(
          (medicine) => `
            <li>
              <strong>${escapeHtml(medicine.name || "N/A")}</strong> (${escapeHtml(medicine.dosage || "N/A")})
              ${medicine.frequency ? `<div>Frequency: ${escapeHtml(medicine.frequency)}</div>` : ""}
              ${medicine.duration ? `<div>Duration: ${escapeHtml(medicine.duration)}</div>` : ""}
              ${medicine.notes ? `<div>Notes: ${escapeHtml(medicine.notes)}</div>` : ""}
            </li>
          `
        )
        .join("")}
    </ul>
  `;

  if (prescriptionRecipient || patientContact?.phoneNumber) {
    try {
      await requestClient.post(
        `${env.notificationServiceUrl}/api/notifications/send`,
        {
          type: "APPOINTMENT_STATUS_UPDATED",
          to: prescriptionRecipient || undefined,
          data: {
            to: prescriptionRecipient || undefined,
            toPhone: payload.patientPhone || patientContact?.phoneNumber || undefined,
            patientEmail: prescriptionRecipient || undefined,
            patientPhone: payload.patientPhone || patientContact?.phoneNumber || undefined,
            patientName: patientContact?.fullName || "Patient",
            subject: payload.subject || "Prescription Issued",
            templateType: "custom",
            message: prescriptionMessage,
            html: payload.html || prescriptionHtml,
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

  const doctor = await getDoctorDocumentById({ id: doctorId });
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

  const doctor = await getDoctorDocumentById({ id: doctorId });
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
