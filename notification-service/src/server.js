const app = require("./app");
const env = require("./config/env");
const { verifyConnection } = require("./services/mailerService");
const { connectMongo, ensureNotificationLogCollection } = require("./services/mongoService");

const start = async () => {
  try {
    const connected = await connectMongo();
    if (connected) {
      await ensureNotificationLogCollection();
      console.log("MongoDB connected for notification-service");
    }
  } catch (error) {
    console.warn(`MongoDB connection failed at startup: ${error.message}`);
  }

  try {
    await verifyConnection();
    console.log("SMTP connection established successfully");
  } catch (error) {
    console.warn(`SMTP verification failed at startup: ${error.message}`);
  }

  app.listen(env.port, env.host, () => {
    console.log(`Notification service listening on ${env.host}:${env.port}`);
  });
};

start().catch((error) => {
  console.error("Failed to start notification-service:", error.message);
  process.exit(1);
});
