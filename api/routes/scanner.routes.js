const express = require("express");
const router = express.Router();
const checkAuth = require("../middlewares/cheackAuth");

// GET /api/v1/scanner/pending
router.get("/pending", checkAuth, async (req, res) => {
  try {
    // Mock pending scans - replace with actual implementation
    const pendingScans = [];

    res.json({
      success: true,
      data: pendingScans
    });
  } catch (error) {
    console.error("Scanner pending error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending scans"
    });
  }
});

module.exports = router;