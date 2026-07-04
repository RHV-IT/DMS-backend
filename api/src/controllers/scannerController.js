const File = require('../models/File');
const AuditLog = require('../models/AuditLog');
const path = require('path');
const fs = require('fs');
const { canUploadLevel } = require('../utils/accessControl');
const { FILE_CATEGORIES, FILE_EXTENSION_GROUPS, FILE_TYPE_GROUPS } = require('../constants');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024;

const getFileCategory = (originalName, mimeType) => {
  const extension = path.extname(originalName || '').toLowerCase().replace('.', '');
  const normalizedMime = String(mimeType || '').split(';')[0].trim().toLowerCase();

  const byExtension = Object.keys(FILE_EXTENSION_GROUPS).find(category =>
    FILE_EXTENSION_GROUPS[category].includes(extension)
  );
  if (byExtension) return byExtension;

  return Object.keys(FILE_TYPE_GROUPS).find(category =>
    FILE_TYPE_GROUPS[category].includes(normalizedMime)
  ) || FILE_CATEGORIES.OTHER;
};

const scannerController = {
   // GET /api/v1/scanner/health
   getAgentHealth: async (req, res) => {
     try {
       const { userId } = req.query;

       if (!userId) {
         return res.status(400).json({
           success: false,
           message: 'User ID is required'
         });
       }

       const Agent = require('../models/Agent');
       // Find user's agent information
       const agent = await Agent.findOne({ userId }).sort({ lastActive: -1 });

       if (!agent) {
        return res.json({
          success: true,
          message: 'No agent found for user',
          data: {
            connected: false,
            machineName: null,
            lastSeen: null
          }
        });
       }

       // Check if agent is still considered connected (within last 5 minutes)
       const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
       const isConnected = agent.lastActive > fiveMinutesAgo && agent.onlineStatus === 'online';

        res.json({
          success: true,
          message: 'Agent health retrieved successfully',
          data: {
            connected: isConnected,
            machineName: agent.machineName,
            lastSeen: agent.lastActive?.toISOString() || null
          }
        });
     } catch (error) {
       console.error('Error in getAgentHealth:', error);
       res.status(500).json({
         success: false,
         message: 'Failed to get agent health'
       });
     }
   },

   // POST /api/v1/scanner/heartbeat
   heartbeat: async (req, res) => {
     try {
       const { machineId, machineName, agentVersion } = req.body;
       const Agent = require('../models/Agent');

       if (!machineId) {
         return res.status(400).json({
           success: false,
           message: 'Machine ID is required'
         });
       }

       // Find and update agent heartbeat
       const agent = await Agent.findOne({ machineId });

       if (!agent) {
         return res.status(404).json({
           success: false,
           message: 'Agent not found. Please register the agent first.'
         });
       }

       // Update heartbeat information
       agent.lastActive = new Date();
       agent.onlineStatus = 'online';

       if (machineName) agent.machineName = machineName;
       if (agentVersion) agent.agentVersion = agentVersion;

       await agent.save();

       // Also update user agent connection status
       if (agent.userId) {
         const User = require('../models/User');
         await User.findByIdAndUpdate(agent.userId, {
           lastAgentHeartbeat: new Date(),
           machineName: agent.machineName,
           agentVersion: agent.agentVersion,
           agentConnected: true
         });
       }

       res.json({
         success: true,
         message: 'Heartbeat received',
         data: {
           timestamp: agent.lastActive.toISOString(),
           machineName: agent.machineName,
           agentVersion: agent.agentVersion
         }
       });
     } catch (error) {
       console.error('Error in heartbeat:', error);
       res.status(500).json({
         success: false,
         message: 'Failed to process heartbeat'
       });
     }
   },

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

        let fileLevel = confidentialityLevel || 'internal';
        const norm = String(fileLevel).toLowerCase().trim();
        if (norm.includes('high')) fileLevel = 'highly_confidential';
        else if (norm.includes('conf')) fileLevel = 'confidential';
        else if (norm.includes('int')) fileLevel = 'internal';
        else fileLevel = 'public';

        if (user && !canUploadLevel(user, fileLevel)) {
          try {
            await AuditLog.create({
              userId: user._id, userEmail: user.email, action: 'restricted_access_attempt',
              resource: 'file', details: { action: 'scanner_upload_denied', attemptedLevel: fileLevel },
              ipAddress: req.ip
            });
          } catch (auditError) {
            console.error('Failed to write audit log for scanner_upload_denied:', auditError.message);
          }
          return res.status(403).json({ success: false, message: 'You are not authorized to upload files with this confidentiality level.' });
        }

        // Ensure blob storage, no local windows paths
        let storageLocation = req.file.filename;
        try {
          const { put } = require('@vercel/blob');
          const localP = req.file.path || req.file.filename;
          const buf = fs.readFileSync(localP);
          const safe = req.file.originalname.replace(/[^a-z0-9.-]/gi, '_');
          const blob = await put(`files/scanner-direct/${Date.now()}-${safe}`, buf, {
            access: 'public',
            contentType: req.file.mimetype || 'application/octet-stream'
          });
          storageLocation = blob.url;
          try { fs.unlinkSync(localP); } catch {}
        } catch (e) { console.warn('scanner direct blob fail:', e.message); }

         const file = await File.create({
           name: req.file.originalname,
           originalFileName: req.file.originalname,
           alias: alias || req.file.originalname,
           type: fileType,
           fileCategory: getFileCategory(req.file.originalname, req.file.mimetype),
           size: req.file.size,
          owner: user?._id || null,
          uploadedBy: user?._id || null,
          department: department || user?.department || 'unknown',
          uploadedByDepartment: user?.department || department || 'unknown',
          uploadedByConfidentiality: user ? (user.getConfidentialityLevel()) : null,
          tags: tags ? tags.split(',').map(t => t.trim()) : [],
          confidentialityLevel: fileLevel,
          mimeType: req.file.mimetype || 'application/octet-stream',
          isScanned: isScannedDoc,
          uploadSource: 'scanner',
          storagePath: storageLocation
        });


      if (user) {
        try {
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
        } catch (auditError) {
          console.error('Failed to write audit log for upload (scanner):', auditError.message);
        }
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

      // blob storage
      let storageLocation = req.file.filename;
      try {
        const { put } = require('@vercel/blob');
        const localP = req.file.path || req.file.filename;
        const buf = fs.readFileSync(localP);
        const safe = req.file.originalname.replace(/[^a-z0-9.-]/gi, '_');
        const blob = await put(`files/scanner-simple/${Date.now()}-${safe}`, buf, {
          access: 'public',
          contentType: req.file.mimetype || 'application/octet-stream'
        });
        storageLocation = blob.url;
        try { fs.unlinkSync(localP); } catch {}
      } catch (e) { console.warn('scanner simple blob fail:', e.message); }

      let fileLevel = req.body.confidentialityLevel || 'internal';
      const norm = String(fileLevel).toLowerCase().trim();
      if (norm.includes('high')) fileLevel = 'highly_confidential';
      else if (norm.includes('conf')) fileLevel = 'confidential';
      else if (norm.includes('int')) fileLevel = 'internal';
      else fileLevel = 'public';

      if (req.user && !canUploadLevel(req.user, fileLevel)) {
        try {
          await AuditLog.create({
            userId: req.user._id, userEmail: req.user.email, action: 'restricted_access_attempt',
            resource: 'file', details: { action: 'scanner_simple_denied', attemptedLevel: fileLevel },
            ipAddress: req.ip
          });
        } catch (auditError) {
          console.error('Failed to write audit log for scanner_simple_denied:', auditError.message);
        }
        return res.status(403).json({ success: false, message: 'You are not authorized to upload files with this confidentiality level.' });
      }

      const file = await File.create({
        name: req.file.originalname,
        originalFileName: req.file.originalname,
        alias: req.file.originalname,
        type: fileType,
        fileCategory: getFileCategory(req.file.originalname, req.file.mimetype),
        size: req.file.size,
        owner: req.user?._id || null,
        uploadedBy: req.user?._id || null,
        department: department || req.body.department || 'unknown',
        uploadedByDepartment: req.user?.department || department || 'unknown',
        uploadedByConfidentiality: req.user ? (req.user.getConfidentialityLevel()) : null,
        tags: [],
        confidentialityLevel: fileLevel,
        mimeType: req.file.mimetype || 'application/octet-stream',
        isScanned: ['pdf', 'jpg', 'jpeg', 'png'].includes(fileType),
        uploadSource: 'scanner',
        storagePath: storageLocation
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

  // POST /api/v1/scanner/notify - Notify backend of new file with metadata only
  notifyNewFile: async (req, res) => {
    try {
      const { fileName, checksum, machineName, machineId } = req.body;
      const user = req.user;

      if (!fileName || !checksum || !machineName) {
        return res.status(400).json({
          success: false,
          message: 'fileName, checksum, and machineName are required'
        });
      }

      // TODO: Implement duplicate detection logic based on checksum
      // For now, always respond with keepFile: true (safe default)
      // In production, check against existing files, user preferences, etc.

      console.log(`[SCANNER NOTIFY] New file detected: ${fileName} on ${machineName} (checksum: ${checksum})`);

      // Log the notification
      try {
        await AuditLog.create({
          userId: user._id,
          userEmail: user.email,
          action: 'scanner_notify',
          resource: 'file',
          resourceId: null,
          details: {
            fileName,
            checksum,
            machineName,
            machineId,
            action: 'file_detected'
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
      } catch (auditError) {
        console.error('Failed to write audit log for scanner_notify:', auditError.message);
      }

      // For beginner-safe behavior, always keep files initially
      // TODO: Add logic to reject based on:
      // - Duplicate checksums
      // - File type restrictions
      // - User preferences
      // - Security policies

      res.json({
        success: true,
        keepFile: true,
        message: 'File notification received. Keep file locally.'
      });
    } catch (error) {
      console.error('Error in notifyNewFile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process file notification'
      });
    }
  },

  generateAgentConfig: async (req, res) => {
    try {
      const user = req.user;
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const config = {
        apiUrl: `${baseUrl}/api/v1/scanner/notify`,
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