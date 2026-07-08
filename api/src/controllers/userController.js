const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const Department = require('../models/Department');
const { validationResult } = require('express-validator');
const validator = require('validator');
const { waitUntil } = require('@vercel/functions');
const { sendUserWelcomeEmail } = require('../services/emailService');
const { encrypt: encryptCredential, decrypt: decryptCredential } = require('../utils/tempCredentialCipher');
const logger = require("../config/logger");

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

const validateDepartment = async (departmentName) => {
  if (!departmentName) return { valid: false, error: 'Department is required' };
  const trimmedDept = departmentName.trim().toUpperCase();
  const dept = await Department.findOne({ 
    $or: [
      { name: trimmedDept, isActive: true },
      { code: trimmedDept, isActive: true }
    ]
  });
  if (!dept) return { valid: false, error: 'Department does not exist or is inactive' };
  return { valid: true, department: dept };
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

      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail || !validator.isEmail(normalizedEmail)) {
        return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
      }

      const normalizedRole = normalizeRole(role);
      if (!normalizedRole) {
        return res.status(400).json({ success: false, message: 'Role is required (admin, hod, or user)' });
      }

      const normalizedConfidentiality = normalizeConfidentialityInput({ confidentialityLevels, confidentialityLevel });
      if (normalizedConfidentiality.error) {
        return res.status(400).json({ success: false, message: normalizedConfidentiality.error });
      }

      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }

      const deptCheck = await validateDepartment(department);
      if (!deptCheck.valid) {
        return res.status(400).json({ success: false, message: deptCheck.error });
      }

// Handle departments array for profile creation
       let finalDepartment = department;
       let profilesToCreate = [];
       
       if (req.body.departments && Array.isArray(req.body.departments)) {
         // Use the first department as the primary department if departments array is provided
         if (req.body.departments.length > 0) {
           finalDepartment = req.body.departments[0];
         }
         
         // Create profiles for each department
         profilesToCreate = req.body.departments.map((dept, index) => ({
           profileId: new (require('mongoose')).Types.ObjectId(),
           department: dept.toUpperCase(),
           confidentialityLevels: normalizedConfidentiality.levels,
           isPrimary: (index === 0), // First department is primary
           status: 'active'
         }));
       } else {
         // Fallback to single department behavior
         profilesToCreate = [{
           profileId: new (require('mongoose')).Types.ObjectId(),
department: department.toUpperCase(),
            confidentialityLevels: normalizedConfidentiality.levels,
            isPrimary: true,
            status: 'active'
         }];
       }

       const user = await User.create({
         name,
         email: normalizedEmail,
         password,
         department: finalDepartment,
         role: normalizedRole,
         confidentialityLevels: normalizedConfidentiality.levels,
         passwordLastChanged: new Date(),
         profiles: profilesToCreate
       });

      await user.addToPasswordHistory();
      user.pendingWelcomeCredential = encryptCredential(password);
      await user.save();

      try {
        await AuditLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          action: 'user_create',
          resource: 'user',
          resourceId: user._id.toString(),
          details: { createdUser: user.email, role: user.role },
          ipAddress: req.ip
        });
      } catch (auditError) {
        console.error('Failed to write audit log for user_create:', auditError.message);
      }

      res.status(201).json({
        success: true,
        message: 'User created successfully. Welcome email is being delivered.',
        emailQueued: true,
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

      // Fire-and-forget: send the welcome email in the background so SMTP latency
      // never delays the response. waitUntil keeps the Vercel serverless function
      // alive until this promise settles (locally it's a plain no-op passthrough).
      waitUntil(
        sendUserWelcomeEmail({
          user,
          password,
          role: user.role,
          createdBy: req.user
        }).catch((emailError) => {
          logger.error(`Welcome email failed for user_create (${user.email}): ${emailError.message}`);
        })
      );
    } catch (error) {
      next(error);
    }
  },

  resendWelcomeEmail: async (req, res, next) => {
    try {
      if (!require('mongoose').Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Valid user ID is required' });
      }

      const user = await User.findById(req.params.id).select('+pendingWelcomeCredential');
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      if (!user.pendingWelcomeCredential) {
        return res.status(400).json({
          success: false,
          message: 'No pending welcome credential available for this user. Use password reset to issue new credentials instead.'
        });
      }

      let plainPassword;
      try {
        plainPassword = decryptCredential(user.pendingWelcomeCredential);
      } catch (decryptError) {
        logger.error(`Failed to decrypt pending welcome credential for ${user.email}: ${decryptError.message}`);
        return res.status(500).json({ success: false, message: 'Unable to process resend request' });
      }

      const emailResult = await sendUserWelcomeEmail({
        user,
        password: plainPassword,
        role: user.role,
        createdBy: req.user,
        force: true
      });

      const emailSent = Boolean(emailResult && emailResult.success && !emailResult.skipped);

      res.json({
        success: true,
        emailSent,
        message: emailSent
          ? 'Welcome email resent successfully.'
          : 'Failed to resend welcome email. Please try again later.'
      });
    } catch (error) {
      next(error);
    }
  },

  updateUser: async (req, res, next) => {
    try {
      const { name, email, department, role, status } = req.body;
      const isAdmin = req.user.role === 'admin';
      const isHod = req.user.role === 'hod';

      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Log incoming data for debugging
      logger.info(`[USER:UPDATE:${req.params.id}] Received update request with body:`, {
        name: req.body.name,
        email: req.body.email,
        department: req.body.department,
        departments: req.body.departments,
        profiles: req.body.profiles,
        role: req.body.role,
        status: req.body.status,
        confidentialityLevels: req.body.confidentialityLevels,
        confidentialityLevel: req.body.confidentialityLevel
      });

      if (isHod && user.department !== req.user.department) {
        return res.status(403).json({ success: false, message: 'HODs can only manage users in their department' });
      }

      if (isHod) {
        const restrictedUpdate = [
          'role',
          'status',
          'profiles',
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

      // Build the list of profiles to validate/persist. `profiles[]` (each owning its own
      // department + confidentialityLevels) is the source of truth. Root-level `department`,
      // `confidentialityLevel` and `confidentialityLevels` are legacy compatibility only and
      // are converted into a single primary profile rather than validated/applied directly.
      let incomingProfiles = null;

      if (Array.isArray(req.body.profiles)) {
        incomingProfiles = req.body.profiles;
      } else if (Array.isArray(req.body.departments)) {
        const validDepartments = req.body.departments
          .map((dept) => String(dept || '').trim())
          .filter((dept) => dept.length > 0)
          .map((dept) => dept.toUpperCase());

        const legacyLevels = Array.isArray(req.body.confidentialityLevels)
          ? req.body.confidentialityLevels
          : (req.body.confidentialityLevel ? [req.body.confidentialityLevel] : null);

        incomingProfiles = validDepartments.map((dept, index) => {
          const existing = (user.profiles || []).find(p => p.department === dept && p.status === 'active');
          return {
            department: dept,
            confidentialityLevels: legacyLevels || existing?.confidentialityLevels || user.confidentialityLevels || ['public'],
            isPrimary: index === 0,
            status: 'active'
          };
        });
      } else if (
        department ||
        Object.prototype.hasOwnProperty.call(req.body, 'confidentialityLevels') ||
        Object.prototype.hasOwnProperty.call(req.body, 'confidentialityLevel')
      ) {
        const primaryNow = user.getPrimaryProfile();
        const legacyLevels = Array.isArray(req.body.confidentialityLevels)
          ? req.body.confidentialityLevels
          : (req.body.confidentialityLevel
            ? [req.body.confidentialityLevel]
            : (primaryNow?.confidentialityLevels || user.confidentialityLevels || ['public']));

        incomingProfiles = [{
          department: (department || user.department || '').toUpperCase(),
          confidentialityLevels: legacyLevels,
          isPrimary: true,
          status: 'active'
        }];
      }

      // Validate every profile independently.
      let validatedProfiles = null;
      if (incomingProfiles) {
        validatedProfiles = [];
        const seenDepartments = new Set();
        let primaryCount = 0;

        for (const rawProfile of incomingProfiles) {
          const deptName = String(rawProfile?.department || '').trim().toUpperCase();
          if (!deptName) {
            return res.status(400).json({ success: false, message: 'Each profile must include a department' });
          }

          const deptCheck = await validateDepartment(deptName);
          if (!deptCheck.valid) {
            return res.status(400).json({ success: false, message: `Invalid department '${deptName}': ${deptCheck.error}` });
          }

          if (seenDepartments.has(deptName)) {
            return res.status(400).json({ success: false, message: `Duplicate profile for department '${deptName}'` });
          }
          seenDepartments.add(deptName);

          const rawLevels = Array.isArray(rawProfile.confidentialityLevels) ? rawProfile.confidentialityLevels : [];
          if (rawLevels.length === 0) {
            return res.status(400).json({ success: false, message: `Profile for '${deptName}' must include at least one confidentiality level` });
          }

          const normalizedLevels = [];
          for (const level of rawLevels) {
            const normalized = normalizeConfidentialityValue(level);
            if (!normalized) {
              return res.status(400).json({ success: false, message: `Invalid confidentiality level: ${level}` });
            }
            if (!normalizedLevels.includes(normalized)) {
              normalizedLevels.push(normalized);
            }
          }

          const isPrimary = Boolean(rawProfile.isPrimary);
          if (isPrimary) primaryCount += 1;

          const existingProfile = (user.profiles || []).find(p => p.department === deptName);

          validatedProfiles.push({
            profileId: existingProfile?.profileId || new (require('mongoose')).Types.ObjectId(),
            department: deptName,
            confidentialityLevels: normalizedLevels,
            isPrimary,
            status: rawProfile.status === 'inactive' ? 'inactive' : 'active'
          });
        }

        if (primaryCount !== 1) {
          return res.status(400).json({
            success: false,
            message: primaryCount === 0
              ? 'Exactly one profile must be marked as primary'
              : 'Only one profile can be marked as primary'
          });
        }

        const activeAfter = validatedProfiles.filter(p => p.status === 'active');
        if (activeAfter.length === 0) {
          return res.status(400).json({ success: false, message: 'Cannot deactivate all active profiles' });
        }
      }

      const oldData = {
        role: user.role,
        status: user.status,
        confidentialityLevels: user.confidentialityLevels,
        department: user.department
      };

      // Update basic fields
      if (name) user.name = name;
      if (email) user.email = email;

      if (isAdmin && Object.prototype.hasOwnProperty.call(req.body, 'role')) {
        const normalizedRole = normalizeRole(role);
        if (!normalizedRole) {
          return res.status(400).json({ success: false, message: 'Role is required (admin, hod, or user)' });
        }
        user.role = normalizedRole;
      }

      if (isAdmin && status) user.status = status;

      if (validatedProfiles) {
        user.profiles = validatedProfiles;

        // Regenerate legacy root fields from the primary profile — never the other way around.
        const primaryProfile = user.profiles.find(p => p.isPrimary);
        const ranks = { public: 1, internal: 2, confidential: 3, highly_confidential: 4 };
        user.department = primaryProfile.department;
        user.confidentialityLevels = primaryProfile.confidentialityLevels;
        user.confidentialityLevel = [...primaryProfile.confidentialityLevels]
          .sort((a, b) => (ranks[b] || 0) - (ranks[a] || 0))[0];
      }

      user.updatedAt = new Date();

      await user.save();

      try {
        await AuditLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          action: 'user_update',
          resource: 'user',
          resourceId: user._id.toString(),
          details: {
            oldData,
            newData: {
              role: user.role,
              status: user.status,
              confidentialityLevels: user.confidentialityLevels,
              department: user.department,
              departments: user.profiles
                .filter(p => p.status === 'active')
                .map(p => p.department)
            }
          },
          ipAddress: req.ip
        });
      } catch (auditError) {
        console.error('Failed to write audit log for user_update:', auditError.message);
      }

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

      try {
        await AuditLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          action: 'user_suspend',
          resource: 'user',
          resourceId: user._id.toString(),
          details: { suspendedUser: user.email }
        });
      } catch (auditError) {
        console.error('Failed to write audit log for user_suspend:', auditError.message);
      }

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

      try {
        await AuditLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          action: 'user_restore',
          resource: 'user',
          resourceId: user._id.toString(),
          details: { restoredUser: user.email }
        });
      } catch (auditError) {
        console.error('Failed to write audit log for user_restore:', auditError.message);
      }

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

      try {
        await AuditLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          action: 'user_update',
          resource: 'password',
          resourceId: user._id.toString(),
          details: { action: 'password_reset' }
        });
      } catch (auditError) {
        console.error('Failed to write audit log for password_reset:', auditError.message);
      }

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

      try {
        await AuditLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          action: 'user_delete',
          resource: 'user',
          resourceId: user._id.toString(),
          details: { deletedUserEmail: user.email }
        });
      } catch (auditError) {
        console.error('Failed to write audit log for user_delete:', auditError.message);
      }

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

      try {
        await AuditLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          action: 'user_activate',
          resource: 'user',
          resourceId: user._id.toString(),
          details: { activatedUser: user.email }
        });
      } catch (auditError) {
        console.error('Failed to write audit log for user_activate:', auditError.message);
      }

      res.json({ success: true, message: 'User activated successfully' });
    } catch (error) {
      next(error);
    }
  },

  // Request endpoints for HOD
  requestSuspend: async (req, res, next) => {
    try {
      const targetUserId = req.params.id;
      const hod = req.user;

      // HOD can only request for users in their own department
      const targetUser = await User.findById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      if (targetUser.department !== hod.department) {
        return res.status(403).json({ success: false, message: 'HOD can only request actions for users in their own department' });
      }
      if (targetUser.role === 'admin') {
        return res.status(400).json({ success: false, message: 'Cannot request action on admin user' });
      }

      // Create notification for admins
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await Notification.create({
          userId: admin._id,
          message: `HOD ${hod.name} (${hod.email}) requests suspension of user ${targetUser.name} (${targetUser.email})`,
          type: 'user_action_request',
          resourceId: targetUserId,
          sharedBy: hod._id,
          isRead: false,
          details: {
            action: 'suspend',
            targetUserId: targetUserId,
            hodId: hod._id,
            hodName: hod.name,
            hodEmail: hod.email,
            requestedAt: new Date()
          }
        });
      }

      try {
        await AuditLog.create({
          userId: hod._id,
          userEmail: hod.email,
          action: 'user_request_suspend',
          resource: 'user',
          resourceId: targetUserId,
          details: { targetUserId, requestedBy: hod._id },
          ipAddress: req.ip
        });
      } catch (auditError) {
        console.error('Failed to write audit log for user_request_suspend:', auditError.message);
      }

      res.json({ success: true, message: 'Suspension request sent to admins' });
    } catch (error) {
      next(error);
    }
  },

  requestEdit: async (req, res, next) => {
    try {
      const targetUserId = req.params.id;
      const hod = req.user;

      const targetUser = await User.findById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      if (targetUser.department !== hod.department) {
        return res.status(403).json({ success: false, message: 'HOD can only request actions for users in their own department' });
      }
      if (targetUser.role === 'admin') {
        return res.status(400).json({ success: false, message: 'Cannot request action on admin user' });
      }

      const updates = req.body;

      // Prevent hod from requesting changes to role, status, confidentialityLevels, confidentialityLevel
      const restrictedFields = ['role', 'status', 'confidentialityLevels', 'confidentialityLevel'];
      const hasRestricted = Object.keys(updates).some(field => restrictedFields.includes(field));
      if (hasRestricted) {
        return res.status(400).json({ success: false, message: 'HOD cannot request changes to role, status, or confidentiality levels' });
      }

      // Prevent hod from requesting to change department to a different one
      if (updates.department && updates.department !== hod.department) {
        return res.status(400).json({ success: false, message: 'HOD cannot request to change user to another department' });
      }

      // Create notification for admins
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await Notification.create({
          userId: admin._id,
          message: `HOD ${hod.name} (${hod.email}) requests edit of user ${targetUser.name} (${targetUser.email})`,
          type: 'user_action_request',
          resourceId: targetUserId,
          sharedBy: hod._id,
          isRead: false,
          details: {
            action: 'edit',
            targetUserId: targetUserId,
            hodId: hod._id,
            hodName: hod.name,
            hodEmail: hod.email,
            requestedChanges: updates,
            requestedAt: new Date()
          }
        });
      }

      try {
        await AuditLog.create({
          userId: hod._id,
          userEmail: hod.email,
          action: 'user_request_edit',
          resource: 'user',
          resourceId: targetUserId,
          details: { targetUserId, requestedBy: hod._id, changes: updates },
          ipAddress: req.ip
        });
      } catch (auditError) {
        console.error('Failed to write audit log for user_request_edit:', auditError.message);
      }

      res.json({ success: true, message: 'Edit request sent to admins' });
    } catch (error) {
      next(error);
    }
  },

  requestPasswordReset: async (req, res, next) => {
    try {
      const targetUserId = req.params.id;
      const hod = req.user;

      const targetUser = await User.findById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      if (targetUser.department !== hod.department) {
        return res.status(403).json({ success: false, message: 'HOD can only request actions for users in their own department' });
      }
      if (targetUser.role === 'admin') {
        return res.status(400).json({ success: false, message: 'Cannot request action on admin user' });
      }

      // Create notification for admins
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await Notification.create({
          userId: admin._id,
          message: `HOD ${hod.name} (${hod.email}) requests password reset for user ${targetUser.name} (${targetUser.email})`,
          type: 'user_action_request',
          resourceId: targetUserId,
          sharedBy: hod._id,
          isRead: false,
          details: {
            action: 'password_reset',
            targetUserId: targetUserId,
            hodId: hod._id,
            hodName: hod.name,
            hodEmail: hod.email,
            requestedAt: new Date()
          }
        });
      }

      try {
        await AuditLog.create({
          userId: hod._id,
          userEmail: hod.email,
          action: 'user_request_password_reset',
          resource: 'user',
          resourceId: targetUserId,
          details: { targetUserId, requestedBy: hod._id },
          ipAddress: req.ip
        });
      } catch (auditError) {
        console.error('Failed to write audit log for user_request_password_reset:', auditError.message);
      }

res.json({ success: true, message: 'Password reset request sent to admins' });
     } catch (error) {
       next(error);
     }
   },

   /**
    * Add a new profile to a user
    * POST /api/v1/users/:id/profiles
    * Access: Admin only
    */
   addProfile: async (req, res, next) => {
     const requestId = Math.random().toString(36).substring(2, 8);
     try {
       const { department, confidentialityLevels } = req.body;
       const user = await User.findById(req.params.id);

       if (!user) {
         return res.status(404).json({ success: false, message: "User not found" });
       }

       if (!department) {
         return res.status(400).json({ success: false, message: "Department is required" });
       }

       // Check if profile already exists for this department
       const existingProfile = user.profiles?.find(p => 
         p.department.toUpperCase() === department.toUpperCase() && 
         p.status !== 'deleted'
       );

       if (existingProfile) {
         return res.status(400).json({ 
           success: false, 
           message: "Profile already exists for this department" 
         });
       }

       // Normalize confidentiality levels
       const levels = confidentialityLevels && Array.isArray(confidentialityLevels) 
         ? confidentialityLevels 
         : ['public', 'internal'];

       const newProfile = {
         profileId: new (require('mongoose')).Types.ObjectId(),
         department: department.toUpperCase(),
         confidentialityLevels: levels,
         isPrimary: false,
         status: 'active'
       };

       user.profiles = [...(user.profiles || []), newProfile];
       await user.save();

       try {
         await AuditLog.create({
           userId: req.user._id,
           userEmail: req.user.email,
           action: 'profile_create',
           resource: 'user',
           resourceId: user._id.toString(),
           details: {
             profileId: newProfile.profileId,
             department: newProfile.department
           },
           ipAddress: req.ip
         });
       } catch (auditError) {
         console.error('Failed to write audit log for profile_create:', auditError.message);
       }

       logger.info(`[USER:PROFILE:${requestId}] Profile added for user ${user.email}: ${newProfile.department}`);

       res.status(201).json({
         success: true,
         data: newProfile
       });
     } catch (error) {
       logger.error(`[USER:PROFILE:${requestId}] Error: ${error.message}`, { stack: error.stack });
       next(error);
     }
   },

   /**
    * Update a user's profile
    * PUT /api/v1/users/:id/profiles/:profileId
    * Access: Admin only
    */
   updateProfile: async (req, res, next) => {
     const requestId = Math.random().toString(36).substring(2, 8);
     try {
       const { confidentialityLevels, isPrimary, status } = req.body;
       const user = await User.findById(req.params.id);

       if (!user) {
         return res.status(404).json({ success: false, message: "User not found" });
       }

       const profileIndex = user.profiles?.findIndex(p => 
         p.profileId.toString() === req.params.profileId
       );

       if (profileIndex === -1) {
         return res.status(404).json({ success: false, message: "Profile not found" });
       }

       const profile = user.profiles[profileIndex];

       // Update fields if provided
       if (confidentialityLevels !== undefined) {
         if (!Array.isArray(confidentialityLevels)) {
           return res.status(400).json({ success: false, message: "confidentialityLevels must be an array" });
         }
         profile.confidentialityLevels = confidentialityLevels;
       }

       if (isPrimary !== undefined) {
         if (isPrimary) {
           // Set all other profiles to non-primary
           user.profiles.forEach(p => {
             if (p.profileId.toString() !== req.params.profileId) {
               p.isPrimary = false;
             }
           });
         }
         profile.isPrimary = Boolean(isPrimary);
       }

       if (status !== undefined) {
         if (!['active', 'inactive'].includes(status)) {
           return res.status(400).json({ success: false, message: "Status must be 'active' or 'inactive'" });
         }
         profile.status = status;
       }

       profile.updatedAt = new Date();
       await user.save();

       try {
         await AuditLog.create({
           userId: req.user._id,
           userEmail: req.user.email,
           action: 'profile_update',
           resource: 'user',
           resourceId: user._id.toString(),
           details: {
             profileId: profile.profileId,
             department: profile.department,
             changes: { confidentialityLevels, isPrimary, status }
           },
           ipAddress: req.ip
         });
       } catch (auditError) {
         console.error('Failed to write audit log for profile_update:', auditError.message);
       }

       logger.info(`[USER:PROFILE:${requestId}] Profile updated for user ${user.email}: ${profile.department}`);

       res.json({
         success: true,
         data: profile
       });
     } catch (error) {
       logger.error(`[USER:PROFILE:${requestId}] Error: ${error.message}`, { stack: error.stack });
       next(error);
     }
   },

   /**
    * Remove a user's profile (soft delete)
    * DELETE /api/v1/users/:id/profiles/:profileId
    * Access: Admin only
    */
   removeProfile: async (req, res, next) => {
     const requestId = Math.random().toString(36).substring(2, 8);
     try {
       const user = await User.findById(req.params.id);

       if (!user) {
         return res.status(404).json({ success: false, message: "User not found" });
       }

       const profileIndex = user.profiles?.findIndex(p => 
         p.profileId.toString() === req.params.profileId
       );

       if (profileIndex === -1) {
         return res.status(404).json({ success: false, message: "Profile not found" });
       }

       const profile = user.profiles[profileIndex];

// Prevent deactivating the last active profile
        if (profile.status === 'active') {
          const activeProfiles = user.profiles.filter(p => p.status === 'active');
          if (activeProfiles.length <= 1) {
            return res.status(400).json({ 
              success: false, 
              message: "Cannot deactivate the last active profile" 
            });
          }
        }



// Soft delete
        profile.status = 'inactive';
        profile.updatedAt = new Date();
       await user.save();

       try {
         await AuditLog.create({
           userId: req.user._id,
           userEmail: req.user.email,
           action: 'profile_deactivate',
           resource: 'user',
           resourceId: user._id.toString(),
           details: {
             profileId: profile.profileId,
             department: profile.department
           },
           ipAddress: req.ip
         });
       } catch (auditError) {
         console.error('Failed to write audit log for profile_deactivate:', auditError.message);
       }

logger.info(`[USER:PROFILE:${requestId}] Profile deactivated for user ${user.email}: ${profile.department}`);

        res.json({
          success: true,
          message: 'Profile deactivated successfully'
        });
     } catch (error) {
       logger.error(`[USER:PROFILE:${requestId}] Error: ${error.message}`, { stack: error.stack });
       next(error);
     }
   },

   /**
    * Set a profile as primary for a user
    * POST /api/v1/users/:id/profiles/:profileId/set-primary
    * Access: Admin only
    */
   setPrimaryProfile: async (req, res, next) => {
     const requestId = Math.random().toString(36).substring(2, 8);
     try {
       const user = await User.findById(req.params.id);

       if (!user) {
         return res.status(404).json({ success: false, message: "User not found" });
       }

       const profileIndex = user.profiles?.findIndex(p => 
         p.profileId.toString() === req.params.profileId
       );

       if (profileIndex === -1) {
         return res.status(404).json({ success: false, message: "Profile not found" });
       }

       const profile = user.profiles[profileIndex];

       if (profile.status !== 'active') {
         return res.status(400).json({ 
           success: false, 
           message: "Cannot set inactive profile as primary" 
         });
       }

       // Set all profiles to non-primary first
       user.profiles.forEach(p => {
         p.isPrimary = false;
       });

       // Set this profile as primary
       profile.isPrimary = true;
       profile.updatedAt = new Date();
       await user.save();

       try {
         await AuditLog.create({
           userId: req.user._id,
           userEmail: req.user.email,
           action: 'profile_set_primary',
           resource: 'user',
           resourceId: user._id.toString(),
           details: {
             profileId: profile.profileId,
             department: profile.department
           },
           ipAddress: req.ip
         });
       } catch (auditError) {
         console.error('Failed to write audit log for profile_set_primary:', auditError.message);
       }

       logger.info(`[USER:PROFILE:${requestId}] Profile set as primary for user ${user.email}: ${profile.department}`);

       res.json({
         success: true,
         data: profile
       });
     } catch (error) {
       logger.error(`[USER:PROFILE:${requestId}] Error: ${error.message}`, { stack: error.stack });
       next(error);
     }
   }
};
module.exports = userController;