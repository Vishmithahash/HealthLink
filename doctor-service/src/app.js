const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const env = require("./config/env");
const doctorRoutes = require("./routes/doctorRoutes");
const { notFound, errorHandler } = require("./middlewares/errorMiddleware");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin === "*" ? true : env.corsOrigin,
    credentials: true
  })
);
app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Doctor service healthy"
  });
});

app.use("/api/doctors", doctorRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
