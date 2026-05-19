const File = require('../models/File');
const FileVersion = require('../models/FileVersion');
const PendingScan = require('../models/PendingScan');
const AuditLog = require('../models/AuditLog');
const Permission = require('../models/Permission');
const DeviceInfoExtractor = require('../utils/deviceInfo');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const FileConverter = require('../utils/fileConverter');
const { v4: uuidv4 } = require('uuid');
const { put } = require('@vercel/blob');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024;
const UPLOAD_PATH = process.env.UPLOAD_PATH || path.join(os.tmpdir(), 'uploads');
// Permanent storage for pending scans (survives serverless restarts)
// Use a subdirectory of the temp uploads directory for consistency
let PENDING_UPLOAD_PATH = process.env.PENDING_UPLOAD_PATH || path.join(UPLOAD_PATH, 'pending');

/**
 * Generate a stable file fingerprint for deduplication
 * Uses SHA256 hash of file content + metadata for uniqueness
 */
function generateFileFingerprint(filePath, fileName, fileSize, machineId) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(fileBuffer);
    hash.update(fileName);
    hash.update(fileSize.toString());
    hash.update(machineId);
    return hash.digest('hex');
  } catch (error) {
    // Fallback: use filename + size + timestamp + machineId
    const timestamp = Date.now();
    const fallback = `${fileName}:${fileSize}:${timestamp}:${machineId}`;
    return crypto.createHash('sha256').update(fallback).digest('hex');
  }
}

// Ensure upload directories exist with better error handling
try {
  console.log('[INIT] Ensuring upload directories exist');
  console.log('[INIT] UPLOAD_PATH:', UPLOAD_PATH);
  console.log('[INIT] PENDING_UPLOAD_PATH:', PENDING_UPLOAD_PATH);

  if (!fs.existsSync(UPLOAD_PATH)) {
    fs.mkdirSync(UPLOAD_PATH, { recursive: true });
    console.log('[INIT] Created UPLOAD_PATH:', UPLOAD_PATH);
  } else {
    console.log('[INIT] UPLOAD_PATH already exists:', UPLOAD_PATH);
  }

  // Always try to create pending directory (it's a subdirectory)
  try {
    if (!fs.existsSync(PENDING_UPLOAD_PATH)) {
      fs.mkdirSync(PENDING_UPLOAD_PATH, { recursive: true });
      console.log('[INIT] Created PENDING_UPLOAD_PATH:', PENDING_UPLOAD_PATH);
    } else {
      console.log('[INIT] PENDING_UPLOAD_PATH already exists:', PENDING_UPLOAD_PATH);
    }
  } catch (pendingError) {
    console.error('[INIT] Could not create pending upload directory:', pendingError.message);
    // Try fallback to temp directory
    const fallbackPendingPath = path.join(os.tmpdir(), 'dms-pending-uploads');
    console.log('[INIT] Trying fallback pending path:', fallbackPendingPath);
    try {
      if (!fs.existsSync(fallbackPendingPath)) {
        fs.mkdirSync(fallbackPendingPath, { recursive: true });
        console.log('[INIT] Created fallback PENDING_UPLOAD_PATH:', fallbackPendingPath);
      }
      // Update the constant (this will affect the module-level variable)
      // Note: In Node.js, this will update the reference for subsequent uses
      PENDING_UPLOAD_PATH = fallbackPendingPath;
    } catch (fallbackError) {
      console.error('[INIT] Fallback pending directory creation also failed:', fallbackError.message);
    }
  }
} catch (error) {
  console.error('[INIT] Could not create upload directories:', error.message);
  console.error('[INIT] This may cause upload failures later');
  // Continue execution - directories might already exist or be accessible
}

const scannerController = {
  /**
   * POST /api/v1/scanner/pending
   * Upload a file and mark it as pending confirmation
   * This replaces the old direct upload endpoint for scanner
   */
  uploadPending: async (req, res, next) => {
    try {
      const { machineId, fileName, originalPath, fileSize, mimeType } = req.body;

      if (!machineId || !fileName || !originalPath || !fileSize || !mimeType) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: machineId, fileName, originalPath, fileSize, mimeType'
        });
      }

      const user = req.user;
      const finalMachineId = machineId;
      const originalExt = path.extname(fileName).toLowerCase().replace('.', '');

      // Generate simple fingerprint from metadata for deduplication
      const fileFingerprint = `${finalMachineId}:${fileName}:${fileSize}`;

      // Debug logging
      console.log('REQ BODY:', req.body);
      console.log('MIME TYPE RECEIVED:', req.body.mimeType);
      console.log('[SCANNER PENDING] Metadata received:', {
        fileName,
        fileSize,
        fileFingerprint,
        userId: user?._id,
        machineId: finalMachineId,
        mimeType
      });

      // Check for duplicates
      const existingScan = await PendingScan.findOne({
        machineId: finalMachineId,
        fileFingerprint,
        status: { $in: ['cancelled', 'uploaded'] }
      });

      if (existingScan) {
        return res.status(409).json({
          success: false,
          message: `File already processed (${existingScan.status})`,
          data: {
            existingId: existingScan.id,
            status: existingScan.status
          }
        });
      }

      let permanentFileUrl = null;
      let finalFilePath = originalPath;

      if (req.file) {
        const blob = await put(`pending/${Date.now()}-${fileName}`, req.file.buffer, {
          access: 'public',
          contentType: mimeType || req.file.mimetype
        });
        permanentFileUrl = blob.url;
        finalFilePath = blob.url;
      }

      const pendingScan = await PendingScan.create({
        id: uuidv4().replace(/-/g, '').toUpperCase(),
        filePath: finalFilePath,
        permanentFilePath: null,
        permanentFileUrl,
        originalName: fileName,
        status: 'pending',
        fileSize,
        mimeType: mimeType || 'application/octet-stream',
        department: user?.department || 'unknown',
        assignedTo: user?._id || null,
        machineId: finalMachineId,
        fileFingerprint,
        machineMetadata: {},
        scannerMetadata: {
          scannerId: user?._id || null,
          scannedAt: new Date(),
          originalExtension: originalExt,
          originalPath
        }
      });

      console.log('[SCANNER PENDING] Pending scan created:', pendingScan.id);

      res.status(201).json({
        success: true,
        message: 'Pending scan created',
        data: pendingScan
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/scanner/pending
   * List pending scans for current user/department
   */
  getPendingScans: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, status = 'pending', machineId } = req.query;
      const user = req.user;

      console.log('[DEBUG] getPendingScans called:', {
        userId: user._id,
        userEmail: user.email,
        machineId,
        status,
        role: user.role
      });

        let filter = {};
        if (status !== 'all') {
          filter.status = status;
        } else {
          // Default behavior: only show pending scans (exclude rejected/uploaded)
          filter.status = 'pending';
        }

       // Filter by machineId if provided
       if (machineId) {
         filter.machineId = machineId;
       }

       // Filter by assignment or department
       if (user.role === 'admin') {
         // Admin sees all pending scans (optionally filter by department)
         if (req.query.department) {
           filter.department = req.query.department;
         }
       } else if (user.role === 'hod') {
         // HOD sees pending scans in their department
         filter.department = user.department;
       } else {
         // Regular user sees only their assigned scans
         filter.assignedTo = user._id;
       }

      console.log('[DEBUG] Filter applied:', filter);
      const total = await PendingScan.countDocuments(filter);
      console.log('[DEBUG] Total records found:', total);
      const pendingScans = await PendingScan.find(filter)
        .populate('assignedTo', 'name email')
        .populate('confirmedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      console.log('[DEBUG] Records returned:', pendingScans.length);
      if (pendingScans.length > 0) {
        console.log('[DEBUG] Sample record machineId:', pendingScans[0].machineId);
      }

      res.json({
        success: true,
        data: {
          pendingScans,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          total
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/scanner/pending/:id
   * Get single pending scan details
   */
  getPendingScan: async (req, res, next) => {
    try {
      const { id } = req.params;
      const user = req.user;

      const pendingScan = await PendingScan.findOne({ id });

      if (!pendingScan) {
        return res.status(404).json({
          success: false,
          message: 'Pending scan not found'
        });
      }

      // Check permissions: assignedTo, HOD of dept, or admin
      const isAssigned = pendingScan.assignedTo.toString() === user._id.toString();
      const isDeptHod = user.role === 'hod' && user.department === pendingScan.department;
      const isAdmin = user.role === 'admin';

      if (!isAssigned && !isDeptHod && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this pending scan'
        });
      }

      res.json({
        success: true,
        data: pendingScan
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/scanner/confirm
   * Confirm and finalize a pending scan with format conversion
   */
  confirmPendingScan: async (req, res, next) => {
    try {
      const { id, alias, confidentialityLevel = 'internal', description, format = 'pdf', tags } = req.body;
      const user = req.user;

      console.log('[DEBUG] confirmPendingScan called, id:', id);
      console.log('[DEBUG] body:', req.body);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Pending scan ID is required'
        });
      }


      if (!['pdf', 'jpg', 'jpeg', 'png'].includes(format.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid format. Supported: pdf, jpg, jpeg, png'
        });
      }

      const targetFormat = format.toLowerCase();

      // Find pending scan by id or _id
      console.log('[DEBUG] Searching for pending scan with id:', id);
      let pendingScan = await PendingScan.findOne({ id });
      console.log('[DEBUG] findOne({ id }):', pendingScan);
      
      if (!pendingScan) {
        pendingScan = await PendingScan.findOne({ _id: id });
        console.log('[DEBUG] findOne({ _id }):', pendingScan);
      }
      
      if (!pendingScan && id) {
        try {
          const mongoose = require('mongoose');
          console.log('[DEBUG] Trying findById with:', id, 'isValid:', mongoose.Types.ObjectId.isValid(id));
          if (mongoose.Types.ObjectId.isValid(id)) {
            pendingScan = await PendingScan.findById(id);
            console.log('[DEBUG] findById result:', pendingScan);
          }
        } catch (e) {
          console.log('[DEBUG] Error finding:', e);
        }
      }
      if (!pendingScan) {
        return res.status(404).json({
          success: false,
          message: 'Pending scan not found'
        });
      }

      if (pendingScan.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: `Pending scan is already ${pendingScan.status}`
        });
      }

      // Check permissions
      const isAssigned = pendingScan.assignedTo.toString() === user._id.toString();
      const isDeptHod = user.role === 'hod' && user.department === pendingScan.department;
      const isAdmin = user.role === 'admin';

      if (!isAssigned && !isDeptHod && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to confirm this pending scan'
        });
      }

      const sourceFilePath = pendingScan.permanentFilePath || pendingScan.filePath;
      const sourceUrl = pendingScan.permanentFileUrl || (sourceFilePath && sourceFilePath.startsWith('http') ? sourceFilePath : null);

      if (!sourceUrl && (!sourceFilePath || !fs.existsSync(sourceFilePath))) {
        return res.status(404).json({
          success: false,
          message: 'Source file not found on disk. It may have been moved or deleted.'
        });
      }

      // Step 1: Convert file if needed
      let conversionResult;
      try {
        let inputForConvert = sourceFilePath;
        if (sourceUrl) {
          const axios = require('axios');
          const response = await axios.get(sourceUrl, { responseType: 'arraybuffer' });
          // Write temp file for converter (Vercel /tmp is writable)
          const tmpPath = path.join(os.tmpdir(), `${uuidv4()}-${path.basename(sourceFilePath || 'scan')}`);
          fs.writeFileSync(tmpPath, Buffer.from(response.data));
          inputForConvert = tmpPath;
        }
        conversionResult = await FileConverter.convert(
          inputForConvert,
          targetFormat,
          { quality: 90 }
        );
      } catch (convertErr) {
        await PendingScan.findByIdAndUpdate(pendingScan._id, {
          status: 'cancelled',
          errorMessage: `Conversion failed: ${convertErr.message}`
        });

        return res.status(500).json({
          success: false,
          message: 'File conversion failed',
          error: convertErr.message
        });
      }

      const { buffer, format: finalFormat, mimeType } = conversionResult;

      // Step 2: Save converted file to storage
      let storageFilename = `${uuidv4()}${path.extname(pendingScan.originalName)}`;
      if (finalFormat !== path.extname(pendingScan.originalName).toLowerCase().replace('.', '')) {
        storageFilename = `${uuidv4()}.${finalFormat}`;
      }

      const storagePath = path.join(UPLOAD_PATH, storageFilename);
      await fs.promises.writeFile(storagePath, buffer);

      // Step 3: Create File record
      const file = await File.create({
        name: pendingScan.originalName,
        alias: alias || pendingScan.originalName,
        type: finalFormat,
        size: buffer.length,
        owner: user._id,
        department: pendingScan.department,
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        confidentialityLevel: confidentialityLevel,
        isScanned: true,
        uploadSource: 'scanner',
        storagePath: storageFilename,
        description: description || undefined
      });

      // Step 4: Create FileVersion
      await FileVersion.create({
        fileId: file._id,
        versionNumber: 1,
        filePath: storageFilename,
        size: buffer.length,
        uploadedBy: user._id
      });

      // Step 5: Update pending scan to confirmed
      await PendingScan.findByIdAndUpdate(pendingScan._id, {
        status: 'confirmed',
        confirmedBy: user._id,
        confirmedAt: new Date(),
        finalFileId: file.fileId
      });

      // Step 6: Log audit with device info
      const deviceInfo = DeviceInfoExtractor.extractFromRequest(req);
      const summary = `${user.name} confirmed ${file.name} from ${pendingScan.machineMetadata?.machineName || 'Scanner'} (Scanner Agent)`;

      await AuditLog.create({
        ...deviceInfo,
        userId: user._id,
        userEmail: user.email,
        action: 'upload',
        resource: 'file',
        resourceId: file.fileId,
        details: {
          fileName: file.name,
          size: file.size,
          format: finalFormat,
          convertedFrom: path.extname(pendingScan.originalName).toLowerCase().replace('.', ''),
          uploadSource: 'scanner_confirmed',
          machineId: pendingScan.machineId,
          fileFingerprint: pendingScan.fileFingerprint,
          originalPendingScanId: pendingScan.id
        },
        summary
      });

      // Step 7: Delete permanent pending file (SAFE — only after success)
      try {
        if (fs.existsSync(sourceFilePath)) {
          fs.unlinkSync(sourceFilePath);
          console.log(`[Scanner] Deleted permanent pending file: ${sourceFilePath}`);
        }
        // Also clean up temp file if it exists
        if (pendingScan.filePath && pendingScan.filePath !== sourceFilePath && fs.existsSync(pendingScan.filePath)) {
          fs.unlinkSync(pendingScan.filePath);
        }
      } catch (delErr) {
        console.error(`[Scanner] Failed to delete pending file: ${delErr.message}`);
        // Don't fail the request — file was converted and saved
      }

      // Build response
      const fileUrl = `${req.protocol}://${req.get('host')}/api/v1/files/${file.fileId}`;

      res.status(201).json({
        success: true,
        message: `File confirmed and converted to ${finalFormat.toUpperCase()} successfully`,
        data: {
          file: file,
          fileUrl,
          fileId: file.fileId,
          deleteFile: true, // Agent should delete local scanned file
          originalFilePath: pendingScan.filePath
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/scanner/cancel
   * Cancel a pending scan (does NOT delete file)
   */
  cancelPendingScan: async (req, res, next) => {
    try {
      const { id, reason } = req.body;
      const user = req.user;

      console.log('[DEBUG] cancelPendingScan called, id:', id, 'body:', req.body);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Pending scan ID is required'
        });
      }

      // Try both id and _id
      let pendingScan = await PendingScan.findOne({ id });
      console.log('[DEBUG] findOne({ id }):', pendingScan);
      
      if (!pendingScan) {
        pendingScan = await PendingScan.findOne({ _id: id });
        console.log('[DEBUG] findOne({ _id }):', pendingScan);
      }
      
      if (!pendingScan && id) {
        try {
          const mongoose = require('mongoose');
          if (mongoose.Types.ObjectId.isValid(id)) {
            pendingScan = await PendingScan.findById(id);
            console.log('[DEBUG] findById result:', pendingScan);
          }
        } catch (e) {}
      }
      if (!pendingScan) {
        return res.status(404).json({
          success: false,
          message: 'Pending scan not found'
        });
      }

      if (pendingScan.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: `Pending scan is already ${pendingScan.status}`
        });
      }

      // Permissions: only assigned user, HOD of dept, or admin can cancel
      const isAssigned = pendingScan.assignedTo.toString() === user._id.toString();
      const isDeptHod = user.role === 'hod' && user.department === pendingScan.department;
      const isAdmin = user.role === 'admin';

      if (!isAssigned && !isDeptHod && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to cancel this pending scan'
        });
      }

      // Update status to cancelled (DO NOT delete file)
      await PendingScan.findByIdAndUpdate(pendingScan._id, {
        status: 'cancelled',
        errorMessage: reason || 'Cancelled by user'
      });

      // Enhanced audit log with device info
      const deviceInfo = DeviceInfoExtractor.extractFromRequest(req);
      const summary = `${user.name} cancelled ${pendingScan.originalName} from ${pendingScan.machineMetadata?.machineName || 'Scanner'}`;

      await AuditLog.create({
        ...deviceInfo,
        userId: user._id,
        userEmail: user.email,
        action: 'cancel',
        resource: 'pending_scan',
        resourceId: pendingScan.id,
        details: {
          fileName: pendingScan.originalName,
          action: 'cancelled',
          reason: reason || 'User cancelled',
          machineId: pendingScan.machineId,
          fileFingerprint: pendingScan.fileFingerprint
        },
        summary
      });

      res.json({
        success: true,
        message: 'Pending scan cancelled successfully',
        data: {
          keepFile: true // Agent should leave file untouched
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/v1/scanner/pending/:id/reject
   * Reject a pending scan (permanent rejection - file stays but won't be re-uploaded)
   */
  rejectPendingScan: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const user = req.user;

      console.log('[DEBUG] rejectPendingScan called, id:', id, 'reason:', reason);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Pending scan ID is required'
        });
      }

      // Find the pending scan
      let pendingScan = await PendingScan.findOne({ id });
      if (!pendingScan) {
        pendingScan = await PendingScan.findById(id);
      }

      if (!pendingScan) {
        return res.status(404).json({
          success: false,
          message: 'Pending scan not found'
        });
      }

      if (pendingScan.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: `Pending scan is already ${pendingScan.status}`
        });
      }

      // Permissions: only assigned user, HOD of dept, or admin can reject
      const isAssigned = pendingScan.assignedTo.toString() === user._id.toString();
      const isDeptHod = user.role === 'hod' && user.department === pendingScan.department;
      const isAdmin = user.role === 'admin';

      if (!isAssigned && !isDeptHod && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to reject this pending scan'
        });
      }

      // Update status to cancelled (DO NOT delete file - keeps it in scan folder)
      await PendingScan.findByIdAndUpdate(pendingScan._id, {
        status: 'cancelled',
        rejectedBy: user._id,
        rejectedAt: new Date(),
        rejectionReason: reason || 'Cancelled by user'
      });

      // Audit log
      await AuditLog.create({
        userId: user._id,
        userEmail: user.email,
        action: 'delete',
        resource: 'pending_scan',
        resourceId: id,
        details: {
          fileName: pendingScan.originalName,
          action: 'cancelled',
          reason: reason || 'User cancelled',
          machineId: pendingScan.machineId,
          fileFingerprint: pendingScan.fileFingerprint
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        ...req.auditEnhancement // Include machine, location, scanner data
      });

      res.json({
        success: true,
        message: 'Pending scan rejected successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/v1/scanner/pending/:id
   * Force delete a pending scan (admin only) - also deletes file
   */
  deletePendingScan: async (req, res, next) => {
    try {
      const { id } = req.params;
      const user = req.user;

      if (user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admin can force delete pending scans'
        });
      }

      const pendingScan = await PendingScan.findOne({ id }) || await PendingScan.findById(id);
      if (!pendingScan) {
        return res.status(404).json({
          success: false,
          message: 'Pending scan not found'
        });
      }

      // Delete file from disk
      if (fs.existsSync(pendingScan.filePath)) {
        try {
          fs.unlinkSync(pendingScan.filePath);
        } catch (delErr) {
          console.error(`Failed to delete file: ${delErr.message}`);
        }
      }

      // Delete PendingScan record
      await pendingScan.deleteOne();

      await AuditLog.create({
        userId: user._id,
        userEmail: user.email,
        action: 'permanent_delete',
        resource: 'pending_scan',
        resourceId: id,
        details: { fileName: pendingScan.originalName },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        success: true,
        message: 'Pending scan deleted permanently'
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/scanner/pending/stats
   * Get pending scan statistics
   */
  getPendingStats: async (req, res, next) => {
    try {
      const user = req.user;

      let filter = {};
      if (user.role === 'admin') {
        // Admin can see all
      } else if (user.role === 'hod') {
        filter.department = user.department;
      } else {
        filter.assignedTo = user._id;
      }

      const pendingCount = await PendingScan.countDocuments({ ...filter, status: 'pending' });
      const confirmedToday = await PendingScan.countDocuments({
        ...filter,
        status: 'confirmed',
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });
      const cancelledCount = await PendingScan.countDocuments({ ...filter, status: 'cancelled' });

      res.json({
        success: true,
        data: {
          pending: pendingCount,
          confirmedToday,
          cancelled: cancelledCount
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = scannerController;
