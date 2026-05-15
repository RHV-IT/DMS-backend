const File = require('../models/File');
const AuditLog = require('../models/AuditLog');
const path = require('path');
const fs = require('fs');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024;

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