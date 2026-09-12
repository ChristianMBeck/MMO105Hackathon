const mongoose = require("mongoose");

async function connectDb(uri = process.env.MONGO_URI) {
  const mongoUri = uri || "mongodb://127.0.0.1:27017/travelog";
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri);
  return { uri: mongoUri, connection: mongoose.connection };
}

async function disconnectDb() {
  await mongoose.disconnect();
}

module.exports = { connectDb, disconnectDb };
