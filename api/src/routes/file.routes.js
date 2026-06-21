const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const auth = require('../middlewares/authMiddleware');
const { handleUpload, handleBulkUpload, handleScannedUpload, handleScannedBulkUpload } = require('../middlewares/uploadMiddleware');
const { FILE_CATEGORIES, FILE_TYPE_GROUPS, FILE_EXTENSION_GROUPS } = require('../constants');

router.use(auth);

router.get('/', fileController.getAllFiles);

router.get('/archive', fileController.getArchiveFiles);

router.get('/deleted', fileController.getDeletedFiles);

router.post('/clean-expired', fileController.cleanExpiredFiles);

router.post('/', handleUpload, fileController.uploadFile);

router.post('/bulk', handleBulkUpload, fileController.uploadBulk);

router.post('/scan', handleScannedUpload, fileController.uploadScannedFile);

router.post('/scan/bulk', handleScannedBulkUpload, fileController.uploadScannedBulk);

router.get('/:fileId', fileController.getFile);

router.get('/:fileId/download', fileController.downloadFile);

router.get('/:fileId/preview', fileController.previewFile);

// Google Docs viewer wrapper (like WhatsApp Web)
router.get('/:fileId/preview/google', fileController.previewFileWithGoogleDocs);

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
      categories: Object.values(FILE_CATEGORIES),
      filters: {
        image: {
          mimeTypes: FILE_TYPE_GROUPS.image,
          extensions: FILE_EXTENSION_GROUPS.image
        },
        zip: {
          mimeTypes: FILE_TYPE_GROUPS.zip,
          extensions: FILE_EXTENSION_GROUPS.zip
        },
        spreadsheet: {
          mimeTypes: FILE_TYPE_GROUPS.spreadsheet,
          extensions: FILE_EXTENSION_GROUPS.spreadsheet
        },
        presentation: {
          mimeTypes: FILE_TYPE_GROUPS.presentation,
          extensions: FILE_EXTENSION_GROUPS.presentation
        },
        pdf: {
          mimeTypes: FILE_TYPE_GROUPS.pdf,
          extensions: FILE_EXTENSION_GROUPS.pdf
        },
        document: {
          mimeTypes: FILE_TYPE_GROUPS.document,
          extensions: FILE_EXTENSION_GROUPS.document
        }
      },
      scanned: ['application/pdf', ...FILE_TYPE_GROUPS.image],
      documents: [
        ...FILE_TYPE_GROUPS.pdf,
        ...FILE_TYPE_GROUPS.document,
        ...FILE_TYPE_GROUPS.spreadsheet,
        ...FILE_TYPE_GROUPS.presentation,
        ...FILE_TYPE_GROUPS.zip
      ],
      images: FILE_TYPE_GROUPS.image
    }
  });
});

module.exports = router;