const express = require('express');
const router = express.Router();
const pendingScanController = require('../controllers/pendingScanController');
const auth = require('../middlewares/authMiddleware');
const { handleScannedUpload } = require('../middlewares/uploadMiddleware');

// All routes require authentication
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

// Upload to pending
router.post('/pending', handleScannedUpload, pendingScanController.uploadPending);

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

// Serve permanent pending files
router.get('/pending-file/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(PENDING_UPLOAD_PATH, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Pending file not found' });
  }

  // Set appropriate headers and stream the file
  const stat = fs.statSync(filePath);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

// Debug endpoint to list all pending scans (bypass filter)
router.get('/pending-all', async (req, res) => {

  const scans = await PendingScan.find({ status: 'pending' })
    .populate('assignedTo', 'name email')
    .populate('confirmedBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({
    success: true,
    data: scans
  });
});

module.exports = router;
