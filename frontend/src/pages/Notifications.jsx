import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle, CircleX, CreditCard, Info, RefreshCw, Video } from 'lucide-react';
import { listLocalNotifications } from '../services/notificationService';

const Notifications = () => {
    const [notifications, setNotifications] = useState([]);

    const refresh = () => {
        setNotifications(listLocalNotifications());
    };

    useEffect(() => {
        refresh();
    }, []);

    const iconByCategory = useMemo(() => ({
        appointment: <CheckCircle className="h-5 w-5 text-blue-500" />,
        payment: <CreditCard className="h-5 w-5 text-green-500" />,
        consultation: <Video className="h-5 w-5 text-purple-500" />,
        profile: <Info className="h-5 w-5 text-cyan-500" />,
        availability: <Info className="h-5 w-5 text-indigo-500" />,
        report: <Info className="h-5 w-5 text-amber-500" />,
        admin: <Info className="h-5 w-5 text-rose-500" />,
        custom: <Bell className="h-5 w-5 text-slate-500" />
    }), []);

    const formatRelative = (iso) => {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) {
            return 'Just now';
        }

        const diffMs = Date.now() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) {
            return 'Just now';
        }
        if (diffMin < 60) {
            return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
        }
        const diffHours = Math.floor(diffMin / 60);
        if (diffHours < 24) {
            return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        }
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center">
                    <Bell className="mr-2 h-6 w-6 text-blue-600" /> Notifications
                </h1>
                <button
                    type="button"
                    onClick={refresh}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                    <RefreshCw className="h-4 w-4" /> Refresh
                </button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <div className="divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                        <div className="p-4 text-sm text-slate-500">No frontend notification events yet.</div>
                    ) : notifications.map((notif) => (
                        <div key={notif.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start space-x-4">
                            <div className="shrink-0 mt-1">
                                {iconByCategory[notif.category] || <Bell className="h-5 w-5 text-slate-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium text-slate-900">{notif.title}</p>
                                    {notif.status === 'sent' ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                                            <CheckCircle className="h-3.5 w-3.5" /> Sent
                                        </span>
                                    ) : null}
                                    {notif.status === 'failed' ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">
                                            <CircleX className="h-3.5 w-3.5" /> Failed
                                        </span>
                                    ) : null}
                                </div>
                                <p className="text-sm text-slate-700 mt-0.5">{notif.message}</p>
                                <p className="text-xs text-slate-500 mt-1">{formatRelative(notif.createdAt)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Notifications;
