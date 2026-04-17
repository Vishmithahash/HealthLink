const ApiError = require("../utils/ApiError");
const env = require("../config/env");

const internalServiceAuth = (req, res, next) => {
  const providedKey = req.headers["x-internal-api-key"];

  if (!env.internalServiceApiKey) {
    return next(new ApiError(500, "Internal service API key is not configured"));
  }

  if (!providedKey || String(providedKey) !== env.internalServiceApiKey) {
    return next(new ApiError(401, "Invalid internal service API key"));
  }

  return next();
};

module.exports = internalServiceAuth;