const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { validationResult } = require('express-validator');
const { sendWelcomeEmail } = require('../services/emailService');

const ALLOWED_ROLES = ['admin', 'hod', 'user'];
const CONFIDENTIALITY_LEVELS = ['public', 'internal', 'confidential', 'highly_confidential'];

const normalizeRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  return ALLOWED_ROLES.includes(normalized) ? normalized : null;
};

const normalizeConfidentialityValue = (value) => {
  const normalized = String(value || '').trim().toLowerCase();

  if (CONFIDENTIALITY_LEVELS.includes(normalized)) {
    return normalized;
  }

  if (normalized.includes('high')) {
    return 'highly_confidential';
  }

  if (normalized.includes('conf')) {
    return 'confidential';
  }

  if (normalized.includes('int')) {
    return 'internal';
  }

  if (normalized === 'public') {
    return 'public';
  }

  return null;
};

const normalizeConfidentialityInput = ({ confidentialityLevels, confidentialityLevel } = {}) => {
  let levels;

  if (Array.isArray(confidentialityLevels)) {
    const mappedLevels = confidentialityLevels.map((level) => normalizeConfidentialityValue(level));
    const invalidLevel = mappedLevels.find((level) => !level);

    if (invalidLevel === null || invalidLevel === undefined) {
      return { error: 'Invalid confidentiality level provided' };
    }

    levels = mappedLevels;
  } else if (confidentialityLevel) {
    const level = normalizeConfidentialityValue(confidentialityLevel);
    if (!level) {
      return { error: `Invalid confidentiality level: ${confidentialityLevel}` };
    }
    levels = CONFIDENTIALITY_LEVELS.slice(0, CONFIDENTIALITY_LEVELS.indexOf(level) + 1);
  } else {
    levels = ['public'];
  }

  const uniqueLevels = [...new Set(levels)];
  const invalidLevel = uniqueLevels.find((level) => !CONFIDENTIALITY_LEVELS.includes(level));

  if (invalidLevel) {
    return { error: `Invalid confidentiality level: ${invalidLevel}` };
  }

  return { levels: uniqueLevels };
};

const userController = {
  getAllUsers: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, role, status, department, search, includeDeleted } = req.query;
      const isHod = req.user.role === 'hod';

      const query = { status: { $ne: 'deleted' } };
      if (isHod) {
        if (includeDeleted === 'true') {
          return res.status(403).json({ success: false, message: 'HODs cannot view deleted users' });
        }
        query.department = req.user.department;
      } else if (includeDeleted === 'true') {
        delete query.status;
      }
      if (role) {
        const normalizedRole = normalizeRole(role);
        if (!normalizedRole) {
          return res.status(400).json({ success: false, message: 'Invalid role filter' });
        }
        query.role = normalizedRole;
      }
      if (status) {
        delete query.status;
        query.status = status;
      }
      if (department) {
        if (isHod && department !== req.user.department) {
          return res.status(403).json({ success: false, message: 'HODs can only view users in their department' });
        }
        query.department = department;
      }
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const users = await User.find(query)
        .select('-password -passwordHistory -refreshToken')
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ createdAt: -1 });

      const total = await User.countDocuments(query);

      res.json({
        success: true,
        data: {
          users,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          total
        }
      });
    } catch (error) {
      next(error);
    }
  },

  getUserById: async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id).select('-password -passwordHistory -refreshToken');
      
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      if (req.user.role === 'hod' && user.department !== req.user.department) {
        return res.status(403).json({ success: false, message: 'HODs can only view users in their department' });
      }

      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  },

  createUser: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { name, email, password, department, role, confidentialityLevels, confidentialityLevel } = req.body;
      const normalizedRole = normalizeRole(role);
      if (!normalizedRole) {
        return res.status(400).json({ success: false, message: 'Role is required (admin, hod, or user)' });
      }

      const normalizedConfidentiality = normalizeConfidentialityInput({ confidentialityLevels, confidentialityLevel });
      if (normalizedConfidentiality.error) {
        return res.status(400).json({ success: false, message: normalizedConfidentiality.error });
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }

      const user = await User.create({
        name,
        email,
        password,
        department,
        role: normalizedRole,
        confidentialityLevels: normalizedConfidentiality.levels,
        passwordLastChanged: new Date()
      });

      await user.addToPasswordHistory();
      await user.save();

      await sendWelcomeEmail({
        name: user.name,
        email: user.email,
        password: password
      });

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'user_create',
        resource: 'user',
        resourceId: user._id.toString(),
        details: { createdUser: user.email, role: user.role },
        ipAddress: req.ip
      });

      res.status(201).json({
        success: true,
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          confidentialityLevels: user.confidentialityLevels,
          confidentialityLevel: user.getConfidentialityLevel()
        }
      });
    } catch (error) {
      next(error);
    }
  },

  updateUser: async (req, res, next) => {
    try {
      const { name, email, department, role, status, confidentialityLevels, confidentialityLevel } = req.body;
      const isAdmin = req.user.role === 'admin';
      const isHod = req.user.role === 'hod';

      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      if (isHod && user.department !== req.user.department) {
        return res.status(403).json({ success: false, message: 'HODs can only manage users in their department' });
      }

      if (isHod) {
        const restrictedUpdate = [
          'role',
          'status',
          'confidentialityLevels',
          'confidentialityLevel'
        ].some((field) => Object.prototype.hasOwnProperty.call(req.body, field));

        if (restrictedUpdate) {
          return res.status(403).json({
            success: false,
            message: 'Only admins can assign user roles or confidentiality levels'
          });
        }

        const nextDepartment = department || user.department;
        if (nextDepartment !== req.user.department) {
          return res.status(403).json({ success: false, message: 'HODs cannot move users outside their department' });
        }
      }

      const oldData = { role: user.role, status: user.status, confidentialityLevels: user.confidentialityLevels };

      if (name) user.name = name;
      if (email) user.email = email;
      if (department) user.department = department;

      if (isAdmin && Object.prototype.hasOwnProperty.call(req.body, 'role')) {
        const normalizedRole = normalizeRole(role);
        if (!normalizedRole) {
          return res.status(400).json({ success: false, message: 'Role is required (admin, hod, or user)' });
        }
        user.role = normalizedRole;
      }

      if (isAdmin && status) user.status = status;

      if (isAdmin && (confidentialityLevels || confidentialityLevel)) {
        const normalizedConfidentiality = normalizeConfidentialityInput({ confidentialityLevels, confidentialityLevel });
        if (normalizedConfidentiality.error) {
          return res.status(400).json({ success: false, message: normalizedConfidentiality.error });
        }
        user.confidentialityLevels = normalizedConfidentiality.levels;
      }

      user.updatedAt = new Date();

      await user.save();

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'user_update',
        resource: 'user',
        resourceId: user._id.toString(),
        details: { oldData, newData: { role, status, confidentialityLevels, confidentialityLevel } },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  },

  suspendUser: async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      if (user.role === 'admin') {
        return res.status(400).json({ success: false, message: 'Cannot suspend admin' });
      }

      user.status = 'suspended';
      await user.save();

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'user_suspend',
        resource: 'user',
        resourceId: user._id.toString(),
        details: { suspendedUser: user.email }
      });

      res.json({ success: true, message: 'User suspended successfully' });
    } catch (error) {
      next(error);
    }
  },

  restoreUser: async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      user.status = 'active';
      await user.save();

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'user_restore',
        resource: 'user',
        resourceId: user._id.toString(),
        details: { restoredUser: user.email }
      });

      res.json({ success: true, message: 'User restored successfully' });
    } catch (error) {
      next(error);
    }
  },

  resetPassword: async (req, res, next) => {
    try {
      if (!req.params.id || req.params.id === 'undefined' || !require('mongoose').Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Valid user ID is required' });
      }

      const { newPassword } = req.body;

      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      if (await user.isPasswordUsedBefore(newPassword)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot reuse old passwords' 
        });
      }

      user.password = newPassword;
      await user.addToPasswordHistory();
      user.passwordLastChanged = new Date();
      await user.save();

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'user_update',
        resource: 'password',
        resourceId: user._id.toString(),
        details: { action: 'password_reset' }
      });

      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
      next(error);
    }
  },

  deleteUser: async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      if (user.role === 'admin') {
        return res.status(400).json({ success: false, message: 'Cannot delete admin user' });
      }

      user.status = 'deleted';
      user.deletedAt = new Date();
      user.email = `deleted_${user._id}_${user.email}`;
      await user.save();

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'user_delete',
        resource: 'user',
        resourceId: user._id.toString(),
        details: { deletedUserEmail: user.email }
      });

      res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
      next(error);
    }
  },

  activateUser: async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      user.status = 'active';
      user.updatedAt = new Date();
      await user.save();

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'user_activate',
        resource: 'user',
        resourceId: user._id.toString(),
        details: { activatedUser: user.email }
      });

      res.json({ success: true, message: 'User activated successfully' });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = userController;