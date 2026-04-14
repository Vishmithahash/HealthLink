import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getDashboardByRole, getToken, getUserInfo } from '../utils/auth';

const ProtectedRoute = ({ allowedRoles }) => {
    const token = getToken();
    const user = getUserInfo();

    if (!token || !user) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.roleKey)) {
        return <Navigate to={getDashboardByRole(user.role)} replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
