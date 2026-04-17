const axios = require("axios");
const Appointment = require("../models/appointmentModel");
const DoctorAvailability = require("../models/doctorAvailabilityModel");
const env = require("../config/env");
const { emitAppointmentChanged } = require("../realtime/socketServer");

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

const parseTimeToMinutes = (value) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || "").trim());
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
};

const WEEKDAY_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

const getZonedDateParts = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const weekdayToken = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);

  return {
    weekday: WEEKDAY_TO_INDEX[weekdayToken] ?? date.getUTCDay(),
    minutes: hour * 60 + minute
  };
};

const fetchDoctorScheduleProfile = async ({ doctorId, headers }) => {
  try {
    const response = await httpClient.get(`${env.doctorServiceUrl}/api/doctors/${encodeURIComponent(doctorId)}`, {
      headers
    });
    return extractData(response);
  } catch (error) {
    if (env.allowDoctorFallback) {
      return null;
    }

    throw new ServiceError(502, "Unable to fetch doctor schedule", {
      reason: error?.response?.data?.message || error.message
    });
  }
};

const evaluateDoctorSchedule = ({ doctorProfile, scheduledAt, durationMinutes }) => {
  if (!doctorProfile) {
    return {
      available: env.allowDoctorFallback,
      reason: "Doctor schedule is unavailable"
    };
  }

  const requestedStart = parseDate(scheduledAt, "scheduledAt");
  const requestedEnd = new Date(requestedStart.getTime() + durationMinutes * 60000);

  const unavailablePeriods = Array.isArray(doctorProfile.unavailablePeriods)
    ? doctorProfile.unavailablePeriods
    : [];

  const blockedByUnavailablePeriod = unavailablePeriods.some((period) => {
    const from = new Date(period.from);
    const to = new Date(period.to);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return false;
    }

    return hasOverlap(requestedStart, requestedEnd, from, to);
  });

  if (blockedByUnavailablePeriod) {
    return {
      available: false,
      reason: "Doctor is unavailable during the selected period"
    };
  }

  const slots = Array.isArray(doctorProfile.availabilitySlots) ? doctorProfile.availabilitySlots : [];
  const absoluteSlots = slots.filter((slot) => slot?.startAt && slot?.endAt);
  const weeklySlots = slots.filter((slot) => slot?.dayOfWeek != null && slot?.startTime && slot?.endTime);

  if (absoluteSlots.length > 0) {
    const matchesAbsoluteSlot = absoluteSlots.some((slot) => {
      const startAt = new Date(slot.startAt);
      const endAt = new Date(slot.endAt);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        return false;
      }
      return startAt <= requestedStart && endAt >= requestedEnd;
    });

    if (!matchesAbsoluteSlot) {
      return {
        available: false,
        reason: "Selected time does not match the doctor's available slots"
      };
    }
  }

  const timeZone = String(doctorProfile?.workingHours?.timezone || "Asia/Colombo");
  const startParts = getZonedDateParts(requestedStart, timeZone);
  const endParts = getZonedDateParts(requestedEnd, timeZone);

  if (startParts.weekday !== endParts.weekday) {
    return {
      available: false,
      reason: "Selected time spans across multiple days in doctor's timezone"
    };
  }

  const startMinutes = startParts.minutes;
  const endMinutes = endParts.minutes;

  if (weeklySlots.length > 0) {
    const matchesWeeklySlot = weeklySlots.some((slot) => {
      const slotDay = Number(slot.dayOfWeek);
      const slotStart = parseTimeToMinutes(slot.startTime);
      const slotEnd = parseTimeToMinutes(slot.endTime);

      if (!Number.isInteger(slotDay) || slotStart == null || slotEnd == null) {
        return false;
      }

      return slotDay === startParts.weekday && startMinutes >= slotStart && endMinutes <= slotEnd;
    });

    if (!matchesWeeklySlot) {
      return {
        available: false,
        reason: "Selected time is outside doctor's weekly availability slots"
      };
    }
  }

  const hasExplicitSlots = absoluteSlots.length > 0 || weeklySlots.length > 0;
  if (!hasExplicitSlots) {
    const workStart = parseTimeToMinutes(doctorProfile?.workingHours?.start || "09:00");
    const workEnd = parseTimeToMinutes(doctorProfile?.workingHours?.end || "17:00");

    if (workStart != null && workEnd != null && (startMinutes < workStart || endMinutes > workEnd)) {
      return {
        available: false,
        reason: "Selected time is outside doctor's working hours"
      };
    }
  }

  return { available: true, reason: "" };
};

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
  const doctorProfile = await fetchDoctorScheduleProfile({
    doctorId,
    headers: {}
  });

  return evaluateDoctorSchedule({ doctorProfile, scheduledAt, durationMinutes });
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

  if (!withinAvailability.available) {
    throw new ServiceError(409, withinAvailability.reason || "Unavailable: Requested time is outside doctor's set availability");
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

const fetchUserContactFromAuth = async (userId) => {
  if (!userId || !env.authServiceUrl || !env.internalServiceApiKey) {
    return null;
  }

  try {
    const response = await httpClient.get(
      `${env.authServiceUrl}/api/auth/internal/users/${encodeURIComponent(String(userId))}`,
      {
        headers: {
          "x-internal-api-key": env.internalServiceApiKey
        }
      }
    );

    return response.data?.data || null;
  } catch (error) {
    return null;
  }
};

const resolveAppointmentNotificationContext = async ({ appointment, notificationContext }) => {
  const baseContext = notificationContext && typeof notificationContext === "object" ? notificationContext : {};

  const needsPatientLookup = !baseContext.patientEmail || !baseContext.patientName || !baseContext.patientPhone;
  const needsDoctorLookup = !baseContext.doctorEmail || !baseContext.doctorName || !baseContext.doctorPhone;

  const [patientContact, doctorContact] = await Promise.all([
    needsPatientLookup ? fetchUserContactFromAuth(appointment.patientId) : Promise.resolve(null),
    needsDoctorLookup ? fetchUserContactFromAuth(appointment.doctorId) : Promise.resolve(null)
  ]);

  return {
    to: baseContext.to,
    toPhone: baseContext.toPhone,
    patientEmail: baseContext.patientEmail || patientContact?.email || null,
    patientPhone: baseContext.patientPhone || patientContact?.phoneNumber || null,
    doctorEmail: baseContext.doctorEmail || doctorContact?.email || null,
    doctorPhone: baseContext.doctorPhone || doctorContact?.phoneNumber || null,
    patientName: baseContext.patientName || patientContact?.fullName || "Patient",
    doctorName: baseContext.doctorName || doctorContact?.fullName || "Doctor",
    message: baseContext.message || ""
  };
};

// UPSTREAM: Notify Payment and Notification services
const notifyExternalSystems = async ({ appointment, headers, notificationContext = {} }) => {
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

  const resolvedNotificationContext = await resolveAppointmentNotificationContext({
    appointment,
    notificationContext
  });

  const to = resolvedNotificationContext.to;
  const toPhone = resolvedNotificationContext.toPhone;
  const patientEmail = resolvedNotificationContext.patientEmail;
  const patientPhone = resolvedNotificationContext.patientPhone;
  const doctorEmail = resolvedNotificationContext.doctorEmail;
  const doctorPhone = resolvedNotificationContext.doctorPhone;

  if (to || toPhone || patientEmail || patientPhone || doctorEmail || doctorPhone) {
    tasks.push(
      httpClient.post(`${env.notificationServiceUrl}/api/notifications/appointment-confirmation`, {
        to,
        toPhone,
        patientEmail,
        patientPhone,
        doctorEmail,
        doctorPhone,
        patientName: resolvedNotificationContext.patientName,
        doctorName: resolvedNotificationContext.doctorName,
        consultationDate: new Date(appointment.scheduledAt).toISOString(),
        appointmentId: payload.appointmentId,
        message: resolvedNotificationContext.message
      }, { headers }).catch(e => console.error("Notification failed", e.message))
    );
  }

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
      params: { specialization: specialty, specialty, name, availability },
      headers
    });

    const doctorList = Array.isArray(response?.data?.data)
      ? response.data.data
      : Array.isArray(response?.data)
        ? response.data
        : [];

    if (!availability) {
      return doctorList;
    }

    const availabilityDate = parseDate(availability, "availability");

    return doctorList.filter((doctor) => {
      const check = evaluateDoctorSchedule({
        doctorProfile: doctor,
        scheduledAt: availabilityDate,
        durationMinutes: 30
      });

      return check.available;
    });
  } catch (error) {
    if (env.allowDoctorFallback) return [];
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
  const notificationContext =
    body.notification && typeof body.notification === "object" ? body.notification : body;

  await notifyExternalSystems({ appointment, headers, notificationContext });
  emitAppointmentChanged({ action: "created", appointment });

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
  emitAppointmentChanged({ action: "rescheduled", appointment });
  return appointment;
};

const cancelAppointment = async ({ id, body, user }) => {
  const appointment = await getAppointmentById({ id, user });
  validateStatusTransition(appointment.status, "cancelled", user.role);

  appointment.status = "cancelled";
  appointment.cancelledReason = body.cancelledReason || "Cancelled by user";
  await appointment.save();
  emitAppointmentChanged({ action: "cancelled", appointment });
  
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
  emitAppointmentChanged({ action: "status-updated", appointment });
  
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
