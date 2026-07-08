const express = require('express');
const router = express.Router();
const systemController = require('../controllers/systemController');
const auth = require('../middlewares/authMiddleware');
const { roleMiddleware } = require('../middlewares/roleMiddleware');

router.get('/email-health', auth, roleMiddleware('admin'), systemController.getEmailHealth);

module.exports = router;
