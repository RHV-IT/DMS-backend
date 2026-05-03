const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const auth = require('../middlewares/authMiddleware');

router.use(auth);

router.get('/stats', dashboardController.getStats);
router.get('/recent-files', dashboardController.getRecentFiles);
router.get('/recent-activity', dashboardController.getRecentActivity);

module.exports = router;