import { notificationApi, extractData } from "./api";

const LOCAL_NOTIFICATION_STORAGE_KEY = "healthlink_notifications";
const MAX_LOCAL_NOTIFICATION_ENTRIES = 100;
const LOCAL_NOTIFICATION_CREATED_EVENT = "healthlink:notification:new";

const readLocalNotifications = () => {
  try {
    const raw = localStorage.getItem(LOCAL_NOTIFICATION_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocalNotifications = (entries) => {
  localStorage.setItem(LOCAL_NOTIFICATION_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_LOCAL_NOTIFICATION_ENTRIES)));
};

const emitLocalNotificationCreated = (entry) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(LOCAL_NOTIFICATION_CREATED_EVENT, { detail: entry }));
};

export const listLocalNotifications = () => {
  return readLocalNotifications();
};

export const pushLocalNotification = ({
  title,
  message,
  category = "custom",
  status = "info",
  recipients = {}
}) => {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    title: title || "Notification",
    message: message || "",
    category,
    status,
    recipients: {
      patientEmail: recipients.patientEmail || null,
      patientPhone: recipients.patientPhone || null,
      doctorEmail: recipients.doctorEmail || null,
      doctorPhone: recipients.doctorPhone || null,
      to: recipients.to || null,
      toPhone: recipients.toPhone || null
    }
  };

  const nextEntries = [entry, ...readLocalNotifications()];
  writeLocalNotifications(nextEntries);
  emitLocalNotificationCreated(entry);

  return entry;
};

export const subscribeToLocalNotifications = (callback) => {
  if (typeof window === "undefined" || typeof callback !== "function") {
    return () => {};
  }

  const handleCreated = (event) => {
    callback(event?.detail || null);
  };

  const handleStorage = (event) => {
    if (event.key !== LOCAL_NOTIFICATION_STORAGE_KEY) {
      return;
    }

    const latest = listLocalNotifications();
    callback(latest[0] || null);
  };

  window.addEventListener(LOCAL_NOTIFICATION_CREATED_EVENT, handleCreated);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(LOCAL_NOTIFICATION_CREATED_EVENT, handleCreated);
    window.removeEventListener("storage", handleStorage);
  };
};

export const sendCustomNotification = async (payload) => {
  const response = await notificationApi.post("/send", {
    type: "APPOINTMENT_STATUS_UPDATED",
    to: payload.to,
    data: {
      ...payload,
      templateType: "custom"
    }
  });

  return extractData(response);
};

const hasAnyRecipient = (recipients = {}) => {
  return Boolean(
    recipients.to ||
      recipients.toPhone ||
      recipients.patientEmail ||
      recipients.patientPhone ||
      recipients.doctorEmail ||
      recipients.doctorPhone
  );
};

export const notifyCustomBestEffort = async ({
  title,
  message,
  recipients = {},
  extraPayload = {},
  category = "custom"
}) => {
  const payload = {
    subject: title,
    message,
    ...recipients,
    ...extraPayload
  };

  if (!hasAnyRecipient(recipients)) {
    pushLocalNotification({
      title,
      message,
      category,
      status: "skipped",
      recipients
    });
    return false;
  }

  try {
    await sendCustomNotification(payload);
    pushLocalNotification({
      title,
      message,
      category,
      status: "sent",
      recipients
    });
    return true;
  } catch {
    pushLocalNotification({
      title,
      message,
      category,
      status: "failed",
      recipients
    });
    return false;
  }
};
