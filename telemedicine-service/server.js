const dotenv = require("dotenv");
const app = require("./app");
const connectDB = require("./config/db");

dotenv.config();

const requiredEnv = ["PORT", "MONGO_URI"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (!process.env.JWT_SECRET && !process.env.JWT_ACCESS_SECRET) {
  missingEnv.push("JWT_SECRET (or JWT_ACCESS_SECRET)");
}

if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);
}

const startServer = async () => {
  await connectDB();

  const port = Number(process.env.PORT || 4004);

  app.listen(port, () => {
    console.log(`Telemedicine service listening on port ${port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start telemedicine service:", error.message);
  process.exit(1);
});
