import React, { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, CircleX, CreditCard, Info, Video, X } from "lucide-react";
import { subscribeToLocalNotifications } from "../services/notificationService";

const MAX_VISIBLE_TOASTS = 3;
const TOAST_DURATION_MS = 4500;

const iconByCategory = {
  appointment: <CheckCircle2 className="h-4 w-4 text-blue-600" />,
  payment: <CreditCard className="h-4 w-4 text-emerald-600" />,
  consultation: <Video className="h-4 w-4 text-purple-600" />,
  profile: <Info className="h-4 w-4 text-cyan-600" />,
  availability: <Info className="h-4 w-4 text-indigo-600" />,
  report: <Info className="h-4 w-4 text-amber-600" />,
  admin: <Info className="h-4 w-4 text-rose-600" />,
  custom: <Bell className="h-4 w-4 text-slate-600" />
};

const NotificationToaster = () => {
  const [toasts, setToasts] = useState([]);
  const timerMapRef = useRef(new Map());

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));

    const timerId = timerMapRef.current.get(id);
    if (timerId) {
      window.clearTimeout(timerId);
      timerMapRef.current.delete(id);
    }
  };

  const addToast = (notification) => {
    if (!notification?.id || !notification?.title) {
      return;
    }

    setToasts((prev) => {
      const deduped = prev.filter((toast) => toast.id !== notification.id);
      return [notification, ...deduped].slice(0, MAX_VISIBLE_TOASTS);
    });

    const existingTimer = timerMapRef.current.get(notification.id);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timerId = window.setTimeout(() => {
      dismissToast(notification.id);
    }, TOAST_DURATION_MS);

    timerMapRef.current.set(notification.id, timerId);
  };

  useEffect(() => {
    const unsubscribe = subscribeToLocalNotifications((notification) => {
      addToast(notification);
    });

    return () => {
      unsubscribe();
      timerMapRef.current.forEach((timerId) => window.clearTimeout(timerId));
      timerMapRef.current.clear();
    };
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed left-2 right-2 top-20 z-90 w-auto sm:left-auto sm:right-4 sm:w-full sm:max-w-sm space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="rounded-lg border border-slate-200 bg-white/95 shadow-lg backdrop-blur-sm px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            <div className="mt-0.5 shrink-0">{iconByCategory[toast.category] || iconByCategory.custom}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 truncate">{toast.title}</p>
              <p className="text-xs text-slate-700 line-clamp-2">{toast.message || "New notification"}</p>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {toast.status === "failed" ? (
            <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">
              <CircleX className="h-3 w-3" /> Delivery failed
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
};

export default NotificationToaster;
