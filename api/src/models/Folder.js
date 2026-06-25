const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  parentFolderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  department: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  confidentialityLevel: {
    type: String,
    enum: ['public', 'internal', 'confidential', 'highly_confidential'],
    default: 'internal'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isSystemFolder: {
    type: Boolean,
    default: false
  },
  path: {
    type: String,
    default: ''
  },
  level: {
    type: Number,
    default: 0
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
});

folderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

folderSchema.index({ parentFolderId: 1 });
folderSchema.index({ department: 1 });
folderSchema.index({ createdBy: 1 });
folderSchema.index({ name: 1, parentFolderId: 1, department: 1 }, { unique: true });
folderSchema.index({ isSystemFolder: 1 });
folderSchema.index({ path: 1 });
folderSchema.index({ createdAt: -1 });
folderSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('Folder', folderSchema);
