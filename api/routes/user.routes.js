const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const fileUploadMiddleware = require("../middlewares/file-upload-middleware");

router.post("/api/upload", fileUploadMiddleware, userController.uploadFile);

router.get("/api/download/:id", userController.downloadFile);

router.get("/api/view/:id", userController.viewFile);

router.get("/api/delete/:id", userController.deleteFile);

router.get("/api/archive", userController.getArchive);

router.get("/api/files", userController.getFiles);

module.exports = router;
