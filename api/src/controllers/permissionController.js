const Permission = require('../models/Permission');
const File = require('../models/File');
const Notification = require('../models/Notification');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const permissionController = {
  grantPermission: async (req, res, next) => {
    try {
      const { userId, access } = req.body;
      const { fileId } = req.params;

      const file = await File.findOne({ fileId });
      if (!file || file.isDeleted) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      const isOwner = file.owner.toString() === req.user._id.toString();
      if (!isOwner && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only owner can grant permissions' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const existing = await Permission.findOne({
        fileId: file._id,
        userId
      });

      if (existing && !existing.isRevoked) {
        existing.access = access;
        await existing.save();
      } else {
        await Permission.create({
          fileId: file._id,
          userId,
          access,
          grantedBy: req.user._id
        });
      }

      await Notification.create({
        userId,
        message: `You have been granted ${access} access to file "${file.name}"`,
        type: 'file_shared',
        resourceId: file.fileId
      });

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'permission_grant',
        resource: 'permission',
        resourceId: file.fileId,
        details: { grantedTo: user.email, access }
      });

      res.json({ success: true, message: 'Permission granted successfully' });
    } catch (error) {
      next(error);
    }
  },

  revokePermission: async (req, res, next) => {
    try {
      const { permissionId } = req.params;

      const permission = await Permission.findById(permissionId);
      if (!permission) {
        return res.status(404).json({ success: false, message: 'Permission not found' });
      }

      const file = await File.findById(permission.fileId);
      const isOwner = file.owner.toString() === req.user._id.toString();
      
      if (!isOwner && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only owner can revoke permissions' });
      }

      permission.isRevoked = true;
      permission.revokedAt = new Date();
      await permission.save();

      await Notification.create({
        userId: permission.userId,
        message: `Your access to file "${file.name}" has been revoked`,
        type: 'access_revoked',
        resourceId: file.fileId
      });

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'permission_revoke',
        resource: 'permission',
        resourceId: file.fileId
      });

      res.json({ success: true, message: 'Permission revoked successfully' });
    } catch (error) {
      next(error);
    }
  },

  getFilePermissions: async (req, res, next) => {
    try {
      const { fileId } = req.params;

      const file = await File.findOne({ fileId });
      if (!file) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      const permissions = await Permission.find({ fileId: file._id })
        .populate('userId', 'name email');

      res.json({ success: true, data: permissions });
    } catch (error) {
      next(error);
    }
  },

  getUserPermissions: async (req, res, next) => {
    try {
      const permissions = await Permission.find({ 
        userId: req.user._id, 
        isRevoked: false 
      }).populate('fileId');

      res.json({ success: true, data: permissions });
    } catch (error) {
      next(error);
    }
  },

  hodOverride: async (req, res, next) => {
    try {
      const { fileId, userId, access } = req.body;
      
      if (req.user.role !== 'hod' && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Only HOD can use override' 
        });
      }

      const user = await User.findById(userId);
      const targetUserDept = user?.department;
      const currentUserDept = req.user.department;

      if (targetUserDept !== currentUserDept && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'HOD can only override within their department' 
        });
      }

      const file = await File.findOne({ fileId });
      if (!file) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      const existing = await Permission.findOne({ fileId: file._id, userId });
      
      if (existing) {
        existing.access = access;
        existing.isRevoked = false;
        await existing.save();
      } else {
        await Permission.create({
          fileId: file._id,
          userId,
          access,
          grantedBy: req.user._id
        });
      }

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'permission_grant',
        resource: 'permission',
        resourceId: file.fileId,
        details: { action: 'hod_override', access }
      });

      res.json({ success: true, message: 'HOD override applied' });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = permissionController;