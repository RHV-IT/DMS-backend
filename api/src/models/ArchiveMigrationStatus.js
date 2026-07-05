const mongoose = require('mongoose');

/**
 * Singleton-style collection (one document) tracking whether the one-time
 * historical-file archive migration has completed, so it isn't re-run on
 * every server boot. Set FORCE_ARCHIVE_MIGRATION=true to re-run anyway.
 */
const archiveMigrationStatusSchema = new mongoose.Schema({
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date,
    default: null
  },
  stats: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('ArchiveMigrationStatus', archiveMigrationStatusSchema);
