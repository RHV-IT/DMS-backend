const path = require('path');
const { FILE_CATEGORIES, FILE_TYPE_GROUPS, FILE_EXTENSION_GROUPS } = require('../constants');

/**
 * Classify a file into one of FILE_CATEGORIES using its extension first,
 * falling back to its MIME type. Single source of truth for every upload
 * pipeline (manual, bulk, scanner, pending-scan confirm, folder copy/move).
 */
const getFileCategory = (originalName, mimeType) => {
  const extension = path.extname(originalName || '').toLowerCase().replace('.', '');
  const normalizedMime = String(mimeType || '').split(';')[0].trim().toLowerCase();

  const byExtension = Object.keys(FILE_EXTENSION_GROUPS).find(category =>
    FILE_EXTENSION_GROUPS[category].includes(extension)
  );
  if (byExtension) return byExtension;

  return Object.keys(FILE_TYPE_GROUPS).find(category =>
    FILE_TYPE_GROUPS[category].includes(normalizedMime)
  ) || FILE_CATEGORIES.OTHER;
};

const normalizeFileCategory = (category) => {
  const normalized = String(category || '').toLowerCase().trim();
  const aliases = {
    docs: FILE_CATEGORIES.DOCUMENT,
    doc: FILE_CATEGORIES.DOCUMENT,
    word: FILE_CATEGORIES.DOCUMENT,
    images: FILE_CATEGORIES.IMAGE,
    img: FILE_CATEGORIES.IMAGE,
    zipped: FILE_CATEGORIES.ZIP,
    archive: FILE_CATEGORIES.ZIP,
    archives: FILE_CATEGORIES.ZIP,
    compressed: FILE_CATEGORIES.ZIP,
    spreadsheets: FILE_CATEGORIES.SPREADSHEET,
    xls: FILE_CATEGORIES.SPREADSHEET,
    xlsx: FILE_CATEGORIES.SPREADSHEET,
    presentations: FILE_CATEGORIES.PRESENTATION,
    ppt: FILE_CATEGORIES.PRESENTATION,
    powerpoint: FILE_CATEGORIES.PRESENTATION,
    powerpoints: FILE_CATEGORIES.PRESENTATION
  };

  if (aliases[normalized]) return aliases[normalized];
  if (Object.values(FILE_CATEGORIES).includes(normalized)) return normalized;
  return null;
};

const buildFileCategoryQuery = (category) => {
  const normalized = normalizeFileCategory(category);
  if (!normalized) return null;

  return {
    $or: [
      { fileCategory: normalized },
      { type: { $in: FILE_EXTENSION_GROUPS[normalized] || [] } }
    ]
  };
};

module.exports = {
  FILE_CATEGORIES,
  FILE_TYPE_GROUPS,
  FILE_EXTENSION_GROUPS,
  getFileCategory,
  normalizeFileCategory,
  buildFileCategoryQuery
};
