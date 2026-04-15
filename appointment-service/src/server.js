const app = require("./app");
const env = require("./config/env");
const { connectDatabase } = require("./config/database");

const start = async () => {
  try {
    await connectDatabase();
    app.listen(env.port, "0.0.0.0", () => {
      console.log(`Appointment service running on port ${env.port}`);
    });
  } catch (error) {
    console.error("Failed to start appointment service", error.message);
    process.exit(1);
  }
};

start();
