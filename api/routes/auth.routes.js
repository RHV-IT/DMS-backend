const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const checkAuth = require("../middlewares/cheackAuth");

router.get("/", authController.get);

router.get("/login", authController.getLogin);

router.post("/login", authController.login);

router.post("/refresh", authController.refreshToken);

router.post("/logout", authController.logout);

router.get("/dashboard", authController.getDashboard);

router.get("/health", (req, res) =>
  res.status(200).json({ message: "server kept alive" }),
);

router.get("/me", checkAuth, authController.getMe);

module.exports = router;
