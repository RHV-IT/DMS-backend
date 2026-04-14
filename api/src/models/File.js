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
  type: {
    type: String,
    required: true
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

fileSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('File', fileSchema);