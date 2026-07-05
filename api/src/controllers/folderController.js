const Folder = require('../models/Folder');
const File = require('../models/File');
const AuditLog = require('../models/AuditLog');
const Permission = require('../models/Permission');
const { canViewFile, canUploadLevel, canUserManageFile } = require('../utils/accessControl');
const mongoose = require('mongoose');

const LEVEL_RANK = { public: 1, internal: 2, confidential: 3, highly_confidential: 4 };

const _enforceFolderInheritance = (fileLevel, folderLevel) => {
  if (!folderLevel) return fileLevel;
  if (LEVEL_RANK[fileLevel] < LEVEL_RANK[folderLevel]) return folderLevel;
  return fileLevel;
};

const _isDescendant = async (folderId, ancestorId) => {
  let current = await Folder.findById(ancestorId);
  while (current) {
    if (current._id.toString() === folderId.toString()) return true;
    if (!current.parentFolderId) break;
    current = await Folder.findById(current.parentFolderId);
  }
  return false;
};

const _normalizeConfidentiality = (level) => {
  const normalized = String(level || 'internal').toLowerCase().trim();
  if (normalized.includes('high')) return 'highly_confidential';
  if (normalized.includes('conf')) return 'confidential';
  if (normalized.includes('int')) return 'internal';
  return 'public';
};

const _getUserHighestLevel = (user) => {
  if (!user || !user.confidentialityLevels || !user.confidentialityLevels.length) return 'internal';
  const ranks = { public: 1, internal: 2, confidential: 3, highly_confidential: 4 };
  return [...user.confidentialityLevels].sort((a, b) => (ranks[b] || 0) - (ranks[a] || 0))[0];
};

const _cascadePaths = async (folderId) => {
  const folder = await Folder.findById(folderId);
  if (!folder) return;
  const children = await Folder.find({ parentFolderId: folderId, isDeleted: { $ne: true } });
  for (const child of children) {
    child.path = `${folder.path}/${child.name}`;
    child.level = folder.level + 1;
    await child.save();
    await _cascadePaths(child._id);
  }
};

const _getFolderStats = async (folderId) => {
  let totalFiles = 0;
  let totalFolders = 0;
  let totalSize = 0;

  const directFiles = await File.find({ folderId, isDeleted: { $ne: true } }).select('size');
  totalFiles += directFiles.length;
  totalSize += directFiles.reduce((sum, f) => sum + (f.size || 0), 0);

  const childFolders = await Folder.find({ parentFolderId: folderId, isDeleted: { $ne: true } });
  totalFolders += childFolders.length;

  for (const child of childFolders) {
    const childStats = await _getFolderStats(child._id);
    totalFiles += childStats.totalFiles;
    totalFolders += childStats.totalFolders;
    totalSize += childStats.totalSize;
  }

  return { totalFiles, totalFolders, totalSize };
};

const folderController = {
  createFolder: async (req, res, next) => {
    try {
      const { name, description, parentFolderId, confidentialityLevel } = req.body;
      const user = req.user;

      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Folder name is required' });
      }

      let level = 0;
      let folderPath = `/${name.trim()}`;

      if (parentFolderId) {
        const parentFolder = await Folder.findOne({ _id: parentFolderId, isDeleted: { $ne: true } });
        if (!parentFolder) {
          return res.status(404).json({ success: false, message: 'Parent folder not found' });
        }
        if (parentFolder.department !== user.department && user.role !== 'admin') {
          return res.status(403).json({ success: false, message: 'Cannot create folder in another department' });
        }
        level = parentFolder.level + 1;
        folderPath = `${parentFolder.path}/${name.trim()}`;
      }

      const existingFolder = await Folder.findOne({
        name: name.trim(),
        parentFolderId: parentFolderId || null,
        department: user.department,
        isDeleted: { $ne: true }
      });

      if (existingFolder) {
        return res.status(409).json({ success: false, message: 'A folder with this name already exists at this level' });
      }

      const folderLevel = _normalizeConfidentiality(confidentialityLevel);

      if (!canUploadLevel(user, folderLevel)) {
        return res.status(403).json({ success: false, message: 'You are not authorized to create folders with this confidentiality level' });
      }

      const folder = await Folder.create({
        name: name.trim(),
        description: description || '',
        parentFolderId: parentFolderId || null,
        department: user.department,
        confidentialityLevel: folderLevel,
        createdBy: user._id,
        path: folderPath,
        level
      });

      try {
        await AuditLog.create({
          userId: user._id,
          userEmail: user.email,
          action: 'create_folder',
          resource: 'folder',
          resourceId: folder._id,
          details: { folderName: folder.name, path: folder.path },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
      } catch (auditError) {
        console.error('Failed to write audit log for create_folder:', auditError.message);
      }

      res.status(201).json({ success: true, data: folder });
    } catch (error) {
      next(error);
    }
  },

  getFolders: async (req, res, next) => {
    try {
      const { parentFolderId, search, department, confidentialityLevel, page = 1, limit = 50 } = req.query;
      const user = req.user;

      let query = { isDeleted: { $ne: true } };

      if (parentFolderId) {
        if (parentFolderId === 'root') {
          query.parentFolderId = null;
        } else {
          query.parentFolderId = parentFolderId;
        }
      } else {
        query.parentFolderId = null;
      }

      if (user.role !== 'admin') {
        query.department = user.department;
      } else if (department) {
        query.department = department;
      }

      if (search) {
        query.name = { $regex: search, $options: 'i' };
      }

      if (confidentialityLevel) {
        query.confidentialityLevel = confidentialityLevel;
      }

      const folders = await Folder.find(query)
        .populate('createdBy', 'name email')
        .sort({ isSystemFolder: 1, name: 1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await Folder.countDocuments(query);

      res.json({
        success: true,
        data: {
          folders,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          total
        }
      });
    } catch (error) {
      next(error);
    }
  },

  getFolder: async (req, res, next) => {
    try {
      const folder = await Folder.findOne({ _id: req.params.folderId, isDeleted: { $ne: true } })
        .populate('createdBy', 'name email')
        .populate('parentFolderId', 'name path');

      if (!folder) {
        return res.status(404).json({ success: false, message: 'Folder not found' });
      }

      const user = req.user;
      if (user.role !== 'admin' && folder.department !== user.department) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const childFolders = await Folder.find({ parentFolderId: folder._id, isDeleted: { $ne: true } })
        .sort({ name: 1 });
      const files = await File.find({ folderId: folder._id, isDeleted: { $ne: true } })
        .populate('uploadedBy', 'name email')
        .sort({ createdAt: -1 });

      const stats = await _getFolderStats(folder._id);

      res.json({
        success: true,
        data: {
          folder,
          childFolders,
          files,
          stats
        }
      });
    } catch (error) {
      next(error);
    }
  },

  updateFolder: async (req, res, next) => {
    try {
      const folder = await Folder.findOne({ _id: req.params.folderId, isDeleted: { $ne: true } });

      if (!folder) {
        return res.status(404).json({ success: false, message: 'Folder not found' });
      }

      if (folder.isSystemFolder) {
        return res.status(400).json({ success: false, message: 'System folders cannot be modified' });
      }

      const user = req.user;
      if (user.role !== 'admin' && folder.createdBy.toString() !== user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Only the creator or admin can update this folder' });
      }

      const { name, description, confidentialityLevel } = req.body;
      const oldName = folder.name;

      if (name && name.trim() && name.trim() !== folder.name) {
        const existingFolder = await Folder.findOne({
          name: name.trim(),
          parentFolderId: folder.parentFolderId,
          department: folder.department,
          isDeleted: { $ne: true },
          _id: { $ne: folder._id }
        });

        if (existingFolder) {
          return res.status(409).json({ success: false, message: 'A folder with this name already exists at this level' });
        }

        folder.name = name.trim();

        if (folder.parentFolderId) {
          const parent = await Folder.findById(folder.parentFolderId);
          folder.path = `${parent.path}/${name.trim()}`;
        } else {
          folder.path = `/${name.trim()}`;
        }

        await folder.save();
        await _cascadePaths(folder._id);
      }

      if (description !== undefined) folder.description = description;

      if (confidentialityLevel) {
        const folderLevel = _normalizeConfidentiality(confidentialityLevel);
        if (!canUploadLevel(user, folderLevel)) {
          return res.status(403).json({ success: false, message: 'You are not authorized to set this confidentiality level' });
        }
        folder.confidentialityLevel = folderLevel;
      }

      await folder.save();

      try {
        await AuditLog.create({
          userId: user._id,
          userEmail: user.email,
          action: name && name.trim() !== oldName ? 'rename_folder' : 'update_folder',
          resource: 'folder',
          resourceId: folder._id,
          details: {
            folderName: folder.name,
            oldName,
            path: folder.path
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
      } catch (auditError) {
        console.error('Failed to write audit log for update_folder:', auditError.message);
      }

      res.json({ success: true, data: folder });
    } catch (error) {
      next(error);
    }
  },

  deleteFolder: async (req, res, next) => {
    try {
      const folder = await Folder.findOne({ _id: req.params.folderId, isDeleted: { $ne: true } });

      if (!folder) {
        return res.status(404).json({ success: false, message: 'Folder not found' });
      }

      if (folder.isSystemFolder) {
        return res.status(400).json({ success: false, message: 'System folders cannot be deleted' });
      }

      const user = req.user;
      if (user.role !== 'admin' && folder.createdBy.toString() !== user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Only the creator or admin can delete this folder' });
      }

      const now = new Date();
      folder.isDeleted = true;
      folder.deletedAt = now;
      folder.deletedBy = user._id;
      await folder.save();

      const _softDeleteDescendants = async (parentId) => {
        const children = await Folder.find({ parentFolderId: parentId, isDeleted: { $ne: true } });
        for (const child of children) {
          child.isDeleted = true;
          child.deletedAt = now;
          child.deletedBy = user._id;
          await child.save();
          await _softDeleteDescendants(child._id);
        }

        const files = await File.find({ folderId: parentId, isDeleted: { $ne: true } });
        for (const file of files) {
          file.isDeleted = true;
          file.deletedAt = now;
          file.deletedBy = user._id;
          const deleteAfter30Days = new Date(now);
          deleteAfter30Days.setDate(deleteAfter30Days.getDate() + 30);
          file.permanentDeleteAt = deleteAfter30Days;
          await file.save();
        }
      };

      await _softDeleteDescendants(folder._id);

      try {
        await AuditLog.create({
          userId: user._id,
          userEmail: user.email,
          action: 'delete_folder',
          resource: 'folder',
          resourceId: folder._id,
          details: { folderName: folder.name, path: folder.path },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
      } catch (auditError) {
        console.error('Failed to write audit log for delete_folder:', auditError.message);
      }

      res.json({ success: true, message: 'Folder moved to recycle bin' });
    } catch (error) {
      next(error);
    }
  },

  restoreFolder: async (req, res, next) => {
    try {
      const folder = await Folder.findOne({ _id: req.params.folderId, isDeleted: true });

      if (!folder) {
        return res.status(404).json({ success: false, message: 'Deleted folder not found' });
      }

      const user = req.user;
      if (user.role !== 'admin' && folder.createdBy.toString() !== user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Only the creator or admin can restore this folder' });
      }

      folder.isDeleted = false;
      folder.deletedAt = null;
      folder.deletedBy = null;
      await folder.save();

      const _restoreDescendants = async (parentId) => {
        const children = await Folder.find({ parentFolderId: parentId, isDeleted: true });
        for (const child of children) {
          child.isDeleted = false;
          child.deletedAt = null;
          child.deletedBy = null;
          await child.save();
          await _restoreDescendants(child._id);
        }

        const files = await File.find({ folderId: parentId, isDeleted: true });
        for (const file of files) {
          file.isDeleted = false;
          file.deletedAt = null;
          file.deletedBy = null;
          file.permanentDeleteAt = null;
          await file.save();
        }
      };

      await _restoreDescendants(folder._id);

      try {
        await AuditLog.create({
          userId: user._id,
          userEmail: user.email,
          action: 'restore_folder',
          resource: 'folder',
          resourceId: folder._id,
          details: { folderName: folder.name, path: folder.path },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
      } catch (auditError) {
        console.error('Failed to write audit log for restore_folder:', auditError.message);
      }

      res.json({ success: true, message: 'Folder restored successfully', data: folder });
    } catch (error) {
      next(error);
    }
  },

  getDeletedFolders: async (req, res, next) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const user = req.user;

      const query = { isDeleted: true };
      if (user.role !== 'admin') {
        query.department = user.department;
        query.createdBy = user._id;
      }

      const folders = await Folder.find(query)
        .populate('createdBy', 'name email')
        .populate('deletedBy', 'name email')
        .sort({ deletedAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await Folder.countDocuments(query);

      res.json({
        success: true,
        data: {
          folders,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          total
        }
      });
    } catch (error) {
      next(error);
    }
  },

  moveFile: async (req, res, next) => {
    try {
      const { fileId, targetFolderId } = req.body;
      const user = req.user;

      if (!fileId) {
        return res.status(400).json({ success: false, message: 'fileId is required' });
      }

      const file = await File.findOne({ fileId });
      if (!file || file.isDeleted) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      const filePermissions = await Permission.find({ fileId: file._id, isRevoked: false });
      if (!canUserManageFile(user, file, filePermissions)) {
        return res.status(403).json({ success: false, message: 'You do not have permission to move this file' });
      }

      if (targetFolderId) {
        const targetFolder = await Folder.findOne({ _id: targetFolderId, isDeleted: { $ne: true } });
        if (!targetFolder) {
          return res.status(404).json({ success: false, message: 'Target folder not found' });
        }
        if (user.role !== 'admin' && targetFolder.department !== user.department) {
          return res.status(403).json({ success: false, message: 'Cannot move file to another department' });
        }

        file.confidentialityLevel = _enforceFolderInheritance(file.confidentialityLevel, targetFolder.confidentialityLevel);
      }

      const oldFolderId = file.folderId;
      file.folderId = targetFolderId || null;
      await file.save();

      try {
        await AuditLog.create({
          userId: user._id,
          userEmail: user.email,
          action: 'move_file',
          resource: 'file',
          resourceId: file.fileId,
          details: {
            fileName: file.name,
            fromFolderId: oldFolderId,
            toFolderId: targetFolderId || null
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
      } catch (auditError) {
        console.error('Failed to write audit log for move_file:', auditError.message);
      }

      res.json({ success: true, data: file, message: 'File moved successfully' });
    } catch (error) {
      next(error);
    }
  },

  bulkMoveFiles: async (req, res, next) => {
    try {
      const { fileIds, targetFolderId } = req.body;
      const user = req.user;

      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ success: false, message: 'fileIds array is required' });
      }

      let targetFolder = null;
      if (targetFolderId) {
        targetFolder = await Folder.findOne({ _id: targetFolderId, isDeleted: { $ne: true } });
        if (!targetFolder) {
          return res.status(404).json({ success: false, message: 'Target folder not found' });
        }
        if (user.role !== 'admin' && targetFolder.department !== user.department) {
          return res.status(403).json({ success: false, message: 'Cannot move files to another department' });
        }
      }

      const files = await File.find({ fileId: { $in: fileIds }, isDeleted: { $ne: true } });
      const moved = [];
      const errors = [];

      for (const file of files) {
        const filePermissions = await Permission.find({ fileId: file._id, isRevoked: false });
        if (!canUserManageFile(user, file, filePermissions)) {
          errors.push({ fileId: file.fileId, message: 'Permission denied' });
          continue;
        }
        if (targetFolder) {
          file.confidentialityLevel = _enforceFolderInheritance(file.confidentialityLevel, targetFolder.confidentialityLevel);
        }
        const oldFolderId = file.folderId;
        file.folderId = targetFolderId || null;
        await file.save();
        moved.push(file.fileId);
      }

      if (moved.length > 0) {
        try {
          await AuditLog.create({
            userId: user._id,
            userEmail: user.email,
            action: 'bulk_move_file',
            resource: 'file',
            details: { movedCount: moved.length, targetFolderId: targetFolderId || null },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          });
        } catch (auditError) {
          console.error('Failed to write audit log for bulk_move_file:', auditError.message);
        }
      }

      res.json({
        success: true,
        data: { moved, errors },
        message: `${moved.length} files moved successfully`
      });
    } catch (error) {
      next(error);
    }
  },

  copyFile: async (req, res, next) => {
    try {
      const { fileId, targetFolderId } = req.body;
      const user = req.user;

      if (!fileId) {
        return res.status(400).json({ success: false, message: 'fileId is required' });
      }

      const file = await File.findOne({ fileId });
      if (!file || file.isDeleted) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      const filePermissions = await Permission.find({ fileId: file._id, isRevoked: false });
      if (!canViewFile(user, file, filePermissions)) {
        return res.status(403).json({ success: false, message: 'You do not have permission to copy this file' });
      }

      let targetFolder = null;
      if (targetFolderId) {
        targetFolder = await Folder.findOne({ _id: targetFolderId, isDeleted: { $ne: true } });
        if (!targetFolder) {
          return res.status(404).json({ success: false, message: 'Target folder not found' });
        }
        if (user.role !== 'admin' && targetFolder.department !== user.department) {
          return res.status(403).json({ success: false, message: 'Cannot copy file to another department' });
        }
      }

      const newFile = await File.create({
        name: file.name,
        originalFileName: file.originalFileName,
        alias: file.alias,
        type: file.type,
        fileCategory: file.fileCategory,
        size: file.size,
        owner: user._id,
        uploadedBy: user._id,
        profileId: user.profileId || null,
        department: targetFolder ? targetFolder.department : file.department,
        uploadedByDepartment: user.department,
        uploadedByConfidentiality: _getUserHighestLevel(user),
        tags: file.tags,
        confidentialityLevel: _enforceFolderInheritance(file.confidentialityLevel, targetFolder ? targetFolder.confidentialityLevel : null),
        mimeType: file.mimeType,
        isScanned: file.isScanned,
        uploadSource: 'import',
        storagePath: file.storagePath,
        folderId: targetFolderId || null
      });

      await require('../models/FileVersion').create({
        fileId: newFile._id,
        versionNumber: 1,
        filePath: file.storagePath,
        size: file.size,
        uploadedBy: user._id
      });

      try {
        await AuditLog.create({
          userId: user._id,
          userEmail: user.email,
          action: 'copy_file',
          resource: 'file',
          resourceId: newFile.fileId,
          details: {
            fileName: newFile.name,
            copiedFrom: file.fileId,
            toFolderId: targetFolderId || null
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
      } catch (auditError) {
        console.error('Failed to write audit log for copy_file:', auditError.message);
      }

      res.status(201).json({ success: true, data: newFile, message: 'File copied successfully' });
    } catch (error) {
      next(error);
    }
  },

  moveFolder: async (req, res, next) => {
    try {
      const { folderId, targetFolderId } = req.body;
      const user = req.user;

      if (!folderId) {
        return res.status(400).json({ success: false, message: 'folderId is required' });
      }

      const folder = await Folder.findOne({ _id: folderId, isDeleted: { $ne: true } });
      if (!folder) {
        return res.status(404).json({ success: false, message: 'Folder not found' });
      }

      if (folder.isSystemFolder) {
        return res.status(400).json({ success: false, message: 'System folders cannot be moved' });
      }

      if (user.role !== 'admin' && folder.createdBy.toString() !== user._id.toString()) {
        return res.status(403).json({ success: false, message: 'You do not have permission to move this folder' });
      }

      if (targetFolderId) {
        if (targetFolderId.toString() === folderId.toString()) {
          return res.status(400).json({ success: false, message: 'Cannot move folder into itself or its descendants.' });
        }

        const targetFolder = await Folder.findOne({ _id: targetFolderId, isDeleted: { $ne: true } });
        if (!targetFolder) {
          return res.status(404).json({ success: false, message: 'Target folder not found' });
        }

        if (user.role !== 'admin' && targetFolder.department !== user.department) {
          return res.status(403).json({ success: false, message: 'Cannot move folder to another department' });
        }

        const isDesc = await _isDescendant(folderId, targetFolderId);
        if (isDesc) {
          return res.status(400).json({ success: false, message: 'Cannot move folder into itself or its descendants.' });
        }
      }

      const oldParentId = folder.parentFolderId;
      const oldPath = folder.path;
      folder.parentFolderId = targetFolderId || null;

      if (targetFolderId) {
        const targetFolder = await Folder.findById(targetFolderId);
        folder.path = `${targetFolder.path}/${folder.name}`;
        folder.level = targetFolder.level + 1;
      } else {
        folder.path = `/${folder.name}`;
        folder.level = 0;
      }

      await folder.save();
      await _cascadePaths(folder._id);

      try {
        await AuditLog.create({
          userId: user._id,
          userEmail: user.email,
          action: 'move_folder',
          resource: 'folder',
          resourceId: folder._id,
          details: {
            folderName: folder.name,
            fromPath: oldPath,
            toPath: folder.path,
            fromParentId: oldParentId,
            toParentId: targetFolderId || null
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
      } catch (auditError) {
        console.error('Failed to write audit log for move_folder:', auditError.message);
      }

      res.json({ success: true, data: folder, message: 'Folder moved successfully' });
    } catch (error) {
      next(error);
    }
  },

  copyFolder: async (req, res, next) => {
    try {
      const { folderId, targetFolderId } = req.body;
      const user = req.user;

      if (!folderId) {
        return res.status(400).json({ success: false, message: 'folderId is required' });
      }

      const sourceFolder = await Folder.findOne({ _id: folderId, isDeleted: { $ne: true } });
      if (!sourceFolder) {
        return res.status(404).json({ success: false, message: 'Source folder not found' });
      }

      if (sourceFolder.isSystemFolder) {
        return res.status(400).json({ success: false, message: 'System folders cannot be copied' });
      }

      if (user.role !== 'admin' && sourceFolder.department !== user.department) {
        return res.status(403).json({ success: false, message: 'Cannot copy folder from another department' });
      }

      if (targetFolderId) {
        const targetFolder = await Folder.findOne({ _id: targetFolderId, isDeleted: { $ne: true } });
        if (!targetFolder) {
          return res.status(404).json({ success: false, message: 'Target folder not found' });
        }
        if (user.role !== 'admin' && targetFolder.department !== user.department) {
          return res.status(403).json({ success: false, message: 'Cannot copy folder to another department' });
        }
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const newFolder = await folderController._copyFolderRecursive(sourceFolder, targetFolderId || null, user, session);
        await session.commitTransaction();

        try {
          await AuditLog.create({
            userId: user._id,
            userEmail: user.email,
            action: 'copy_folder',
            resource: 'folder',
            resourceId: newFolder._id,
            details: {
              folderName: newFolder.name,
              copiedFrom: folderId,
              toParentId: targetFolderId || null
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          });
        } catch (auditError) {
          console.error('Failed to write audit log for copy_folder:', auditError.message);
        }

        res.status(201).json({ success: true, data: newFolder, message: 'Folder copied successfully' });
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    } catch (error) {
      next(error);
    }
  },

  _copyFolderRecursive: async (sourceFolder, newParentId, user, session) => {
    let folderPath = `/${sourceFolder.name}`;
    let level = 0;
    if (newParentId) {
      const parent = await Folder.findById(newParentId);
      folderPath = `${parent.path}/${sourceFolder.name}`;
      level = parent.level + 1;
    }

    const [newFolder] = await Folder.create([{
      name: sourceFolder.name,
      description: sourceFolder.description,
      parentFolderId: newParentId,
      department: sourceFolder.department,
      confidentialityLevel: sourceFolder.confidentialityLevel,
      createdBy: user._id,
      isSystemFolder: false,
      path: folderPath,
      level
    }], { session });

    const files = await File.find({ folderId: sourceFolder._id, isDeleted: { $ne: true } });
    for (const file of files) {
      const [newFile] = await File.create([{
        name: file.name,
        originalFileName: file.originalFileName,
        alias: file.alias,
        type: file.type,
        fileCategory: file.fileCategory,
        size: file.size,
        owner: user._id,
        uploadedBy: user._id,
        profileId: user.profileId || null,
        department: file.department,
        uploadedByDepartment: user.department,
        uploadedByConfidentiality: _getUserHighestLevel(user),
        tags: file.tags,
        confidentialityLevel: _enforceFolderInheritance(file.confidentialityLevel, newFolder.confidentialityLevel),
        mimeType: file.mimeType,
        isScanned: file.isScanned,
        uploadSource: 'import',
        storagePath: file.storagePath,
        folderId: newFolder._id
      }], { session });

      await require('../models/FileVersion').create([{
        fileId: newFile._id,
        versionNumber: 1,
        filePath: file.storagePath,
        size: file.size,
        uploadedBy: user._id
      }], { session });
    }

    const childFolders = await Folder.find({ parentFolderId: sourceFolder._id, isDeleted: { $ne: true } });
    for (const child of childFolders) {
      await folderController._copyFolderRecursive(child, newFolder._id, user, session);
    }

    return newFolder;
  },

  bulkDeleteFolders: async (req, res, next) => {
    try {
      const { folderIds } = req.body;
      const user = req.user;

      if (!folderIds || !Array.isArray(folderIds) || folderIds.length === 0) {
        return res.status(400).json({ success: false, message: 'folderIds array is required' });
      }

      const now = new Date();
      const deleted = [];
      const errors = [];

      for (const folderId of folderIds) {
        const folder = await Folder.findOne({ _id: folderId, isDeleted: { $ne: true } });
        if (!folder) {
          errors.push({ folderId, message: 'Folder not found' });
          continue;
        }
        if (folder.isSystemFolder) {
          errors.push({ folderId, message: 'System folders cannot be deleted' });
          continue;
        }
        if (user.role !== 'admin' && folder.createdBy.toString() !== user._id.toString()) {
          errors.push({ folderId, message: 'Permission denied' });
          continue;
        }

        folder.isDeleted = true;
        folder.deletedAt = now;
        folder.deletedBy = user._id;
        await folder.save();

        const _softDeleteDescendants = async (parentId) => {
          const children = await Folder.find({ parentFolderId: parentId, isDeleted: { $ne: true } });
          for (const child of children) {
            child.isDeleted = true;
            child.deletedAt = now;
            child.deletedBy = user._id;
            await child.save();
            await _softDeleteDescendants(child._id);
          }
          const files = await File.find({ folderId: parentId, isDeleted: { $ne: true } });
          for (const file of files) {
            file.isDeleted = true;
            file.deletedAt = now;
            file.deletedBy = user._id;
            const deleteAfter30Days = new Date(now);
            deleteAfter30Days.setDate(deleteAfter30Days.getDate() + 30);
            file.permanentDeleteAt = deleteAfter30Days;
            await file.save();
          }
        };

        await _softDeleteDescendants(folder._id);
        deleted.push(folderId);
      }

      if (deleted.length > 0) {
        try {
          await AuditLog.create({
            userId: user._id,
            userEmail: user.email,
            action: 'bulk_delete_folder',
            resource: 'folder',
            details: { deletedCount: deleted.length },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          });
        } catch (auditError) {
          console.error('Failed to write audit log for bulk_delete_folder:', auditError.message);
        }
      }

      res.json({
        success: true,
        data: { deleted, errors },
        message: `${deleted.length} folders moved to recycle bin`
      });
    } catch (error) {
      next(error);
    }
  },

  bulkDeleteFiles: async (req, res, next) => {
    try {
      const { fileIds } = req.body;
      const user = req.user;

      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ success: false, message: 'fileIds array is required' });
      }

      const now = new Date();
      const deleted = [];
      const errors = [];

      const files = await File.find({ fileId: { $in: fileIds }, isDeleted: { $ne: true } });

      for (const file of files) {
        const isOwner = file.owner && file.owner.toString() === user._id.toString();
        const isAdmin = user.role === 'admin';
        const isHod = user.role === 'hod' && file.department === user.department;

        if (!isOwner && !isAdmin && !isHod) {
          errors.push({ fileId: file.fileId, message: 'Permission denied' });
          continue;
        }

        const deleteAfter30Days = new Date(now);
        deleteAfter30Days.setDate(deleteAfter30Days.getDate() + 30);
        file.isDeleted = true;
        file.deletedAt = now;
        file.deletedBy = user._id;
        file.permanentDeleteAt = deleteAfter30Days;
        await file.save();
        deleted.push(file.fileId);
      }

      if (deleted.length > 0) {
        try {
          await AuditLog.create({
            userId: user._id,
            userEmail: user.email,
            action: 'bulk_delete_file',
            resource: 'file',
            details: { deletedCount: deleted.length },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          });
        } catch (auditError) {
          console.error('Failed to write audit log for bulk_delete_file:', auditError.message);
        }
      }

      res.json({
        success: true,
        data: { deleted, errors },
        message: `${deleted.length} files moved to recycle bin`
      });
    } catch (error) {
      next(error);
    }
  },

  getFolderTree: async (req, res, next) => {
    try {
      const { department } = req.query;
      const user = req.user;

      let deptFilter = user.department;
      if (user.role === 'admin' && department) {
        deptFilter = department;
      }

      const rootFolders = await Folder.find({
        parentFolderId: null,
        department: deptFilter,
        isDeleted: { $ne: true }
      }).sort({ name: 1 });

      const buildTree = async (folder) => {
        const children = await Folder.find({
          parentFolderId: folder._id,
          isDeleted: { $ne: true }
        }).sort({ name: 1 });

        const childTrees = await Promise.all(children.map(buildTree));

        const stats = await _getFolderStats(folder._id);

        return {
          ...folder.toObject(),
          children: childTrees,
          stats
        };
      };

      const tree = await Promise.all(rootFolders.map(buildTree));

      res.json({ success: true, data: tree });
    } catch (error) {
      next(error);
    }
  },

  getFolderStats: async (req, res, next) => {
    try {
      const folder = await Folder.findOne({ _id: req.params.folderId, isDeleted: { $ne: true } });
      if (!folder) {
        return res.status(404).json({ success: false, message: 'Folder not found' });
      }

      const user = req.user;
      if (user.role !== 'admin' && folder.department !== user.department) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const stats = await _getFolderStats(folder._id);
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = folderController;
