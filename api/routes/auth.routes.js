const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

router.get("/", authController.get);

router.get("/api/login", authController.getLogin);

router.post("/api/login", authController.login);

router.get("/api/logout", authController.getLogout);

router.get("/api/dashboard", authController.getDashboard);

router.get("/api/health", (req, res) =>
  res.status(200).json({ message: "server kept alive" }),
);

module.exports = router;
