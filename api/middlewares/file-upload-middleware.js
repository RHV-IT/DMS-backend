const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(process.cwd(), process.env.VERCEL ? 'tmp' : '', "uploads");

try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  console.error('Upload directory creation failed:', err.message);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

const configuredMulterMiddleware = upload.single("file");

module.exports = configuredMulterMiddleware;
