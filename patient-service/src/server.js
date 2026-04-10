const app = require("./app");
const env = require("./config/env");
const { connectDatabase } = require("./config/database");

const start = async () => {
  try {
    await connectDatabase();
    app.listen(env.port, () => {
      console.log(`Patient service running on port ${env.port}`);
    });
  } catch (error) {
    console.error("Failed to start patient service", error.message);
    process.exit(1);
  }
};

start();
