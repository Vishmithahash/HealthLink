import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import Layout from '../components/Layout';
import Login from '../pages/Login';
import Register from '../pages/Register';

// Lazy load dashboards
const PatientDashboard = lazy(() => import('../pages/PatientDashboard'));
const DoctorDashboard = lazy(() => import('../pages/DoctorDashboard'));
const AdminDashboard = lazy(() => import('../pages/AdminDashboard'));
const VideoConsultation = lazy(() => import('../pages/VideoConsultation'));
const Notifications = lazy(() => import('../pages/Notifications'));
const SymptomChecker = lazy(() => import('../pages/SymptomChecker'));

const FallbackLoader = () => (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
);

const AppRouter = () => {
    return (
        <Suspense fallback={<FallbackLoader />}>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />

                {/* Protected routes wrapped in Layout */}
                <Route element={<Layout />}>
                    {/* Patient Routes */}
                    <Route element={<ProtectedRoute allowedRoles={['patient']} />}>
                        <Route path="/patient/dashboard" element={<PatientDashboard />} />
                    </Route>

                    {/* Doctor Routes */}
                    <Route element={<ProtectedRoute allowedRoles={['doctor']} />}>
                        <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
                    </Route>

                    {/* Admin Routes */}
                    <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                        <Route path="/admin/dashboard" element={<AdminDashboard />} />
                    </Route>

                    {/* Telemedicine Routes */}
                    <Route element={<ProtectedRoute allowedRoles={['patient', 'doctor']} />}>
                        <Route path="/telemedicine/:id" element={<VideoConsultation />} />
                    </Route>

                    {/* Shared Protected Routes */}
                    <Route element={<ProtectedRoute allowedRoles={['patient', 'doctor', 'admin']} />}>
                        <Route path="/notifications" element={<Notifications />} />
                        <Route path="/symptom-checker" element={<SymptomChecker />} />
                    </Route>
                </Route>

                {/* Redirect root to login for now */}
                <Route path="/" element={<Navigate to="/login" replace />} />

                <Route path="*" element={<div className="min-h-screen flex items-center justify-center flex-col text-slate-800">
                    <h1 className="text-4xl font-bold">404</h1>
                    <p className="mt-2">Page Not Found</p>
                </div>} />
            </Routes>
        </Suspense>
    );
};

export default AppRouter;
