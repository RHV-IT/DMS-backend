const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const Department = require('../models/Department');
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

const validateDepartment = async (departmentName) => {
  if (!departmentName) return { valid: false, error: 'Department is required' };
  const dept = await Department.findOne({ name: departmentName.trim().toUpperCase(), isActive: true });
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

      const deptCheck = await validateDepartment(department);
      if (!deptCheck.valid) {
        return res.status(400).json({ success: false, message: deptCheck.error });
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

      if (department && department !== user.department) {
        const deptCheck = await validateDepartment(department);
        if (!deptCheck.valid) {
          return res.status(400).json({ success: false, message: deptCheck.error });
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

      await AuditLog.create({
        userId: hod._id,
        userEmail: hod.email,
        action: 'user_request_suspend',
        resource: 'user',
        resourceId: targetUserId,
        details: { targetUserId, requestedBy: hod._id },
        ipAddress: req.ip
      });

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

      await AuditLog.create({
        userId: hod._id,
        userEmail: hod.email,
        action: 'user_request_edit',
        resource: 'user',
        resourceId: targetUserId,
        details: { targetUserId, requestedBy: hod._id, changes: updates },
        ipAddress: req.ip
      });

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

      await AuditLog.create({
        userId: hod._id,
        userEmail: hod.email,
        action: 'user_request_password_reset',
        resource: 'user',
        resourceId: targetUserId,
        details: { targetUserId, requestedBy: hod._id },
        ipAddress: req.ip
      });

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
         profileId: new mongoose.Types.ObjectId(),
         department: department.toUpperCase(),
         confidentialityLevels: levels,
         isPrimary: false,
         status: 'active'
       };

       user.profiles = [...(user.profiles || []), newProfile];
       await user.save();

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

       // Prevent deleting the last active profile
       const activeProfiles = user.profiles.filter(p => p.status === 'active');
       if (activeProfiles.length <= 1) {
         return res.status(400).json({ 
           success: false, 
           message: "Cannot delete the last active profile" 
         });
       }

       // Prevent deleting primary profile unless another is set as primary first
       if (profile.isPrimary) {
         return res.status(400).json({ 
           success: false, 
           message: "Cannot delete primary profile. Set another profile as primary first." 
         });
       }

       // Soft delete
       profile.status = 'deleted';
       profile.updatedAt = new Date();
       await user.save();

       await AuditLog.create({
         userId: req.user._id,
         userEmail: req.user.email,
         action: 'profile_delete',
         resource: 'user',
         resourceId: user._id.toString(),
         details: { 
           profileId: profile.profileId,
           department: profile.department
         },
         ipAddress: req.ip
       });

       logger.info(`[USER:PROFILE:${requestId}] Profile deleted for user ${user.email}: ${profile.department}`);

       res.json({
         success: true,
         message: 'Profile deleted successfully'
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