import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import NotificationToaster from './NotificationToaster';

const Layout = () => {
    return (
        <div className="min-h-screen bg-slate-50 font-sans">
            <Navbar />
            <NotificationToaster />
            <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
                <Outlet />
            </main>
        </div>
    );
};

export default Layout;
