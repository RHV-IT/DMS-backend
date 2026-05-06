const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const DeviceInfoExtractor = require('../utils/deviceInfo');
const authService = require('../services/authService');
const { validationResult } = require('express-validator');
const { createAuditLog } = require('../middlewares/auditMiddleware');

const authController = {
  register: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { name, email, password, department } = req.body;

      const existingUser = await User.findOne({ email });
      
      if (existingUser) {
        if (existingUser.status === 'deleted') {
          return res.status(400).json({ 
            success: false, 
            message: 'This account was deleted. Please contact administrator to restore.' 
          });
        }
        return res.status(400).json({ success: false, message: 'User already exists' });
      }

      const user = await User.create({
        name,
        email,
        password,
        department,
        role: 'user',
        confidentialityLevels: ['public', 'internal'],
        passwordLastChanged: new Date()
      });

      const accessToken = authService.generateAccessToken(user);
      const refreshToken = authService.generateRefreshToken(user);

      await user.addToPasswordHistory();
      await user.save();

      const deviceInfo = req.deviceInfo || DeviceInfoExtractor.extractFromRequest(req);
      const summary = `${user.name} registered from ${deviceInfo.machine?.machineName || deviceInfo.device?.deviceName || 'Unknown Device'}`;

      await AuditLog.create({
        ...deviceInfo,
        userId: user._id,
        userEmail: user.email,
        action: 'login',
        resource: 'auth',
        details: { method: 'registration' },
        summary
      });

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department
          },
          accessToken,
          refreshToken
        }
      });
    } catch (error) {
      next(error);
    }
  },

  login: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { email, password, rememberMe } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      if (user.status === 'deleted') {
        const deviceInfo = req.deviceInfo || DeviceInfoExtractor.extractFromRequest(req);
        const summary = `${user.email} attempted login from ${deviceInfo.machine?.machineName || deviceInfo.device?.deviceName || 'Unknown Device'} (Account Deleted)`;

        await AuditLog.create({
          ...deviceInfo,
          userId: user._id,
          userEmail: user.email,
          action: 'failed_login',
          resource: 'auth',
          details: { method: 'password', success: false, reason: 'account_deleted', rememberMe },
          summary
        });
        return res.status(403).json({ 
          success: false, 
          message: 'This account has been deleted. Please contact your administrator.' 
        });
      }

      if (user.status === 'suspended') {
        await AuditLog.create({
          userId: user._id,
          userEmail: user.email,
          action: 'login',
          resource: 'auth',
          details: { method: 'password', success: false, reason: 'account_suspended', rememberMe },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
        return res.status(403).json({ 
          success: false, 
          message: 'Your account has been suspended. Please contact your administrator.' 
        });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        await AuditLog.create({
          userId: user._id,
          userEmail: user.email,
          action: 'login',
          resource: 'auth',
          details: { method: 'password', success: false, rememberMe },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      const accessToken = authService.generateAccessToken(user, rememberMe);
      const refreshToken = authService.generateRefreshToken(user);

      user.refreshToken = refreshToken;
      user.loginCount = (user.loginCount || 0) + 1;
      user.rememberMe = rememberMe;
      await user.save();

      const passwordExpired = await authService.checkPasswordExpiry(user);

      await createAuditLog(req, user, 'login', 'auth', null, { method: 'password', success: true, rememberMe });

      const cookieConfig = authService.getCookieConfig(rememberMe);
      res.cookie('token', accessToken, cookieConfig);

      res.json({
        success: true,
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
            loginCount: user.loginCount,
            passwordExpired
          },
          accessToken,
          refreshToken,
          rememberMe
        }
      });
    } catch (error) {
      next(error);
    }
  },

  logout: async (req, res, next) => {
    try {
      const isProduction = process.env.NODE_ENV === 'production';
      
      res.clearCookie('token', {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/'
      });

      if (req.user) {
        await createAuditLog(req, req.user, 'logout', 'auth', null, { method: 'logout' });
        await authService.logout(req.user._id, req.ip, req.get('user-agent'));
      }
      
      return res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  },

  refreshToken: async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({ success: false, message: 'Refresh token required' });
      }

      const result = await authService.refreshAccessToken(refreshToken);
      
      res.json({ success: true, data: result });
    } catch (error) {
      return res.status(401).json({ success: false, message: error.message });
    }
  },

  changePassword: async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = req.user;

      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      }

      if (await user.isPasswordUsedBefore(newPassword)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot reuse any of your last passwords' 
        });
      }

      user.password = newPassword;
      await user.addToPasswordHistory();
      await user.save();

      await AuditLog.create({
        userId: user._id,
        userEmail: user.email,
        action: 'user_update',
        resource: 'password',
        details: { action: 'password_change' }
      });

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  },

  getProfile: async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id).select('-password -passwordHistory -refreshToken');
      
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  },

  updateProfile: async (req, res, next) => {
    try {
      const { name, department } = req.body;
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { name, department, updatedAt: new Date() },
        { new: true }
      ).select('-password -passwordHistory -refreshToken');

      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = authController;