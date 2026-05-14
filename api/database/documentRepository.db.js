const mongodb = require("mongodb");
const MongoClient = mongodb.MongoClient;
require("dotenv").config();
let database;
let isConnecting = false;

const connect = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is missing');
  }
  const client = await MongoClient.connect(mongoUri);
  database = client.db("dms");
  return database;
};

const ensureConnected = async () => {
  if (database) {
    return database;
  }
  if (isConnecting) {
    // Wait for ongoing connection
    while (isConnecting && !database) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (database) return database;
  }

  isConnecting = true;
  try {
    await connect();
    isConnecting = false;
    return database;
  } catch (error) {
    isConnecting = false;
    throw error;
  }
};

const getDb = async () => {
  if (!database) {
    await ensureConnected();
  }
  return database;
};

module.exports = {
  connect,
  ensureConnected,
  getDb,
};
