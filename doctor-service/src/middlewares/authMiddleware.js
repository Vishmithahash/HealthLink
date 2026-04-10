const jwt = require("jsonwebtoken");
const env = require("../config/env");

const getVerificationSecret = () => env.jwtAccessSecret || env.jwtSecret;

const extractToken = (req) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.split(" ")[1];
};

const decodeTokenToUser = (token) => {
  const payload = jwt.verify(token, getVerificationSecret());
  const userId = payload.sub || payload.userId || payload.id;

  if (!userId) {
    return null;
  }

  return {
    id: String(userId),
    role: String(payload.role || "").trim()
  };
};

const protect = (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token is required",
        details: null
      });
    }

    const user = decodeTokenToUser(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid access token",
        details: null
      });
    }

    req.user = user;

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
      details: null
    });
  }
};

const optionalProtect = (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return next();
    }

    const user = decodeTokenToUser(token);
    if (user) {
      req.user = user;
    }

    return next();
  } catch (error) {
    return next();
  }
};

module.exports = { protect, optionalProtect };
