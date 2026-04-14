import React from 'react';
import { Bell, CheckCircle, CreditCard, Video } from 'lucide-react';

const Notifications = () => {
    const notifications = [
        { id: 1, type: 'appointment', message: 'Your appointment with Dr. Smith is confirmed for Nov 20.', time: '2 hours ago', icon: <CheckCircle className="h-5 w-5 text-blue-500" /> },
        { id: 2, type: 'payment', message: 'Payment of $50 was successful.', time: '1 day ago', icon: <CreditCard className="h-5 w-5 text-green-500" /> },
        { id: 3, type: 'telemedicine', message: 'Video consultation session with Dr. Jane is completed.', time: '3 days ago', icon: <Video className="h-5 w-5 text-purple-500" /> },
    ];

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center">
                <Bell className="mr-2 h-6 w-6 text-blue-600" /> Notifications
            </h1>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <div className="divide-y divide-slate-100">
                    {notifications.map((notif) => (
                        <div key={notif.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start space-x-4 cursor-pointer">
                            <div className="flex-shrink-0 mt-1">
                                {notif.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900">
                                    {notif.message}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    {notif.time}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Notifications;
