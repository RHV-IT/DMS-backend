const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { validationResult } = require('express-validator');

const userController = {
  getAllUsers: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, role, status, department, search, includeDeleted } = req.query;
      
      const query = { status: { $ne: 'deleted' } };
      if (includeDeleted === 'true') {
        delete query.status;
      }
      if (role) query.role = role;
      if (status) {
        delete query.status;
        query.status = status;
      }
      if (department) query.department = department;
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

      const { name, email, password, department, role } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }

      const confidentialityLevels = role === 'admin' 
        ? ['public', 'internal', 'confidential', 'highly_confidential']
        : role === 'hod'
          ? ['public', 'internal', 'confidential']
          : ['public', 'internal'];

      const user = await User.create({
        name,
        email,
        password,
        department,
        role: role || 'user',
        confidentialityLevels,
        passwordLastChanged: new Date()
      });

      await user.addToPasswordHistory();
      await user.save();

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
          department: user.department
        }
      });
    } catch (error) {
      next(error);
    }
  },

  updateUser: async (req, res, next) => {
    try {
      const { name, email, department, role, status } = req.body;
      
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const oldData = { role: user.role, status: user.status };

      if (name) user.name = name;
      if (email) user.email = email;
      if (department) user.department = department;
      if (role) user.role = role;
      if (status) user.status = status;
      user.updatedAt = new Date();

      await user.save();

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'user_update',
        resource: 'user',
        resourceId: user._id.toString(),
        details: { oldData, newData: { role, status } },
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