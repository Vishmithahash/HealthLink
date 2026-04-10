const notFound = (req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
    details: null
  });
};

const errorHandler = (error, req, res, next) => {
  if (error.name === "MulterError") {
    return res.status(400).json({
      success: false,
      message: error.message,
      details: null
    });
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal server error";

  return res.status(statusCode).json({
    success: false,
    message,
    details: error.details || null
  });
};

module.exports = {
  notFound,
  errorHandler
};
