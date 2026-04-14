const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  groupId: {
    type: String
  },
  access: {
    type: String,
    enum: ['view', 'download', 'edit'],
    required: true
  },
  grantedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isRevoked: {
    type: Boolean,
    default: false
  },
  revokedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

permissionSchema.index({ fileId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Permission', permissionSchema);