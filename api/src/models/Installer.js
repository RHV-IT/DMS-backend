const mongoose = require('mongoose');

const installerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    default: 'DMS-Scanner-Setup.exe'
  },
  version: {
    type: String,
    required: true,
    default: '1.0.0'
  },
  platform: {
    type: String,
    required: true,
    default: 'windows'
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true,
    default: 'application/octet-stream'
  },
  data: {
    type: Buffer,
    required: true
  },
  checksum: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
installerSchema.index({ isActive: 1, platform: 1, version: -1 });

installerSchema.pre('save', function() {
  this.updatedAt = new Date();
});

module.exports = mongoose.model('Installer', installerSchema);