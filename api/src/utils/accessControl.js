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
 * Get user's effective (highest) confidentiality level - uses ONLY array
 */
function getUserLevel(user) {
  if (!user) return 'public';
  if (typeof user.getConfidentialityLevel === 'function') {
    return user.getConfidentialityLevel();
  }
  if (Array.isArray(user.confidentialityLevels) && user.confidentialityLevels.length > 0) {
    const sorted = [...user.confidentialityLevels].sort((a, b) =>
      (CONFIDENTIALITY_LEVELS[b] || 0) - (CONFIDENTIALITY_LEVELS[a] || 0)
    );
    return sorted[0];
  }
  return 'public';
}

/**
 * canViewFile(user, file, permissions = []) 
 * 
 * Sharing is the ONLY way to view files that violate normal rules:
 *   - above your confidentiality level, or
 *   - outside your department
 * 
 * Priority:
 * 1. Admin → always true
 * 2. Explicitly shared with this user (active non-revoked Permission) → true (bypass dept/level/high rules)
 * 3. Otherwise: strict dept + matrix + high-conf only uploader
 */
function canViewFile(user, file, permissions = []) {
  if (!user || !file) return false;

  // 1. Admin full bypass
  if (user.role === 'admin') {
    return true;
  }

  // 2. Sharing bypass (the ONLY exception to dept/level/high rules)
  const fileIdStr = file._id ? file._id.toString() : (file.fileId || '');
  const userIdStr = user._id ? user._id.toString() : '';

  const isExplicitlyShared = permissions.some(perm => {
    if (perm.isRevoked) return false;
    const permFileId = perm.fileId ? perm.fileId.toString() : '';
    const permUserId = perm.userId ? perm.userId.toString() : '';
    return permFileId === fileIdStr && permUserId === userIdStr;
  });

  if (isExplicitlyShared) {
    return true;
  }

  // 3. Strict rules (only reached if NOT shared)
  const userDept = (user.department || '').toString().trim().toUpperCase();
  const fileDept = (file.department || '').toString().trim().toUpperCase();

  if (userDept !== fileDept || !userDept) {
    return false;
  }

  const fileLevel = file.confidentialityLevel || 'internal';
  const userLevels = Array.isArray(user.confidentialityLevels) ? user.confidentialityLevels : [];

  // ONLY allow if file level is explicitly in user's allowed list (array membership)
  if (!userLevels.includes(fileLevel)) {
    return false;
  }

  // HIGHLY CONFIDENTIAL: ONLY uploader (even if in list). Shared already handled above.
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
 * canUploadLevel(user, level) - uses ONLY array membership (no singular/rank)
 * Matches: requestedLevel must be in user.confidentialityLevels
 */
function canUploadLevel(user, level) {
  if (!user || !level) return false;
  if (user.role === 'admin') return true;

  const userLevels = Array.isArray(user.confidentialityLevels) ? user.confidentialityLevels : [];
  return userLevels.includes(level);
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
  const userLevels = Array.isArray(user.confidentialityLevels) ? user.confidentialityLevels : [];

  const query = {
    ...base,
    department: userDept
  };

  const hasHigh = userLevels.includes('highly_confidential');
  const nonHighLevels = userLevels.filter(l => l !== 'highly_confidential');

  if (hasHigh) {
    // lower (from list) + own high files only
    if (nonHighLevels.length > 0) {
      query.$or = [
        { confidentialityLevel: { $in: nonHighLevels } },
        { confidentialityLevel: 'highly_confidential', uploadedBy: user._id }
      ];
    } else {
      query.confidentialityLevel = 'highly_confidential';
      query.uploadedBy = user._id;
    }
  } else if (userLevels.length > 0) {
    query.confidentialityLevel = { $in: userLevels };
  } else {
    // no access
    query._id = null;
  }

  return query;
}

/**
 * Legacy wrappers (updated to delegate to strict canViewFile for security)
 */
function canUserAccessFile(user, file, sharedPermissions = []) {
  return canViewFile(user, file, sharedPermissions);
}

function canUserAccessFileContents(user, file, sharedPermissions = []) {
  return canViewFile(user, file, sharedPermissions);
}

function canUserManageFile(user, file, sharedPermissions = []) {
  if (user && user.role === 'admin') return true;

  // Sharing also grants manage if they have 'edit' permission
  const fileIdStr = file._id ? file._id.toString() : '';
  const userIdStr = user._id ? user._id.toString() : '';

  const hasEditShare = sharedPermissions.some(p =>
    !p.isRevoked &&
    (p.fileId ? p.fileId.toString() : '') === fileIdStr &&
    (p.userId ? p.userId.toString() : '') === userIdStr &&
    (p.access === 'edit' || p.access === 'download') // treat download/edit as management capable for now
  );

  if (hasEditShare) return true;

  if (!canViewFile(user, file, sharedPermissions)) return false;

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

function canViewFolder(user, folder) {
  if (!user || !folder) return false;
  if (user.role === 'admin') return true;
  if (folder.department !== user.department) return false;

  const userLevels = Array.isArray(user.confidentialityLevels) ? user.confidentialityLevels : [];
  return userLevels.includes(folder.confidentialityLevel) || folder.confidentialityLevel === 'public';
}

function canManageFolder(user, folder) {
  if (!user || !folder) return false;
  if (user.role === 'admin') return true;
  if (folder.isSystemFolder) return false;
  if (folder.department !== user.department) return false;
  return folder.createdBy && folder.createdBy.toString() === user._id.toString();
}

module.exports = {
  CONFIDENTIALITY_LEVELS,
  LEVEL_ORDER,
  getUserLevel,
  canViewFile,
  canUploadLevel,
  buildFileAccessQuery,
  canViewFolder,
  canManageFolder,
  // legacy names for existing code (now strict)
  canUserAccessFile,
  canUserAccessFileContents,
  canUserManageFile,
  filterAccessibleFiles,
  canConfidentialityLevelAccess
};
