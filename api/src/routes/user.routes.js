const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middlewares/authMiddleware');
const { roleMiddleware } = require('../middlewares/roleMiddleware');

router.use(auth);

// Admin only routes
router.get('/', roleMiddleware('admin', 'hod'), userController.getAllUsers);
router.get('/:id', roleMiddleware('admin', 'hod'), userController.getUserById);

router.post(
  '/',
  roleMiddleware('admin'),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 3 }).withMessage('Password must be at least 3 characters'),
    body('department').notEmpty().withMessage('Department is required'),
    body('role').custom((value) => ['admin', 'hod', 'user'].includes(String(value || '').trim().toLowerCase())).withMessage('Role is required (admin, hod, or user)')
  ],
  userController.createUser
);

router.put('/:id', roleMiddleware('admin', 'hod'), userController.updateUser);

router.post('/:id/reset', roleMiddleware('admin'), userController.resetPassword);
router.post('/:id/suspend', roleMiddleware('admin'), userController.suspendUser);
router.post('/:id/restore', roleMiddleware('admin'), userController.restoreUser);
router.post('/:id/delete', roleMiddleware('admin'), userController.deleteUser);
router.post('/:id/activate', roleMiddleware('admin'), userController.activateUser);

// Profile management routes (admin only)
router.post('/:id/profiles', roleMiddleware('admin'), [
  body('department').notEmpty().withMessage('Department is required'),
  body('confidentialityLevels').isArray().optional().withMessage('confidentialityLevels must be an array')
], userController.addProfile);

router.put('/:id/profiles/:profileId', roleMiddleware('admin'), [
  body('confidentialityLevels').isArray().optional().withMessage('confidentialityLevels must be an array'),
  body('isPrimary').isBoolean().optional().withMessage('isPrimary must be a boolean'),
  body('status').isIn(['active', 'inactive']).optional().withMessage('status must be either active or inactive')
], userController.updateProfile);

router.delete('/:id/profiles/:profileId', roleMiddleware('admin'), userController.removeProfile);

router.post('/:id/profiles/:profileId/set-primary', roleMiddleware('admin'), userController.setPrimaryProfile);

// HOD request endpoints
router.post('/:id/request-suspend', roleMiddleware('hod'), userController.requestSuspend);
router.post('/:id/request-edit', roleMiddleware('hod'), userController.requestEdit);
router.post('/:id/request-password-reset', roleMiddleware('hod'), userController.requestPasswordReset);

module.exports = router;