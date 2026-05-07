const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  machineId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  machineName: {
    type: String,
    required: true
  },
  hostname: {
    type: String,
    required: true
  },
  os: {
    type: String,
    required: true
  },
  osVersion: {
    type: String,
    required: true
  },
  agentVersion: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  department: {
    type: String,
    required: true
  },
  installationStatus: {
    type: String,
    enum: ['installing', 'installed', 'failed'],
    default: 'installing'
  },
  onlineStatus: {
    type: String,
    enum: ['online', 'offline'],
    default: 'online'
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  installedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update lastActive on save
agentSchema.pre('save', function(next) {
  this.lastActive = new Date();
  next();
});

module.exports = mongoose.model('Agent', agentSchema);