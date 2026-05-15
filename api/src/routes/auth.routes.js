const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middlewares/authMiddleware');

router.post(
  '/register',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 3 }).withMessage('Password must be at least 3 characters'),
    body('department').notEmpty().withMessage('Department is required')
  ],
  authController.register
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  authController.login
);

router.post('/refresh', authController.refreshToken);

router.use(auth);

router.post('/logout', authController.logout);

router.post(
  '/change-password',
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 3 }).withMessage('New password must be at least 3 characters')
  ],
  authController.changePassword
);

router.get('/profile', authController.getProfile);

router.get('/me', authController.getProfile);

router.put('/profile', authController.updateProfile);

// Track login for scanner agent (optional, graceful handling)
router.post('/track-login', (req, res) => {
  res.status(200).json({ success: true, message: 'Login tracked' });
});

// Token handshake for scanner agent
router.post('/set-token', auth, async (req, res) => {
  try {
    // This endpoint is called by the frontend to send token to local agent
    // In a real implementation, this would communicate with the local agent
    // For now, we'll just acknowledge receipt
    const { token } = req.body;
    const user = req.user;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required',
        mustDownloadAgent: true
      });
    }

    // In a production system, you would:
    // 1. Validate the token format
    // 2. Send it to the local agent via WebSocket or local network call
    // 3. Wait for agent confirmation

    // For now, just log and acknowledge
    console.log(`[TOKEN HANDSHAKE] Token set for user ${user.email}`);

    res.json({
      success: true,
      message: 'Token sent to agent successfully'
    });
  } catch (error) {
    console.error('Error in set-token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set token',
      mustDownloadAgent: true
    });
  }
});

module.exports = router;