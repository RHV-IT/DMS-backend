const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const pendingScanSchema = new mongoose.Schema({
  id: {
    type: String,
    default: () => uuidv4().replace(/-/g, '').toUpperCase(),
    unique: true
  },
  filePath: {
    type: String,
    required: true
  },
  // Permanent storage path (for production environments)
  permanentFilePath: {
    type: String,
    required: false
  },
  permanentFileUrl: {
    type: String,
    required: false
  },
  originalName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'uploaded', 'failed'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 72 * 60 * 60 // Auto-delete after 72 hours (TTL index)
  },
  // Optional metadata from scanner
  scannerMetadata: {
    scannerId: String,
    scannedAt: Date,
    pageCount: Number,
    resolution: String,
    colorMode: String
  },
  // Assigned to user who will confirm
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Confirmation details (set on confirm)
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  confirmedAt: Date,
  // Final file reference (after confirm)
  finalFileId: {
    type: String
  },
  // Error message if confirm failed
  errorMessage: String,
  // Original file size (for validation)
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  // Department (inherited from scanner user or assigned)
  department: {
    type: String,
    required: true
  },
  machineId: {
    type: String,
    required: true
  },
  // File fingerprint for deduplication (SHA256 hash or stable fingerprint)
  fileFingerprint: {
    type: String,
    required: true,
    index: true
  },
  // Rejection tracking
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: Date,
  rejectionReason: String,
  // Additional machine metadata
  machineMetadata: {
    machineName: String,
    hostname: String,
    localIp: String,
    os: String,
    osVersion: String
  }
});

// Indexes
pendingScanSchema.index({ status: 1, createdAt: -1 }); // For listing pending scans
pendingScanSchema.index({ assignedTo: 1 }); // For user's assigned scans
pendingScanSchema.index({ machineId: 1 }); // For machine-specific queries
pendingScanSchema.index({ machineId: 1, fileFingerprint: 1 }); // For deduplication
pendingScanSchema.index({ fileFingerprint: 1, status: 1 }); // For status-based fingerprint queries

module.exports = mongoose.model('PendingScan', pendingScanSchema);
