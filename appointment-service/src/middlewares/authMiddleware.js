const jwt = require("jsonwebtoken");
const env = require("../config/env");

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Access token is required", details: null });
    }

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, env.jwtAccessSecret);

    req.user = {
      userId: payload.sub || payload.userId,
      role: payload.role
    };

    if (!req.user.userId) {
      return res.status(401).json({ success: false, message: "Invalid access token", details: null });
    }

    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid or expired access token", details: null });
  }
};

module.exports = authMiddleware;
