const File = require('../models/File');
const AuditLog = require('../models/AuditLog');
const path = require('path');
const fs = require('fs');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024;

const scannerController = {
   uploadScannerFile: async (req, res, next) => {
     try {
       if (!req.file) {
         return res.status(400).json({ 
           success: false, 
           message: 'No file uploaded' 
         });
       }

        const { department, uploadedBy, alias, tags, machineId, confidentialityLevel } = req.body;
       const user = req.user;

       // Debug logging
       console.log('[SCANNER UPLOAD] Direct upload received:', {
         fileName: req.file.originalname,
         userId: user._id,
         machineId: machineId || 'unknown'
       });

      const fileType = path.extname(req.file.originalname).toLowerCase().replace('.', '');
      const isScannedDoc = ['pdf', 'jpg', 'jpeg', 'png', 'tiff', 'bmp'].includes(fileType);

      const file = await File.create({
        name: req.file.originalname,
        alias: alias || req.file.originalname,
        type: fileType,
        size: req.file.size,
        owner: user?._id || null,
        department: department || user?.department || 'unknown',
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        confidentialityLevel: confidentialityLevel || 'internal',
        isScanned: isScannedDoc,
        uploadSource: 'scanner',
        storagePath: req.file.filename
      });

      if (user) {
        await AuditLog.create({
          userId: user._id,
          userEmail: user.email,
          action: 'upload',
          resource: 'file',
          resourceId: file.fileId,
          details: { 
            fileName: file.name, 
            size: file.size, 
            department,
            uploadedBy: uploadedBy || req.body.uploadedBy,
            uploadSource: 'scanner'
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
      }

      const fileUrl = `${req.protocol}://${req.get('host')}/api/v1/files/${file.fileId}`;

      res.status(201).json({
        success: true,
        fileUrl,
        fileId: file.fileId,
        message: 'File uploaded successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  uploadScannerFileSimple: async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          message: 'No file uploaded' 
        });
      }

      const { department, uploadedBy, notes } = req.body;
      const fileType = path.extname(req.file.originalname).toLowerCase().replace('.', '');

      const file = await File.create({
        name: req.file.originalname,
        alias: req.file.originalname,
        type: fileType,
        size: req.file.size,
        owner: req.user?._id || null,
        department: department || req.body.department || 'unknown',
        tags: [],
        confidentialityLevel: req.body.confidentialityLevel || 'internal',
        isScanned: ['pdf', 'jpg', 'jpeg', 'png'].includes(fileType),
        uploadSource: 'scanner',
        storagePath: req.file.filename
      });

      const fileUrl = `${req.protocol}://${req.get('host')}/api/v1/files/${file.fileId}`;

      res.status(201).json({
        success: true,
        fileUrl,
        message: 'File uploaded successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  generateAgentConfig: async (req, res) => {
    try {
      const user = req.user;
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const config = {
        apiUrl: `${baseUrl}/api/v1/scanner/pending`,
        token: req.token,
        userId: user._id.toString(),
        userEmail: user.email,
        userName: user.name,
        machineId: `machine-${require('uuid').v4().replace(/-/g, '').toLowerCase()}`,
        configuredAt: new Date().toISOString()
      };

      res.json({
        success: true,
        data: config,
        downloadUrl: `${baseUrl}/api/v1/scanner/config-download`
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to generate config' });
    }
  }
};

module.exports = scannerController;