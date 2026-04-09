const ApiError = require("../utils/ApiError");

const normalizeRole = (role) => role.toLowerCase();

const roleMiddleware = (...allowedRoles) => {
  const normalizedAllowedRoles = allowedRoles.map((role) => normalizeRole(role));

  return (req, res, next) => {
    if (!req.auth || !req.auth.role) {
      return next(new ApiError(401, "Unauthorized"));
    }

    const userRole = normalizeRole(req.auth.role);

    if (!normalizedAllowedRoles.includes(userRole)) {
      return next(new ApiError(403, "You do not have permission to access this resource"));
    }

    return next();
  };
};

module.exports = roleMiddleware;
