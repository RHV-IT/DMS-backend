const express = require("express");
const router = express.Router();
const checkAuth = require("../middlewares/cheackAuth");

// GET /api/v1/notifications
router.get("/", checkAuth, async (req, res) => {
  try {
    // Mock notifications - replace with actual implementation
    const notifications = [];

    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error("Notifications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications"
    });
  }
});

module.exports = router;