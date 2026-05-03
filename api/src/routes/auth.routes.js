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

module.exports = router;