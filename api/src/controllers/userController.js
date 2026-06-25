const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const Department = require('../models/Department');
const { validationResult } = require('express-validator');
const { sendWelcomeEmail } = require('../services/emailService');
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
         email,
         password,
         department: finalDepartment,
         role: normalizedRole,
         confidentialityLevels: normalizedConfidentiality.levels,
         passwordLastChanged: new Date(),
         profiles: profilesToCreate
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

       // Log incoming data for debugging
       logger.info(`[USER:UPDATE:${req.params.id}] Received update request with body:`, {
         name: req.body.name,
         email: req.body.email,
         department: req.body.department,
         departments: req.body.departments,
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

// Handle departments array for profile synchronization
       let profilesToCreate = [];
       let profilesToDeactivate = [];
       let finalDepartment = department;
       
       // Process departments array if provided
       if (req.body.departments && Array.isArray(req.body.departments)) {
         // Filter out empty departments and convert to uppercase
         const validDepartments = req.body.departments
           .map(dept => dept.trim())
           .filter(dept => dept.length > 0)
           .map(dept => dept.toUpperCase());
         
         // If we have departments, use the first one as the primary department for the user.department field
         if (validDepartments.length > 0) {
           finalDepartment = validDepartments[0];
         }
         
         // Get current active profiles
         const currentProfiles = user.profiles || [];
         const currentDepartmentSet = new Set(currentProfiles
           .filter(p => p.status === 'active')
           .map(p => p.department));
         
         // Convert new departments to set
         const newDepartmentSet = new Set(validDepartments);
         
         // Departments to add (in new but not in current)
         const departmentsToAdd = [...newDepartmentSet].filter(dept => !currentDepartmentSet.has(dept));
         
         // Departments to remove (in current but not in new)
         const departmentsToRemove = currentProfiles
           .filter(p => p.status === 'active' && !newDepartmentSet.has(p.department))
           .map(p => ({ 
             profileId: p.profileId,
             department: p.department 
           }));
         
         // Create profiles for new departments
         profilesToCreate = departmentsToAdd.map((dept, index) => ({
           department: dept,
           confidentialityLevels: req.body.confidentialityLevels && Array.isArray(req.body.confidentialityLevels) 
             ? req.body.confidentialityLevels 
             : (user.confidentialityLevels || ['public', 'internal']),
           isPrimary: false, // Will be set later
           status: 'active'
         }));
         
         // Profiles to deactivate
         profilesToDeactivate = departmentsToRemove;
       } else if (department) {
         // Handle single department update (legacy behavior)
         finalDepartment = department;
       }
       
       // Validate all departments
       if (req.body.departments && Array.isArray(req.body.departments)) {
         for (const dept of req.body.departments) {
           if (dept && dept.trim().length > 0) {
             const deptCheck = await validateDepartment(dept.trim());
             if (!deptCheck.valid) {
               return res.status(400).json({ success: false, message: `Invalid department '${dept.trim()}': ${deptCheck.error}` });
             }
           }
         }
       } else if (department) {
const deptCheck = await validateDepartment(department);
          if (!deptCheck.valid) {
            return res.status(400).json({ success: false, message: `Invalid department '${department}': ${deptCheck.error}` });
          }
        }
        
        // Prevent deactivating all active profiles
        if (profilesToDeactivate.length > 0) {
          const activeProfilesNow = user.profiles.filter(p => p.status === 'active');
          const profilesToDeactivateSet = new Set(profilesToDeactivate.map(p => p.profileId));
          const activeProfilesAfter = activeProfilesNow.filter(p => !profilesToDeactivateSet.has(p.profileId));
          if (activeProfilesAfter.length === 0) {
            return res.status(400).json({ 
              success: false, 
              message: "Cannot deactivate all active profiles" 
            });
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
       if (department) {
         // Use the processed department value
         if (user.department !== finalDepartment) {
           user.department = finalDepartment;
         }
       }

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
           return res.status(400).json({ success: false, message: `Invalid confidentiality level: ${normalizedConfidentiality.error}` });
         }
         user.confidentialityLevels = normalizedConfidentiality.levels;
       }

       // Handle profile synchronization
       if (req.body.departments && Array.isArray(req.body.departments)) {
         // Create new profiles for departments that don't exist
         for (const profileData of profilesToCreate) {
           // Check if profile already exists (shouldn't happen with our logic, but just in case)
           const existingProfileIndex = user.profiles.findIndex(p => 
             p.department === profileData.department && p.status === 'active'
           );
           
           if (existingProfileIndex === -1) {
             const newProfile = {
               profileId: new (require('mongoose')).Types.ObjectId(),
               department: profileData.department,
               confidentialityLevels: profileData.confidentialityLevels,
               isProfile: profileData.isProfile,
               status: profileData.status
             };
             
             user.profiles.push(newProfile);
           }
         }
         
         // Deactivate profiles for departments that are no longer in the list
         for (const profileInfo of profilesToDeactivate) {
           const profileIndex = user.profiles.findIndex(p => 
             p.profileId.equals(profileInfo.profileId)
           );
if (profileIndex !== -1) {
              user.profiles[profileIndex].status = 'inactive';
              user.profiles[profileIndex].updatedAt = new Date();
            }
         }
         
         // Ensure exactly one primary profile exists among active profiles
         let primarySet = false;
         // First, reset all to non-primary
         for (let i = 0; i < user.profiles.length; i++) {
           if (user.profiles[i].status === 'active') {
             user.profiles[i].isPrimary = false;
           }
         }
         
         // Then set the first active profile from our departments list as primary
         if (req.body.departments && req.body.departments.length > 0) {
           const firstDept = req.body.departments[0].trim().toUpperCase();
           for (let i = 0; i < user.profiles.length; i++) {
             if (user.profiles[i].status === 'active' && 
                 user.profiles[i].department === firstDept) {
               user.profiles[i].isPrimary = true;
               primarySet = true;
               break;
             }
           }
         }
         
         // If no primary was set (shouldn't happen, but just in case), set the first active profile as primary
         if (!primarySet) {
           for (let i = 0; i < user.profiles.length; i++) {
             if (user.profiles[i].status === 'active') {
               user.profiles[i].isPrimary = true;
               primarySet = true;
               break;
             }
           }
         }
       } else if (department) {
         // Handle single department update (legacy behavior)
         // Update the primary profile's department if it changed
         if (user.department !== department.toUpperCase()) {
           const primaryProfileIndex = user.profiles.findIndex(p => 
             p.isPrimary && p.status === 'active'
           );
           if (primaryProfileIndex !== -1) {
             user.profiles[primaryProfileIndex].department = department.toUpperCase();
           }
         }
       }

       user.updatedAt = new Date();

       await user.save();

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

       res.json({
         success: true,
         data: user
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