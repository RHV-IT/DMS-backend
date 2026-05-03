/**
 * Confidentiality access control utilities
 */

/**
 * Confidentiality hierarchy levels (higher number = more restrictive)
 */
const CONFIDENTIALITY_LEVELS = {
  'public': 1,
  'internal': 2,
  'confidential': 3,
  'highly_confidential': 4
};

/**
 * Check if a user's confidentiality level allows access to a file's confidentiality level
 * @param {string} userLevel - User's confidentiality level
 * @param {string} fileLevel - File's confidentiality level
 * @returns {boolean}
 */
function canConfidentialityLevelAccess(userLevel, fileLevel) {
  const userRank = CONFIDENTIALITY_LEVELS[userLevel] || 1;
  const fileRank = CONFIDENTIALITY_LEVELS[fileLevel] || 1;

  // Higher rank (number) means more restrictive access
  // Users can access files with equal or lower rank (less restrictive)
  return userRank >= fileRank;
}

/**
 * Check if user can access a file based on confidentiality rules
 * @param {Object} user - User object with department and confidentialityLevel
 * @param {Object} file - File object with department, confidentialityLevel, owner
 * @param {Array} sharedPermissions - Array of permission objects for this file
 * @returns {boolean}
 */
function canUserAccessFile(user, file, sharedPermissions = []) {
  // Admin can access everything
  if (user.role === 'admin') {
    return true;
  }

  const userDept = user.department;
  const fileDept = file.department;
  const userLevel = user.confidentialityLevel || 'public';
  const fileLevel = file.confidentialityLevel || 'internal';

  // Check if user is explicitly shared with this file (for highly confidential files)
  const isExplicitlyShared = sharedPermissions.some(perm =>
    perm.userId && perm.userId.toString() === user._id.toString() && !perm.isRevoked
  );

  // Check if user is the owner
  const isOwner = file.owner && file.owner.toString() === user._id.toString();

  // HOD can see ALL files in their department (but with restrictions for highly confidential)
  if (user.role === 'hod' && userDept === fileDept) {
    return true; // HOD can see all department files in archive listing
  }

  // HIGHLY CONFIDENTIAL files: only owner and explicitly shared users
  if (fileLevel === 'highly_confidential') {
    return isOwner || isExplicitlyShared;
  }

  // For all other levels: must be same department
  if (userDept !== fileDept) {
    // Exception: highly confidential files can be shared across departments
    if (fileLevel === 'highly_confidential' && isExplicitlyShared) {
      return true;
    }
    return false;
  }

  // Same department: check confidentiality level hierarchy
  return canConfidentialityLevelAccess(userLevel, fileLevel);
}

/**
 * Check if user can preview/download file contents (more restrictive than access)
 * @param {Object} user - User object
 * @param {Object} file - File object
 * @param {Array} sharedPermissions - Array of permission objects
 * @returns {boolean}
 */
function canUserAccessFileContents(user, file, sharedPermissions = []) {
  // Admin can access everything
  if (user.role === 'admin') {
    return true;
  }

  const userDept = user.department;
  const fileDept = file.department;
  const fileLevel = file.confidentialityLevel || 'internal';

  // Check if user is explicitly shared with this file
  const isExplicitlyShared = sharedPermissions.some(perm =>
    perm.userId && perm.userId.toString() === user._id.toString() && !perm.isRevoked
  );

  // Check if user is the owner
  const isOwner = file.owner && file.owner.toString() === user._id.toString();

  // HOD can access all department files EXCEPT highly confidential contents
  if (user.role === 'hod' && userDept === fileDept && fileLevel !== 'highly_confidential') {
    return true;
  }

  // For highly confidential files: HOD CANNOT access contents, only owner and explicitly shared users
  if (fileLevel === 'highly_confidential') {
    return isOwner || isExplicitlyShared;
  }

  // For other files: use standard access rules
  return canUserAccessFile(user, file, sharedPermissions);
}

/**
 * Check if user can manage (update/delete/share) a file
 * @param {Object} user - User object
 * @param {Object} file - File object
 * @param {Array} sharedPermissions - Array of permission objects
 * @returns {boolean}
 */
function canUserManageFile(user, file, sharedPermissions = []) {
  // Admin can manage everything
  if (user.role === 'admin') {
    return true;
  }

  const userDept = user.department;
  const fileDept = file.department;
  const fileLevel = file.confidentialityLevel || 'internal';

  // Check if user is the owner
  const isOwner = file.owner && file.owner.toString() === user._id.toString();

  // HOD can manage all department files EXCEPT highly confidential
  if (user.role === 'hod' && userDept === fileDept && fileLevel !== 'highly_confidential') {
    return true;
  }

  // For highly confidential files: only owner can manage
  if (fileLevel === 'highly_confidential') {
    return isOwner;
  }

  // For other files: owner can manage, or users with edit permissions
  if (isOwner) {
    return true;
  }

  // Check for explicit edit permissions
  const hasEditPermission = sharedPermissions.some(perm =>
    perm.userId && perm.userId.toString() === user._id.toString() &&
    perm.access === 'edit' && !perm.isRevoked
  );

  return hasEditPermission;
}

/**
 * Get files accessible to user based on department and confidentiality rules
 * @param {Object} user - User object
 * @param {Array} allFiles - Array of all files
 * @param {Array} allPermissions - Array of all permissions
 * @returns {Array} - Filtered array of accessible files
 */
function filterAccessibleFiles(user, allFiles, allPermissions) {
  // Create permission lookup map for faster access
  const permissionMap = new Map();
  allPermissions.forEach(perm => {
    if (!perm.isRevoked) {
      const fileId = perm.fileId.toString();
      if (!permissionMap.has(fileId)) {
        permissionMap.set(fileId, []);
      }
      permissionMap.get(fileId).push(perm);
    }
  });

  return allFiles.filter(file => {
    const filePermissions = permissionMap.get(file._id.toString()) || [];
    return canUserAccessFile(user, file, filePermissions);
  });
}

module.exports = {
  CONFIDENTIALITY_LEVELS,
  canConfidentialityLevelAccess,
  canUserAccessFile,
  canUserAccessFileContents,
  canUserManageFile,
  filterAccessibleFiles
};