const jwt = require("jsonwebtoken");

const getJwtSecret = () => process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET;

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
    const payload = jwt.verify(token, getJwtSecret());
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
      role: String(payload.role || "").trim()
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

module.exports = authMiddleware;
