const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const env = require("./config/env");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin === "*" ? true : env.corsOrigin,
    credentials: true
  })
);
app.use(morgan("combined"));

// Stripe webhook requires the raw body for signature verification.
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));

app.use(
  "/uploads",
  express.static(path.resolve(process.cwd(), env.uploadPath), {
    fallthrough: true
  })
);

app.get("/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Payment service healthy"
  });
});

app.use("/api/payments", paymentRoutes);
app.use("/api/payment", paymentRoutes);

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
