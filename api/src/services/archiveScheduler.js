const cron = require('node-cron');
const Folder = require('../models/Folder');
const File = require('../models/File');
const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

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

const findOrCreateSystemFolder = async (name, parentId, department, user, session = null) => {
  const query = {
    name,
    parentFolderId: parentId || null,
    department,
    isSystemFolder: true,
    isDeleted: { $ne: true }
  };

  let folder = await Folder.findOne(query);
  if (folder) {
    return folder;
  }

  let path = name;
  let level = 0;
  if (parentId) {
    const parent = await Folder.findById(parentId);
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
    department,
    confidentialityLevel: 'internal',
    createdBy: user ? user._id : new mongoose.Types.ObjectId(),
    isSystemFolder: true,
    path,
    level
  }], createOpts);

  return newFolder;
};

const performMonthlyArchive = async (date, systemUser) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const monthName = MONTH_NAMES[month];

  console.log(`[ARCHIVE] Starting monthly archive for ${monthName} ${year}`);

  const departments = await File.distinct('department', {
    createdAt: { $gte: getMonthStart(year, month), $lte: getMonthEnd(year, month) },
    isDeleted: { $ne: true },
    folderId: null
  });

  console.log(`[ARCHIVE] Found ${departments.length} departments with unarchived files`);

  for (const dept of departments) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const yearFolder = await findOrCreateSystemFolder(String(year), null, dept, systemUser, session);
      const monthFolder = await findOrCreateSystemFolder(monthName, yearFolder._id, dept, systemUser, session);

      const files = await File.find({
        department: dept,
        createdAt: { $gte: getMonthStart(year, month), $lte: getMonthEnd(year, month) },
        isDeleted: { $ne: true },
        folderId: null
      }).session(session);

      let archivedCount = 0;
      if (files.length > 0) {
        const fileIds = files.map(f => f._id);
        await File.updateMany(
          { _id: { $in: fileIds } },
          { folderId: monthFolder._id },
          { session }
        );
        archivedCount = files.length;
      }

      await session.commitTransaction();

      if (archivedCount > 0) {
        try {
          await AuditLog.create({
            userId: systemUser ? systemUser._id : new mongoose.Types.ObjectId(),
            userEmail: 'system@archive',
            action: 'archive',
            resource: 'folder',
            resourceId: monthFolder._id,
            details: {
              type: 'monthly',
              month: monthName,
              year,
              fileCount: archivedCount,
              department: dept
            }
          });
        } catch (auditError) {
          console.error('Failed to write audit log for archive (monthly):', auditError.message);
        }

        console.log(`[ARCHIVE] Archived ${archivedCount} files to ${monthName} ${year} for ${dept}`);
      } else {
        console.log(`[ARCHIVE] No unarchived files for ${dept} in ${monthName} ${year}`);
      }
    } catch (err) {
      await session.abortTransaction();
      console.error(`[ARCHIVE] Error archiving ${dept} for ${monthName} ${year}:`, err.message);
    } finally {
      session.endSession();
    }
  }

  console.log(`[ARCHIVE] Monthly archive for ${monthName} ${year} completed`);
};

const performYearlyArchive = async (date, systemUser) => {
  const year = date.getFullYear();

  console.log(`[ARCHIVE] Starting yearly archive verification for ${year}`);

  const departments = await File.distinct('department', {
    createdAt: { $gte: getYearStart(year), $lte: getYearEnd(year) },
    isDeleted: { $ne: true }
  });

  for (const dept of departments) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const yearFolder = await findOrCreateSystemFolder(String(year), null, dept, systemUser, session);

      await session.commitTransaction();

      try {
        await AuditLog.create({
          userId: systemUser ? systemUser._id : new mongoose.Types.ObjectId(),
          userEmail: 'system@archive',
          action: 'archive',
          resource: 'folder',
          resourceId: yearFolder._id,
          details: {
            type: 'yearly',
            year,
            department: dept,
            status: 'verified'
          }
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

  console.log(`[ARCHIVE] Yearly archive verification for ${year} completed`);
};

let dailyCheckTask = null;

const startArchiveScheduler = () => {
  if (dailyCheckTask) {
    console.log('[ARCHIVE] Scheduler already running');
    return;
  }

  const rawTz = (process.env.TZ || 'UTC').replace(/^:/, '');
  dailyCheckTask = cron.schedule('59 23 * * *', async () => {
    const now = new Date();
    console.log(`[ARCHIVE] Daily archive check at ${now.toISOString()}`);

    try {
      const systemUser = await require('../models/User').findOne({ role: 'admin' }).select('_id');

      if (isLastDayOfMonth(now)) {
        await performMonthlyArchive(now, systemUser);
      }

      if (isLastDayOfYear(now)) {
        await performYearlyArchive(now, systemUser);
      }
    } catch (err) {
      console.error('[ARCHIVE] Error in daily check:', err.message);
    }
  }, {
    timezone: rawTz
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
  const systemUser = await require('../models/User').findOne({ role: 'admin' }).select('_id');
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
