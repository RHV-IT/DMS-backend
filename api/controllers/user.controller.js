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

const previewFile = async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "not authenticated" });
    return;
  }
  const { fileId } = req.params;
  const file = await Upload.findFileById(fileId);
  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  if (file.user.toString() !== req.user.id.toString()) {
    res.status(403).json({ error: "not authorized" });
    return;
  }
  const filePath = path.join(__dirname, "..", file.path.toString());
  const fileExt = path.extname(file.name).toLowerCase();
  
  const imageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
  const pdfType = '.pdf';
  
  let contentType;
  if (imageTypes.includes(fileExt)) {
    contentType = `image/${fileExt.slice(1)}`;
    if (fileExt === '.svg') contentType = 'image/svg+xml';
    if (fileExt === '.jpg') contentType = 'image/jpeg';
    if (fileExt === '.jpeg') contentType = 'image/jpeg';
    if (fileExt === '.png') contentType = 'image/png';
    if (fileExt === '.gif') contentType = 'image/gif';
    if (fileExt === '.webp') contentType = 'image/webp';
    if (fileExt === '.bmp') contentType = 'image/bmp';
  } else if (pdfType === fileExt) {
    contentType = 'application/pdf';
  } else {
    contentType = 'application/octet-stream';
  }

  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${file.name}"`,
      'Cache-Control': 'public, max-age=3600'
    };
    res.writeHead(206, head);
    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
    stream.on('error', (err) => {
      console.error('[PREVIEW] Stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file' });
      } else {
        res.end();
      }
    });
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${file.name}"`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600'
    };
    res.writeHead(200, head);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', (err) => {
      console.error('[PREVIEW] Stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file' });
      } else {
        res.end();
      }
    });
  }
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
  previewFile,
  deleteFile,
  getArchive,
  getFiles,
};
