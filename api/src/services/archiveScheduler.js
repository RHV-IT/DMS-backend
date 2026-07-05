const cron = require('node-cron');
const Folder = require('../models/Folder');
const File = require('../models/File');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const mongoose = require('mongoose');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const TZ = (process.env.TZ || 'UTC').replace(/^:/, '');

const ARCHIVE_ROOT_NAME = 'Archive';

const isLastDayOfMonth = (date) => {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getDate() === lastDay;
};

const isLastDayOfYear = (date) => {
  return date.getMonth() === 11 && date.getDate() === 31;
};

const getMonthStart = (year, month) => new Date(year, month, 1, 0, 0, 0, 0);
const getMonthEnd = (year, month) => new Date(year, month + 1, 0, 23, 59, 59, 999);
const getYearStart = (year) => new Date(year, 0, 1, 0, 0, 0, 0);
const getYearEnd = (year) => new Date(year, 11, 31, 23, 59, 59, 999);

const getSystemUserId = (systemUser) => (systemUser ? systemUser._id : new mongoose.Types.ObjectId());

/**
 * Find an existing system folder or create it. Idempotent: a second call with the
 * same (name, parentId, department) never creates a duplicate.
 */
const findOrCreateSystemFolder = async (name, parentId, department, user, session = null) => {
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

  return newFolder;
};

/**
 * Ensure the Archive -> Year -> Month system-folder chain exists for a department
 * and return the Month folder. Idempotent — safe to call repeatedly.
 */
const findOrCreateMonthFolder = async (department, year, monthIndex, user, session = null) => {
  const archiveFolder = await findOrCreateSystemFolder(ARCHIVE_ROOT_NAME, null, department, user, session);
  const yearFolder = await findOrCreateSystemFolder(String(year), archiveFolder._id, department, user, session);
  const monthFolder = await findOrCreateSystemFolder(MONTH_NAMES[monthIndex], yearFolder._id, department, user, session);
  return { archiveFolder, yearFolder, monthFolder };
};

/**
 * Ensure the Archive -> Year chain exists for a department and return the Year folder.
 */
const findOrCreateYearFolder = async (department, year, user, session = null) => {
  const archiveFolder = await findOrCreateSystemFolder(ARCHIVE_ROOT_NAME, null, department, user, session);
  const yearFolder = await findOrCreateSystemFolder(String(year), archiveFolder._id, department, user, session);
  return { archiveFolder, yearFolder };
};

/**
 * Archive every file created in a given month that isn't already inside a folder.
 * Only touches files with folderId === null, so it is safe to call this repeatedly
 * for the same month (already-archived files are simply never matched again).
 * Never loads file documents into memory — uses distinct() to discover which
 * departments have work, then a single updateMany per department.
 */
const performMonthlyArchive = async (date, systemUser) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const monthName = MONTH_NAMES[month];

  const monthStart = getMonthStart(year, month);
  const monthEnd = getMonthEnd(year, month);

  const baseMatch = {
    createdAt: { $gte: monthStart, $lte: monthEnd },
    isDeleted: { $ne: true },
    folderId: null
  };

  const departments = await File.distinct('department', baseMatch);

  if (departments.length === 0) {
    console.log(`[ARCHIVE] No unarchived files for ${monthName} ${year}`);
    return { departmentsProcessed: 0, filesMoved: 0 };
  }

  let totalMoved = 0;

  for (const dept of departments) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { monthFolder } = await findOrCreateMonthFolder(dept, year, month, systemUser, session);

      const result = await File.updateMany(
        { ...baseMatch, department: dept },
        { $set: { folderId: monthFolder._id } },
        { session }
      );

      await session.commitTransaction();

      const movedCount = result.modifiedCount || 0;
      totalMoved += movedCount;

      if (movedCount > 0) {
        try {
          await AuditLog.create({
            userId: getSystemUserId(systemUser),
            userEmail: 'system@archive',
            action: 'archive',
            resource: 'folder',
            resourceId: monthFolder._id,
            details: { type: 'monthly', month: monthName, year, fileCount: movedCount, department: dept }
          });
        } catch (auditError) {
          console.error('Failed to write audit log for archive (monthly):', auditError.message);
        }

        console.log(`[ARCHIVE] Archived ${movedCount} files to Archive/${year}/${monthName} for ${dept}`);
      }
    } catch (err) {
      await session.abortTransaction();
      console.error(`[ARCHIVE] Error archiving ${dept} for ${monthName} ${year}:`, err.message);
    } finally {
      session.endSession();
    }
  }

  return { departmentsProcessed: departments.length, filesMoved: totalMoved };
};

/**
 * Year-end safety net: reconcile every month of the given year (idempotent — months
 * already archived simply match zero files) and make sure the Year system folder
 * exists, even for departments whose only activity was in months with no files left
 * to move.
 */
const performYearlyArchive = async (date, systemUser) => {
  const year = date.getFullYear();

  console.log(`[ARCHIVE] Starting yearly archive reconciliation for ${year}`);

  for (let month = 0; month < 12; month++) {
    await performMonthlyArchive(new Date(year, month, 1), systemUser);
  }

  const departments = await File.distinct('department', {
    createdAt: { $gte: getYearStart(year), $lte: getYearEnd(year) },
    isDeleted: { $ne: true }
  });

  for (const dept of departments) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { yearFolder } = await findOrCreateYearFolder(dept, year, systemUser, session);
      await session.commitTransaction();

      try {
        await AuditLog.create({
          userId: getSystemUserId(systemUser),
          userEmail: 'system@archive',
          action: 'archive',
          resource: 'folder',
          resourceId: yearFolder._id,
          details: { type: 'yearly', year, department: dept, status: 'verified' }
        });
      } catch (auditError) {
        console.error('Failed to write audit log for archive (yearly):', auditError.message);
      }
    } catch (err) {
      await session.abortTransaction();
      console.error(`[ARCHIVE] Error in yearly archive for ${dept}:`, err.message);
    } finally {
      session.endSession();
    }
  }

  console.log(`[ARCHIVE] Yearly archive reconciliation for ${year} completed`);
};

/**
 * One-time (but idempotent) migration of every pre-existing file that has never
 * been placed in a folder. Groups files by department/year/month using an
 * aggregation (never loads file documents into memory — the result set is bounded
 * by the number of department/month combinations, not the number of files) then
 * moves each group with a single bulk updateMany. Safe to run on every server
 * boot: after the first successful run, every file has folderId set, so the
 * aggregation returns nothing and this becomes a fast no-op.
 */
const migrateExistingFilesToArchive = async (systemUser) => {
  console.log('[ARCHIVE] Checking for unarchived historical files to migrate...');

  const groups = await File.aggregate([
    { $match: { folderId: null, isDeleted: { $ne: true } } },
    {
      $group: {
        _id: {
          department: '$department',
          year: { $year: { date: '$createdAt', timezone: TZ } },
          month: { $month: { date: '$createdAt', timezone: TZ } }
        },
        count: { $sum: 1 }
      }
    }
  ]);

  if (groups.length === 0) {
    console.log('[ARCHIVE] Migration: no unarchived files found, nothing to do.');
    return { groupsProcessed: 0, filesMoved: 0 };
  }

  console.log(`[ARCHIVE] Migration: found ${groups.length} department/month group(s) to migrate`);

  let totalMoved = 0;

  for (const group of groups) {
    const { department, year, month } = group._id;
    const monthIndex = month - 1; // Mongo $month is 1-12
    const monthName = MONTH_NAMES[monthIndex];

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { monthFolder } = await findOrCreateMonthFolder(department, year, monthIndex, systemUser, session);

      const result = await File.updateMany(
        {
          department,
          folderId: null,
          isDeleted: { $ne: true },
          createdAt: { $gte: getMonthStart(year, monthIndex), $lte: getMonthEnd(year, monthIndex) }
        },
        { $set: { folderId: monthFolder._id } },
        { session }
      );

      await session.commitTransaction();

      const movedCount = result.modifiedCount || 0;
      totalMoved += movedCount;
      console.log(`[ARCHIVE] Migration: moved ${movedCount} files to Archive/${year}/${monthName} for ${department}`);
    } catch (err) {
      await session.abortTransaction();
      console.error(`[ARCHIVE] Migration error for ${department} ${monthName} ${year}:`, err.message);
    } finally {
      session.endSession();
    }
  }

  try {
    await AuditLog.create({
      userId: getSystemUserId(systemUser),
      userEmail: 'system@archive',
      action: 'archive',
      resource: 'folder',
      details: { type: 'migration', groups: groups.length, filesMoved: totalMoved }
    });
  } catch (auditError) {
    console.error('Failed to write audit log for archive migration:', auditError.message);
  }

  console.log(`[ARCHIVE] Migration completed: ${totalMoved} file(s) moved across ${groups.length} group(s)`);
  return { groupsProcessed: groups.length, filesMoved: totalMoved };
};

let dailyCheckTask = null;
let migrationRun = false;

const runOneTimeMigration = async () => {
  if (migrationRun) return;
  migrationRun = true;

  try {
    const systemUser = await User.findOne({ role: 'admin' }).select('_id');
    await migrateExistingFilesToArchive(systemUser);
  } catch (err) {
    console.error('[ARCHIVE] One-time migration failed:', err.message);
    // allow a later retry (e.g. next boot) since nothing was marked as migrated
    migrationRun = false;
  }
};

const startArchiveScheduler = () => {
  if (dailyCheckTask) {
    console.log('[ARCHIVE] Scheduler already running');
    return;
  }

  // Fire-and-forget: migrate any historical unfoldered files. Idempotent, so it is
  // cheap to attempt this on every boot (subsequent boots find nothing to do).
  runOneTimeMigration().catch((err) => console.error('[ARCHIVE] Migration error:', err.message));

  dailyCheckTask = cron.schedule('59 23 * * *', async () => {
    const now = new Date();
    console.log(`[ARCHIVE] Daily archive check at ${now.toISOString()}`);

    try {
      const systemUser = await User.findOne({ role: 'admin' }).select('_id');

      // Safety net: always reconcile last month too, so a missed month-end trigger
      // (e.g. server restart at exactly 23:59) is caught within a day, not skipped
      // forever. Idempotent — already-archived months just match zero files.
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      await performMonthlyArchive(lastMonthDate, systemUser);

      if (isLastDayOfMonth(now)) {
        await performMonthlyArchive(now, systemUser);
      }

      if (now.getMonth() === 0) {
        // Safety net for last year, same reasoning as above.
        await performYearlyArchive(new Date(now.getFullYear() - 1, 11, 31), systemUser);
      }

      if (isLastDayOfYear(now)) {
        await performYearlyArchive(now, systemUser);
      }
    } catch (err) {
      console.error('[ARCHIVE] Error in daily check:', err.message);
    }
  }, {
    timezone: TZ
  });

  console.log('[ARCHIVE] Archive scheduler started - runs daily at 23:59');
};

const stopArchiveScheduler = () => {
  if (dailyCheckTask) {
    dailyCheckTask.stop();
    dailyCheckTask = null;
  }
  console.log('[ARCHIVE] Archive scheduler stopped');
};

const runManualArchive = async (date) => {
  const systemUser = await User.findOne({ role: 'admin' }).select('_id');
  const archiveDate = date ? new Date(date) : new Date();

  console.log(`[ARCHIVE] Manual archive triggered for ${archiveDate.toISOString()}`);

  await performMonthlyArchive(archiveDate, systemUser);
  await performYearlyArchive(archiveDate, systemUser);

  console.log('[ARCHIVE] Manual archive completed');
};

module.exports = {
  startArchiveScheduler,
  stopArchiveScheduler,
  runManualArchive,
  performMonthlyArchive,
  performYearlyArchive,
  migrateExistingFilesToArchive,
  isLastDayOfMonth,
  isLastDayOfYear
};
