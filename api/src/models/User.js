const mongoose = require('mongoose');
// const bcrypt = require('bcrypt');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 3
  },
  role: {
    type: String,
    enum: ['admin', 'hod', 'user'],
    default: 'user'
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active'
  },
  deletedAt: {
    type: Date,
    default: null
  },
  // DEPRECATED: single level kept for DB backward compat only. DO NOT USE for permissions.
  // Source of truth is confidentialityLevels array only.
  confidentialityLevel: {
    type: String,
    enum: ['public', 'internal', 'confidential', 'highly_confidential'],
    default: undefined
  },
  confidentialityLevels: [{
    type: String,
    enum: ['public', 'internal', 'confidential', 'highly_confidential']
  }],
  passwordHistory: [{
    password: String,
    changedAt: Date
  }],
  passwordLastChanged: {
    type: Date,
    default: Date.now
  },
  loginCount: {
    type: Number,
    default: 0
  },
  refreshToken: String,
  // Agent health tracking
  lastAgentHeartbeat: {
    type: Date,
    default: null
  },
  machineName: {
    type: String,
    default: null
  },
  agentVersion: {
    type: String,
    default: null
  },
  agentConnected: {
    type: Boolean,
    default: false
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

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  this.updatedAt = new Date();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isPasswordUsedBefore = async function (newPassword) {
  const history = this.passwordHistory || [];
  for (const entry of history) {
    if (await bcrypt.compare(newPassword, entry.password)) {
      return true;
    }
  }
  return false;
};

userSchema.methods.addToPasswordHistory = async function () {
  const historyLimit = parseInt(process.env.PASSWORD_HISTORY_LIMIT) || 5;
  let history = this.passwordHistory || [];
  history.unshift({
    password: this.password,
    changedAt: new Date()
  });
  if (history.length > historyLimit) {
    history = history.slice(0, historyLimit);
  }
  this.passwordHistory = history;
  this.passwordLastChanged = new Date();
};

userSchema.methods.getConfidentialityLevel = function () {
  // ONLY use array - singular is deprecated and never used for permissions
  if (Array.isArray(this.confidentialityLevels) && this.confidentialityLevels.length > 0) {
    const ranks = { public: 1, internal: 2, confidential: 3, highly_confidential: 4 };
    const sorted = [...this.confidentialityLevels].sort((a, b) => (ranks[b] || 0) - (ranks[a] || 0));
    return sorted[0];
  }
  return 'public';
};

/**
 * Normalize confidentiality data:
 * - Ensure admins always have full access array
 * - Ensure the array's highest level is reflected in singular
 * - This fixes historical clashes
 */
userSchema.methods.normalizeConfidentiality = async function () {
  const levelOrder = ['public', 'internal', 'confidential', 'highly_confidential'];
  let changed = false;

  // If admin or hod, force full access array ONLY (no singular overwrite)
  if (this.role === 'admin' || this.role === 'hod') {
    if (!Array.isArray(this.confidentialityLevels) || this.confidentialityLevels.length !== levelOrder.length) {
      this.confidentialityLevels = levelOrder;
      changed = true;
    }
  } else {
    // For normal users, ensure array exists (do not touch deprecated singular)
    if (!Array.isArray(this.confidentialityLevels) || this.confidentialityLevels.length === 0) {
      this.confidentialityLevels = ['public'];
      changed = true;
    }
  }

  if (changed) {
    await this.save();
  }
  return changed;
};

// Prevent returning deprecated singular field in API responses (avoids mismatch with array)
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.confidentialityLevel;
    delete ret.__v;
    return ret;
  }
});
userSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.confidentialityLevel;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);