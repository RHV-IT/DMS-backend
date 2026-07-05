const mongoose = require('mongoose');
const File = require('../models/File');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const ArchiveMigrationStatus = require('../models/ArchiveMigrationStatus');
const { getMonthStart, getMonthEnd, findOrCreateMonthFolder, MONTH_NAMES } = require('../utils/archiveFolders');

const TZ = (process.env.TZ || 'UTC').replace(/^:/, '');

/**
 * One-time migration: place every pre-existing file that predates the archive
 * scheduler into its correct Year -> Month folder, based on createdAt.
 *
 * - Ignores deleted files.
 * - Ignores files already inside a folder (folderId != null) — including files
 *   already archived by a previous migration run or by the scheduler.
 * - Never loads individual file documents into memory: an aggregation discovers
 *   which (department, year, month) groups have work, then each group is moved
 *   with a single bulk updateMany — safe for 100,000+ files.
 * - Idempotent: safe to call on every server boot. After the first successful
 *   run it records completion in ArchiveMigrationStatus and skips on subsequent
 *   boots unless FORCE_ARCHIVE_MIGRATION=true.
 */
const runArchiveMigration = async ({ force = false } = {}) => {
  const startedAt = Date.now();
  const shouldForce = force || String(process.env.FORCE_ARCHIVE_MIGRATION).toLowerCase() === 'true';

  if (!shouldForce) {
    const status = await ArchiveMigrationStatus.findOne({ completed: true });
    if (status) {
      console.log(`[ARCHIVE MIGRATION] Already completed at ${status.completedAt?.toISOString()}, skipping. Set FORCE_ARCHIVE_MIGRATION=true to re-run.`);
      return { skipped: true, previousStats: status.stats };
    }
  }

  console.log('[ARCHIVE MIGRATION] Starting...');

  const counters = {
    foldersCreated: 0,
    yearsCreated: 0
  };

  const [filesTotal, filesDeleted, filesAlreadyArchived] = await Promise.all([
    File.countDocuments({}),
    File.countDocuments({ isDeleted: true }),
    File.countDocuments({ isDeleted: { $ne: true }, folderId: { $ne: null } })
  ]);

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

  const systemUser = await User.findOne({ role: 'admin' }).select('_id');

  let filesMoved = 0;
  let groupsFailed = 0;

  for (const group of groups) {
    const { department, year, month } = group._id;
    const monthIndex = month - 1; // Mongo $month is 1-12
    const monthName = MONTH_NAMES[monthIndex];

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { monthFolder } = await findOrCreateMonthFolder(department, year, monthIndex, systemUser, session, counters);

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
      filesMoved += movedCount;
      console.log(`[ARCHIVE MIGRATION] Moved ${movedCount} file(s) -> ${year}/${monthName} (${department})`);
    } catch (err) {
      await session.abortTransaction();
      groupsFailed++;
      console.error(`[ARCHIVE MIGRATION] Failed for ${department} ${monthName} ${year}:`, err.message);
    } finally {
      session.endSession();
    }
  }

  const durationMs = Date.now() - startedAt;

  const stats = {
    filesScanned: filesTotal,
    filesMoved,
    foldersCreated: counters.foldersCreated,
    yearsCreated: counters.yearsCreated,
    skippedDeleted: filesDeleted,
    alreadyArchived: filesAlreadyArchived,
    groupsProcessed: groups.length,
    groupsFailed,
    durationMs
  };

  console.log('[ARCHIVE MIGRATION] Summary:');
  console.log(`  Files scanned:     ${stats.filesScanned}`);
  console.log(`  Files moved:       ${stats.filesMoved}`);
  console.log(`  Folders created:   ${stats.foldersCreated}`);
  console.log(`  Years created:     ${stats.yearsCreated}`);
  console.log(`  Skipped (deleted): ${stats.skippedDeleted}`);
  console.log(`  Already archived:  ${stats.alreadyArchived}`);
  console.log(`  Duration:          ${durationMs}ms`);

  // Only mark as fully completed if every group succeeded — a partial failure
  // (e.g. a transient DB error on one department/month) should be retried on
  // the next boot rather than silently marked done forever.
  if (groupsFailed === 0) {
    await ArchiveMigrationStatus.findOneAndUpdate(
      {},
      { completed: true, completedAt: new Date(), stats },
      { upsert: true }
    );
  } else {
    console.warn(`[ARCHIVE MIGRATION] ${groupsFailed} group(s) failed — migration will retry on next boot.`);
  }

  try {
    await AuditLog.create({
      userId: systemUser ? systemUser._id : new mongoose.Types.ObjectId(),
      userEmail: 'system@archive',
      action: 'archive',
      resource: 'folder',
      details: { type: 'migration', ...stats }
    });
  } catch (auditError) {
    console.error('Failed to write audit log for archive migration:', auditError.message);
  }

  return { skipped: false, stats };
};

module.exports = { runArchiveMigration };
