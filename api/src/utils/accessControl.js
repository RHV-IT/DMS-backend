/**
 * STRICT Department + Confidentiality Security Enforcement
 * Implements task requirements for server-side access control.
 * NO reliance on frontend or permission sharing for core rules.
 */

const mongoose = require('mongoose');

const CONFIDENTIALITY_LEVELS = {
  'public': 1,
  'internal': 2,
  'confidential': 3,
  'highly_confidential': 4
};

const LEVEL_ORDER = ['public', 'internal', 'confidential', 'highly_confidential'];

/**
 * Get user's effective confidentiality level (supports new single + legacy array)
 */
function getUserLevel(user) {
  if (!user) return 'public';
  if (typeof user.getConfidentialityLevel === 'function') {
    return user.getConfidentialityLevel();
  }
  if (user.confidentialityLevel) return user.confidentialityLevel;
  if (Array.isArray(user.confidentialityLevels) && user.confidentialityLevels.length > 0) {
    // pick highest for legacy
    const sorted = [...user.confidentialityLevels].sort((a, b) =>
      (CONFIDENTIALITY_LEVELS[b] || 0) - (CONFIDENTIALITY_LEVELS[a] || 0)
    );
    return sorted[0];
  }
  return 'public';
}

/**
 * canViewFile(user, file) - STRICT per task spec
 * - Admin: all
 * - Non-admin: own dept ONLY
 * - Conf matrix: user level allows <= files
 * - HIGHLY_CONFIDENTIAL: ONLY if uploadedBy === currentUserId (strict, no exceptions)
 */
function canViewFile(user, file) {
  if (!user || !file) return false;

  // Admin full bypass
  if (user.role === 'admin') {
    return true;
  }

  // Strict department isolation for ALL non-admins (hod/user/etc)
  const userDept = (user.department || '').toString().trim().toUpperCase();
  const fileDept = (file.department || '').toString().trim().toUpperCase();
  if (userDept !== fileDept || !userDept) {
    return false;
  }

  const userLevel = getUserLevel(user);
  const fileLevel = file.confidentialityLevel || 'internal';

  const userRank = CONFIDENTIALITY_LEVELS[userLevel] || 1;
  const fileRank = CONFIDENTIALITY_LEVELS[fileLevel] || 1;

  // Matrix: user can see files at their level or lower
  if (userRank < fileRank) {
    return false;
  }

  // HIGHLY CONFIDENTIAL special rule (overrides matrix): uploader ONLY
  if (fileLevel === 'highly_confidential') {
    const uploaderId = file.uploadedBy
      ? file.uploadedBy.toString()
      : (file.owner ? file.owner.toString() : null);
    const currentId = user._id ? user._id.toString() : null;
    if (uploaderId !== currentId) {
      return false;
    }
  }

  return true;
}

/**
 * canUploadLevel(user, level) - per task section 11
 */
function canUploadLevel(user, level) {
  if (!user || !level) return false;
  if (user.role === 'admin') return true;

  const userLevel = getUserLevel(user);
  const userRank = CONFIDENTIALITY_LEVELS[userLevel] || 1;
  const targetRank = CONFIDENTIALITY_LEVELS[level] || 1;

  // user rank >= target rank means can upload that level or lower
  return userRank >= targetRank;
}

/**
 * buildFileAccessQuery(user) - for DB query level enforcement
 * NEVER fetch all then filter. Use this as baseFilter in .find()
 * Task section 7,13: secure mongo query
 */
function buildFileAccessQuery(user) {
  const base = { isDeleted: { $ne: true } };

  if (!user) {
    // no user -> nothing (or public only? but require auth)
    return { _id: null };
  }

  if (user.role === 'admin') {
    return base; // all non-deleted
  }

  const userDept = user.department;
  const userLevel = getUserLevel(user);
  const userRank = CONFIDENTIALITY_LEVELS[userLevel] || 1;

  // levels this user is allowed (by matrix)
  const allowed = LEVEL_ORDER.filter((l, idx) => (idx + 1) <= userRank);

  const query = {
    ...base,
    department: userDept
  };

  if (allowed.includes('highly_confidential')) {
    // allow lower + high only for self
    query.$or = [
      { confidentialityLevel: { $in: allowed.filter(l => l !== 'highly_confidential') } },
      { confidentialityLevel: 'highly_confidential', uploadedBy: user._id }
    ];
  } else {
    query.confidentialityLevel = { $in: allowed };
  }

  return query;
}

/**
 * Legacy wrappers (updated to delegate to strict canViewFile for security)
 */
function canUserAccessFile(user, file, sharedPermissions = []) {
  // ignore sharedPermissions for strict enforcement; high conf is uploader only
  return canViewFile(user, file);
}

function canUserAccessFileContents(user, file, sharedPermissions = []) {
  return canViewFile(user, file); // same rules for contents per task
}

function canUserManageFile(user, file, sharedPermissions = []) {
  if (user && user.role === 'admin') return true;
  // for manage, stricter: must be able to view + owner or high rank?
  // task focuses on view/access; for manage keep similar but use view + owner for non-admin
  if (!canViewFile(user, file)) return false;
  const isOwner = file.owner && user._id && file.owner.toString() === user._id.toString();
  const isUploader = file.uploadedBy && user._id && file.uploadedBy.toString() === user._id.toString();
  return isOwner || isUploader;
}

function filterAccessibleFiles(user, allFiles, allPermissions = []) {
  // still supports but now strict
  return allFiles.filter(f => canViewFile(user, f));
}

function canConfidentialityLevelAccess(userLevel, fileLevel) {
  const u = CONFIDENTIALITY_LEVELS[userLevel] || 1;
  const f = CONFIDENTIALITY_LEVELS[fileLevel] || 1;
  return u >= f;
}

module.exports = {
  CONFIDENTIALITY_LEVELS,
  LEVEL_ORDER,
  getUserLevel,
  canViewFile,
  canUploadLevel,
  buildFileAccessQuery,
  // legacy names for existing code (now strict)
  canUserAccessFile,
  canUserAccessFileContents,
  canUserManageFile,
  filterAccessibleFiles,
  canConfidentialityLevelAccess
};
