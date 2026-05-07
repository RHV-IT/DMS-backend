const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');

// Public endpoints (no auth required)
router.get('/version', agentController.getVersion);
router.post('/register', agentController.registerAgent);

module.exports = router;