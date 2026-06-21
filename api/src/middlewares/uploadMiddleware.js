const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { FILE_TYPE_GROUPS, FILE_EXTENSION_GROUPS } = require('../constants');

const maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024;

const uploadDir = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), 'uploads');

console.log('Using upload temp directory:', uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  }
});

const scannedFileMimes = [
  ...FILE_TYPE_GROUPS.pdf,
  ...FILE_TYPE_GROUPS.image
];

const pdfFileMimes = FILE_TYPE_GROUPS.pdf;

const documentFileMimes = [
  ...FILE_TYPE_GROUPS.pdf,
  ...FILE_TYPE_GROUPS.document,
  ...FILE_TYPE_GROUPS.spreadsheet,
  ...FILE_TYPE_GROUPS.presentation
];

const imageFileMimes = FILE_TYPE_GROUPS.image;

const zipFileMimes = FILE_TYPE_GROUPS.zip;

const fileCategoryMimes = {
  image: FILE_TYPE_GROUPS.image,
  zip: FILE_TYPE_GROUPS.zip,
  spreadsheet: FILE_TYPE_GROUPS.spreadsheet,
  presentation: FILE_TYPE_GROUPS.presentation,
  pdf: FILE_TYPE_GROUPS.pdf,
  document: FILE_TYPE_GROUPS.document
};

const allFileMimes = [
  ...FILE_TYPE_GROUPS.image,
  ...FILE_TYPE_GROUPS.zip,
  ...FILE_TYPE_GROUPS.spreadsheet,
  ...FILE_TYPE_GROUPS.presentation,
  ...FILE_TYPE_GROUPS.pdf,
  ...FILE_TYPE_GROUPS.document
];

const allFileExtensions = [
  ...FILE_EXTENSION_GROUPS.image,
  ...FILE_EXTENSION_GROUPS.zip,
  ...FILE_EXTENSION_GROUPS.spreadsheet,
  ...FILE_EXTENSION_GROUPS.presentation,
  ...FILE_EXTENSION_GROUPS.pdf,
  ...FILE_EXTENSION_GROUPS.document
];

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase().replace('.', '');
  if (allFileMimes.includes(file.mimetype) || allFileExtensions.includes(extension)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, zip/rar/7z archives, PDFs, Word documents, spreadsheets, presentations, and text files are allowed.'), false);
  }
};

const scannedFileFilter = (req, file, cb) => {
  if (scannedFileMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid scanned file type. Only PDF, JPG, PNG, TIFF allowed.'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: maxFileSize },
  fileFilter
});

const uploadSingle = upload.single('file');
const uploadMultiple = upload.array('files', 10);

const scannedUpload = multer({
  storage,
  limits: { fileSize: maxFileSize },
  fileFilter: scannedFileFilter
});

const scannedUploadSingle = scannedUpload.single('file');
const scannedUploadMultiple = scannedUpload.array('files', 20);

const handleUpload = (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          success: false, 
          message: `File too large. Maximum size is ${maxFileSize / 1024 / 1024}MB` 
        });
      }
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

const handleBulkUpload = (req, res, next) => {
  uploadMultiple(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          success: false, 
          message: `File too large. Maximum size is ${maxFileSize / 1024 / 1024}MB` 
        });
      }
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

const handleScannedUpload = (req, res, next) => {
  scannedUploadSingle(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          success: false, 
          message: `File too large. Maximum size is ${maxFileSize / 1024 / 1024}MB` 
        });
      }
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

const handleScannedBulkUpload = (req, res, next) => {
  scannedUploadMultiple(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          success: false, 
          message: `File too large. Maximum size is ${maxFileSize / 1024 / 1024}MB` 
        });
      }
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

module.exports = { 
  handleUpload, 
  handleBulkUpload, 
  handleScannedUpload,
  handleScannedBulkUpload,
  upload,
  scannedFileMimes,
  documentFileMimes,
  imageFileMimes,
  pdfFileMimes,
  zipFileMimes,
  fileCategoryMimes,
  allFileMimes,
  allFileExtensions
};