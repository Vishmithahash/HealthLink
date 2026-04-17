const jwt = require("jsonwebtoken");
const env = require("../config/env");

const isAllowedCaller = (payload) => {
  if (env.allowedServiceCallers.length === 0) {
    return true;
  }

  const caller = payload.service || payload.sub || payload.aud;

  if (!caller) {
    return false;
  }

  return env.allowedServiceCallers.includes(String(caller));
};

const authMiddleware = (req, res, next) => {
  if (!env.authRequired) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authorization token is required",
      details: null
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, env.jwtSecret);

    if (!isAllowedCaller(payload)) {
      return res.status(403).json({
        success: false,
        message: "Caller is not allowed to access notification APIs",
        details: null
      });
    }

    req.auth = payload;
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      details: error.message
    });
  }
};

module.exports = authMiddleware;
