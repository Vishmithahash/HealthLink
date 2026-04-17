import { telemedicineApi, extractData } from "./api";

const normalizeTelemedicineError = (error) => {
  const status = Number(error?.response?.status || 0);

  if (status === 502 || status === 503 || status === 504) {
    const normalized = new Error("Telemedicine service is currently unavailable. Please try again in a moment.");
    normalized.status = status;
    normalized.cause = error;
    return normalized;
  }

  return error;
};

export const createSession = async (payload) => {
  try {
    const response = await telemedicineApi.post("/session", payload);
    return extractData(response);
  } catch (error) {
    throw normalizeTelemedicineError(error);
  }
};

export const getSessionByAppointment = async (appointmentId) => {
  try {
    const response = await telemedicineApi.get(`/session/appointment/${appointmentId}`);
    return extractData(response);
  } catch (error) {
    throw normalizeTelemedicineError(error);
  }
};

export const getSessionById = async (sessionId) => {
  try {
    const response = await telemedicineApi.get(`/session/${sessionId}`);
    return extractData(response);
  } catch (error) {
    throw normalizeTelemedicineError(error);
  }
};

export const startTelemedicineSession = async (sessionId) => {
  try {
    const response = await telemedicineApi.patch(`/session/${sessionId}/start`);
    return extractData(response);
  } catch (error) {
    throw normalizeTelemedicineError(error);
  }
};

export const endTelemedicineSession = async (sessionId, payload = {}) => {
  try {
    const response = await telemedicineApi.patch(`/session/${sessionId}/end`, payload);
    return extractData(response);
  } catch (error) {
    throw normalizeTelemedicineError(error);
  }
};

export const getOrCreateTelemedicineSession = async ({ appointmentId, patientId, doctorId }) => {
  try {
    return await getSessionByAppointment(appointmentId);
  } catch (error) {
    if (error?.response?.status !== 404) {
      throw error;
    }

    return createSession({ appointmentId, patientId, doctorId });
  }
};
