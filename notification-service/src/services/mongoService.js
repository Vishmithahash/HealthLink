const mongoose = require("mongoose");
const env = require("../config/env");

const connectMongo = async () => {
  if (!env.mongoUri) {
    return false;
  }

  if (mongoose.connection.readyState === 1) {
    return true;
  }

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10000
  });

  return true;
};

const ensureNotificationLogCollection = async () => {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  const collectionName = "notificationlogs";
  const existing = await mongoose.connection.db
    .listCollections({ name: collectionName })
    .toArray();

  if (existing.length === 0) {
    await mongoose.connection.db.createCollection(collectionName);
  }
};

module.exports = {
  connectMongo,
  ensureNotificationLogCollection
};
