const mongodb = require("mongodb");
const MongoClient = mongodb.MongoClient;
require("dotenv").config();
let database;

const connect = async () => {
  const client = await MongoClient.connect(process.env.uri);
  database = client.db(process.env.dbName);
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
