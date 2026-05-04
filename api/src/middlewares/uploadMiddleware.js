const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const uploadPath = path.join(process.cwd(), process.env.VERCEL ? 'tmp' : '', 'uploads');
      // Ensure directory exists
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    } catch (error) {
      console.warn('Could not create upload directory:', error.message);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  }
});

const scannedFileMimes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/bmp'
];

const documentFileMimes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/zip',
  'application/x-rar-compressed'
];

const imageFileMimes = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/tiff',
  'image/bmp'
];

const fileFilter = (req, file, cb) => {
  const allAllowedMimes = [...documentFileMimes, ...imageFileMimes];
  if (allAllowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only documents (PDF, DOC, XLS, PPT) and images (JPG, PNG) are allowed.'), false);
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
  imageFileMimes
};