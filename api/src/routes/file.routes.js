const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const auth = require('../middlewares/authMiddleware');
const { handleUpload, handleBulkUpload, handleScannedUpload, handleScannedBulkUpload } = require('../middlewares/uploadMiddleware');

router.use(auth);

router.get('/', fileController.getAllFiles);

router.get('/deleted', fileController.getDeletedFiles);

router.post('/clean-expired', fileController.cleanExpiredFiles);

router.post('/', handleUpload, fileController.uploadFile);

router.post('/bulk', handleBulkUpload, fileController.uploadBulk);

router.post('/scan', handleScannedUpload, fileController.uploadScannedFile);

router.post('/scan/bulk', handleScannedBulkUpload, fileController.uploadScannedBulk);

router.get('/:fileId', fileController.getFile);

router.get('/:fileId/download', fileController.downloadFile);

router.get('/:fileId/preview', fileController.previewFile);

router.put('/:fileId', handleUpload, fileController.updateFile);

router.delete('/:fileId', fileController.deleteFile);

router.post('/:fileId/permanent-delete', fileController.permanentDeleteFile);

router.post('/:fileId/restore', fileController.restoreFile);

router.get('/:fileId/versions', fileController.getVersionHistory);

router.post('/:fileId/rollback', fileController.rollbackVersion);

router.get('/types/supported', (req, res) => {
  res.json({
    success: true,
    data: {
      scanned: ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/bmp'],
      documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain', 'application/zip', 'application/x-rar-compressed'],
      images: ['image/jpeg', 'image/png', 'image/gif', 'image/tiff', 'image/bmp']
    }
  });
});

module.exports = router;