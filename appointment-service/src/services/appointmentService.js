const axios = require("axios");
const Appointment = require("../models/appointmentModel");
const DoctorAvailability = require("../models/doctorAvailabilityModel");
const env = require("../config/env");

class ServiceError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const httpClient = axios.create({ timeout: env.requestTimeoutMs });
const ACTIVE_STATUSES = ["pending", "confirmed"];
const TERMINAL_STATUSES = ["cancelled", "completed", "rejected"];

// HELPER: Extract auth header for upstream calls
const authHeaderFromReq = (req) => ({ authorization: req.headers.authorization || "" });

// HELPER: Authorization check
const ensureCanAccessAppointment = (appointment, user) => {
  if (user.role === "Admin") return;
  if (user.role === "Doctor" && appointment.doctorId === user.userId) return;
  if (user.role === "patient" && appointment.patientId === user.userId) return;
  throw new ServiceError(403, "Forbidden: You cannot access this appointment");
};

// HELPER: Status transition validation
const validateStatusTransition = (currentStatus, newStatus, userRole) => {
  if (TERMINAL_STATUSES.includes(currentStatus)) {
    throw new ServiceError(400, `Cannot update appointment from terminal state: ${currentStatus}`);
  }

  // Business Rules:
  // 1. Patients can only cancel.
  if (userRole === "patient" && newStatus !== "cancelled") {
    throw new ServiceError(403, "Patients can only cancel their appointments");
  }

  // 2. Cannot transition to same status
  if (currentStatus === newStatus) {
    throw new ServiceError(400, "Appointment is already in this status");
  }
};

// HELPER: Future date validation
const assertFutureDate = (date, fieldName) => {
  if (new Date(date) <= new Date()) {
    throw new ServiceError(400, `${fieldName} must be in the future`);
  }
};

const parseDate = (value, fieldName) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ServiceError(400, `${fieldName} must be a valid ISO date`);
  }
  return date;
};

const extractData = (response) => response?.data?.data ?? null;

const assertPatientAccountCanBook = async ({ patientId, headers, user }) => {
  if (user.role !== "patient") {
    return;
  }

  try {
    const profileResponse = await httpClient.get(`${env.patientServiceUrl}/api/patients/profile`, {
      headers
    });

    const profile = extractData(profileResponse) || {};
    const status = String(profile.status || "active").toLowerCase();

    if (["inactive", "suspended"].includes(status)) {
      throw new ServiceError(403, `Booking is not allowed because your account is ${status}. Please contact support.`);
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }

    const statusCode = Number(error?.response?.status || 0);
    if (statusCode === 401 || statusCode === 403) {
      throw new ServiceError(403, "Booking is not allowed for this account.");
    }

    if (statusCode === 404) {
      throw new ServiceError(404, "Patient profile not found. Complete profile setup before booking.");
    }

    throw new ServiceError(502, "Could not verify patient account status before booking", {
      reason: error?.message || "unknown error",
      patientId
    });
  }
};

const hasOverlap = (leftStart, leftEnd, rightStart, rightEnd) => leftStart < rightEnd && leftEnd > rightStart;

// CORE: Check for existing appointment conflicts
const hasDoctorAppointmentConflict = async ({ doctorId, scheduledAt, durationMinutes, excludeAppointmentId }) => {
  const requestedStart = parseDate(scheduledAt, "scheduledAt");
  const requestedEnd = new Date(requestedStart.getTime() + durationMinutes * 60000);

  const query = {
    doctorId,
    status: { $in: ACTIVE_STATUSES },
    scheduledAt: { $lt: requestedEnd }
  };

  if (excludeAppointmentId) {
    query._id = { $ne: excludeAppointmentId };
  }

  const candidates = await Appointment.find(query).select("scheduledAt durationMinutes");

  return candidates.some((appointment) => {
    const start = new Date(appointment.scheduledAt);
    const end = new Date(start.getTime() + appointment.durationMinutes * 60000);
    return hasOverlap(start, end, requestedStart, requestedEnd);
  });
};

// CORE: Check against local doctor availability slots
const isWithinDoctorAvailability = async ({ doctorId, scheduledAt, durationMinutes }) => {
  const requestedStart = parseDate(scheduledAt, "scheduledAt");
  const requestedEnd = new Date(requestedStart.getTime() + durationMinutes * 60000);

  // If no availability is defined at all, we treat it as "unmanaged" (available) 
  // ONLY IF env.allowDoctorFallback is true. Otherwise, we require explicit slots.
  const anyAvailabilityDefined = await DoctorAvailability.exists({ doctorId });

  if (!anyAvailabilityDefined) {
    return env.allowDoctorFallback; 
  }

  const matchingSlot = await DoctorAvailability.findOne({
    doctorId,
    startAt: { $lte: requestedStart },
    endAt: { $gte: requestedEnd }
  });

  return Boolean(matchingSlot);
};

const assertDoctorSlotAvailable = async ({ doctorId, scheduledAt, durationMinutes, excludeAppointmentId }) => {
  // 1. Check local appointment conflicts
  const hasConflict = await hasDoctorAppointmentConflict({
    doctorId,
    scheduledAt,
    durationMinutes,
    excludeAppointmentId
  });

  if (hasConflict) {
    throw new ServiceError(409, "Conflicting appointment: Doctor is already booked at this time");
  }

  // 2. Check local availability slots
  const withinAvailability = await isWithinDoctorAvailability({
    doctorId,
    scheduledAt,
    durationMinutes
  });

  if (!withinAvailability) {
    throw new ServiceError(409, "Unavailable: Requested time is outside doctor's set availability");
  }
};

// UPSTREAM: Check external doctor service (if applicable)
const checkExternalDoctorAvailability = async ({ doctorId, scheduledAt, durationMinutes, headers }) => {
  try {
    const response = await httpClient.get(`${env.doctorServiceUrl}/api/doctors/${doctorId}/check-availability`, {
      params: { scheduledAt, durationMinutes },
      headers
    });
    return Boolean(response.data?.data?.available);
  } catch (error) {
    if (env.allowDoctorFallback) return true;
    throw new ServiceError(502, "Doctor service unreachable", { reason: error.message });
  }
};

// UPSTREAM: Notify Payment and Notification services
const notifyExternalSystems = async ({ appointment, headers }) => {
  const payload = {
    appointmentId: appointment._id.toString(),
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    status: appointment.status,
    scheduledAt: appointment.scheduledAt
  };

  const tasks = [];

  // Initiate Payment Request
  tasks.push(
    httpClient.post(`${env.paymentServiceUrl}/api/payments/requests`, {
      orderId: payload.appointmentId,
      customerId: payload.patientId,
      amount: 1000, // Placeholder
      type: "APPOINTMENT_FEE"
    }, { headers }).catch(e => console.error("Payment notification failed", e.message))
  );

  // Send Notification
  tasks.push(
    httpClient.post(`${env.notificationServiceUrl}/api/notifications/send`, {
      recipientId: payload.patientId,
      type: "APPOINTMENT_CONFIRMATION",
      data: payload
    }, { headers }).catch(e => console.error("Notification failed", e.message))
  );

  await Promise.allSettled(tasks);
};

const ensureTelemedicineSession = async ({ appointment, headers }) => {
  if (String(appointment.status) !== "confirmed") {
    return;
  }

  try {
    await httpClient.post(
      `${env.telemedicineServiceUrl}/api/telemedicine/session`,
      {
        appointmentId: appointment._id.toString(),
        patientId: appointment.patientId,
        doctorId: appointment.doctorId
      },
      { headers }
    );
  } catch (error) {
    // Best-effort integration so appointment confirmation remains successful.
  }
};

// API LOGIC: Search Doctors
const searchDoctors = async ({ specialty, name, availability, headers }) => {
  try {
    const response = await httpClient.get(`${env.doctorServiceUrl}/api/doctors`, {
      params: { specialty, name, availability },
      headers
    });
    return response.data;
  } catch (error) {
    if (env.allowDoctorFallback) return { success: true, data: [] };
    throw new ServiceError(502, "Unable to search doctors", { reason: error.message });
  }
};

// API LOGIC: Set Availability
const setDoctorAvailability = async ({ doctorId, body, user }) => {
  if (user.role !== "Admin" && (user.role !== "Doctor" || user.userId !== doctorId)) {
    throw new ServiceError(403, "Unauthorized to manage availability for this doctor");
  }

  const startAt = parseDate(body.startAt, "startAt");
  const endAt = parseDate(body.endAt, "endAt");

  assertFutureDate(startAt, "startAt");
  if (startAt >= endAt) throw new ServiceError(400, "endAt must be later than startAt");

  return DoctorAvailability.create({
    doctorId,
    startAt,
    endAt,
    setBy: user.userId
  });
};

const listDoctorAvailability = async ({ doctorId, from, to }) => {
  const query = { doctorId };
  if (from || to) {
    query.$and = [];
    if (from) query.$and.push({ endAt: { $gte: parseDate(from, "from") } });
    if (to) query.$and.push({ startAt: { $lte: parseDate(to, "to") } });
  }
  return DoctorAvailability.find(query).sort({ startAt: 1 });
};

// API LOGIC: Create Appointment
const createAppointment = async ({ body, user, headers }) => {
  const patientId = user.role === "patient" ? user.userId : body.patientId;
  const durationMinutes = body.durationMinutes || 30;

  if (!patientId) throw new ServiceError(400, "patientId is required");
  await assertPatientAccountCanBook({ patientId, headers, user });
  assertFutureDate(body.scheduledAt, "scheduledAt");

  // 1. Conflict & Local Availability Check
  await assertDoctorSlotAvailable({
    doctorId: body.doctorId,
    scheduledAt: body.scheduledAt,
    durationMinutes
  });

  // 2. Upstream Verification
  const externalAvailable = await checkExternalDoctorAvailability({
    doctorId: body.doctorId,
    scheduledAt: body.scheduledAt,
    durationMinutes,
    headers
  });

  if (!externalAvailable) {
    throw new ServiceError(409, "Doctor is not available according to doctor-service");
  }

  // 3. Persistent Creation
  const appointment = await Appointment.create({
    patientId,
    doctorId: body.doctorId,
    specialty: body.specialty,
    scheduledAt: body.scheduledAt,
    durationMinutes,
    reason: body.reason || "",
    status: "pending",
    createdBy: user.userId
  });

  // 4. Async Notifications
  await notifyExternalSystems({ appointment, headers });

  return appointment;
};

const getAppointmentById = async ({ id, user }) => {
  const appointment = await Appointment.findById(id);
  if (!appointment) throw new ServiceError(404, "Appointment not found");
  ensureCanAccessAppointment(appointment, user);
  return appointment;
};

const rescheduleAppointment = async ({ id, body, user, headers }) => {
  const appointment = await getAppointmentById({ id, user });
  
  if (TERMINAL_STATUSES.includes(appointment.status)) {
    throw new ServiceError(400, "Cannot reschedule a completed or cancelled appointment");
  }

  assertFutureDate(body.scheduledAt, "scheduledAt");
  const durationMinutes = body.durationMinutes || appointment.durationMinutes;

  await assertDoctorSlotAvailable({
    doctorId: appointment.doctorId,
    scheduledAt: body.scheduledAt,
    durationMinutes,
    excludeAppointmentId: appointment._id
  });

  appointment.scheduledAt = body.scheduledAt;
  appointment.durationMinutes = durationMinutes;
  appointment.status = "pending"; // Reset to pending if rescheduled?
  
  await appointment.save();
  return appointment;
};

const cancelAppointment = async ({ id, body, user }) => {
  const appointment = await getAppointmentById({ id, user });
  validateStatusTransition(appointment.status, "cancelled", user.role);

  appointment.status = "cancelled";
  appointment.cancelledReason = body.cancelledReason || "Cancelled by user";
  await appointment.save();
  
  return appointment;
};

const listPatientAppointments = async ({ patientId, user }) => {
  if (user.role !== "Admin" && user.userId !== patientId) {
    throw new ServiceError(403, "Forbidden: Cannot view other patient's appointments");
  }
  return Appointment.find({ patientId }).sort({ scheduledAt: -1 });
};

const listDoctorAppointments = async ({ doctorId, user }) => {
  if (user.role !== "Admin" && user.userId !== doctorId) {
    throw new ServiceError(403, "Forbidden: Cannot view other doctor's appointments");
  }
  return Appointment.find({ doctorId }).sort({ scheduledAt: -1 });
};

const updateAppointmentStatus = async ({ id, body, user, headers }) => {
  const appointment = await getAppointmentById({ id, user });
  validateStatusTransition(appointment.status, body.status, user.role);

  appointment.status = body.status;
  await appointment.save();

  await ensureTelemedicineSession({ appointment, headers });
  
  return appointment;
};

module.exports = {
  ServiceError,
  authHeaderFromReq,
  searchDoctors,
  setDoctorAvailability,
  listDoctorAvailability,
  createAppointment,
  getAppointmentById,
  rescheduleAppointment,
  cancelAppointment,
  listPatientAppointments,
  listDoctorAppointments,
  updateAppointmentStatus
};
