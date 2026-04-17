import { notificationApi, extractData } from "./api";
import { getUserInfo } from "../utils/auth";

const LOCAL_NOTIFICATION_STORAGE_PREFIX = "healthlink_notifications_v2";
const MAX_LOCAL_NOTIFICATION_ENTRIES = 100;
const LOCAL_NOTIFICATION_CREATED_EVENT = "healthlink:notification:new";
const LOCAL_NOTIFICATION_UPDATED_EVENT = "healthlink:notification:updated";

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const getCurrentUser = () => getUserInfo() || null;

const buildUserScopeKey = (user) => {
  const userId = String(user?.id || user?._id || user?.userId || "").trim();
  const email = normalizeText(user?.email);
  const username = normalizeText(user?.username);
  const role = normalizeText(user?.role) || "unknown";

  if (userId) {
    return `id:${userId}`;
  }
  if (email) {
    return `email:${email}`;
  }
  if (username) {
    return `username:${username}:${role}`;
  }
  return "anonymous";
};

const getLocalNotificationStorageKey = (user = getCurrentUser()) => {
  return `${LOCAL_NOTIFICATION_STORAGE_PREFIX}:${buildUserScopeKey(user)}`;
};

const isNotificationRelevant = (entry, user = getCurrentUser()) => {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const ownerKey = String(entry.ownerUserKey || "").trim();
  const currentOwnerKey = buildUserScopeKey(user);

  // Notifications are stored in a user-scoped key. Only enforce owner mismatch exclusion.
  if (ownerKey && ownerKey !== currentOwnerKey) {
    return false;
  }

  return true;
};

const readScopedNotifications = (user = getCurrentUser()) => {
  const storageKey = getLocalNotificationStorageKey(user);
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry) => isNotificationRelevant(entry, user));
  } catch {
    return [];
  }
};

const writeLocalNotifications = (entries, user = getCurrentUser()) => {
  const storageKey = getLocalNotificationStorageKey(user);
  localStorage.setItem(storageKey, JSON.stringify(entries.slice(0, MAX_LOCAL_NOTIFICATION_ENTRIES)));
};

const emitLocalNotificationCreated = (entry) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(LOCAL_NOTIFICATION_CREATED_EVENT, { detail: entry }));
};

const emitLocalNotificationUpdated = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(LOCAL_NOTIFICATION_UPDATED_EVENT));
};

export const listLocalNotifications = ({ includeRead = false } = {}) => {
  const items = readScopedNotifications();
  if (includeRead) {
    return items;
  }

  return items.filter((entry) => !entry?.readAt);
};

export const getUnreadLocalNotificationCount = () => {
  return listLocalNotifications().length;
};

export const pushLocalNotification = ({
  title,
  message,
  category = "custom",
  status = "info",
  recipients = {},
  dedupKey = ""
}) => {
  const user = getCurrentUser();
  const ownerUserKey = buildUserScopeKey(user);
  const normalizedDedupKey = String(dedupKey || "").trim();
  const existingEntries = readScopedNotifications(user);

  if (normalizedDedupKey) {
    const existing = existingEntries.find((item) => String(item?.dedupKey || "").trim() === normalizedDedupKey);
    if (existing) {
      return existing;
    }
  }

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    title: title || "Notification",
    message: message || "",
    category,
    status,
    dedupKey: normalizedDedupKey || null,
    ownerUserKey,
    recipients: {
      patientEmail: recipients.patientEmail || null,
      patientPhone: recipients.patientPhone || null,
      doctorEmail: recipients.doctorEmail || null,
      doctorPhone: recipients.doctorPhone || null,
      to: recipients.to || null,
      toPhone: recipients.toPhone || null
    }
  };

  const nextEntries = [entry, ...existingEntries];
  writeLocalNotifications(nextEntries, user);
  emitLocalNotificationCreated(entry);

  return entry;
};

export const markLocalNotificationAsRead = (id) => {
  if (!id) {
    return false;
  }

  const user = getCurrentUser();
  const items = readScopedNotifications(user);
  let changed = false;

  const next = items.map((entry) => {
    if (entry?.id !== id || entry?.readAt) {
      return entry;
    }

    changed = true;
    return {
      ...entry,
      readAt: new Date().toISOString()
    };
  });

  if (!changed) {
    return false;
  }

  writeLocalNotifications(next, user);
  emitLocalNotificationUpdated();
  return true;
};

export const clearLocalNotifications = () => {
  const user = getCurrentUser();
  writeLocalNotifications([], user);
  emitLocalNotificationUpdated();
};

export const subscribeToLocalNotifications = (callback) => {
  if (typeof window === "undefined" || typeof callback !== "function") {
    return () => {};
  }

  const handleCreated = (event) => {
    const entry = event?.detail || null;
    if (isNotificationRelevant(entry)) {
      callback(entry);
    }
  };

  const handleUpdated = () => {
    callback(null);
  };

  const handleStorage = (event) => {
    const storageKey = getLocalNotificationStorageKey();
    if (event.key !== storageKey) {
      return;
    }

    const latest = listLocalNotifications();
    callback(latest[0] || null);
  };

  window.addEventListener(LOCAL_NOTIFICATION_CREATED_EVENT, handleCreated);
  window.addEventListener(LOCAL_NOTIFICATION_UPDATED_EVENT, handleUpdated);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(LOCAL_NOTIFICATION_CREATED_EVENT, handleCreated);
    window.removeEventListener(LOCAL_NOTIFICATION_UPDATED_EVENT, handleUpdated);
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
