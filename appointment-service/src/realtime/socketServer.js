const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const env = require("../config/env");

let ioInstance = null;

const normalizeRole = (role) => String(role || "").trim().toLowerCase();

const getBearerToken = (authorizationHeader) => {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return "";
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (String(scheme || "").toLowerCase() !== "bearer") {
    return "";
  }

  return String(token || "").trim();
};

const initSocketServer = (httpServer) => {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: env.corsOrigin === "*" ? true : env.corsOrigin,
      credentials: true
    }
  });

  ioInstance.use((socket, next) => {
    try {
      const tokenFromHeader = getBearerToken(socket.handshake.auth?.token || socket.handshake.headers?.authorization);
      const tokenFromQuery = String(socket.handshake.query?.token || "").trim();
      const token = tokenFromHeader || tokenFromQuery;

      if (!token) {
        return next(new Error("Missing access token"));
      }

      const payload = jwt.verify(token, env.jwtAccessSecret);
      socket.user = {
        userId: String(payload.userId || payload.id || "").trim(),
        role: String(payload.role || "")
      };

      return next();
    } catch {
      return next(new Error("Unauthorized socket connection"));
    }
  });

  ioInstance.on("connection", (socket) => {
    const userId = socket.user?.userId;
    const role = normalizeRole(socket.user?.role);

    if (userId) {
      socket.join(`user:${userId}`);
    }

    if (role === "patient") {
      socket.join(`patient:${userId}`);
    }

    if (role === "doctor") {
      socket.join(`doctor:${userId}`);
    }

    if (role === "admin") {
      socket.join("role:admin");
    }

    socket.on("appointment:watch", (appointmentId) => {
      const normalizedId = String(appointmentId || "").trim();
      if (normalizedId) {
        socket.join(`appointment:${normalizedId}`);
      }
    });
  });

  return ioInstance;
};

const getSocketServer = () => ioInstance;

const emitAppointmentChanged = ({ action, appointment }) => {
  if (!ioInstance || !appointment) {
    return;
  }

  const data = typeof appointment.toObject === "function" ? appointment.toObject() : appointment;
  const appointmentId = String(data._id || "").trim();
  const patientId = String(data.patientId || "").trim();
  const doctorId = String(data.doctorId || "").trim();

  const payload = {
    action: String(action || "updated"),
    appointment: data,
    timestamp: new Date().toISOString()
  };

  if (appointmentId) {
    ioInstance.to(`appointment:${appointmentId}`).emit("appointment:changed", payload);
  }

  if (patientId) {
    ioInstance.to(`patient:${patientId}`).emit("appointment:changed", payload);
    ioInstance.to(`user:${patientId}`).emit("appointment:changed", payload);
  }

  if (doctorId) {
    ioInstance.to(`doctor:${doctorId}`).emit("appointment:changed", payload);
    ioInstance.to(`user:${doctorId}`).emit("appointment:changed", payload);
  }

  ioInstance.to("role:admin").emit("appointment:changed", payload);
};

module.exports = {
  initSocketServer,
  getSocketServer,
  emitAppointmentChanged
};