const Upload = require("../models/uploads.model");
const path = require("path");
const fs = require("fs");
const uploadFile = async (req, res) => {
  const sizeKB = (req.file.size / 1024).toFixed(2);
  const sizeMB = (req.file.size / (1024 * 1024)).toFixed(2);
  const fileData = {
    user: req.user.id,
    name: req.file.originalname,
    type: req.file.mimetype,
    path: req.file.path,
    sizeKB,
    sizeMB,
    date: new Date(),
  };
  const uploaded = await Upload.upload(fileData);
  if (uploaded) {
    res.status(200).json({ message: "File uploaded successfully" });
  } else {
    res.status(400).json({ error: "Failed to upload file to database" });
  }
};

const downloadFile = async (req, res) => {
  const { id } = req.params;
  const file = await Upload.findFileById(id);
  if (file.user.toString() !== req.user.id.toString()) {
    res.status(403).json({ error: "not authorized" });
    return;
  }
  const filePath = path.join(__dirname, "..", file.path.toString());
  res.sendFile(filePath);
};

const viewFile = async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "not authenticated" });
    return;
  }
  const { id } = req.params;
  const file = await Upload.findFileById(id);
  if (file.user.toString() !== req.user.id.toString()) {
    res.status(403).json({ error: "not authorized" });
    return;
  }
  const filePath = path.join(__dirname, "..", file.path.toString());
  res.sendFile(filePath);
};

const deleteFile = async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "not authenticated" });
    return;
  }
  const { id } = req.params;
  const file = await Upload.findFileById(id);
  if (file.user.toString() !== req.user.id.toString()) {
    res.status(403).json({ error: "not authorized" });
    return;
  }
  const filePath = path.join(__dirname, "..", file.path.toString());
  await Upload.deleteFile(id);
  fs.unlink(filePath, (err) => {
    if (err) {
      console.log("error deleting file err:", err);
    }
  });
  res.status(200).json({ message: "File deleted successfully" });
};

const getArchive = async (req, res) => {
  if (!req.user) {
    res.redirect("/login");
    return;
  }
  const files = await Upload.getUserFilesInOrder(req.user.id);
  const groupedFiles = await Upload.groupAllFiles(files);
  res.status(200).json({ user: req.user.name, files: groupedFiles });
};

const getFiles = async (req, res) => {
  const files = await Upload.getRecentFiles(req.user.id);
  res.status(200).json({ user: req.user.name, files });
};

module.exports = {
  uploadFile,
  downloadFile,
  viewFile,
  deleteFile,
  getArchive,
  getFiles,
};
