const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const telemedicineRoutes = require("./routes/telemedicineRoutes");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN === "*" ? true : process.env.CORS_ORIGIN || "*",
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

app.get("/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Telemedicine service healthy"
  });
});

app.use("/api/telemedicine", telemedicineRoutes);

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "Route not found",
    details: null
  });
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: error.message || "Internal server error",
    details: error.details || null
  });
});

module.exports = app;
