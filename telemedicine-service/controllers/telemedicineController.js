const axios = require("axios");
const Session = require("../models/sessionModel");
const { generateMeetingUrl, generateRoomName } = require("../services/jitsiService");

const normalizeRole = (role) => String(role || "").trim().toLowerCase();

const send = (res, statusCode, message, data) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

const sendError = (res, statusCode, message, details = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    details
  });
};

const getAuthHeader = (req) => req.headers.authorization || "";

const getInternalApiKey = () => String(process.env.INTERNAL_SERVICE_API_KEY || "").trim();

const fetchUserContactFromAuth = async (userId) => {
  if (!userId) {
    return null;
  }

  const authServiceUrl = process.env.AUTH_SERVICE_URL || "http://localhost:4000";
  const timeout = Number(process.env.REQUEST_TIMEOUT_MS || 5000);
  const internalApiKey = getInternalApiKey();

  if (!internalApiKey) {
    return null;
  }

  try {
    const response = await axios.get(
      `${authServiceUrl}/api/auth/internal/users/${encodeURIComponent(String(userId))}`,
      {
        headers: {
          "x-internal-api-key": internalApiKey
        },
        timeout
      }
    );

    return response.data?.data || null;
  } catch {
    return null;
  }
};

const assertParticipantByPayload = (user, payload) => {
  const role = normalizeRole(user.role);

  if (role === "doctor" && String(payload.doctorId) !== String(user.id)) {
    return { allowed: false, message: "Doctor can only create session for own user ID" };
  }

  if (role === "patient" && String(payload.patientId) !== String(user.id)) {
    return { allowed: false, message: "Patient can only create session for own user ID" };
  }

  return { allowed: true };
};

const assertParticipantBySession = (user, session) => {
  const role = normalizeRole(user.role);

  if (role === "doctor" && String(session.doctorId) === String(user.id)) {
    return { allowed: true };
  }

  if (role === "patient" && String(session.patientId) === String(user.id)) {
    return { allowed: true };
  }

  return { allowed: false, message: "Forbidden: you are not a participant of this session" };
};

const verifyAppointmentIfRequired = async ({ req, appointmentId, doctorId, patientId }) => {
  if (String(process.env.VERIFY_APPOINTMENT_WITH_SERVICE || "false").toLowerCase() !== "true") {
    return;
  }

  const appointmentServiceUrl = process.env.APPOINTMENT_SERVICE_URL || "http://localhost:4001";
  const timeout = Number(process.env.REQUEST_TIMEOUT_MS || 5000);

  try {
    const response = await axios.get(`${appointmentServiceUrl}/api/appointments/${encodeURIComponent(appointmentId)}`, {
      headers: {
        Authorization: getAuthHeader(req)
      },
      timeout
    });

    const appointment = response.data?.data || response.data;
    const status = String(appointment?.status || "").toLowerCase();

    if (!["confirmed", "completed"].includes(status)) {
      const statusLabel = status || "unknown";
      throw new Error(`Appointment must be confirmed or completed. Current status: ${statusLabel}`);
    }

    if (String(appointment.doctorId) !== String(doctorId) || String(appointment.patientId) !== String(patientId)) {
      throw new Error("Appointment doctorId/patientId does not match payload");
    }
  } catch (error) {
    const allowFallback = String(process.env.ALLOW_APPOINTMENT_FALLBACK || "false").toLowerCase() === "true";

    if (allowFallback) {
      return;
    }

    const upstreamMessage = error.response?.data?.message || error.message || "Failed to validate appointment";
    const statusCode = error.response?.status ? Number(error.response.status) : 502;

    const serviceError = new Error(upstreamMessage);
    serviceError.statusCode = statusCode >= 500 ? 502 : statusCode;
    throw serviceError;
  }
};

const sendConsultationCompletedNotification = async ({ req, session }) => {
  const [patientContact, doctorContact] = await Promise.all([
    fetchUserContactFromAuth(session.patientId),
    fetchUserContactFromAuth(session.doctorId)
  ]);

  const patientEmail = req.body?.patientEmail || req.query?.patientEmail || patientContact?.email || null;
  const doctorEmail = req.body?.doctorEmail || req.query?.doctorEmail || doctorContact?.email || null;
  const patientPhone = req.body?.patientPhone || req.query?.patientPhone || patientContact?.phoneNumber || null;
  const doctorPhone = req.body?.doctorPhone || req.query?.doctorPhone || doctorContact?.phoneNumber || null;
  const patientName = req.body?.patientName || patientContact?.fullName || "Patient";
  const doctorName = req.body?.doctorName || doctorContact?.fullName || "Doctor";

  if (!patientEmail && !doctorEmail && !patientPhone && !doctorPhone) {
    return;
  }

  const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4007";
  const timeout = Number(process.env.REQUEST_TIMEOUT_MS || 5000);

  try {
    await axios.post(
      `${notificationServiceUrl}/api/notifications/consultation-completed`,
      {
        to: req.body?.to,
        toPhone: req.body?.toPhone || req.query?.toPhone,
        patientEmail,
        patientPhone,
        doctorEmail,
        doctorPhone,
        patientName,
        doctorName,
        appointmentId: session.appointmentId,
        consultationDate: (session.endedAt || new Date()).toISOString(),
        message: req.body?.message || "Your consultation session has been completed."
      },
      {
        headers: {
          Authorization: getAuthHeader(req)
        },
        timeout
      }
    );
  } catch (error) {
    const reason = error.response?.data?.message || error.message;
    console.error(`Telemedicine notification failed: ${reason}`);
  }
};

const createSession = async (req, res) => {
  try {
    const { appointmentId, patientId, doctorId } = req.body;

    const accessCheck = assertParticipantByPayload(req.user, { appointmentId, patientId, doctorId });
    if (!accessCheck.allowed) {
      return sendError(res, 403, accessCheck.message);
    }

    await verifyAppointmentIfRequired({ req, appointmentId, doctorId, patientId });

    const existingSession = await Session.findOne({ appointmentId });
    if (existingSession) {
      const existingAccess = assertParticipantBySession(req.user, existingSession);
      if (!existingAccess.allowed) {
        return sendError(res, 403, existingAccess.message);
      }

      return send(res, 200, "Session already exists for this appointment", existingSession);
    }

    const roomName = generateRoomName(appointmentId);
    const meetingUrl = generateMeetingUrl(roomName);

    const session = await Session.create({
      appointmentId,
      patientId,
      doctorId,
      roomName,
      meetingUrl,
      status: "scheduled"
    });

    return send(res, 201, "Telemedicine session created successfully", session);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return sendError(res, statusCode, error.message || "Failed to create session");
  }
};

const getSessionByAppointment = async (req, res) => {
  try {
    const session = await Session.findOne({ appointmentId: req.params.appointmentId });

    if (!session) {
      return sendError(res, 404, "Session not found for this appointment");
    }

    const accessCheck = assertParticipantBySession(req.user, session);
    if (!accessCheck.allowed) {
      return sendError(res, 403, accessCheck.message);
    }

    return send(res, 200, "Session fetched successfully", session);
  } catch (error) {
    return sendError(res, 500, "Failed to fetch session");
  }
};

const getSessionById = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);

    if (!session) {
      return sendError(res, 404, "Session not found");
    }

    const accessCheck = assertParticipantBySession(req.user, session);
    if (!accessCheck.allowed) {
      return sendError(res, 403, accessCheck.message);
    }

    return send(res, 200, "Session fetched successfully", session);
  } catch (error) {
    return sendError(res, 500, "Failed to fetch session");
  }
};

const getRoomDetails = async (req, res) => {
  try {
    const session = await Session.findOne({ roomName: req.params.roomName });

    if (!session) {
      return sendError(res, 404, "Room not found");
    }

    const accessCheck = assertParticipantBySession(req.user, session);
    if (!accessCheck.allowed) {
      return sendError(res, 403, accessCheck.message);
    }

    return send(res, 200, "Room details fetched successfully", {
      roomName: session.roomName,
      meetingUrl: session.meetingUrl,
      appointmentId: session.appointmentId,
      doctorId: session.doctorId,
      patientId: session.patientId,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt
    });
  } catch (error) {
    return sendError(res, 500, "Failed to fetch room details");
  }
};

const startSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);

    if (!session) {
      return sendError(res, 404, "Session not found");
    }

    const accessCheck = assertParticipantBySession(req.user, session);
    if (!accessCheck.allowed) {
      return sendError(res, 403, accessCheck.message);
    }

    if (session.status === "completed") {
      return sendError(res, 400, "Cannot start a completed session");
    }

    if (session.status === "ongoing") {
      return send(res, 200, "Session is already ongoing", session);
    }

    session.status = "ongoing";
    session.startedAt = session.startedAt || new Date();

    await session.save();

    return send(res, 200, "Session started successfully", session);
  } catch (error) {
    return sendError(res, 500, "Failed to start session");
  }
};

const endSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);

    if (!session) {
      return sendError(res, 404, "Session not found");
    }

    const accessCheck = assertParticipantBySession(req.user, session);
    if (!accessCheck.allowed) {
      return sendError(res, 403, accessCheck.message);
    }

    if (session.status === "completed") {
      return send(res, 200, "Session is already completed", session);
    }

    if (session.status !== "ongoing") {
      return sendError(res, 400, "Only ongoing sessions can be ended");
    }

    session.status = "completed";
    session.endedAt = new Date();
    if (!session.startedAt) {
      session.startedAt = session.endedAt;
    }

    await session.save();

      await sendConsultationCompletedNotification({ req, session }); // Dispatch notification when session ends

    return send(res, 200, "Session ended successfully", session);
  } catch (error) {
    return sendError(res, 500, "Failed to end session");
  }
};

module.exports = {
  createSession,
  getSessionByAppointment,
  getSessionById,
  getRoomDetails,
  startSession,
  endSession
};
