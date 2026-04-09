const app = require("./app");
const env = require("./config/env");
const { connectDatabase } = require("./config/database");

const startServer = async () => {
  try {
    await connectDatabase();

    app.listen(env.port, () => {
      console.log(`Auth service is running on port ${env.port}`);
    });
  } catch (error) {
    console.error("Failed to start auth service", error.message);
    process.exit(1);
  }
};

startServer();
