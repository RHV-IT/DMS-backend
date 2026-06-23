const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  department: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  confidentialityLevels: [{
    type: String,
    enum: ['public', 'internal', 'confidential', 'highly_confidential']
  }],
  isPrimary: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
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

userProfileSchema.index({ userId: 1, department: 1 }, { unique: true });

userProfileSchema.pre('save', function() {
  this.updatedAt = new Date();
});

module.exports = mongoose.model('UserProfile', userProfileSchema);