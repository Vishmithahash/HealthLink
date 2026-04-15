const jwt = require("jsonwebtoken");
const env = require("../config/env");

const normalizeRole = (value) => String(value || "").trim().toLowerCase();

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access token is required",
        details: null
      });
    }

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, env.jwtSecret);
    const userId = payload.sub || payload.userId || payload.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid access token",
        details: null
      });
    }

    req.user = {
      id: String(userId),
      role: normalizeRole(payload.role)
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
      details: null
    });
  }
};

const allowRoles = (...roles) => {
  const allowedRoles = new Set(roles.map((role) => normalizeRole(role)));

  return (req, res, next) => {
    const role = normalizeRole(req.user?.role);

    if (!allowedRoles.has(role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: insufficient role permissions",
        details: null
      });
    }

    return next();
  };
};

module.exports = {
  authMiddleware,
  allowRoles
};
