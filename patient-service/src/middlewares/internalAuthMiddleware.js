const env = require("../config/env");

const internalOnly = (req, res, next) => {
  const providedKey = req.headers["x-internal-api-key"];

  if (!providedKey || providedKey !== env.internalServiceApiKey) {
    return res.status(403).json({
      success: false,
      message: "Forbidden",
      details: null
    });
  }

  return next();
};

module.exports = { internalOnly };
