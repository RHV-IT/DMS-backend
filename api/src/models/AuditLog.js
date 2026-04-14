const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'login',
      'logout',
      'upload',
      'download',
      'delete',
      'soft_delete',
      'restore',
      'permission_grant',
      'permission_revoke',
      'user_create',
      'user_update',
      'user_suspend',
      'user_restore',
      'file_share',
      'file_update',
      'version_create',
      'rollback'
    ]
  },
  resource: {
    type: String
  },
  resourceId: {
    type: String
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  ipAddress: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);