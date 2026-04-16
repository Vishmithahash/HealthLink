const { validationResult } = require("express-validator");

const validateRequest = (options = {}) => {
  const errorMessage = options.errorMessage || "Validation failed";

  return (req, res, next) => {
    const errors = validationResult(req);

    if (errors.isEmpty()) {
      return next();
    }

    return res.status(400).json({
      error: errorMessage,
      details: errors.array().map((item) => ({
        field: item.path,
        message: item.msg
      }))
    });
  };
};

module.exports = { validateRequest };
