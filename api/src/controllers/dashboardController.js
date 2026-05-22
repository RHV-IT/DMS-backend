const File = require('../models/File');
const Permission = require('../models/Permission');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { buildFileAccessQuery } = require('../utils/accessControl');

const dashboardController = {
  getStats: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const user = await User.findById(userId);
      const userRole = user.role;
      const userDepartment = user.department;

      let totalFiles;
      let recentUploads;
      let pendingShares;
      let sentShares;

      const accessQ = buildFileAccessQuery(user);
      const baseCountQ = { ...accessQ, isDeleted: { $ne: true } };
      totalFiles = await File.countDocuments(baseCountQ);
      recentUploads = await File.countDocuments({
        ...baseCountQ,
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      });
      // pending shares still permission based for now
      pendingShares = userRole === 'admin' 
        ? await Permission.countDocuments({ isRevoked: false })
        : await Permission.countDocuments({ isRevoked: false, userId });

      sentShares = await Permission.countDocuments({
        grantedBy: userId,
        isRevoked: false
      });

      const storageResult = await File.aggregate([
        { $match: userRole === 'user' ? { owner: userId, isDeleted: { $ne: true } } : (userRole === 'hod' ? { department: userDepartment, isDeleted: { $ne: true } } : { isDeleted: { $ne: true } }) },
        { $group: { _id: null, totalSize: { $sum: '$size' } } }
      ]);

      const totalSizeBytes = storageResult[0]?.totalSize || 0;
      const storageUsed = formatBytes(totalSizeBytes);

      res.json({
        success: true,
        data: {
          totalFiles,
          recentUploads,
          storageUsed,
          pendingShares,
          sentShares
        }
      });
    } catch (error) {
      next(error);
    }
  },

  getRecentFiles: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const user = await User.findById(userId);
      const userRole = user.role;
      const userDepartment = user.department;

      // STRICT + shared files
      const strictQ = buildFileAccessQuery(user);
      const myShared = await Permission.find({ userId: user._id, isRevoked: false });
      const sharedIds = myShared.map(p => p.fileId);

      let q;
      if (sharedIds.length > 0) {
        q = {
          isDeleted: { $ne: true },
          $or: [ strictQ, { _id: { $in: sharedIds } } ]
        };
      } else {
        q = { ...strictQ, isDeleted: { $ne: true } };
      }

      const files = await File.find(q)
        .populate('uploadedBy', 'name email department confidentialityLevel')
        .populate('owner', 'name email department')
        .sort({ createdAt: -1 })
        .limit(10);

      const recentFiles = files.map(file => ({
        fileId: file.fileId,
        name: file.name,
        alias: file.alias,
        type: file.type,
        size: formatBytes(file.size),
        owner: file.owner,
        confidentialityLevel: file.confidentialityLevel,
        createdAt: file.createdAt
      }));

      res.json({
        success: true,
        data: recentFiles
      });
    } catch (error) {
      next(error);
    }
  },

  getRecentActivity: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const user = await User.findById(userId);
      const userRole = user.role;

      let logs;
      if (userRole === 'admin') {
        logs = await AuditLog.find()
          .populate('userId', 'name email')
          .sort({ timestamp: -1 })
          .limit(20);
      } else {
        logs = await AuditLog.find({ userId })
          .populate('userId', 'name email')
          .sort({ timestamp: -1 })
          .limit(20);
      }

      const activities = logs.map(log => ({
        id: log._id,
        action: log.action,
        user: log.userId,
        resource: log.resource,
        resourceId: log.resourceId,
        details: log.details,
        timestamp: log.timestamp
      }));

      res.json({
        success: true,
        data: activities
      });
    } catch (error) {
      next(error);
    }
  }
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = dashboardController;