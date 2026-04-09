const notFound = (req, res) => {
  res.status(404).json({ success: false, message: "Route not found", details: null });
};

const errorHandler = (error, req, res, next) => {
  if (error && error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || "field";
    return res.status(409).json({
      success: false,
      message: `Duplicate value for ${field}`,
      details: null
    });
  }

  const status = error.statusCode || 500;
  const message = error.message || "Internal server error";

  if (status >= 500) {
    console.error("Appointment service error", { message: error.message, stack: error.stack });
  }

  return res.status(status).json({
    success: false,
    message,
    details: error.details || null
  });
};

module.exports = { notFound, errorHandler };
