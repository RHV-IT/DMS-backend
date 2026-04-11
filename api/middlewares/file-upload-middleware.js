const multer = require("multer");
const upload = multer({
  storage: multer.diskStorage({
    destination: "uploads",
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
