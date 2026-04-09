const ApiError = require("../utils/ApiError");

const notFoundHandler = (req, res, next) => {
  next(new ApiError(404, "Route not found"));
};

const errorHandler = (error, req, res, next) => {
  if (error && error.code === 11000) {
    const duplicateField = Object.keys(error.keyPattern || {})[0] || "field";

    return res.status(409).json({
      success: false,
      message: `A user with this ${duplicateField} already exists`,
      details: null
    });
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal server error";

  if (!error.isOperational) {
    console.error("Unexpected error", {
      message: error.message,
      stack: error.stack
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    details: error.details || null
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
