# DMS Backend API Documentation

## Table of Contents
1. [Authentication](#authentication)
2. [Users](#users)
3. [Files](#files)
4. [Permissions](#permissions)
5. [Notifications](#notifications)
6. [Audit Logs](#audit-logs)
7. [Common Info](#common-info)

---

## 1. Authentication

### Register
Create a new user account.

**Endpoint:** `POST /api/v1/auth/register`

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "department": "IT"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "user",
      "department": "IT"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

### Login
Authenticate user and get tokens.

**Endpoint:** `POST /api/v1/auth/login`

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "user",
      "department": "IT",
      "passwordExpired": false
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Error Responses:**
- **401** - Invalid credentials: `{"success": false, "message": "Invalid email or password"}`
- **403** - Suspended: `{"success": false, "message": "Your account has been suspended. Please contact your administrator."}`
- **403** - Deleted: `{"success": false, "message": "This account has been deleted. Please contact your administrator."}`

---

### Refresh Token
Get new access token using refresh token.

**Endpoint:** `POST /api/v1/auth/refresh`

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

### Logout
Logout current user.

**Endpoint:** `POST /api/v1/auth/logout`

**Headers:** `Authorization: Bearer <accessToken>`

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### Change Password
Change user password.

**Endpoint:** `POST /api/v1/auth/change-password`

**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:**
```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

### Get Profile
Get current user profile.

**Endpoint:** `GET /api/v1/auth/profile`

**Headers:** `Authorization: Bearer <accessToken>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "department": "IT",
    "status": "active",
    "confidentialityLevels": ["public", "internal"],
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### Update Profile
Update current user profile.

**Endpoint:** `PUT /api/v1/auth/profile`

**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:**
```json
{
  "name": "John Updated",
  "department": "Finance"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { ...user object }
}
```

---

## 2. Users

> **Note:** All user endpoints require `Authorization: Bearer <accessToken>` header.

### Get All Users
Get all users (admin/hod only).

**Endpoint:** `GET /api/v1/users`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20) |
| role | string | Filter by role (admin/hod/user) |
| status | string | Filter by status (active/suspended/deleted) |
| department | string | Filter by department |
| search | string | Search by name or email |
| includeDeleted | boolean | Include deleted users (default: false) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "user",
        "department": "IT",
        "status": "active",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "totalPages": 1,
    "currentPage": 1,
    "total": 1
  }
}
```

---

### Get User By ID
Get specific user by ID.

**Endpoint:** `GET /api/v1/users/:id`

**Response (200):**
```json
{
  "success": true,
  "data": { ...user object }
}
```

---

### Create User
Create new user (admin only).

**Endpoint:** `POST /api/v1/users`

**Request Body:**
```json
{
  "name": "New User",
  "email": "newuser@example.com",
  "password": "password123",
  "department": "IT",
  "role": "user"  // optional: admin, hod, user
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "name": "New User",
    "email": "newuser@example.com",
    "role": "user",
    "department": "IT"
  }
}
```

---

### Update User
Update user (admin/hod only).

**Endpoint:** `PUT /api/v1/users/:id`

**Request Body:**
```json
{
  "name": "Updated Name",
  "email": "updated@example.com",
  "department": "Finance",
  "role": "hod",
  "status": "active"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { ...user object }
}
```

---

### Reset User Password
Reset user's password (admin only).

**Endpoint:** `POST /api/v1/users/:id/reset`

**Request Body:**
```json
{
  "newPassword": "newpassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

---

### Suspend User
Suspend a user (admin only).

**Endpoint:** `POST /api/v1/users/:id/suspend`

**Response (200):**
```json
{
  "success": true,
  "message": "User suspended successfully"
}
```

---

### Restore User
Restore suspended user (admin only).

**Endpoint:** `POST /api/v1/users/:id/restore`

**Response (200):**
```json
{
  "success": true,
  "message": "User restored successfully"
}
```

---

### Delete User
Soft delete a user (admin only).

**Endpoint:** `POST /api/v1/users/:id/delete`

**Response (200):**
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

---

### Activate User
Activate a user (admin only).

**Endpoint:** `POST /api/v1/users/:id/activate`

**Response (200):**
```json
{
  "success": true,
  "message": "User activated successfully"
}
```

---

## 3. Files

> **Note:** All file endpoints require `Authorization: Bearer <accessToken>` header.

### Get All Files
Get all files accessible to user based on role:
- **Admin**: Can view all files across all departments
- **HOD**: Can view all files in their department (e.g., HR HOD sees all HR staff files)
- **User**: Can view only their own files + files shared with them

**Endpoint:** `GET /api/v1/files`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | number | Page number |
| limit | number | Items per page |
| type | string | Filter by file type |
| owner | string | Filter by owner ID |
| department | string | Filter by department (admin/hod only) |
| fromDate | date | Filter from date |
| toDate | date | Filter to date |
| confidentiality | string | Filter by level |
| search | string | Search by name/alias/tags |
| sortBy | string | Sort field (default: createdAt) |
| sortOrder | string | asc or desc |

**Confidentiality Levels:** `public`, `internal`, `confidential`, `highly_confidential`

**File Access by Role:**
- **User**: Only sees their own uploaded files + files shared with them
- **HOD**: Sees all files from users in their department
- **Admin**: Sees all files from all departments

**Response (200):**
```json
{
  "success": true,
  "data": {
    "files": [
      {
        "fileId": "ABC123DEF456",
        "name": "document.pdf",
        "alias": "Q1 Report",
        "type": "pdf",
        "size": 1024000,
        "owner": { "_id": "...", "name": "John Doe", "email": "john@example.com" },
        "department": "IT",
        "tags": ["report", "quarterly"],
        "confidentialityLevel": "internal",
        "isScanned": false,
        "currentVersion": 1,
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "totalPages": 1,
    "currentPage": 1,
    "total": 1
  }
}
```

---

### Upload File
Upload a single file.

**Endpoint:** `POST /api/v1/files`

**Headers:** `Authorization: Bearer <accessToken>`

**Content-Type:** `multipart/form-data`

**Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | Yes | The file to upload |
| alias | string | No | Friendly name |
| tags | string | No | Comma-separated tags |
| confidentialityLevel | string | No | File confidentiality level |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "fileId": "ABC123DEF456",
    "name": "document.pdf",
    "type": "pdf",
    "size": 1024000,
    "confidentialityLevel": "internal",
    "isScanned": false,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### Bulk Upload
Upload multiple files at once.

**Endpoint:** `POST /api/v1/files/bulk`

**Form Data:**
| Field | Type | Required |
|-------|------|----------|
| files | file[] | Yes (max 10) |

**Response (201):**
```json
{
  "success": true,
  "data": [ ...files array ],
  "message": "3 files uploaded successfully"
}
```

---

### Upload Scanned Document
Upload scanned document (from scanner).

**Endpoint:** `POST /api/v1/files/scan`

**Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | Yes | Scanned file (PDF, JPG, PNG) |
| alias | string | No | Friendly name |
| tags | string | No | Comma-separated tags |
| confidentialityLevel | string | No | File confidentiality level |
| uploadSource | string | No | scanner, manual, import |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "fileId": "ABC123DEF456",
    "name": "scan001.pdf",
    "type": "pdf",
    "isScanned": true,
    "uploadSource": "scanner",
    "ocrStatus": "pending"
  },
  "message": "Scanned document uploaded successfully"
}
```

---

### Bulk Scan Upload
Upload multiple scanned documents.

**Endpoint:** `POST /api/v1/files/scan/bulk`

**Form Data:**
| Field | Type | Required |
|-------|------|----------|
| files | file[] | Yes (max 20) |

**Response (201):**
```json
{
  "success": true,
  "data": [ ...files array ],
  "message": "10 scanned documents uploaded successfully"
}
```

---

### Get File
Get specific file metadata.

**Endpoint:** `GET /api/v1/files/:fileId`

**Response (200):**
```json
{
  "success": true,
  "data": { ...file object }
}
```

---

### Download File
Download a file.

**Endpoint:** `GET /api/v1/files/:fileId/download`

**Response:** File stream (application/octet-stream)

---

### Preview File
Preview file in browser.

**Endpoint:** `GET /api/v1/files/:fileId/preview`

**Response:** File stream (inline display for PDF/images)

---

### Update File
Update file metadata or upload new version.

**Endpoint:** `PUT /api/v1/files/:fileId`

**Form Data:**
| Field | Type | Description |
|-------|------|-------------|
| file | file | New version (optional) |
| alias | string | New alias |
| tags | string | Comma-separated tags |
| confidentialityLevel | string | New level |

**Response (200):**
```json
{
  "success": true,
  "data": { ...updated file object }
}
```

---

### Delete File
Soft delete a file (moves to recycle bin). File will be permanently deleted after 30 days.

**Endpoint:** `DELETE /api/v1/files/:fileId`

**Notes:**
- Owner, HOD (same department), or Admin can delete
- Deleted files go to recycle bin with 30-day expiry
- Use `permanent=true` query to skip recycle bin (admin only)

**Response (200):**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

---

### Permanent Delete File
Permanently delete a file from recycle bin (admin only).

**Endpoint:** `POST /api/v1/files/:fileId/permanent-delete`

**Response (200):**
```json
{
  "success": true,
  "message": "File permanently deleted"
}
```

---

### Restore File
Restore a file from recycle bin.

**Endpoint:** `POST /api/v1/files/:fileId/restore`

**Notes:**
- Owner, HOD (same department), or Admin can restore

**Response (200):**
```json
{
  "success": true,
  "message": "File restored successfully"
}
```

---

### Get Deleted Files (Recycle Bin)
Get files in user's recycle bin.

**Endpoint:** `GET /api/v1/files/deleted`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | number | Page number |
| limit | number | Items per page |
| showAll | boolean | Admin only - show all deleted files |

**Notes:**
- Regular users see only their files and department files set to expire
- Admin sees all deleted files when `showAll=true`
- Files older than 30 days are auto-deleted (except for admin view)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "files": [
      {
        "fileId": "ABC123DEF456",
        "name": "document.pdf",
        "deletedAt": "2024-01-01T00:00:00.000Z",
        "permanentDeleteAt": "2024-01-31T00:00:00.000Z",
        "deletedBy": { "name": "John Doe", "email": "john@example.com" }
      }
    ],
    "totalPages": 1,
    "currentPage": 1,
    "total": 1
  }
}
```

---

### Clean Expired Files
Manually trigger cleanup of expired files (admin only).

**Endpoint:** `POST /api/v1/files/clean-expired`

**Response (200):**
```json
{
  "success": true,
  "message": "5 files permanently deleted"
}
```

---

### Get Version History
Get all versions of a file.

**Endpoint:** `GET /api/v1/files/:fileId/versions`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "versionNumber": 1,
      "filePath": "abc123.pdf",
      "size": 1024000,
      "uploadedBy": { "name": "John Doe", "email": "john@example.com" },
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    {
      "versionNumber": 2,
      "filePath": "abc123v2.pdf",
      "size": 1048576,
      "uploadedBy": { "name": "Jane Doe", "email": "jane@example.com" },
      "createdAt": "2024-01-02T00:00:00.000Z"
    }
  ]
}
```

---

### Rollback Version
Rollback file to previous version.

**Endpoint:** `POST /api/v1/files/:fileId/rollback`

**Request Body:**
```json
{
  "versionNumber": 1
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Rolled back to version 1"
}
```

---

### Get Supported File Types
Get list of supported file types.

**Endpoint:** `GET /api/v1/files/types/supported`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "scanned": ["application/pdf", "image/jpeg", "image/png", "image/tiff", "image/bmp"],
    "documents": ["application/pdf", "application/msword", ...],
    "images": ["image/jpeg", "image/png", "image/gif", ...]
  }
}
```

---

## 4. Permissions

> **Note:** All permission endpoints require `Authorization: Bearer <accessToken>` header.

### Get File Permissions
Get all permissions for a file.

**Endpoint:** `GET /api/v1/permissions/file/:fileId`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "fileId": "ABC123DEF456",
      "userId": { "_id": "...", "name": "John Doe", "email": "john@example.com" },
      "access": "view",
      "isRevoked": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### Grant Permission
Grant access to a file.

**Endpoint:** `POST /api/v1/permissions/file/:fileId`

**Request Body:**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "access": "view"  // view, download, edit
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Permission granted successfully"
}
```

---

### Revoke Permission
Revoke a permission.

**Endpoint:** `POST /api/v1/permissions/:permissionId/revoke`

**Response (200):**
```json
{
  "success": true,
  "message": "Permission revoked successfully"
}
```

---

### Get My Permissions
Get files shared with current user.

**Endpoint:** `GET /api/v1/permissions/my`

**Response (200):**
```json
{
  "success": true,
  "data": [ ...permissions array ]
}
```

---

### HOD Override
HOD can override permissions within their department.

**Endpoint:** `POST /api/v1/permissions/hod-override`

**Request Body:**
```json
{
  "fileId": "ABC123DEF456",
  "userId": "507f1f77bcf86cd799439011",
  "access": "download"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "HOD override applied"
}
```

---

## 5. Notifications

> **Note:** All notification endpoints require `Authorization: Bearer <accessToken>` header.

### Get Notifications
Get user's notifications.

**Endpoint:** `GET /api/v1/notifications`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | number | Page number |
| limit | number | Items per page |
| unreadOnly | boolean | Only unread notifications |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "message": "File 'report.pdf' was shared with you",
        "type": "file_shared",
        "isRead": false,
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "unreadCount": 1,
    "currentPage": 1
  }
}
```

---

### Mark as Read
Mark a notification as read.

**Endpoint:** `POST /api/v1/notifications/:notificationId/read`

**Response (200):**
```json
{
  "success": true,
  "data": { ...notification object }
}
```

---

### Mark All as Read
Mark all notifications as read.

**Endpoint:** `POST /api/v1/notifications/read-all`

**Response (200):**
```json
{
  "success": true,
  "message": "All notifications marked as read"
}
```

---

### Delete Notification
Delete a notification.

**Endpoint:** `DELETE /api/v1/notifications/:notificationId`

**Response (200):**
```json
{
  "success": true,
  "message": "Notification deleted"
}
```

---

## 6. Audit Logs

> **Note:** All log endpoints require `Authorization: Bearer <accessToken>` header. Admin/HOD only for most endpoints.

### Get Logs
Get audit logs (admin/hod only).

**Endpoint:** `GET /api/v1/logs`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | number | Page number |
| limit | number | Items per page |
| userId | string | Filter by user |
| action | string | Filter by action |
| fromDate | date | From date |
| toDate | date | To date |
| search | string | Search |

**Action Types:** login, logout, upload, download, delete, soft_delete, restore, permission_grant, permission_revoke, user_create, user_update, user_suspend, user_restore

**Response (200):**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "userId": { "_id": "...", "name": "John Doe", "email": "john@example.com" },
        "action": "upload",
        "resource": "file",
        "resourceId": "ABC123DEF456",
        "timestamp": "2024-01-01T00:00:00.000Z"
      }
    ],
    "totalPages": 1,
    "currentPage": 1,
    "total": 1
  }
}
```

---

### Get My Logs
Get current user's own activity logs.

**Endpoint:** `GET /api/v1/logs/my`

**Response (200):**
```json
{
  "success": true,
  "data": [ ...logs array ]
}
```

---

### Export Logs
Export logs as CSV or JSON.

**Endpoint:** `GET /api/v1/logs/export`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| fromDate | date | From date |
| toDate | date | To date |
| format | string | json or csv (default: json) |

**Response:** CSV file download or JSON array

---

### Get Log Stats
Get statistics for logs.

**Endpoint:** `GET /api/v1/logs/stats`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| days | number | Number of days (default: 7) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "actionStats": [
      { "_id": "login", "count": 100 },
      { "_id": "upload", "count": 50 }
    ],
    "dailyStats": [
      { "_id": "2024-01-01", "count": 25 }
    ]
  }
}
```

---

## 7. Common Info

### Health Check
Check if server is running.

**Endpoint:** `GET /health`

**Response (200):**
```json
{
  "status": "ok",
  "message": "DMS Server is running"
}
```

---

### Swagger API Docs
Interactive API documentation.

**Endpoint:** `/api-docs`

---

### Swagger JSON
Raw OpenAPI specification.

**Endpoint:** `/api-docs.json`

---

## Error Response Format

All error responses follow this format:

```json
{
  "success": false,
  "message": "Error description"
}
```

**Common Status Codes:**
- **400** - Bad Request (validation failed)
- **401** - Unauthorized (invalid/missing token)
- **403** - Forbidden (no permission)
- **404** - Not Found
- **500** - Internal Server Error

---

## Allowed File Types

### General Documents
- PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, ZIP, RAR

### Scanned Documents
- PDF, JPG, JPEG, PNG, TIFF, BMP

### Images
- JPG, JPEG, PNG, GIF, TIFF, BMP

---

## User Roles

| Role | Permissions |
|------|-------------|
| admin | All permissions |
| hod | Department-level management, view logs |
| user | Basic file operations |

## File Access by Role

- **Admin**: Can view all files across all departments, can see all deleted files
- **HOD**: Can view all files in their department, can delete/restore department files
- **User**: Can view own files and department public files, personal recycle bin

---

## Confidentiality Levels

| Level | Description |
|-------|-------------|
| public | Anyone can view |
| internal | Department members only |
| confidential | Restricted access |
| highly_confidential | Admin only |