import { io } from "socket.io-client";
import { getToken } from "../utils/auth";

let socketInstance = null;
let socketToken = "";
const watchedAppointmentIds = new Set();

const getSocketUrl = () => {
  if (typeof window === "undefined") {
    return "http://localhost:5173";
  }

  return window.location.origin;
};

const ensureSocket = () => {
  const token = getToken();
  if (!token) {
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
      socketToken = "";
    }
    return null;
  }

  if (socketInstance && socketToken && socketToken !== token) {
    socketInstance.disconnect();
    socketInstance = null;
  }

  if (!socketInstance) {
    socketToken = token;
    socketInstance = io(getSocketUrl(), {
      path: "/socket.io",
      autoConnect: false,
      auth: {
        token: `Bearer ${token}`
      },
      query: {
        token
      }
    });

    socketInstance.on("connect", () => {
      watchedAppointmentIds.forEach((appointmentId) => {
        socketInstance.emit("appointment:watch", appointmentId);
      });
    });
  } else {
    socketToken = token;
    socketInstance.auth = {
      token: `Bearer ${token}`
    };
    socketInstance.io.opts.query = {
      token
    };
  }

  if (!socketInstance.connected) {
    socketInstance.connect();
  }

  return socketInstance;
};

const toAppointmentIdList = (idsOrAppointments) => {
  if (!Array.isArray(idsOrAppointments)) {
    return [];
  }

  return idsOrAppointments
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") {
        return String(item);
      }

      if (item && typeof item === "object") {
        return String(item._id || item.id || "");
      }

      return "";
    })
    .map((id) => id.trim())
    .filter(Boolean);
};

export const watchAppointmentRooms = (idsOrAppointments = []) => {
  const ids = toAppointmentIdList(idsOrAppointments);

  if (ids.length === 0) {
    return;
  }

  const socket = ensureSocket();
  if (!socket) {
    return;
  }

  ids.forEach((appointmentId) => {
    watchedAppointmentIds.add(appointmentId);
    socket.emit("appointment:watch", appointmentId);
  });
};

export const subscribeToAppointmentChanges = (callback) => {
  const socket = ensureSocket();
  if (!socket || typeof callback !== "function") {
    return () => {};
  }

  socket.on("appointment:changed", callback);

  return () => {
    socket.off("appointment:changed", callback);
  };
};
