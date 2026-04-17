const mongoose = require("mongoose");
const env = require("./env");

const connectDB = async () => {
  try {
    await mongoose.connect(env.mongoUri, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 10000
    });
    console.log("MongoDB connected for payment-service");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
