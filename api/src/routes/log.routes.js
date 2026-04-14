const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const auth = require('../middlewares/authMiddleware');
const { roleMiddleware } = require('../middlewares/roleMiddleware');

router.use(auth);

router.get('/', roleMiddleware('admin', 'hod'), auditLogController.getLogs);

router.get('/my', auditLogController.getUserLogs);

router.get('/export', roleMiddleware('admin'), auditLogController.exportLogs);

router.get('/stats', roleMiddleware('admin'), auditLogController.getLogStats);

module.exports = router;