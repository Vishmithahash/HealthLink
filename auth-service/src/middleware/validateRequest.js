const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  const details = errors.array().map((error) => ({
    field: error.path,
    message: error.msg
  }));

  return next(new ApiError(400, "Validation failed", details));
};

module.exports = validateRequest;
