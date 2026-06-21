module.exports = {
  ROLES: {
    ADMIN: 'admin',
    HOD: 'hod',
    USER: 'user'
  },

  CONFIDENTIALITY_LEVELS: {
    PUBLIC: 'public',
    INTERNAL: 'internal',
    CONFIDENTIAL: 'confidential',
    HIGHLY_CONFIDENTIAL: 'highly_confidential'
  },

  USER_STATUS: {
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    DELETED: 'deleted'
  },

  PERMISSIONS: {
    FILE_UPLOAD: 'file:upload',
    FILE_DOWNLOAD: 'file:download',
    FILE_DELETE: 'file:delete',
    FILE_SHARE: 'file:share',
    FILE_UPDATE: 'file:update',
    FILE_READ: 'file:read',
    USER_CREATE: 'user:create',
    USER_READ: 'user:read',
    USER_UPDATE: 'user:update',
    USER_DELETE: 'user:delete',
    ROLE_ASSIGN: 'role:assign',
    PERMISSION_OVERRIDE: 'permission:override',
    LOGS_READ: 'logs:read',
    LOGS_EXPORT: 'logs:export',
    NOTIFICATION_READ: 'notification:read',
    NOTIFICATION_MANAGE: 'notification:manage'
  },

  FILE_ACCESS: {
    VIEW: 'view',
    DOWNLOAD: 'download',
    EDIT: 'edit'
  },

  OCR_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed'
  },

  UPLOAD_SOURCE: {
    SCANNER: 'scanner',
    MANUAL: 'manual',
    IMPORT: 'import'
  },

  FILE_CATEGORIES: {
    IMAGE: 'image',
    ZIP: 'zip',
    SPREADSHEET: 'spreadsheet',
    PRESENTATION: 'presentation',
    PDF: 'pdf',
    DOCUMENT: 'document',
    OTHER: 'other'
  },

  FILE_TYPE_GROUPS: {
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/tiff', 'image/bmp', 'image/webp'],
    zip: ['application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', 'application/x-7z-compressed'],
    spreadsheet: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.oasis.opendocument.spreadsheet', 'text/csv'],
    presentation: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.presentation'],
    pdf: ['application/pdf'],
    document: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text', 'text/plain', 'application/rtf']
  },

  FILE_EXTENSION_GROUPS: {
    image: ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'tif', 'bmp', 'webp'],
    zip: ['zip', 'rar', '7z'],
    spreadsheet: ['xls', 'xlsx', 'ods', 'csv'],
    presentation: ['ppt', 'pptx', 'odp'],
    pdf: ['pdf'],
    document: ['doc', 'docx', 'odt', 'txt', 'rtf']
  },

  AUDIT_ACTIONS: {
    LOGIN: 'login',
    LOGOUT: 'logout',
    UPLOAD: 'upload',
    DOWNLOAD: 'download',
    DELETE: 'delete',
    SOFT_DELETE: 'soft_delete',
    RESTORE: 'restore',
    PERMISSION_GRANT: 'permission_grant',
    PERMISSION_REVOKE: 'permission_revoke',
    USER_CREATE: 'user_create',
    USER_UPDATE: 'user_update',
    USER_SUSPEND: 'user_suspend',
    USER_RESTORE: 'user_restore',
    FILE_SHARE: 'file_share',
    FILE_UPDATE: 'file_update',
    VERSION_CREATE: 'version_create',
    ROLLBACK: 'rollback'
  },

  NOTIFICATION_TYPES: {
    FILE_SHARED: 'file_shared',
    ACCESS_REVOKED: 'access_revoked',
    FILE_UPDATED: 'file_updated',
    SYSTEM: 'system',
    FILE_DELETED: 'file_deleted'
  },

  DEFAULT_CONFIDENTIALITY_LEVELS: {
    admin: ['public', 'internal', 'confidential', 'highly_confidential'],
    hod: ['public', 'internal', 'confidential'],
    user: ['public', 'internal']
  }
};