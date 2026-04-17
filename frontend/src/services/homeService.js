import axios from "axios";
import { getDoctors } from "./doctorService";

const HEALTH_ENDPOINTS = [
  {
    key: "auth",
    name: "Auth",
    description: "Sign-in and account security",
    path: "/health/auth"
  },
  {
    key: "appointment",
    name: "Appointments",
    description: "Booking and schedule management",
    path: "/health/appointments"
  },
  {
    key: "doctor",
    name: "Doctors",
    description: "Doctor directory and profiles",
    path: "/health/doctors"
  },
  {
    key: "patient",
    name: "Patients",
    description: "Patient records and reports",
    path: "/health/patients"
  },
  {
    key: "telemedicine",
    name: "Telemedicine",
    description: "Video consultations",
    path: "/health/telemedicine"
  },
  {
    key: "ai",
    name: "AI",
    description: "Symptom analysis",
    path: "/health/ai"
  },
  {
    key: "payment",
    name: "Payments",
    description: "Transactions and billing",
    path: "/health/payments"
  },
  {
    key: "notification",
    name: "Notifications",
    description: "Alerts and emails",
    path: "/health/notifications"
  }
];

const asDoctorArray = (value) => {
  if (Array.isArray(value?.data)) {
    return value.data;
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [];
};

export const getHomeDoctors = async () => {
  const response = await getDoctors({});
  return asDoctorArray(response);
};

const getOfflineReason = (error) => {
  if (error?.code === "ECONNABORTED") {
    return "Health check timed out";
  }

  const status = Number(error?.response?.status || 0);
  if (Number.isInteger(status) && status > 0) {
    return `Health endpoint returned HTTP ${status}`;
  }

  return "Service is not reachable from this portal";
};

export const getPlatformHealth = async () => {
  const checks = await Promise.all(
    HEALTH_ENDPOINTS.map(async (endpoint) => {
      const startedAt = Date.now();

      try {
      const response = await axios.get(endpoint.path, { timeout: 4500 });
      const durationMs = Math.max(1, Date.now() - startedAt);
      const statusCode = Number(response?.status || 200);

      return {
        ...endpoint,
        status: "online",
        
      };
      } catch (error) {
        const durationMs = Math.max(1, Date.now() - startedAt);

        return {
          ...endpoint,
          status: "offline",
          message: `${getOfflineReason(error)} • Checked in ${durationMs} ms`
        };
      }
    })
  );

  return checks;
};
