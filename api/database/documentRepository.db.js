const mongodb = require("mongodb");
const MongoClient = mongodb.MongoClient;
require("dotenv").config();
let database;

const connect = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is missing');
  }
  const client = await MongoClient.connect(mongoUri);
  database = client.db("dms");
};

const getDb = () => {
  if (!database) {
    throw new Error("Database not connected");
  }
  return database;
};

module.exports = {
  connect,
  getDb,
};
