const roleToKey = (role) => String(role || "").trim().toLowerCase();

export const getUserInfo = () => {
    const raw = localStorage.getItem("user");
    if (!raw) {
        return null;
    }

    try {
        const user = JSON.parse(raw);
        return {
            ...user,
            roleKey: roleToKey(user.role)
        };
    } catch {
        return null;
    }
};

export const setSession = ({ user, accessToken, refreshToken }) => {
    localStorage.setItem("token", accessToken);
    if (refreshToken) {
        localStorage.setItem("refreshToken", refreshToken);
    }
    localStorage.setItem("user", JSON.stringify(user));
};

export const getToken = () => localStorage.getItem("token");

export const getDashboardByRole = (role) => {
    const roleKey = roleToKey(role);
    if (roleKey === "doctor") {
        return "/doctor/dashboard";
    }
    if (roleKey === "admin") {
        return "/admin/dashboard";
    }
    return "/patient/dashboard";
};

export const clearSession = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
};

export const logout = () => {
    clearSession();
    window.location.href = "/login";
};
