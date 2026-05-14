const db = require("../database/documentRepository.db");
const ObjectId = require("mongodb").ObjectId;
class Uploads {
  static async getUserfiles(userId) {
    const database = await db.getDb();
    return await database.collection("uploads").find({ user: userId }).toArray();
  }

  static async getUserFilesInOrder(userId) {
    const database = await db.getDb();
    return await database.collection("uploads").find({ user: userId }).sort({ _id: -1 }).toArray();
  }

  static async getRecentFiles(userId) {
    const database = await db.getDb();
    return await database.collection("uploads").find({ user: userId }).sort({ _id: -1 }).limit(10).toArray();
  }

  static async upload(fileData) {
    const database = await db.getDb();
    if (await database.collection("uploads").insertOne(fileData)) return true;
  }

  static async findFileById(id) {
    const database = await db.getDb();
    return await database.collection("uploads").findOne({ _id: new ObjectId(id) });
  }

  static async deleteFile(id) {
    const database = await db.getDb();
    await database.collection("uploads").deleteOne({ _id: new ObjectId(id) });
  }

  static async groupAllFiles(files) {
    return await files.reduce((acc, file) => {
      const date = new Date(file.date);
      const month = date.toLocaleString("default", {
        month: "long",
        year: "numeric",
      });
      const day = date.toLocaleString("default", {
        month: "long",
        day: "numeric",
      });

      if (!acc[month]) {
        acc[month] = {};
      }

      if (!acc[month][day]) {
        acc[month][day] = [];
      }

      acc[month][day].push(file);

      return acc;
    }, {});
  }
}

module.exports = Uploads;
