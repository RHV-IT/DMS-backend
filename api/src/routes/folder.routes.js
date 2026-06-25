const express = require('express');
const router = express.Router();
const folderController = require('../controllers/folderController');
const auth = require('../middlewares/authMiddleware');

router.use(auth);

router.post('/', folderController.createFolder);

router.get('/', folderController.getFolders);

router.get('/tree', folderController.getFolderTree);

router.get('/deleted', folderController.getDeletedFolders);

router.post('/move-file', folderController.moveFile);

router.post('/bulk-move-files', folderController.bulkMoveFiles);

router.post('/copy-file', folderController.copyFile);

router.post('/move-folder', folderController.moveFolder);

router.post('/copy-folder', folderController.copyFolder);

router.post('/bulk-delete-folders', folderController.bulkDeleteFolders);

router.post('/bulk-delete-files', folderController.bulkDeleteFiles);

router.get('/:folderId', folderController.getFolder);

router.get('/:folderId/stats', folderController.getFolderStats);

router.put('/:folderId', folderController.updateFolder);

router.delete('/:folderId', folderController.deleteFolder);

router.post('/:folderId/restore', folderController.restoreFolder);

module.exports = router;
