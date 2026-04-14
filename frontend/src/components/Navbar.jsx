import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getUserInfo, logout } from '../utils/auth';
import { Activity, LogOut, User, Bell } from 'lucide-react';

const Navbar = () => {
    const user = getUserInfo();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <nav className="bg-white/95 backdrop-blur shadow-sm border-b border-slate-200 sticky top-0 z-30">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex">
                        <Link to="/" className="flex-shrink-0 flex items-center">
                            <Activity className="h-8 w-8 text-teal-700 mr-2" />
                            <span className="font-bold text-xl text-slate-800">HealthLink</span>
                        </Link>
                    </div>
                    <div className="flex items-center">
                        {user ? (
                            <>
                                <div className="flex items-center mr-6">
                                    <Link to="/notifications" className="relative p-2 text-slate-500 hover:text-teal-700 transition-colors mr-4">
                                        <Bell className="h-5 w-5" />
                                        <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
                                    </Link>
                                    <User className="h-5 w-5 text-slate-500 mr-2" />
                                    <span className="text-sm font-medium text-slate-700 hidden sm:block">{user.fullName || user.name || user.username} ({user.role})</span>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-slate-800 hover:bg-slate-700 focus:outline-none transition-colors"
                                >
                                    <LogOut className="h-4 w-4 sm:mr-2" />
                                    <span className="hidden sm:inline">Logout</span>
                                </button>
                            </>
                        ) : (
                            <Link to="/login" className="text-sm font-medium text-blue-600 hover:text-blue-500">
                                Login
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
