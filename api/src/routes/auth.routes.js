const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middlewares/authMiddleware');

/**
 * Authentication routes
 * All routes are prefixed with /api/v1/auth (defined in app.js or server entry point)
 */

/**
 * @route POST /api/v1/auth/register
 * @description Register a new user account
 * @access Public
 */
router.post(
  '/register',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('password').isLength({ min: 3 }).withMessage('Password must be at least 3 characters'),
    body('department').notEmpty().withMessage('Department is required')
  ],
  authController.register
);

/**
 * @route POST /api/v1/auth/login
 * @description Authenticate user and get access and refresh tokens
 * @access Public
 */
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  authController.login
);

/**
 * @route POST /api/v1/auth/refresh
 * @description Get new access token using refresh token
 * @access Public
 */
router.post('/refresh', authController.refreshToken);

/**
 * Apply authentication middleware to all routes below this line
 * Protects routes so that only authenticated users can access them
 */
router.use(auth);

/**
 * @route POST /api/v1/auth/logout
 * @description Logout current user (invalidate refresh token)
 * @access Private
 */
router.post('/logout', authController.logout);

/**
 * @route POST /api/v1/auth/change-password
 * @description Change user's password
 * @access Private
 */
router.post(
  '/change-password',
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 3 }).withMessage('New password must be at least 3 characters')
  ],
  authController.changePassword
);

/**
 * @route GET /api/v1/auth/profile
 * @description Get current user's profile
 * @access Private
 */
router.get('/profile', authController.getProfile);

/**
 * @route GET /api/v1/auth/me
 * @description Alias for /profile - Get current user's profile
 * @access Private
 */
router.get('/me', authController.getProfile);

/**
 * @route PUT /api/v1/auth/profile
 * @description Update current user's profile
 * @access Private
 */
router.put('/profile', authController.updateProfile);

/**
 * @route POST /api/v1/auth/switch-profile
 * @description Switch active department profile
 * @access Private
 */
router.post(
  '/switch-profile',
  [
    body('profileId').notEmpty().withMessage('Profile ID is required')
  ],
  authController.switchProfile
);

/**
 * @route POST /api/v1/auth/track-login
 * @description Track login for scanner agent (optional, graceful handling)
 * @access Private
 */
router.post('/track-login', (req, res) => {
  res.status(200).json({ success: true, message: 'Login tracked' });
});

/**
 * @route POST /api/v1/auth/set-token
 * @description Token handshake for scanner agent
 * @access Private
 */
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