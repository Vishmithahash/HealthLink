const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const env = require("./config/env");
const appointmentRoutes = require("./routes/appointmentRoutes");
const { notFound, errorHandler } = require("./middlewares/errorMiddleware");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin === "*" ? true : env.corsOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

app.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "Appointment service healthy" });
});

app.use("/api/appointments", appointmentRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
