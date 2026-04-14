const File = require('../models/File');
const FileVersion = require('../models/FileVersion');
const Permission = require('../models/Permission');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const path = require('path');
const fs = require('fs');

const fileController = {
  uploadFile: async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const { alias, tags, confidentialityLevel } = req.body;
      const user = req.user;

      const allowedLevels = user.confidentialityLevels || [];
      const fileLevel = confidentialityLevel || 'internal';
      
      if (!allowedLevels.includes(fileLevel)) {
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

      const user = req.user;
      const files = [];

      for (const file of req.files) {
        const newFile = await File.create({
          name: file.originalname,
          alias: file.originalname,
          type: path.extname(file.originalname).toLowerCase().replace('.', ''),
          size: file.size,
          owner: user._id,
          department: user.department,
          confidentialityLevel: 'internal',
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

      const hasPermission = await fileController.checkAccess(file, req.user, 'download');
      if (!hasPermission && file.owner.toString() !== req.user._id.toString()) {
        if (req.user.role !== 'admin' && req.user.role !== 'hod') {
          return res.status(403).json({ success: false, message: 'No download permission' });
        }
      }

      const filePath = path.join(process.env.UPLOAD_PATH || './uploads', file.storagePath);
      
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

      const query = { isDeleted: false };
      const user = req.user;

      if (type) query.type = type;
      if (confidentiality) query.confidentialityLevel = confidentiality;
      if (owner) query.owner = owner;
      
      if (fromDate || toDate) {
        query.createdAt = {};
        if (fromDate) query.createdAt.$gte = new Date(fromDate);
        if (toDate) query.createdAt.$lte = new Date(toDate);
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { alias: { $regex: search, $options: 'i' } },
          { tags: { $in: new RegExp(search, 'i') } }
        ];
      }

      let baseQuery = { ...query };
      
      if (user.role === 'admin') {
        if (department) baseQuery.department = department;
      } else if (user.role === 'hod') {
        baseQuery.department = user.department;
        if (department && department !== user.department) {
          return res.status(403).json({ success: false, message: 'Cannot view other departments' });
        }
      } else {
        baseQuery.$or = [
          { owner: user._id }
        ];
        if (department && department !== user.department) {
          return res.status(403).json({ success: false, message: 'Cannot view other departments' });
        }
      }

      const myFiles = await File.find(baseQuery).populate('owner', 'name email');

      const sharedFiles = await Permission.find({
        userId: user._id,
        isRevoked: false,
        access: { $in: ['view', 'download', 'edit'] }
      }).populate('fileId');

      const sharedFileIds = sharedFiles.map(p => p.fileId._id);
      
      let allFiles = await File.find({
        ...baseQuery,
        _id: { $in: [...myFiles.map(f => f._id), ...sharedFileIds] }
      })
        .populate('owner', 'name email')
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 });

      if (user.role === 'user') {
        allFiles = allFiles.filter(f => {
          if (f.owner._id.toString() === user._id.toString()) return true;
          return sharedFileIds.includes(f._id.toString());
        });
      }

      const total = allFiles.length;

      res.json({
        success: true,
        data: {
          files: allFiles,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          total
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
        const filePath = path.join(process.env.UPLOAD_PATH || './uploads', file.storagePath);
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

      const isOwner = file.owner.toString() === req.user._id.toString();
      const isAdmin = req.user.role === 'admin';
      const isHod = req.user.role === 'hod' && file.department === req.user.department;
      
      if (!isOwner && !isAdmin && !isHod) {
        return res.status(403).json({ success: false, message: 'Not authorized to restore this file' });
      }

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
        details: { fileName: file.name }
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

      let query = { isDeleted: true };

      if (user.role !== 'admin') {
        query.$or = [
          { owner: user._id },
          { department: user.department }
        ];
        query.permanentDeleteAt = { $gt: now };
      }

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

      const filePath = path.join(process.env.UPLOAD_PATH || './uploads', file.storagePath);
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
        const filePath = path.join(process.env.UPLOAD_PATH || './uploads', file.storagePath);
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
      const file = await File.findOne({ fileId: req.params.fileId });
      
      if (!file || file.isDeleted) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      const hasPermission = await fileController.checkAccess(file, req.user, 'view');
      if (!hasPermission && file.owner.toString() !== req.user._id.toString()) {
        if (req.user.role !== 'admin' && req.user.role !== 'hod') {
          return res.status(403).json({ success: false, message: 'No view permission' });
        }
      }

      const filePath = path.join(process.env.UPLOAD_PATH || './uploads', file.storagePath);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'File not found on disk' });
      }

      const mimeTypes = {
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'tiff': 'image/tiff'
      };

      const contentType = mimeTypes[file.type] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      next(error);
    }
  }
};

module.exports = fileController;