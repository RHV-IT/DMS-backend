const File = require('../models/File');
const FileVersion = require('../models/FileVersion');
const Permission = require('../models/Permission');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { canUserAccessFile, canUserAccessFileContents, canUserManageFile, filterAccessibleFiles } = require('../utils/accessControl');
const path = require('path');
const fs = require('fs');
const os = require('os');

const UPLOAD_PATH = process.env.UPLOAD_PATH || path.join(os.tmpdir(), 'uploads');

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

const userLevels = user.confidentialityLevels || ['public'];
       const fileLevel = confidentialityLevel || 'internal';

       if (!userLevels.includes(fileLevel)) {
         return res.status(403).json({
           success: false,
           message: 'Not authorized to create files at this confidentiality level'
         });
       }

       const file = await File.create({
        name: req.file.originalname,
        alias: alias || req.file.originalname,
        type: path.extname(req.file.originalname).toLowerCase().replace('.', ''),
        size: req.file.size,
        owner: user._id,
        department: user.department,
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        confidentialityLevel: fileLevel,
        isScanned: false,
        storagePath: req.file.filename
      });

      await FileVersion.create({
        fileId: file._id,
        versionNumber: 1,
        filePath: req.file.filename,
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

const { confidentialityLevel } = req.body;
       const user = req.user;
       const fileLevel = confidentialityLevel || 'internal';
       const userLevels = user.confidentialityLevels || ['public'];

       if (!userLevels.includes(fileLevel)) {
         return res.status(403).json({
           success: false,
           message: 'Not authorized to create files at this confidentiality level'
         });
       }

      const files = [];

      for (const file of req.files) {
        const newFile = await File.create({
          name: file.originalname,
          alias: file.originalname,
          type: path.extname(file.originalname).toLowerCase().replace('.', ''),
          size: file.size,
          owner: user._id,
          department: user.department,
          confidentialityLevel: fileLevel,
          storagePath: file.filename
        });

        await FileVersion.create({
          fileId: newFile._id,
          versionNumber: 1,
          filePath: file.filename,
          size: file.size,
          uploadedBy: user._id
        });

        files.push(newFile);
      }

      res.status(201).json({
        success: true,
        data: files,
        message: `${files.length} files uploaded successfully`
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
        // Special handling for HOD trying to access highly confidential file
        if (req.user.role === 'hod' && file.confidentialityLevel === 'highly_confidential') {
          // Log restricted access attempt
          await AuditLog.create({
            userId: req.user._id,
            userEmail: req.user.email,
            action: 'restricted_access_attempt',
            resource: 'file',
            resourceId: file.fileId,
            details: {
              action: 'download',
              fileName: file.name,
              confidentialityLevel: file.confidentialityLevel,
              restrictionReason: 'HOD attempted to download highly confidential file'
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            ...req.auditEnhancement
          });

          return res.status(403).json({
            success: false,
            message: 'Access restricted. Highly confidential file download not available to department heads.',
            restricted: true,
            restrictionReason: 'Highly confidential file. Download restricted for department heads.'
          });
        }

        return res.status(403).json({ success: false, message: 'No access to file contents' });
      }

      const filePath = path.join(UPLOAD_PATH, file.storagePath);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'File not found on disk' });
      }

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

      res.download(filePath, file.name);
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

      const hasPermission = await fileController.checkAccess(file, req.user, 'view');
      if (!hasPermission && file.owner.toString() !== req.user._id.toString()) {
        if (req.user.role !== 'admin' && req.user.role !== 'hod') {
          return res.status(403).json({ success: false, message: 'No view permission' });
        }
      }

      res.json({ success: true, data: file });
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

      // Build base filters (excluding owner restrictions)
      const baseFilter = { isDeleted: false };
      
      if (type) baseFilter.type = type;
      if (confidentiality) baseFilter.confidentialityLevel = confidentiality;
      if (owner) {
        if (user.role !== 'admin') {
          return res.status(403).json({ success: false, message: 'Only admin can filter by owner' });
        }
        baseFilter.owner = owner;
      }
      
      if (fromDate || toDate) {
        baseFilter.createdAt = {};
        if (fromDate) baseFilter.createdAt.$gte = new Date(fromDate);
        if (toDate) baseFilter.createdAt.$lte = new Date(toDate);
      }

      if (search) {
        baseFilter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { alias: { $regex: search, $options: 'i' } },
          { tags: { $in: new RegExp(search, 'i') } }
        ];
      }

      // Department restrictions
      if (user.role === 'admin') {
        if (department) baseFilter.department = department;
      } else if (user.role === 'hod') {
        baseFilter.department = user.department;
        if (department && department !== user.department) {
          return res.status(403).json({ success: false, message: 'Cannot view other departments' });
        }
      } else {
        if (department && department !== user.department) {
          return res.status(403).json({ success: false, message: 'Cannot view other departments' });
        }
        // For regular users, restrict to their department
        baseFilter.department = user.department;
      }

      let files;
      let total;

      if (user.role === 'admin' || user.role === 'hod') {
        files = await File.find(baseFilter)
          .populate('owner', 'name email')
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip((page - 1) * limit)
          .limit(limit);
        total = await File.countDocuments(baseFilter);
      } else {
        // Regular user: combine owned and shared files, with confidentiality level filtering
        const sharedPermissions = await Permission.find({
          userId: user._id,
          isRevoked: false,
          access: { $in: ['view', 'download', 'edit'] }
        });
        const sharedFileIds = sharedPermissions.map(p => p.fileId);

        const userLevels = user.confidentialityLevels || ['public'];

        // Separate search $or from other filters
        const searchOrClauses = baseFilter.$or || [];
        const { $or: _, ...staticFilters } = baseFilter; // remove $or from static filters

        // Add confidentiality level filter - user can only see files at levels they have access to
        staticFilters.confidentialityLevel = { $in: userLevels };

        // Build final query
        let finalQuery;
        if (searchOrClauses.length > 0) {
          // Need both search and ownership: combine via $and
          finalQuery = {
            ...staticFilters,
            $and: [
              { $or: searchOrClauses },
              {
                $or: [
                  { owner: user._id }, // Own files, including highly_confidential
                  { _id: { $in: sharedFileIds } } // Shared files
                ]
              }
            ]
          };
        } else {
          // Only ownership condition needed
          finalQuery = {
            ...staticFilters,
            $or: [
              { owner: user._id }, // Own files, including highly_confidential
              { _id: { $in: sharedFileIds } } // Shared files
            ]
          };
        }

        total = await File.countDocuments(finalQuery);
        files = await File.find(finalQuery)
          .populate('owner', 'name email')
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip((page - 1) * limit)
          .limit(limit);
      }

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

      // Build base filters
      const baseFilter = {
        isDeleted: false // Exclude soft deleted files
        // Note: Archive includes all files (both scanned and uploaded)
        // Scanned files are included if they have completed the approval process
      };

      // Add filters
      if (confidentialityLevel) {
        baseFilter.confidentialityLevel = confidentialityLevel;
      }

      if (uploadedBy) {
        baseFilter.owner = uploadedBy;
      }

      if (search) {
        baseFilter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { alias: { $regex: search, $options: 'i' } },
          { tags: { $in: new RegExp(search, 'i') } }
        ];
      }

      // Get all files matching basic criteria
      const allFiles = await File.find(baseFilter)
        .populate('owner', 'name email department')
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 });

      // Ensure populated owner objects have valid values
      allFiles.forEach(file => {
        if (file.owner) {
          file.owner.name = file.owner.name || 'Unknown User';
          file.owner.email = file.owner.email || 'unknown@example.com';
          file.owner.department = file.owner.department || 'Unknown';
        }
      });

      // Get all permissions for performance
      const allPermissions = await Permission.find({ isRevoked: false })
        .populate('userId', 'department confidentialityLevel');

      // Filter files based on confidentiality access rules
      const accessibleFiles = filterAccessibleFiles(user, allFiles, allPermissions);

      // For HOD users, mark highly confidential files as restricted
      let processedFiles = accessibleFiles;
      if (user.role === 'hod') {
        processedFiles = accessibleFiles.map(file => {
          if (file.confidentialityLevel === 'highly_confidential') {
            // Return metadata-only object for HOD
            return {
              _id: file._id,
              fileId: file.fileId || `file_${file._id}`,
              name: file.name || 'Unnamed File',
              alias: file.alias || '',
              type: file.type || 'unknown',
              size: file.size || 0,
              department: file.department || 'Unknown',
              uploadedBy: file.owner,
              confidentialityLevel: file.confidentialityLevel || 'internal',
              createdAt: file.createdAt,
              currentVersion: file.currentVersion || 1,
              // HOD restriction indicator
              restricted: true,
              restrictionReason: "Highly confidential file. Access restricted."
            };
          }
          return file;
        });
      }

      // Ensure all files have valid values for frontend select components
      processedFiles = processedFiles.map(file => ({
        ...file,
        fileId: file.fileId || `file_${file._id}`,
        name: file.name || 'Unnamed File',
        alias: file.alias || '',
        type: file.type || 'unknown',
        department: file.department || 'Unknown',
        confidentialityLevel: file.confidentialityLevel || 'internal'
      }));

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + parseInt(limit);
      const paginatedFiles = processedFiles.slice(startIndex, endIndex);

      // Audit log archive access
      await AuditLog.create({
        userId: user._id,
        userEmail: user.email,
        action: 'archive_view',
        resource: 'archive',
        resourceId: null,
        details: {
          fileCount: accessibleFiles.length,
          department: user.department,
          confidentialityLevel: user.confidentialityLevel,
          filters: {
            search,
            confidentialityLevel,
            uploadedBy,
            page: parseInt(page),
            limit: parseInt(limit)
          }
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        ...req.auditEnhancement // Include machine, location, scanner data
      });

      res.json({
        success: true,
        data: {
          files: paginatedFiles,
          totalPages: Math.ceil(accessibleFiles.length / limit),
          currentPage: parseInt(page),
          total: accessibleFiles.length
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

      const isOwner = file.owner.toString() === req.user._id.toString();
      const hasEditPermission = await fileController.checkAccess(file, req.user, 'edit');

      if (!isOwner && !hasEditPermission && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'No edit permission' });
      }

      if (req.file) {
        file.currentVersion += 1;
        file.size = req.file.size;
        file.storagePath = req.file.filename;
        file.name = req.file.originalname;

        await FileVersion.create({
          fileId: file._id,
          versionNumber: file.currentVersion,
          filePath: req.file.filename,
          size: req.file.size,
          uploadedBy: req.user._id
        });
      }

      const { alias, tags, confidentialityLevel } = req.body;
      if (alias) file.alias = alias;
      if (tags) file.tags = tags.split(',').map(t => t.trim());
      if (confidentialityLevel) file.confidentialityLevel = confidentialityLevel;
      
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
        const filePath = path.join(UPLOAD_PATH, file.storagePath);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        await FileVersion.deleteMany({ fileId: file._id });
        await Permission.deleteMany({ fileId: file._id });
        await file.deleteOne();

        await AuditLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          action: 'delete',
          resource: 'file',
          resourceId: file.fileId,
          details: { fileName: file.name, permanent: true }
        });
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

      res.json({ success: true, message: 'File deleted successfully' });
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

      // ALL authenticated users can restore any file (recovery from recycle bin)
      // No ownership or role restrictions - anyone can restore
      
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
      const { page = 1, limit = 20, showAll } = req.query;
      const user = req.user;
      const now = new Date();

      // Base query: only deleted files
      let query = { isDeleted: true };

      // Non-admin users can only see files within the 30-day recovery window
      // (permanentDeleteAt > now), and only their own or department files
      if (user.role !== 'admin') {
        query.$or = [
          { owner: user._id },
          { department: user.department }
        ];
        query.permanentDeleteAt = { $gt: now };
      }

      // Admin can see all deleted files (including expired) when showAll=true
      if (showAll === 'true' && user.role === 'admin') {
        delete query.permanentDeleteAt;
      }

      const files = await File.find(query)
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

      const filePath = path.join(UPLOAD_PATH, file.storagePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
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

      for (const file of expiredFiles) {
        const filePath = path.join(UPLOAD_PATH, file.storagePath);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        await FileVersion.deleteMany({ fileId: file._id });
        await Permission.deleteMany({ fileId: file._id });
        await file.deleteOne();
      }

      res.json({ 
        success: true, 
        message: `${expiredFiles.length} files permanently deleted` 
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

      const allowedLevels = user.confidentialityLevels || [];
      const fileLevel = confidentialityLevel || 'internal';
      
      if (!allowedLevels.includes(fileLevel)) {
        return res.status(403).json({ 
          success: false, 
          message: 'Not authorized to create files at this confidentiality level' 
        });
      }

      const source = uploadSource || 'scanner';
      const isScannedDoc = ['pdf', 'jpg', 'jpeg', 'png', 'tiff', 'bmp'].includes(
        path.extname(req.file.originalname).toLowerCase().replace('.', '')
      );

      const file = await File.create({
        name: req.file.originalname,
        alias: alias || req.file.originalname,
        type: path.extname(req.file.originalname).toLowerCase().replace('.', ''),
        size: req.file.size,
        owner: user._id,
        department: user.department,
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        confidentialityLevel: fileLevel,
        isScanned: isScannedDoc,
        uploadSource: source,
        storagePath: req.file.filename,
        ocrStatus: 'pending'
      });

      await FileVersion.create({
        fileId: file._id,
        versionNumber: 1,
        filePath: req.file.filename,
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

      for (const file of req.files) {
        const isScannedDoc = ['pdf', 'jpg', 'jpeg', 'png', 'tiff', 'bmp'].includes(
          path.extname(file.originalname).toLowerCase().replace('.', '')
        );

        const newFile = await File.create({
          name: file.originalname,
          alias: file.originalname,
          type: path.extname(file.originalname).toLowerCase().replace('.', ''),
          size: file.size,
          owner: user._id,
          department: user.department,
          confidentialityLevel: 'internal',
          isScanned: isScannedDoc,
          uploadSource: source,
          storagePath: file.filename,
          ocrStatus: 'pending'
        });

        await FileVersion.create({
          fileId: newFile._id,
          versionNumber: 1,
          filePath: file.filename,
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
        // Special handling for HOD trying to access highly confidential file
        if (req.user.role === 'hod' && file.confidentialityLevel === 'highly_confidential') {
          // Log restricted access attempt
          await AuditLog.create({
            userId: req.user._id,
            userEmail: req.user.email,
            action: 'restricted_access_attempt',
            resource: 'file',
            resourceId: file.fileId,
            details: {
              action: 'preview',
              fileName: file.name,
              confidentialityLevel: file.confidentialityLevel,
              restrictionReason: 'HOD attempted to preview highly confidential file'
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            ...req.auditEnhancement
          });

          return res.status(403).json({
            success: false,
            message: 'Access restricted. Highly confidential file content not available to department heads.',
            restricted: true,
            restrictionReason: 'Highly confidential file. Content access restricted for department heads.'
          });
        }

        return res.status(403).json({ success: false, message: 'No access to file contents' });
      }

      const filePath = path.join(UPLOAD_PATH, file.storagePath);
      console.log('[PREVIEW] File path:', filePath);
      
      if (!fs.existsSync(filePath)) {
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

      const contentType = mimeTypes[ext] || file.type || 'application/octet-stream';
      console.log('[PREVIEW] Content-Type:', contentType);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
      
      const fileStream = fs.createReadStream(filePath);
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
         // Special handling for HOD trying to access highly confidential file
         if (req.user.role === 'hod' && file.confidentialityLevel === 'highly_confidential') {
           // Log restricted access attempt
           await AuditLog.create({
             userId: req.user._id,
             userEmail: req.user.email,
             action: 'restricted_access_attempt',
             resource: 'file',
             resourceId: file.fileId,
             details: {
               action: 'google_preview',
               fileName: file.name,
               confidentialityLevel: file.confidentialityLevel,
               restrictionReason: 'HOD attempted to Google preview highly confidential file'
             },
             ipAddress: req.ip,
             userAgent: req.get('user-agent'),
             ...req.auditEnhancement
           });

           return res.status(403).json({
             success: false,
             message: 'Access restricted. Highly confidential file Google preview not available to department heads.',
             restricted: true,
             restrictionReason: 'Highly confidential file. Google preview restricted for department heads.'
           });
         }

         return res.status(403).json({ success: false, message: 'No access to file contents' });
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