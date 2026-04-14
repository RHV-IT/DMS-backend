const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    enum: ['admin', 'hod', 'user']
  },
  permissions: [{
    type: String,
    enum: [
      'file:upload',
      'file:download',
      'file:delete',
      'file:share',
      'file:update',
      'file:read',
      'user:create',
      'user:read',
      'user:update',
      'user:delete',
      'role:assign',
      'permission:override',
      'logs:read',
      'logs:export',
      'notification:read',
      'notification:manage'
    ]
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Role', roleSchema);