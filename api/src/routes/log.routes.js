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

router.get('/actions', roleMiddleware('admin', 'hod'), auditLogController.getActions);

router.get('/ip/:ip', roleMiddleware('admin'), auditLogController.getLogsByIp);

router.get('/device/:deviceId', roleMiddleware('admin'), auditLogController.getLogsByDevice);

module.exports = router;