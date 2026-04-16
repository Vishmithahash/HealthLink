const env = require("../config/env");

const internalServiceAuth = (req, res, next) => {
  const providedKey = String(req.headers["x-internal-api-key"] || "").trim();
  const expectedKey = String(env.internalServiceApiKey || "").trim();

  if (!expectedKey || providedKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized internal service request"
    });
  }

  return next();
};

module.exports = internalServiceAuth;
