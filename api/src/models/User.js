const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

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
  confidentialityLevel: {
    type: String,
    enum: ['public', 'internal', 'confidential', 'highly_confidential'],
    default: 'public'
  },
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
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  this.updatedAt = new Date();
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isPasswordUsedBefore = async function(newPassword) {
  const history = this.passwordHistory || [];
  for (const entry of history) {
    if (await bcrypt.compare(newPassword, entry.password)) {
      return true;
    }
  }
  return false;
};

userSchema.methods.addToPasswordHistory = async function() {
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

module.exports = mongoose.model('User', userSchema);