const app = require("./app");
const connectDB = require("./config/db");
const env = require("./config/env");
const { ensureUploadDir } = require("./services/uploadService");

const start = async () => {
  await connectDB();
  ensureUploadDir();

  app.listen(env.port, () => {
    console.log(`Payment service listening on port ${env.port}`);
  });
};

start().catch((error) => {
  console.error("Failed to start payment-service:", error.message);
  process.exit(1);
});
