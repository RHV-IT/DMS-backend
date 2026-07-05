const cron = require('node-cron');
const File = require('../models/File');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const mongoose = require('mongoose');
const {
  MONTH_NAMES,
  getMonthStart,
  getMonthEnd,
  getYearStart,
  getYearEnd,
  findOrCreateYearFolder,
  findOrCreateMonthFolder
} = require('../utils/archiveFolders');

const TZ = (process.env.TZ || 'UTC').replace(/^:/, '');

const isLastDayOfMonth = (date) => {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getDate() === lastDay;
};

const isLastDayOfYear = (date) => {
  return date.getMonth() === 11 && date.getDate() === 31;
};

const getSystemUserId = (systemUser) => (systemUser ? systemUser._id : new mongoose.Types.ObjectId());

/**
 * Archive every file created in a given month that isn't already inside a folder.
 * Only touches files with folderId === null, so it is safe to call this repeatedly
 * for the same month (already-archived files are simply never matched again).
 * Never loads file documents into memory — discovers which departments have work
 * via distinct(), then a single updateMany per department.
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

        console.log(`[ARCHIVE] Archived ${movedCount} files to ${year}/${monthName} for ${dept}`);
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
      const yearFolder = await findOrCreateYearFolder(dept, year, systemUser, session);
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

let dailyCheckTask = null;

const startArchiveScheduler = () => {
  if (dailyCheckTask) {
    console.log('[ARCHIVE] Scheduler already running');
    return;
  }

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
  isLastDayOfMonth,
  isLastDayOfYear
};
