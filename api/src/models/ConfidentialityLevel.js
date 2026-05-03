const mongoose = require('mongoose');

const confidentialityLevelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function(v) {
        return typeof v === 'string' && v.trim().length > 0;
      },
      message: 'Name must be a non-empty string'
    }
  },
  displayName: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  level: {
    type: Number,
    required: true,
    default: 1
  },
  color: {
    type: String,
    default: '#000000'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

confidentialityLevelSchema.index({ level: 1 });

module.exports = mongoose.model('ConfidentialityLevel', confidentialityLevelSchema);