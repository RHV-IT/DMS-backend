const mongoose = require('mongoose');
// const bcrypt = require('bcrypt');
const bcrypt = require('bcryptjs');

/**
 * User schema definition for the DMS application.
 * Defines the structure and methods for user documents in MongoDB.
 */
const userSchema = new mongoose.Schema({
  // User's full name
  name: {
    type: String,
    required: true,
    trim: true
  },
  // User's email address (used for login)
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  // Hashed password
  password: {
    type: String,
    required: true,
    minlength: 3
  },
  // Role determines permissions: admin, hod (head of department), or regular user
  role: {
    type: String,
    enum: ['admin', 'hod', 'user'],
    default: 'user'
  },
  // Department the user belongs to (required for all users) - LEGACY: kept for backward compatibility
  // For multi-profile users, the active profile's department is used via JWT
  department: {
    type: String,
    required: true,
    trim: true
  },
  // Account status: active, suspended, or deleted
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active'
  },
  // Timestamp when the account was deleted (soft delete)
  deletedAt: {
    type: Date,
    default: null
  },
  // DEPRECATED: single confidentiality level kept for DB backward compatibility only.
  // DO NOT USE for permissions. Source of truth is confidentialityLevels array only.
  confidentialityLevel: {
    type: String,
    enum: ['public', 'internal', 'confidential', 'highly_confidential'],
    default: undefined
  },
  // Array of confidentiality levels the user is allowed to access.
  // Used for permission checks (e.g., a user with ['public', 'internal'] can view public and internal files).
  // LEGACY: For multi-profile users, the active profile's confidentialityLevels is used via JWT
  confidentialityLevels: [{
    type: String,
    enum: ['public', 'internal', 'confidential', 'highly_confidential']
  }],
  // Multi-department profiles
  // One user can have multiple department profiles
  // Each profile has its own department, confidentialityLevels, and permissions
  profiles: [{
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId()
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
    }
  }],
  // History of previous passwords to prevent reuse
  passwordHistory: [{
    password: String,
    changedAt: Date
  }],
  // Timestamp of the last password change
  passwordLastChanged: {
    type: Date,
    default: Date.now
  },
  // Number of times the user has logged in
  loginCount: {
    type: Number,
    default: 0
  },
  // Refresh token for generating new access tokens
  refreshToken: String,
  // Timestamp the automatic welcome email was successfully sent (prevents duplicate resends)
  welcomeEmailSentAt: {
    type: Date,
    default: null
  },
  // Encrypted (reversible) copy of the temporary password, kept ONLY until the welcome
  // email is confirmed delivered so it can be resent on failure. select:false means it is
  // never returned unless explicitly requested via .select('+pendingWelcomeCredential').
  pendingWelcomeCredential: {
    type: String,
    default: null,
    select: false
  },
  // Agent health tracking fields (for scanner agent)
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
  // Timestamps for when the document was created and last updated
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

/**
 * Hash the password before saving to the database.
 * Runs on every save operation if the password field is modified.
 */
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  this.updatedAt = new Date();
});

/**
 * Compare a candidate password with the stored hashed password.
 * @param {string} candidatePassword - The plaintext password to compare
 * @returns {Promise<boolean>} True if passwords match, false otherwise
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Check if a new password has been used before (based on password history).
 * @param {string} newPassword - The plaintext password to check
 * @returns {Promise<boolean>} True if password is found in history, false otherwise
 */
userSchema.methods.isPasswordUsedBefore = async function (newPassword) {
  const history = this.passwordHistory || [];
  for (const entry of history) {
    if (await bcrypt.compare(newPassword, entry.password)) {
      return true;
    }
  }
  return false;
};

/**
 * Add the current password to the history array before changing it.
 * Maintains a limited history based on PASSWORD_HISTORY_LIMIT environment variable.
 */
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

/**
 * Get the highest confidentiality level from the user's confidentialityLevels array.
 * @returns {string} The highest level (e.g., 'highly_confidential') or 'public' if none set
 */
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
 * Preserve assigned confidentiality levels.
 * Do not auto-change a user's confidentiality because of their role.
 */
userSchema.methods.normalizeConfidentiality = async function () {
  return false;
};

/**
 * Get the primary (active) profile for the user.
 * @returns {Object|null} The primary profile or null if not found
 */
userSchema.methods.getPrimaryProfile = function () {
  if (!this.profiles || this.profiles.length === 0) {
    return null;
  }
  const primary = this.profiles.find(p => p.isPrimary && p.status === 'active');
  if (primary) return primary;
  return this.profiles.find(p => p.status === 'active') || this.profiles[0];
};

/**
 * Get a specific profile by profileId.
 * @param {string} profileId - The profile ID to find
 * @returns {Object|null} The profile or null if not found
 */
userSchema.methods.getProfileById = function (profileId) {
  if (!this.profiles || this.profiles.length === 0) {
    return null;
  }
  return this.profiles.find(p => p.profileId.toString() === profileId.toString() && p.status === 'active');
};

/**
 * Get all active profiles for the user.
 * @returns {Array} Array of active profiles
 */
userSchema.methods.getActiveProfiles = function () {
  if (!this.profiles || this.profiles.length === 0) {
    return [];
  }
  return this.profiles.filter(p => p.status === 'active');
};

// Prevent returning deprecated singular field in API responses (avoids mismatch with array)
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.confidentialityLevel;
    delete ret.__v;
    if (ret.profiles) {
      ret.profiles = ret.profiles.map(p => ({
        profileId: p.profileId,
        department: p.department,
        confidentialityLevels: p.confidentialityLevels,
        isPrimary: p.isPrimary,
        status: p.status
      }));
    }
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