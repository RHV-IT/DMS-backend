const express = require('express');
const router = express.Router();
const multer = require('multer');
const pendingScanController = require('../controllers/pendingScanController');
const PendingScan = require('../models/PendingScan');
const auth = require('../middlewares/authMiddleware');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });


// Debug endpoint to list all pending scans (public - no auth required)
router.get('/pending-all', async (req, res) => {
  try {
    const scans = await PendingScan.find({ status: 'pending' })
      .populate('assignedTo', 'name email')
      .populate('confirmedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: scans,
      count: scans.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching pending scans',
      error: error.message
    });
  }
});

// Public endpoint to check pending scans count (no auth required)
router.get('/pending-public', async (req, res) => {
  try {
    const count = await PendingScan.countDocuments({ status: 'pending' });
    const scans = await PendingScan.find({ status: 'pending' })
      .select('id originalName machineId department createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      data: {
        count,
        recent: scans
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching pending scans count',
      error: error.message
    });
  }
});

// All routes below require authentication
router.use(auth);

/**
 * Pending Scan Routes
 * 
 * Endpoints:
 * 1. POST /pending - Upload file to pending
 * 2. GET /pending - List pending scans
 * 3. GET /pending/:id - Get single pending scan
 * 4. POST /confirm - Confirm pending scan
 * 5. POST /cancel - Cancel pending scan
 * 6. DELETE /pending/:id - Delete pending scan
 * 7. GET /pending/stats - Get stats
 */

// Upload to pending (supports file upload for production)
router.post('/pending', upload.single('file'), pendingScanController.uploadPending);

// List pending scans
router.get('/pending', pendingScanController.getPendingScans);

// Get single pending scan
router.get('/pending/:id', pendingScanController.getPendingScan);

// Confirm and finalize with format conversion
router.post('/confirm', pendingScanController.confirmPendingScan);

// Cancel pending scan
router.post('/cancel', pendingScanController.cancelPendingScan);

// Reject pending scan (permanent rejection)
router.patch('/pending/:id/reject', pendingScanController.rejectPendingScan);

// Admin: force delete pending scan
router.delete('/pending/:id', pendingScanController.deletePendingScan);

// Stats
router.get('/pending/stats', pendingScanController.getPendingStats);

module.exports = router;
