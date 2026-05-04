const multer = require("multer");
const path = require("path");

const uploadDir = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), "uploads");

console.log('Using upload temp directory:', uploadDir);

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
