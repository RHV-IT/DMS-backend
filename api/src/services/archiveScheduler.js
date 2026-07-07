const cron = require('node-cron');
const File = require('../models/File');
const Folder = require('../models/Folder');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const mongoose = require('mongoose');
const {
  MONTH_NAMES,
  getMonthStart,
  getMonthEnd,
  isLastDayOfMonth,
  isLastDayOfYear,
  isMonthArchivable,
  findOrCreateMonthFolder
} = require('../utils/archiveFolders');

const TZ = (process.env.TZ || 'UTC').replace(/^:/, '');

const getSystemUserId = (systemUser) => (systemUser ? systemUser._id : new mongoose.Types.ObjectId());

/**
 * Self-healing repair pass: every existing Month system folder must represent an
 * ALREADY-COMPLETED month. Validates each one against the same isMonthArchivable
 * truth used to gate archiving itself, so this can never conflict with legitimate
 * end-of-month archiving happening in the same tick (a folder created for a month
 * that just completed on its last day is, by definition, archivable, so it is left
 * alone). Anything that fails the check — e.g. a folder left over from earlier
 * buggy logic that archived a month before it had finished — has its files moved
 * back to root (folderId: null) and the folder removed. Idempotent: once cleaned
 * up, later calls find nothing and are a fast no-op. Safe to run on every boot and
 * on every daily tick.
 */
const reconcileActiveMonthFolders = async () => {
  const yearFolders = await Folder.find({ isSystemFolder: true, parentFolderId: null, isDeleted: { $ne: true } });

  for (const yearFolder of yearFolders) {
    const year = parseInt(yearFolder.name, 10);
    if (!Number.isFinite(year)) continue; // not one of ours, leave alone

    const monthFolders = await Folder.find({
      parentFolderId: yearFolder._id,
      isSystemFolder: true,
      isDeleted: { $ne: true }
    });

    for (const monthFolder of monthFolders) {
      const monthIndex = MONTH_NAMES.indexOf(monthFolder.name);
      if (monthIndex === -1) continue; // not a recognized month folder, leave alone
      if (isMonthArchivable(year, monthIndex)) continue; // legitimate, already-completed month

      const result = await File.updateMany(
        { folderId: monthFolder._id },
        { $set: { folderId: null } }
      );

      monthFolder.isDeleted = true;
      monthFolder.deletedAt = new Date();
      await monthFolder.save();

      console.log(`[ARCHIVE REPAIR] Removed premature ${monthFolder.name} ${year} folder for department ${monthFolder.department} — moved ${result.modifiedCount || 0} file(s) back to their normal location.`);
    }
  }
};

/**
 * Archive every file created in a given month that isn't already inside a folder.
 *
 * Refuses to touch the active (in-progress) or any future month — this guard is
 * enforced here, inside the core function, so it protects every caller (the daily
 * scheduler, the yearly reconciliation loop, and manual triggers) uniformly: files
 * uploaded during the current month always stay visible at their normal location
 * until the month actually completes.
 *
 * Only touches files with folderId === null, so it is safe to call this repeatedly
 * for the same month (already-archived files are simply never matched again).
 * Never loads file documents into memory — discovers which departments have work
 * via distinct(), then a single updateMany per department.
 */
const performMonthlyArchive = async (date, systemUser) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const monthName = MONTH_NAMES[month];

  if (!isMonthArchivable(year, month)) {
    console.log(`[ARCHIVE] Skipping ${monthName} ${year} — month is still active/in the future, not archivable yet`);
    return { skipped: true, departmentsProcessed: 0, filesMoved: 0 };
  }

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
    return { skipped: false, departmentsProcessed: 0, filesMoved: 0 };
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

  return { skipped: false, departmentsProcessed: departments.length, filesMoved: totalMoved };
};

/**
 * Reconcile every month of the given year. Relies entirely on performMonthlyArchive's
 * own active/future-month guard, so it is always safe to call — including for the
 * current year mid-year, where every month up to and including the completed
 * portion gets archived and the active month is automatically skipped. Year folders
 * are never created independently; they only ever come into existence as a side
 * effect of a month actually being archived.
 */
const performYearlyArchive = async (date, systemUser) => {
  const year = date.getFullYear();

  console.log(`[ARCHIVE] Starting yearly archive reconciliation for ${year}`);

  for (let month = 0; month < 12; month++) {
    await performMonthlyArchive(new Date(year, month, 1), systemUser);
  }

  console.log(`[ARCHIVE] Yearly archive reconciliation for ${year} completed`);
};

let dailyCheckTask = null;

const startArchiveScheduler = () => {
  if (dailyCheckTask) {
    console.log('[ARCHIVE] Scheduler already running');
    return;
  }

  // Fire-and-forget: heal any premature archive folder left over from earlier
  // logic that didn't respect the active-month rule. Idempotent and cheap once
  // cleaned up.
  reconcileActiveMonthFolders().catch((err) => console.error('[ARCHIVE REPAIR] Startup reconciliation failed:', err.message));

  dailyCheckTask = cron.schedule('59 23 * * *', async () => {
    const now = new Date();
    console.log(`[ARCHIVE] Daily archive check at ${now.toISOString()}`);

    try {
      await reconcileActiveMonthFolders();

      const systemUser = await User.findOne({ role: 'admin' }).select('_id');

      // Safety net: always reconcile last month too, so a missed month-end trigger
      // (e.g. server restart at exactly 23:59) is caught within a day, not skipped
      // forever. Idempotent — already-archived months just match zero files, and
      // performMonthlyArchive's own guard means this can never touch the active month.
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

/**
 * Manual/admin trigger. Safe to call for any date at any time — performMonthlyArchive's
 * guard means the active or a future month is simply skipped and logged, never archived.
 */
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
  reconcileActiveMonthFolders,
  isLastDayOfMonth,
  isLastDayOfYear
};
