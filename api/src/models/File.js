const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const fileSchema = new mongoose.Schema({
  fileId: {
    type: String,
    default: () => uuidv4().replace(/-/g, '').toUpperCase(),
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  alias: {
    type: String,
    trim: true
  },
  originalFileName: {
    type: String
  },
  mimeType: {
    type: String
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Profile that uploaded this file (for multi-profile support)
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  type: {
    type: String,
    required: true
  },
  fileCategory: {
    type: String,
    enum: ['image', 'zip', 'spreadsheet', 'presentation', 'pdf', 'document', 'other'],
    default: 'other'
  },
  size: {
    type: Number,
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  department: {
    type: String,
    required: true
  },
  tags: [{
    type: String
  }],
  confidentialityLevel: {
    type: String,
    enum: ['public', 'internal', 'confidential', 'highly_confidential'],
    default: 'internal'
  },
  uploadedByDepartment: {
    type: String,
    default: null
  },
  uploadedByConfidentiality: {
    type: String,
    enum: ['public', 'internal', 'confidential', 'highly_confidential'],
    default: null
  },
  isScanned: {
    type: Boolean,
    default: false
  },
  uploadSource: {
    type: String,
    enum: ['scanner', 'manual', 'import'],
    default: 'manual'
  },
  extractedText: {
    type: String,
    default: null
  },
  ocrStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  storagePath: {
    type: String,
    required: true
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  permanentDeleteAt: {
    type: Date,
    default: null
  },
  currentVersion: {
    type: Number,
    default: 1
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

fileSchema.pre('save', function() {
  this.updatedAt = new Date();
});

fileSchema.index({ folderId: 1 });
fileSchema.index({ department: 1, createdAt: -1 });
fileSchema.index({ confidentialityLevel: 1 });
// Supports the archive scheduler/migration queries: find unarchived files for a
// given department within a date range without a full collection scan.
fileSchema.index({ folderId: 1, department: 1, createdAt: 1 });

module.exports = mongoose.model('File', fileSchema);