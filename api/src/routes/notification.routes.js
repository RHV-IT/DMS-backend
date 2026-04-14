const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const auth = require('../middlewares/authMiddleware');

router.use(auth);

router.get('/', notificationController.getNotifications);

router.post('/read-all', notificationController.markAllAsRead);

router.post('/:notificationId/read', notificationController.markAsRead);

router.delete('/:notificationId', notificationController.deleteNotification);

module.exports = router;