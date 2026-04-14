const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const permissionController = require('../controllers/permissionController');
const auth = require('../middlewares/authMiddleware');

router.use(auth);

router.get('/my', permissionController.getUserPermissions);

router.get('/file/:fileId', permissionController.getFilePermissions);

router.post(
  '/file/:fileId',
  [
    body('userId').notEmpty().withMessage('User ID is required'),
    body('access').isIn(['view', 'download', 'edit']).withMessage('Invalid access type')
  ],
  permissionController.grantPermission
);

router.post('/hod-override', permissionController.hodOverride);

router.post('/:permissionId/revoke', permissionController.revokePermission);

module.exports = router;