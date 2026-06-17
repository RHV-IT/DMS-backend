const File = require('../models/File');
const FileVersion = require('../models/FileVersion');
const Permission = require('../models/Permission');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { canViewFile, canUploadLevel, buildFileAccessQuery, canUserAccessFile, canUserAccessFileContents, canUserManageFile, filterAccessibleFiles } = require('../utils/accessControl');
const path = require('path');
const fs = require('fs');
const os = require('os');

const UPLOAD_PATH = process.env.UPLOAD_PATH || (process.env.VERCEL ? '/tmp' : path.join(os.tmpdir(), 'uploads'));

// Confidentiality level hierarchy (higher index = higher level)
const CONFIDENTIALITY_LEVELS = ['public', 'internal', 'confidential', 'highly_confidential'];

const getLevelIndex = (level) => CONFIDENTIALITY_LEVELS.indexOf(level);

const fileController = {
  uploadFile: async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const { alias, tags, confidentialityLevel } = req.body;
      const user = req.user;

      let fileLevel = confidentialityLevel || 'internal';
      // normalize
      const normalized = String(fileLevel).toLowerCase().trim();
      if (normalized.includes('high')) fileLevel = 'highly_confidential';
      else if (normalized.includes('conf')) fileLevel = 'confidential';
      else if (normalized.includes('int')) fileLevel = 'internal';
      else fileLevel = 'public';

      if (!canUploadLevel(user, fileLevel)) {
        // Audit denied upload attempt
        await AuditLog.create({
          userId: user._id,
          userEmail: user.email,
          action: 'restricted_access_attempt',
          resource: 'file',
          details: {
            action: 'upload_denied',
            attemptedLevel: fileLevel,
            userLevel: user.getConfidentialityLevel(),
            department: user.department
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to upload files with this confidentiality level.'
        });
      }

      // Upload to blob to eliminate local path dependency
      let storageLocation = req.file.filename;
      try {
        const { put } = require('@vercel/blob');
        const localPath = req.file.path || path.join(UPLOAD_PATH, req.file.filename);
        const buffer = fs.readFileSync(localPath);
        const safeName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const blob = await put(`files/${Date.now()}-${safeName}`, buffer, {
          access: 'public',
          contentType: req.file.mimetype || 'application/octet-stream'
        });
        storageLocation = blob.url;
        try { if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath); } catch {}
      } catch (e) {
        console.warn('[UPLOAD] Blob upload failed, local fallback:', e.message);
      }

      const file = await File.create({
        name: req.file.originalname,
        originalFileName: req.file.originalname,
        alias: alias || req.file.originalname,
        type: path.extname(req.file.originalname).toLowerCase().replace('.', ''),
        size: req.file.size,
        owner: user._id,
        uploadedBy: user._id,
        department: user.department,
        uploadedByDepartment: user.department,
        uploadedByConfidentiality: user.getConfidentialityLevel(),
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        confidentialityLevel: fileLevel,
        mimeType: req.file.mimetype || 'application/octet-stream',
        isScanned: false,
        storagePath: storageLocation
      });

      await FileVersion.create({
        fileId: file._id,
        versionNumber: 1,
        filePath: storageLocation,
        size: req.file.size,
        uploadedBy: user._id
      });

      await AuditLog.create({
        userId: user._id,
        userEmail: user.email,
        action: 'upload',
        resource: 'file',
        resourceId: file.fileId,
        details: { fileName: file.name, size: file.size },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.status(201).json({
        success: true,
        data: file
      });
    } catch (error) {
      next(error);
    }
  },


  uploadBulk: async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'No files uploaded' });
      }

      const user = req.user;

      // Support per-file metadata[] (JSON strings) mapped by index to files[]
      // Also fallback to single confidentialityLevel for all if no metadata
      let metadataArray = [];
      if (req.body.metadata) {
        const rawMeta = Array.isArray(req.body.metadata) ? req.body.metadata : [req.body.metadata];
        metadataArray = rawMeta.map(m => {
          if (typeof m === 'string') {
            try { return JSON.parse(m); } catch { return {}; }
          }
          return m || {};
        });
      }
      const globalLevel = req.body.confidentialityLevel || 'internal';

      const files = [];
      const errors = [];

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const meta = metadataArray[i] || {};
        const alias = meta.alias || file.originalname;
        let fileLevel = meta.confidentialityLevel || globalLevel || 'internal';

        // Normalize level to enum values
        const normalized = String(fileLevel).toLowerCase().trim();
        if (normalized.includes('high')) fileLevel = 'highly_confidential';
        else if (normalized.includes('conf')) fileLevel = 'confidential';
        else if (normalized.includes('int')) fileLevel = 'internal';
        else fileLevel = 'public';

        if (!canUploadLevel(user, fileLevel)) {
          errors.push(`File ${file.originalname}: confidentiality level ${fileLevel} not allowed for user`);
          // Audit each denied in bulk
          await AuditLog.create({
            userId: user._id,
            userEmail: user.email,
            action: 'restricted_access_attempt',
            resource: 'file',
            details: { action: 'bulk_upload_denied', fileName: file.originalname, attemptedLevel: fileLevel },
            ipAddress: req.ip
          });
          continue;
        }

        // Upload to Vercel Blob for production (no local disk dependency)
        let storageLocation;
        try {
          const { put } = require('@vercel/blob');
          const localPath = file.path || path.join(UPLOAD_PATH, file.filename);
          let buffer;
          try {
            buffer = fs.readFileSync(localPath);
          } catch (readErr) {
            buffer = file.buffer; // if somehow memory
          }
          const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
          const blob = await put(`files/bulk/${Date.now()}-${i}-${safeName}`, buffer, {
            access: 'public',
            contentType: file.mimetype || 'application/octet-stream'
          });
          storageLocation = blob.url;
          // cleanup temp disk file if existed
          try { if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath); } catch {}
        } catch (blobErr) {
          console.warn('[BULK] Blob upload failed, using local filename (dev only):', blobErr.message);
          storageLocation = file.filename; // fallback, may 404 in prod without disk persist
        }

        const newFile = await File.create({
          name: file.originalname,
          originalFileName: file.originalname,
          alias: alias,
          type: path.extname(file.originalname).toLowerCase().replace('.', ''),
          size: file.size,
          owner: user._id,
          uploadedBy: user._id,
          department: user.department,
          uploadedByDepartment: user.department,
          uploadedByConfidentiality: user.getConfidentialityLevel(),
          confidentialityLevel: fileLevel,
          mimeType: file.mimetype || 'application/octet-stream',
          storagePath: storageLocation
        });

        await FileVersion.create({
          fileId: newFile._id,
          versionNumber: 1,
          filePath: storageLocation,
          size: file.size,
          uploadedBy: user._id
        });

        files.push(newFile);
      }

      if (files.length === 0 && errors.length > 0) {
        return res.status(403).json({
          success: false,
          message: 'No files could be uploaded due to permission errors',
          errors
        });
      }

      res.status(201).json({
        success: true,
        data: files,
        message: `${files.length} files uploaded successfully`,
        errors: errors.length ? errors : undefined
      });
    } catch (error) {
      next(error);
    }
  },


  downloadFile: async (req, res, next) => {
    try {
      const file = await File.findOne({ fileId: req.params.fileId });
      
      if (!file || file.isDeleted) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      // Get file permissions for access control
      const filePermissions = await Permission.find({
        fileId: file._id,
        isRevoked: false
      });

      // Check if user can access file contents (download)
      const canAccessContents = canUserAccessFileContents(req.user, file, filePermissions);

      if (!canAccessContents) {
        await AuditLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          action: 'restricted_access_attempt',
          resource: 'file',
          resourceId: file.fileId,
          details: {
            action: 'download_denied',
            fileName: file.name,
            fileLevel: file.confidentialityLevel,
            userDept: req.user.department,
            userLevel: req.user.getConfidentialityLevel()
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const storageLocation = file.storagePath;

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'download',
        resource: 'file',
        resourceId: file.fileId,
        details: { fileName: file.name },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      if (storageLocation && (storageLocation.startsWith('http://') || storageLocation.startsWith('https://'))) {
        // Stream download from cloud/blob - no local path ever
        try {
          const axios = require('axios');
          const remoteRes = await axios.get(storageLocation, {
            responseType: 'stream',
            timeout: 30000
          });

          const contentType = remoteRes.headers['content-type'] || file.mimeType || file.type || 'application/octet-stream';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.alias || file.name || 'file')}"`);
          if (remoteRes.headers['content-length']) {
            res.setHeader('Content-Length', remoteRes.headers['content-length']);
          }

          remoteRes.data.on('error', (err) => {
            console.error('[DOWNLOAD] Stream error:', err.message);
            if (!res.headersSent) res.status(500).end();
          });
          return remoteRes.data.pipe(res);
        } catch (fetchErr) {
          console.error('[DOWNLOAD] Failed to stream from cloud:', fetchErr.message);
          return res.status(404).json({ success: false, message: 'File not available in storage' });
        }
      }

      // Local dev only
      const localFilePath = path.join(UPLOAD_PATH, storageLocation);
      
      if (!fs.existsSync(localFilePath)) {
        return res.status(404).json({ success: false, message: 'File not found on disk' });
      }

      res.download(localFilePath, file.name);
    } catch (error) {
      next(error);
    }
  },

  getFile: async (req, res, next) => {
    try {
      // Handle special case: if someone tries to access /files/archive as a fileId,
      // redirect to the archive endpoint
      if (req.params.fileId === 'archive') {
        return fileController.getArchiveFiles(req, res, next);
      }

      const file = await File.findOne({ fileId: req.params.fileId });

      if (!file || (file.isDeleted && req.user.role !== 'admin')) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      const filePermissions = await Permission.find({ fileId: file._id, isRevoked: false });
      if (!canViewFile(req.user, file, filePermissions)) {
        await AuditLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          action: 'restricted_access_attempt',
          resource: 'file',
          resourceId: file.fileId,
          details: {
            action: 'getFile_denied',
            fileName: file.name,
            fileLevel: file.confidentialityLevel,
            userDept: req.user.department,
            userLevel: req.user.getConfidentialityLevel()
          },
          ipAddress: req.ip
        });
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      // populate uploader info so user sees who uploaded
      const populated = await File.findOne({ fileId: req.params.fileId })
        .populate('uploadedBy', 'name email department confidentialityLevels')
        .populate('owner', 'name email department');

      res.json({ success: true, data: populated || file });
    } catch (error) {
      next(error);
    }
  },

  getAllFiles: async (req, res, next) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        type, 
        owner, 
        department, 
        fromDate, 
        toDate, 
        confidentiality, 
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const user = req.user;

      // STRICT base (dept + level)
      const strictQuery = buildFileAccessQuery(user);

      // Also include files explicitly shared with me (this is the bypass for cross-dept / higher level)
      const mySharedPerms = await Permission.find({ userId: user._id, isRevoked: false });
      const sharedFileIds = mySharedPerms.map(p => p.fileId);

      let query;
      if (sharedFileIds.length > 0) {
        query = {
          isDeleted: { $ne: true },
          $or: [
            strictQuery,
            { _id: { $in: sharedFileIds } }
          ]
        };
      } else {
        query = { ...strictQuery };
      }

      if (type) query.type = type;
      if (confidentiality) query.confidentialityLevel = confidentiality;
      if (fromDate || toDate) {
        query.createdAt = query.createdAt || {};
        if (fromDate) query.createdAt.$gte = new Date(fromDate);
        if (toDate) query.createdAt.$lte = new Date(toDate);
      }
      if (search) {
        const searchOr = [
          { name: { $regex: search, $options: 'i' } },
          { alias: { $regex: search, $options: 'i' } },
          { tags: { $in: new RegExp(search, 'i') } }
        ];
        // wrap existing query in $and with search
        query = {
          $and: [ query, { $or: searchOr } ]
        };
      }

      if (owner) {
        if (user.role !== 'admin') {
          return res.status(403).json({ success: false, message: 'Only admin can filter by owner' });
        }
        // when owner filter, restrict to admin only
        if (query.$or) {
          query.$and = (query.$and || []).concat([{ owner }]);
        } else {
          query.owner = owner;
        }
      }
      if (department) {
        if (user.role === 'admin') {
          // admin can further filter
        } else if (department !== user.department) {
          return res.status(403).json({ success: false, message: 'Cannot view other departments' });
        }
      }

      const files = await File.find(query)
        .populate('uploadedBy', 'name email department confidentialityLevels')
        .populate('owner', 'name email department')
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      const total = await File.countDocuments(query);

      res.json({
        success: true,
        data: {
          files,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          total
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/files/archive
   * Get archive files accessible to current user based on confidentiality rules
   */
  getArchiveFiles: async (req, res, next) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        confidentialityLevel,
        uploadedBy,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const user = req.user;

      if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      // STRICT base + shared files (sharing bypasses dept/level)
      const strictQuery = buildFileAccessQuery(user);

      const mySharedPerms = await Permission.find({ userId: user._id, isRevoked: false });
      const sharedFileIds = mySharedPerms.map(p => p.fileId);

      let query;
      if (sharedFileIds.length > 0) {
        query = {
          isDeleted: { $ne: true },
          $or: [
            strictQuery,
            { _id: { $in: sharedFileIds } }
          ]
        };
      } else {
        query = { ...strictQuery };
      }

      if (confidentialityLevel) query.confidentialityLevel = confidentialityLevel;
      if (uploadedBy) {
        if (user.role === 'admin' || uploadedBy.toString() === user._id.toString()) {
          // when filtering by uploadedBy, add to the current query structure
          if (query.$or) {
            query.$and = (query.$and || []).concat([ { $or: query.$or }, { uploadedBy } ]);
            delete query.$or;
          } else {
            query.uploadedBy = uploadedBy;
          }
        } else {
          query.uploadedBy = user._id;
        }
      }
      if (search) {
        const searchOr = [
          { name: { $regex: search, $options: 'i' } },
          { alias: { $regex: search, $options: 'i' } },
          { tags: { $in: new RegExp(search, 'i') } }
        ];
        if (query.$or) {
          query.$and = (query.$and || []).concat([{ $or: query.$or }, { $or: searchOr }]);
          delete query.$or;
        } else {
          query.$or = searchOr;
        }
      }

      // Query directly - no post-filter ever
      const allAccessible = await File.find(query)
        .populate('uploadedBy', 'name email department confidentialityLevels')
        .populate('owner', 'name email department')
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 });

      // normalize for frontend (no more special hod masking)
      const processedFiles = allAccessible.map(file => ({
        ...file.toObject(),
        fileId: file.fileId || `file_${file._id}`,
        name: file.name || 'Unnamed File',
        alias: file.alias || '',
        type: file.type || 'unknown',
        department: file.department || 'Unknown',
        confidentialityLevel: file.confidentialityLevel || 'internal',
        uploadedBy: file.uploadedBy || file.owner
      }));

      // pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + parseInt(limit);
      const paginatedFiles = processedFiles.slice(startIndex, endIndex);

      // Audit
      await AuditLog.create({
        userId: user._id,
        userEmail: user.email,
        action: 'archive_view',
        resource: 'archive',
        details: {
          fileCount: processedFiles.length,
          department: user.department,
          confidentialityLevel: user.getConfidentialityLevel(),
          filters: { search, confidentialityLevel, uploadedBy, page, limit }
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        ...req.auditEnhancement
      });

      res.json({
        success: true,
        data: {
          files: paginatedFiles,
          totalPages: Math.ceil(processedFiles.length / limit),
          currentPage: parseInt(page),
          total: processedFiles.length
        }
      });
    } catch (error) {
      next(error);
    }
  },

  updateFile: async (req, res, next) => {
    try {
      const file = await File.findOne({ fileId: req.params.fileId });
      
      if (!file || file.isDeleted) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      const filePermissions = await Permission.find({ fileId: file._id, isRevoked: false });
      if (!canViewFile(req.user, file, filePermissions)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const isOwner = file.owner && file.owner.toString() === req.user._id.toString();
      const hasEditPermission = await fileController.checkAccess(file, req.user, 'edit');

      if (!isOwner && !hasEditPermission && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'No edit permission' });
      }

      if (req.file) {
        file.currentVersion += 1;
        file.size = req.file.size;
        file.name = req.file.originalname;

        // Upload new version to blob
        let newStorage = req.file.filename;
        try {
          const { put } = require('@vercel/blob');
          const localP = req.file.path || path.join(UPLOAD_PATH, req.file.filename);
          const buf = fs.readFileSync(localP);
          const safe = req.file.originalname.replace(/[^a-z0-9.-]/gi, '_');
          const blob = await put(`files/versions/${Date.now()}-${safe}`, buf, {
            access: 'public',
            contentType: req.file.mimetype || 'application/octet-stream'
          });
          newStorage = blob.url;
          try { fs.unlinkSync(localP); } catch {}
        } catch (e) { console.warn('version blob fail:', e.message); }

        file.storagePath = newStorage;

        await FileVersion.create({
          fileId: file._id,
          versionNumber: file.currentVersion,
          filePath: newStorage,
          size: req.file.size,
          uploadedBy: req.user._id
        });
      }

      const { alias, tags, confidentialityLevel } = req.body;
      if (alias) file.alias = alias;
      if (tags) file.tags = tags.split(',').map(t => t.trim());
      if (confidentialityLevel) {
        if (!canUploadLevel(req.user, confidentialityLevel)) {
          return res.status(403).json({
            success: false,
            message: 'You are not authorized to upload files with this confidentiality level.'
          });
        }
        file.confidentialityLevel = confidentialityLevel;
      }
      
      file.updatedAt = new Date();
      await file.save();

      await Notification.create({
        userId: file.owner,
        message: `File "${file.name}" has been updated`,
        type: 'file_updated',
        resourceId: file.fileId
      });

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'file_update',
        resource: 'file',
        resourceId: file.fileId,
        details: { version: file.currentVersion }
      });

      res.json({ success: true, data: file });
    } catch (error) {
      next(error);
    }
  },

  deleteFile: async (req, res, next) => {
    try {
      const file = await File.findOne({ fileId: req.params.fileId });
      
      if (!file) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      const isOwner = file.owner.toString() === req.user._id.toString();
      const isAdmin = req.user.role === 'admin';
      const isHod = req.user.role === 'hod' && file.department === req.user.department;
      
      if (!isOwner && !isAdmin && !isHod) {
        return res.status(403).json({ success: false, message: 'Only owner, HOD (same department), or admin can delete' });
      }

      if (req.query.permanent === 'true') {
        if (!file.isDeleted && !isAdmin) {
          return res.status(400).json({ success: false, message: 'Only deleted files can be permanently removed from the recycle bin' });
        }

        if (isAdmin) {
          const storage = file.storagePath;
          if (storage && (storage.startsWith('http://') || storage.startsWith('https://'))) {
            try {
              const { del } = require('@vercel/blob');
              await del(storage);
              console.log('[DELETE] Removed blob:', storage);
            } catch (delErr) {
              console.error('[DELETE] Blob delete failed (may already gone):', delErr.message);
            }
          } else {
            const localPath = path.join(UPLOAD_PATH, storage);
            if (fs.existsSync(localPath)) {
              fs.unlinkSync(localPath);
            }
          }
          await FileVersion.deleteMany({ fileId: file._id });
          await Permission.deleteMany({ fileId: file._id });
          await file.deleteOne();

          await AuditLog.create({
            userId: req.user._id,
            userEmail: req.user.email,
            action: 'permanent_delete',
            resource: 'file',
            resourceId: file.fileId,
            details: { fileName: file.name, permanent: true }
          });
        } else {
          const originalPermanentDeleteAt = file.permanentDeleteAt;

          file.isDeleted = true;
          file.deletedAt = file.deletedAt || new Date();
          file.deletedBy = req.user._id;
          file.permanentDeleteAt = new Date();
          await file.save();

          await AuditLog.create({
            userId: req.user._id,
            userEmail: req.user.email,
            action: 'permanent_delete',
            resource: 'file',
            resourceId: file.fileId,
            details: {
              fileName: file.name,
              permanent: false,
              adminVisible: true,
              deletedFromUserRecycleBin: true,
              originalPermanentDeleteAt
            }
          });
        }
      } else {
        const deleteAfter30Days = new Date();
        deleteAfter30Days.setDate(deleteAfter30Days.getDate() + 30);
        
        file.isDeleted = true;
        file.deletedAt = new Date();
        file.deletedBy = req.user._id;
        file.permanentDeleteAt = deleteAfter30Days;
        await file.save();

        await AuditLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          action: 'soft_delete',
          resource: 'file',
          resourceId: file.fileId,
          details: { fileName: file.name, permanentDeleteAt: deleteAfter30Days }
        });
      }

      res.json({
        success: true,
        message: req.query.permanent === 'true'
          ? (req.user.role === 'admin' ? 'File permanently deleted' : 'File removed from your recycle bin')
          : 'File moved to recycle bin'
      });
    } catch (error) {
      next(error);
    }
  },

  restoreFile: async (req, res, next) => {
    try {
      const file = await File.findOne({ fileId: req.params.fileId });
      
      if (!file) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      if (!file.isDeleted) {
        return res.status(400).json({ success: false, message: 'File is not in the recycle bin' });
      }

      if (req.user.role !== 'admin' && file.permanentDeleteAt && file.permanentDeleteAt <= new Date()) {
        return res.status(403).json({ success: false, message: 'This file is no longer available in your recycle bin' });
      }

      // Restore only files that are still visible in the user's recycle bin.
      
      file.isDeleted = false;
      file.deletedAt = null;
      file.deletedBy = null;
      file.permanentDeleteAt = null;
      await file.save();

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'restore',
        resource: 'file',
        resourceId: file.fileId,
        details: { fileName: file.name, restoredBy: req.user.email }
      });

      res.json({ success: true, message: 'File restored successfully' });
    } catch (error) {
      next(error);
    }
  },

  getVersionHistory: async (req, res, next) => {
    try {
      const file = await File.findOne({ fileId: req.params.fileId });
      
      if (!file) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      const versions = await FileVersion.find({ fileId: file._id })
        .populate('uploadedBy', 'name email')
        .sort({ versionNumber: -1 });

      res.json({ success: true, data: versions });
    } catch (error) {
      next(error);
    }
  },

  rollbackVersion: async (req, res, next) => {
    try {
      const { versionNumber } = req.body;
      const file = await File.findOne({ fileId: req.params.fileId });
      
      if (!file) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      const version = await FileVersion.findOne({ 
        fileId: file._id, 
        versionNumber 
      });

      if (!version) {
        return res.status(404).json({ success: false, message: 'Version not found' });
      }

      const oldPath = file.storagePath;
      file.currentVersion = versionNumber;
      file.storagePath = version.filePath;
      await file.save();

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'rollback',
        resource: 'file',
        resourceId: file.fileId,
        details: { fromVersion: oldPath, toVersion: versionNumber }
      });

      res.json({ success: true, message: `Rolled back to version ${versionNumber}` });
    } catch (error) {
      next(error);
    }
  },

  getDeletedFiles: async (req, res, next) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const user = req.user;
      const now = new Date();

      let query = { isDeleted: true };

      if (user.role !== 'admin') {
        const strictQuery = buildFileAccessQuery(user);
        delete strictQuery.isDeleted;

        const mySharedPerms = await Permission.find({ userId: user._id, isRevoked: false });
        const sharedFileIds = mySharedPerms.map(p => p.fileId);

        if (sharedFileIds.length > 0) {
          query = {
            isDeleted: true,
            $or: [
              strictQuery,
              { _id: { $in: sharedFileIds } }
            ]
          };
        } else {
          query = { ...strictQuery, isDeleted: true };
        }

        query.permanentDeleteAt = { $gt: now };
      }

      const files = await File.find(query)
        .populate('uploadedBy', 'name email department confidentialityLevels')
        .populate('owner', 'name email')
        .populate('deletedBy', 'name email')
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ deletedAt: -1 });

      const total = await File.countDocuments(query);

      res.json({
        success: true,
        data: {
          files,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          total
        }
      });
    } catch (error) {
      next(error);
    }
  },

  permanentDeleteFile: async (req, res, next) => {
    try {
      const file = await File.findOne({ fileId: req.params.fileId });
      
      if (!file) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only admin can permanently delete files' });
      }

      // Remove from storage (blob or local) without windows path hardcode
      const storage = file.storagePath;
      if (storage && (storage.startsWith('http://') || storage.startsWith('https://'))) {
        try {
          const { del } = require('@vercel/blob');
          await del(storage);
        } catch (e) { console.error('permanent blob del:', e.message); }
      } else {
        const localPath = path.join(UPLOAD_PATH, storage);
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      }

      await FileVersion.deleteMany({ fileId: file._id });
      await Permission.deleteMany({ fileId: file._id });
      await file.deleteOne();

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'permanent_delete',
        resource: 'file',
        resourceId: req.params.fileId,
        details: { fileName: file.name }
      });

      res.json({ success: true, message: 'File permanently deleted' });
    } catch (error) {
      next(error);
    }
  },

  cleanExpiredFiles: async (req, res, next) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only admin can clean expired files' });
      }

      const now = new Date();
      const expiredFiles = await File.find({
        isDeleted: true,
        permanentDeleteAt: { $lte: now }
      });

      res.json({ 
        success: true, 
        message: `${expiredFiles.length} expired recycle-bin files are hidden from non-admin users. Admin must permanently delete files to remove them completely.`
      });
    } catch (error) {
      next(error);
    }
  },

  checkAccess: async (file, user, accessType) => {
    const permission = await Permission.findOne({
      fileId: file._id,
      userId: user._id,
      isRevoked: false
    });

    if (!permission) return false;
    return permission.access === accessType || permission.access === 'edit';
  },

  uploadScannedFile: async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const { alias, tags, confidentialityLevel, uploadSource } = req.body;
      const user = req.user;

      let fileLevel = confidentialityLevel || 'internal';

      const normalized = String(fileLevel).toLowerCase().trim();
      if (normalized.includes('high')) fileLevel = 'highly_confidential';
      else if (normalized.includes('conf')) fileLevel = 'confidential';
      else if (normalized.includes('int')) fileLevel = 'internal';
      else fileLevel = 'public';
      
      if (!canUploadLevel(user, fileLevel)) {
        await AuditLog.create({
          userId: user._id, userEmail: user.email, action: 'restricted_access_attempt',
          resource: 'file', details: { action: 'scanned_upload_denied', attemptedLevel: fileLevel },
          ipAddress: req.ip
        });
        return res.status(403).json({ 
          success: false, 
          message: 'You are not authorized to upload files with this confidentiality level.' 
        });
      }

      const source = uploadSource || 'scanner';
      const isScannedDoc = ['pdf', 'jpg', 'jpeg', 'png', 'tiff', 'bmp'].includes(
        path.extname(req.file.originalname).toLowerCase().replace('.', '')
      );

      // Blob upload for scanner files too
      let storageLocation = req.file.filename;
      try {
        const { put } = require('@vercel/blob');
        const localPath = req.file.path || path.join(UPLOAD_PATH, req.file.filename);
        const buffer = fs.readFileSync(localPath);
        const safeName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const blob = await put(`files/scanned/${Date.now()}-${safeName}`, buffer, {
          access: 'public',
          contentType: req.file.mimetype || 'application/octet-stream'
        });
        storageLocation = blob.url;
        try { if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath); } catch {}
      } catch (e) {
        console.warn('[SCANNED UPLOAD] Blob fallback:', e.message);
      }

      const file = await File.create({
        name: req.file.originalname,
        originalFileName: req.file.originalname,
        alias: alias || req.file.originalname,
        type: path.extname(req.file.originalname).toLowerCase().replace('.', ''),
        size: req.file.size,
        owner: user._id,
        uploadedBy: user._id,
        department: user.department,
        uploadedByDepartment: user.department,
        uploadedByConfidentiality: user.getConfidentialityLevel(),
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        confidentialityLevel: fileLevel,
        mimeType: req.file.mimetype || 'application/octet-stream',
        isScanned: isScannedDoc,
        uploadSource: source,
        storagePath: storageLocation,
        ocrStatus: 'pending'
      });

      await FileVersion.create({
        fileId: file._id,
        versionNumber: 1,
        filePath: storageLocation,
        size: req.file.size,
        uploadedBy: user._id
      });

      await AuditLog.create({
        userId: user._id,
        userEmail: user.email,
        action: 'upload',
        resource: 'file',
        resourceId: file.fileId,
        details: { fileName: file.name, size: file.size, isScanned: true, uploadSource: source },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.status(201).json({
        success: true,
        data: file,
        message: 'Scanned document uploaded successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  uploadScannedBulk: async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'No files uploaded' });
      }

      const { uploadSource } = req.body;
      const user = req.user;
      const source = uploadSource || 'scanner';
      const files = [];
      const errors = [];

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const isScannedDoc = ['pdf', 'jpg', 'jpeg', 'png', 'tiff', 'bmp'].includes(
          path.extname(file.originalname).toLowerCase().replace('.', '')
        );

        // Blob for scanned bulk
        let storageLocation = file.filename;
        try {
          const { put } = require('@vercel/blob');
          const localPath = file.path || path.join(UPLOAD_PATH, file.filename);
          const buffer = fs.readFileSync(localPath);
          const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
          const blob = await put(`files/scanned-bulk/${Date.now()}-${i}-${safeName}`, buffer, {
            access: 'public',
            contentType: file.mimetype || 'application/octet-stream'
          });
          storageLocation = blob.url;
          try { if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath); } catch {}
        } catch (e) {
          console.warn('[SCANNED BULK] Blob fallback:', e.message);
        }

        const fileLevel = 'internal';
        if (!canUploadLevel(user, fileLevel)) {
          errors.push(`File ${file.originalname}: internal level not allowed`);
          await AuditLog.create({ userId: user._id, userEmail: user.email, action: 'restricted_access_attempt', resource: 'file', details: {action:'scanned_bulk_denied', fileName: file.originalname}, ipAddress: req.ip });
          continue;
        }

        const newFile = await File.create({
          name: file.originalname,
          originalFileName: file.originalname,
          alias: file.originalname,
          type: path.extname(file.originalname).toLowerCase().replace('.', ''),
          size: file.size,
          owner: user._id,
          uploadedBy: user._id,
          department: user.department,
          uploadedByDepartment: user.department,
          uploadedByConfidentiality: user.getConfidentialityLevel(),
          confidentialityLevel: fileLevel,
          mimeType: file.mimetype || 'application/octet-stream',
          isScanned: isScannedDoc,
          uploadSource: source,
          storagePath: storageLocation,
          ocrStatus: 'pending'
        });

        await FileVersion.create({
          fileId: newFile._id,
          versionNumber: 1,
          filePath: storageLocation,
          size: file.size,
          uploadedBy: user._id
        });

        files.push(newFile);
      }

      await AuditLog.create({
        userId: user._id,
        userEmail: user.email,
        action: 'upload',
        resource: 'file',
        details: { fileCount: files.length, isScanned: true, uploadSource: source, bulk: true },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.status(201).json({
        success: true,
        data: files,
        message: `${files.length} scanned documents uploaded successfully`
      });
    } catch (error) {
      next(error);
    }
  },

  previewFile: async (req, res, next) => {
    try {
      console.log('[PREVIEW] Request received for fileId:', req.params.fileId);
      
      const file = await File.findOne({ fileId: req.params.fileId });
      console.log('[PREVIEW] File found:', file ? file.name : 'NOT FOUND');
      console.log('[PREVIEW] File isDeleted:', file ? file.isDeleted : 'N/A');
      
      if (!file || file.isDeleted) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      console.log('[PREVIEW] User:', req.user ? req.user.email : 'NO USER');

      // Get file permissions for access control
      const filePermissions = await Permission.find({
        fileId: file._id,
        isRevoked: false
      });

      // Check if user can access file contents (preview/download)
      const canAccessContents = canUserAccessFileContents(req.user, file, filePermissions);

      console.log('[PREVIEW] Can access contents:', canAccessContents);
      console.log('[PREVIEW] File level:', file.confidentialityLevel);
      console.log('[PREVIEW] User role:', req.user.role);

      if (!canAccessContents) {
        await AuditLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          action: 'restricted_access_attempt',
          resource: 'file',
          resourceId: file.fileId,
          details: {
            action: 'preview_denied',
            fileName: file.name,
            fileLevel: file.confidentialityLevel,
            userDept: req.user.department,
            userLevel: req.user.getConfidentialityLevel()
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      // Support both local disk (dev) and Vercel Blob / remote URLs (production) - NEVER use local paths for cloud files
      const storageLocation = file.storagePath;

      if (storageLocation && (storageLocation.startsWith('http://') || storageLocation.startsWith('https://'))) {
        // Stream from blob/cloud to ensure valid headers and no redirect leakage
        console.log('[PREVIEW] Streaming from cloud URL:', storageLocation);
        try {
          const axios = require('axios');
          const remoteRes = await axios.get(storageLocation, {
            responseType: 'stream',
            timeout: 30000
          });

          const contentType = remoteRes.headers['content-type'] || file.mimeType || file.type || 'application/octet-stream';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.alias || file.name || 'file')}"`);
          res.setHeader('Cache-Control', 'private, max-age=3600');
          if (remoteRes.headers['content-length']) {
            res.setHeader('Content-Length', remoteRes.headers['content-length']);
          }

          remoteRes.data.on('error', (err) => {
            console.error('[PREVIEW] Stream error from blob:', err.message);
            if (!res.headersSent) res.status(500).end();
          });
          remoteRes.data.pipe(res);
          return;
        } catch (fetchErr) {
          console.error('[PREVIEW] Failed to fetch from cloud storage:', fetchErr.message);
          return res.status(404).json({ success: false, message: 'File not available in cloud storage' });
        }
      }

      // Local disk path (only for dev/non-cloud)
      const localFilePath = path.join(UPLOAD_PATH, storageLocation);
      console.log('[PREVIEW] Local file path (dev only):', localFilePath);

      if (!fs.existsSync(localFilePath)) {
        console.log('[PREVIEW] File not found on disk');
        return res.status(404).json({ success: false, message: 'File not found on disk' });
      }

      const ext = path.extname(file.name).toLowerCase().slice(1);
      const mimeTypes = {
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'tiff': 'image/tiff',
        'tif': 'image/tiff'
      };

      const contentType = mimeTypes[ext] || file.mimeType || file.type || 'application/octet-stream';
      console.log('[PREVIEW] Content-Type:', contentType);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.alias || file.name || 'file')}"`);
      
      const fileStream = fs.createReadStream(localFilePath);
      fileStream.pipe(res);
    } catch (error) {
      console.log('[PREVIEW] Error:', error.message);
      next(error);
    }
  },

   previewFileWithGoogleDocs: async (req, res, next) => {
     try {
       const file = await File.findOne({ fileId: req.params.fileId });

       if (!file || file.isDeleted) {
         return res.status(404).json({ success: false, message: 'File not found' });
       }

       // Get file permissions for access control
       const filePermissions = await Permission.find({
         fileId: file._id,
         isRevoked: false
       });

       // Check if user can access file contents (Google Docs preview)
       const canAccessContents = canUserAccessFileContents(req.user, file, filePermissions);

        if (!canAccessContents) {
          await AuditLog.create({
            userId: req.user._id,
            userEmail: req.user.email,
            action: 'restricted_access_attempt',
            resource: 'file',
            resourceId: file.fileId,
            details: {
              action: 'google_preview_denied',
              fileName: file.name,
              fileLevel: file.confidentialityLevel,
              userDept: req.user.department,
              userLevel: req.user.getConfidentialityLevel()
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          });
          return res.status(403).json({ success: false, message: 'Access denied' });
        }

      // Construct the file URL that Google Docs can access
      const protocol = req.protocol;
      const host = req.get('host');
      const fileUrl = `${protocol}://${host}/api/v1/files/${file.fileId}/preview`;

      // Google Docs Viewer URL
      const googleViewerUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(fileUrl)}`;

      // Build HTML response (Google Docs viewer wrapper)
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview - ${file.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      background: #fff;
      padding: 12px 20px;
      border-bottom: 1px solid #ddd;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header h1 {
      font-size: 18px;
      color: #333;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 70%;
    }
    .header .actions {
      display: flex;
      gap: 10px;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: background 0.2s;
    }
    .btn-download {
      background: #1a73e8;
      color: white;
      border: none;
      cursor: pointer;
    }
    .btn-download:hover {
      background: #1557b0;
    }
    .btn-close {
      background: #f1f3f4;
      color: #3c4043;
      border: 1px solid #dadce0;
      cursor: pointer;
    }
    .btn-close:hover {
      background: #e8eaed;
    }
    .viewer-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .viewer-container iframe {
      width: 100%;
      height: 100%;
      border: none;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    .error {
      text-align: center;
      color: #d93025;
      padding: 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${file.name}</h1>
    <div class="actions">
      <a href="/api/v1/files/${file.fileId}/download" class="btn btn-download">Download</a>
      <button onclick="window.close()" class="btn btn-close">Close</button>
    </div>
  </div>
  <div class="viewer-container">
    <iframe src="${googleViewerUrl}" frameborder="0" allowfullscreen>
      <div class="error">
        <p>Unable to load preview.</p>
        <p><a href="/api/v1/files/${file.fileId}/download">Download file instead</a></p>
      </div>
    </iframe>
  </div>
  <script>
    // Error handling for iframe
    const iframe = document.querySelector('iframe');
    iframe.onerror = function() {
      document.querySelector('.viewer-container').innerHTML = \`
        <div class="error">
          <p>Preview not available for this file type.</p>
          <p><a href="/api/v1/files/${file.fileId}/download">Download file</a></p>
        </div>
      \`;
    };
    // Timeout fallback if Google Docs doesn't respond properly
    setTimeout(function() {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc && iframeDoc.body && iframeDoc.body.innerHTML && iframeDoc.body.innerHTML.includes('Cannot preview this file')) {
          throw new Error('Google Docs cannot preview');
        }
      } catch (e) {
        document.querySelector('.viewer-container').innerHTML = \`
          <div class="error">
            <p>Preview unavailable. The file may not be supported by Google Docs.</p>
            <p><a href="/api/v1/files/${file.fileId}/download">Download file</a></p>
          </div>
        \`;
      }
    }, 10000);
  </script>
</body>
</html>`;
      res.send(html);
    } catch (error) {
      next(error);
    }
  },
};

module.exports = fileController;