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
      'rollback',
      'profile_update',
      'password_change',
      'failed_login',
      'session_expired',
      'archive_view',
      'restricted_access_attempt',
      'admin_sensitive_access'
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
  ipAddress: {
    type: String
  },
  location: {
    country: String,
    region: String,
    city: String,
    timezone: String,
    isp: String,
    latitude: Number,
    longitude: Number
  },
  machine: {
    machineId: String,
    machineName: String,
    hostname: String,
    localIp: String,
    publicIp: String
  },
  scanner: {
    source: String,
    uploadMethod: String
  },
  device: {
    browser: String,
    browserVersion: String,
    os: String,
    osVersion: String,
    deviceType: String,
    deviceName: String,
    userAgent: String,
    screenResolution: String,
    language: String,
    platform: String
  },
  sessionId: String,
  systemName: String,
  systemSpec: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ ipAddress: 1 });
auditLogSchema.index({ systemName: 1 });
auditLogSchema.index({ systemSpec: 1 });
auditLogSchema.index({ 'machine.machineId': 1 });
auditLogSchema.index({ 'machine.hostname': 1 });
auditLogSchema.index({ 'location.country': 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);