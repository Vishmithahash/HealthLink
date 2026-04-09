const mongoose = require("mongoose");
const env = require("./env");

const connectDatabase = async () => {
  await mongoose.connect(env.mongoUri, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10000
  });
};

module.exports = { connectDatabase };
