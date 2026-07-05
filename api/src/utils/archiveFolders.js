const mongoose = require('mongoose');
const Folder = require('../models/Folder');

/**
 * Shared Year -> Month archive-folder helpers used by both the one-time
 * migration (archiveMigration.js) and the recurring scheduler (archiveScheduler.js),
 * so the two never drift into duplicate/incompatible folder-creation logic.
 *
 * Structure (per department, since Folder.department is required):
 *   2026
 *     January
 *     February
 *     ...
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const getMonthStart = (year, month) => new Date(year, month, 1, 0, 0, 0, 0);
const getMonthEnd = (year, month) => new Date(year, month + 1, 0, 23, 59, 59, 999);
const getYearStart = (year) => new Date(year, 0, 1, 0, 0, 0, 0);
const getYearEnd = (year) => new Date(year, 11, 31, 23, 59, 59, 999);

/**
 * Find an existing system folder or create it. Idempotent: calling this twice
 * with the same (name, parentId, department) never creates a duplicate.
 *
 * `counters`, if provided, gets `.yearsCreated` or `.foldersCreated` incremented
 * (per `kind`) whenever a NEW folder document is actually created — used by the
 * migration's summary log. The scheduler can omit `counters` entirely.
 */
const findOrCreateSystemFolder = async (name, parentId, department, user, session = null, counters = null, kind = null) => {
  // Folder.department is schema-forced uppercase on save, but Mongoose does not
  // apply that transform to query filters — normalize here so a lookup for the
  // same department always matches what was actually persisted (otherwise this
  // would create a duplicate folder on every call whose department isn't already
  // all-uppercase, breaking idempotency).
  const normalizedDepartment = String(department || '').toUpperCase();

  const query = {
    name,
    parentFolderId: parentId || null,
    department: normalizedDepartment,
    isSystemFolder: true,
    isDeleted: { $ne: true }
  };

  const existing = await Folder.findOne(query).session(session || null);
  if (existing) {
    return existing;
  }

  let path = name;
  let level = 0;
  if (parentId) {
    const parent = await Folder.findById(parentId).session(session || null);
    if (parent) {
      path = `${parent.path}/${name}`;
      level = parent.level + 1;
    }
  }

  const createOpts = session ? { session } : {};
  const [newFolder] = await Folder.create([{
    name,
    description: `Auto-created archive folder for ${name}`,
    parentFolderId: parentId || null,
    department: normalizedDepartment,
    confidentialityLevel: 'internal',
    createdBy: user ? user._id : new mongoose.Types.ObjectId(),
    isSystemFolder: true,
    path,
    level
  }], createOpts);

  if (counters) {
    if (kind === 'year') counters.yearsCreated = (counters.yearsCreated || 0) + 1;
    else if (kind === 'month') counters.foldersCreated = (counters.foldersCreated || 0) + 1;
  }

  return newFolder;
};

/**
 * Ensure the Year folder exists (at root, parentFolderId: null) for a department.
 */
const findOrCreateYearFolder = async (department, year, user, session = null, counters = null) => {
  return findOrCreateSystemFolder(String(year), null, department, user, session, counters, 'year');
};

/**
 * Ensure the Year -> Month chain exists for a department and return both folders.
 */
const findOrCreateMonthFolder = async (department, year, monthIndex, user, session = null, counters = null) => {
  const yearFolder = await findOrCreateYearFolder(department, year, user, session, counters);
  const monthFolder = await findOrCreateSystemFolder(MONTH_NAMES[monthIndex], yearFolder._id, department, user, session, counters, 'month');
  return { yearFolder, monthFolder };
};

module.exports = {
  MONTH_NAMES,
  getMonthStart,
  getMonthEnd,
  getYearStart,
  getYearEnd,
  findOrCreateSystemFolder,
  findOrCreateYearFolder,
  findOrCreateMonthFolder
};
