# DMS Backend API Documentation

## Table of Contents
1. [CORS & Network Setup](#cors--network-setup)
2. [Authentication](#authentication)
3. [Users](#users)
4. [Files](#files)
5. [Permissions](#permissions)
6. [Notifications](#notifications)
7. [Audit Logs](#audit-logs)
8. [Dashboard](#dashboard)
9. [Settings (Admin Only)](#settings-admin-only)
10. [Scanner Upload](#scanner-upload)
11. [Common Info](#common-info)
12. [Vercel Deployment](#vercel-deployment)

---

## 1. CORS & Network Setup

### Development Environment

**Frontend:** `http://localhost:3000`  
**Backend:** `http://localhost:5000`

### CORS Configuration

The backend is configured to accept cross-origin requests from multiple origins. CORS is enforced at **two levels** — Vercel edge headers and Express middleware — to handle both production (serverless) and development (local) environments.

#### Allowed Origins

Requests are accepted from the following whitelisted origins:

- `https://rhv-dms.vercel.app` — Production frontend
- `http://docmanager.rhv` — Internal network alias
- `http://192.168.0.153:3000` — Local network frontend
- `http://localhost:3000` — Local development

#### Vercel Edge Configuration (`vercel.json`)

Vercel sets CORS headers at the edge layer for all `/api/*` requests:

- **`Access-Control-Allow-Origin`**: `https://rhv-dms.vercel.app`
- **`Access-Control-Allow-Credentials`**: `true`
- **`Access-Control-Allow-Methods`**: `GET,OPTIONS,PATCH,DELETE,POST,PUT`
- **`Access-Control-Allow-Headers`**: `Content-Type, Authorization, x-platform, x-browser, x-device, x-client-type`

If you need additional custom headers, add them to the `Access-Control-Allow-Headers` value in `vercel.json`.

#### Express CORS Middleware (`api/src/config/cors.js`)

The Express app applies its own CORS middleware as the first middleware to handle dynamic origin validation and preflight requests:

```javascript
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin', 'X-Requested-With', 'Content-Type', 'Accept',
    'Authorization', 'x-browser', 'x-device', 'x-client-type', 'x-platform'
  ],
  optionsSuccessStatus: 200
};
```

**Key points:**
- **Dynamic origin check**: Uses a whitelist; `!origin` allows server-to-server and Postman requests (no `Origin` header).
- **`x-platform` is explicitly whitelisted**: Required by the frontend for device/browser detection headers.
- **`credentials: true`**: Enables cookies and `Authorization` headers in cross-origin requests.
- **Preflight handled**: `app.options('*', corsConfig)` ensures `OPTIONS` requests return the correct CORS headers.

**Both layers must agree.** If a header is allowed in the Express middleware but blocked by Vercel edge headers (or vice versa), the browser will reject the request. Keep both configurations in sync.

### Troubleshooting Network Errors

If you encounter "Axios Network Error" or "Provisional headers are shown":

1. **Verify CORS is enabled** — The backend must have CORS middleware before routes
2. **Check middleware order** — CORS → JSON parsing → Routes
3. **Preflight requests** — Browser sends `OPTIONS` before `POST`/`PUT` requests; ensure the server responds with 200
4. **Credentials** — If using `withCredentials: true`, origin must be specific (not `*`)
5. **Port mismatch** — Ensure frontend calls `http://localhost:5000`, not port 3000
6. **Custom headers** — If adding a new header like `x-platform`, verify it appears in **both** `vercel.json` headers and `cors.js` `allowedHeaders`
7. **Vercel deploy** — After changing `vercel.json`, redeploy — edge config is not hot-reloaded

### API Base URL

```
http://localhost:5000
```

All API endpoints are prefixed with `/api`.

---

## 2. Authentication

> **Base URL:** `/api/v1/auth` (e.g., `/api/v1/auth/login`, `/api/v1/auth/register`)

> **Note:** Login and Register endpoints do NOT require a token. Token is generated after successful login.

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
      "loginCount": 5,
      "passwordExpired": false
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```


pls
**Error Responses:**
- **401** - Invalid credentials: `{"success": false, "message": "Invalid email or password"}`
- **403** - Suspended: `{"success": false, "message": "Your account has been suspended. Please contact your administrator."}`
- **403** - Deleted: `{"success": false, "message": "This account has been deleted. Please contact your administrator."}`

---

### Refresh Token
Get new access token using refresh token.

**Endpoint:** `POST /api/v1/auth/refresh`

**Headers:** Not required

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
    "loginCount": 5,
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

## 3. Users

> **Base URL:** `/api/v1/users`

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
        "loginCount": 5,
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

## 4. Files

> **Base URL:** `/api/v1/files`

> **Note:** All file endpoints require `Authorization: Bearer <accessToken>` header.

> **Production Storage (Important for Frontend):** 
> All uploads (single, bulk, scan, scanner direct/pending-confirm) now use **Vercel Blob** cloud storage.
> - `storagePath` on File objects is a full public HTTPS URL (e.g. `https://<id>.public.blob.vercel-storage.com/files/...`)
> - `originalFileName`, `mimeType`, and `uploadedBy` are now populated on all created records.
> - Preview (`/preview`) and Download (`/download`) endpoints **validate auth + ownership + permissions**, then **stream** the file from the cloud URL with correct headers. No more local disk 404s.
> - Backend never serves using Windows/local paths in production.

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

### Get Archive Files
Get archive files accessible to the current user based on department and confidentiality access rules.

**Endpoint:** `GET /api/v1/files/archive`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20) |
| search | string | Search by name/alias/tags |
| confidentialityLevel | string | Filter by confidentiality level |
| uploadedBy | string | Filter by uploader user ID |
| sortBy | string | Sort field (default: createdAt) |
| sortOrder | string | asc or desc (default: desc) |

**Role-Based Access Rules:**

**ADMIN Users:**
- Can see ALL files across ALL departments
- Full access to ALL confidentiality levels
- Can preview, download, update, delete, and share ALL files
- Bypasses all department and confidentiality restrictions

**HOD (Head of Department) Users:**
- Can see ALL files uploaded by members of their department
- Can access all confidentiality levels within their department
- **BUT** for highly confidential files:
  - Can ONLY see metadata (filename, uploader, date, size, etc.)
  - **CANNOT** preview, download, update, delete, or share highly confidential files
  - Gets "restricted" response when attempting content access

**USER Access Rules:**

**PUBLIC Files:**
- Visible only to users in the SAME department as uploader
- User must have at least "public" access level

**INTERNAL Files:**
- Visible only to users in SAME department
- User confidentialityLevel must allow "internal" or higher

**CONFIDENTIAL Files:**
- Visible only to users in SAME department
- User confidentialityLevel must be "confidential" or higher

**HIGHLY CONFIDENTIAL Files:**
- ONLY visible to:
  - File uploader (owner)
  - Users explicitly shared with the file
- Not visible to other department members
- Not visible to other users with same confidentiality level

**Confidentiality Hierarchy:**
```
public < internal < confidential < highly_confidential
```

**Examples:**
- `confidential` user can see: public, internal, confidential (their own highly_confidential files)
- `internal` user can see: public, internal
- `public` user can see: public only
- **HOD** can see: all department files (metadata-only for highly confidential)
- **Admin** can see: everything, everywhere

**Department Isolation:**
- Files are NEVER visible across departments
- Exception: highly_confidential files can be shared across departments when explicitly granted

**Response (200):**
```json
{
  "success": true,
  "data": {
    "files": [
      {
        "_id": "...",
        "fileId": "ABC123",
        "name": "budget.pdf",
        "alias": "Budget Report",
        "type": "pdf",
        "size": 1024000,
        "department": {
          "_id": "...",
          "name": "ICT"
        },
        "uploadedBy": {
          "_id": "...",
          "name": "Samuel",
          "email": "samuel@example.com"
        },
        "confidentialityLevel": "public",
        "createdAt": "2026-05-02T10:00:00.000Z"
      },
      {
        "_id": "...",
        "fileId": "XYZ789",
        "name": "secret.pdf",
        "alias": "Secret Document",
        "type": "pdf",
        "size": 2048000,
        "department": {
          "_id": "...",
          "name": "ICT"
        },
        "uploadedBy": {
          "_id": "...",
          "name": "Samuel",
          "email": "samuel@example.com"
        },
        "confidentialityLevel": "highly_confidential",
        "createdAt": "2026-05-02T11:00:00.000Z",
        "restricted": true,
        "restrictionReason": "Highly confidential file. Access restricted."
      }
    ],
    "totalPages": 1,
    "currentPage": 1,
    "total": 10
  }
}
```

**HOD Restricted File Response:**
When HOD users view highly confidential files, they receive metadata-only objects with restriction indicators:
- `restricted: true`
- `restrictionReason`: Explanation of why content access is blocked
- All sensitive file paths and content access are removed

**Audit Logging:**
- Action: `archive_view`
- Includes: user, file count, department, applied filters, machine info

**Additional Audit Events:**
- `restricted_access_attempt`: When HOD attempts to access highly confidential file content
- `admin_sensitive_access`: When admin accesses highly confidential files (for compliance tracking)

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
Upload multiple files at once. Supports **per-file metadata** for `alias` and `confidentialityLevel`.

**Endpoint:** `POST /api/v1/files/bulk`

**Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| files | file[] | Yes (max 10) | The files to upload (index order matters) |
| metadata | string[] | No | JSON string per file, mapped by index to `files[]`. Example: `{"alias":"Patient Scan","confidentialityLevel":"confidential"}` |
| confidentialityLevel | string | No | Fallback level for all files if no per-file metadata (default: "internal") |

**Per-file metadata mapping:**
- `files[0]` pairs with `metadata[0]`
- `files[1]` pairs with `metadata[1]`
- etc.

**Rules:**
- If `alias` missing in metadata → uses original filename
- If `confidentialityLevel` missing → defaults to "internal"
- Supported levels (exact, lowercase): `public`, `internal`, `confidential`, `highly_confidential`
- Backend normalizes common variants (e.g. "Confidential", "Highly Confidential")

**Example multipart/form-data (conceptual):**
```
files[0] = report.pdf
files[1] = scan.jpg
metadata[0] = {"alias":"Q4 Financials","confidentialityLevel":"confidential"}
metadata[1] = {"alias":"Patient X-Ray"}
```

**Response (201):**
```json
{
  "success": true,
  "data": [ ...files array with alias, confidentialityLevel, mimeType, originalFileName, uploadedBy per record ],
  "message": "2 files uploaded successfully"
}
```

**Storage Note:** Files are uploaded to Vercel Blob. `storagePath` in the returned File objects will be a full HTTPS URL in production.
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
Upload multiple scanned documents. (Per-file metadata not yet supported here; uses "internal" level.)

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
Download a file. Backend validates permissions then streams from cloud storage (blob URL) or local (dev only) with `Content-Disposition: attachment`.

**Endpoint:** `GET /api/v1/files/:fileId/download`

**Response:** File stream (application/octet-stream)

---

### Preview File with Google Docs
Preview file using Google Docs Viewer (embeddable iframe). Works similar to WhatsApp Web.

**Endpoint:** `GET /api/v1/files/:fileId/preview/google`

**Response:** HTML page with embedded Google Docs viewer

**Frontend Usage:**
```html
<!-- Embed in your page -->
<iframe src="/api/v1/files/ABC123/preview/google" width="100%" height="600px"></iframe>
```

**How it works:**
1. This endpoint returns an HTML page that embeds `https://docs.google.com/gview?embedded=true&url=<file_url>`
2. Google Docs fetches the file from your server
3. File is displayed within the iframe

**Important Requirements:**
- **Public URL:** Your server must be publicly accessible on the internet (Google's servers need to fetch the file)
- **File Access:** The file URL must be reachable without additional authentication
- **Supported Formats:** PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, RTF, and most common document formats (see Google Docs viewer documentation)

**Supported File Types:**
- Microsoft Office: DOC, DOCX, XLS, XLSX, PPT, PPTX
- OpenDocument: ODT, ODS, ODP
- PDF
- Plain Text: TXT
- Image formats (viewed as images): JPG, PNG, GIF, BMP, TIFF
- Others as supported by Google Docs

**Fallback:** If Google Docs cannot preview the file, the page will display a download link.

**Security Note:**
The Google Docs viewer accesses your file via the internal preview endpoint (`/api/v1/files/:fileId/preview`). Ensure your server's preview endpoint is accessible to Google's crawler if hosting publicly. For internal/local networks where Google cannot reach the URL, use the raw preview endpoint instead (`/api/v1/files/:fileId/preview`).

---

### Preview File (Raw)
Direct file stream for inline browser display (PDF/images only). 

In production, the backend fetches from Vercel Blob and streams the response with proper `Content-Type`, `Content-Disposition: inline`, and `Cache-Control` headers after permission checks.

**Endpoint:** `GET /api/v1/files/:fileId/preview`

**Response:** File stream with appropriate Content-Type (never relies on local disk paths)

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
- ANY authenticated user can restore any file
- Restored file is removed from recycle bin and becomes active again

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

## 5. Permissions

> **Base URL:** `/api/v1/permissions`

> **Note:** All permission endpoints require `Authorization: Bearer <accessToken>` header.

### Get Files Shared With Me (Received)
Get files that have been shared with the current user.

**Endpoint:** `GET /api/v1/permissions/my`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "fileId": { ...file object },
      "userId": { "_id": "...", "name": "John Doe", "email": "john@example.com" },
      "access": "view",
      "isRevoked": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### Get Files I Shared (Sent)
Get files that the current user has shared with others.

**Endpoint:** `GET /api/v1/permissions/my-sent`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | number | Page number |
| limit | number | Items per page |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "fileId": "ABC123DEF456",
      "userId": { "_id": "...", "name": "Jane Doe", "email": "jane@example.com" },
      "access": "view",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "file": {
        "fileId": "ABC123DEF456",
        "name": "document.pdf",
        "alias": "Q1 Report",
        "type": "pdf",
        "size": 1024000
      }
    }
  ],
  "totalPages": 1,
  "currentPage": 1,
  "total": 5
}
```

---

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

## 6. Notifications

> **Base URL:** `/api/v1/notifications`

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

## 7. Audit Logs

> **Base URL:** `/api/v1/logs`

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

**Response (200):**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "userId": { "_id": "...", "name": "John Doe", "email": "john@example.com" },
        "userEmail": "john@example.com",
        "action": "login",
        "resource": "auth",
        "resourceId": null,
        "details": { "method": "password", "success": true },
        "ipAddress": "192.168.1.100",
        "location": {
          "country": "Nigeria",
          "region": "Lagos",
          "city": "Lagos",
          "timezone": "Africa/Lagos",
          "isp": "MTN Nigeria"
        },
        "device": {
          "browser": "Chrome 120",
          "browserVersion": "120.0.0",
          "os": "Windows",
          "osVersion": "11",
          "deviceType": "desktop",
          "deviceName": "Desktop",
          "userAgent": "Mozilla/5.0...",
          "platform": "Win32"
        },
        "sessionId": "abc123...",
        "timestamp": "2024-01-01T00:00:00.000Z"
      }
    ],
    "totalPages": 1,
    "currentPage": 1,
    "total": 1
  }
}
```

**Action Types:** login, logout, upload, download, delete, soft_delete, restore, permission_grant, permission_revoke, user_create, user_update, user_suspend, user_restore, file_share, file_update, version_create, rollback, profile_update, password_change, failed_login, session_expired

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

### Get Actions
Get all unique action types with counts (admin/hod only).

**Endpoint:** `GET /api/v1/logs/actions`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "actions": ["login", "upload", "download", ...],
    "actionCounts": [
      { "_id": "login", "count": 150 },
      { "_id": "upload", "count": 45 }
    ]
  }
}
```

---

### Get Logs By IP
Get all logs from a specific IP address (admin only).

**Endpoint:** `GET /api/v1/logs/ip/:ip`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | number | Page number |
| limit | number | Items per page |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "logs": [ ... ],
    "totalPages": 1,
    "currentPage": 1,
    "total": 15
  }
}
```

---

### Get Logs By Device
Get all logs from a specific device (admin only).

**Endpoint:** `GET /api/v1/logs/device/:deviceId`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | number | Page number |
| limit | number | Items per page |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "logs": [ ... ],
    "totalPages": 1,
    "currentPage": 1,
    "total": 10
  }
}
```

---

### Export Logs
Export logs as CSV or JSON (admin only).

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
Get statistics for logs (admin only).

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

### Audit Log Fields

| Field | Type | Description |
|-------|------|-------------|
| _id | string | Unique log ID |
| userId | object | User reference (name, email) |
| userEmail | string | User email |
| action | string | Action type |
| resource | string | Resource affected |
| resourceId | string | Resource ID |
| details | object | Additional details |
| ipAddress | string | Client IP address |
| location | object | Geographic location (country, region, city, timezone, ISP) |
| device | object | Device info (browser, OS, device type, device name) |
| sessionId | string | Session identifier |
| systemName | string | Device/system name (e.g., "Dell Latitude 5490") |
| systemSpec | string | System specifications (e.g., "16GB RAM, Intel Core i7") |
| timestamp | date | Action timestamp |

### Sending System Name and Spec to Audit Logs

The frontend should send the following headers with each request to include system information in audit logs:

```
X-System-Name: Dell Latitude 5490
X-System-Spec: 16GB RAM, Intel Core i7, Windows 11
```

**Note:** These headers are optional. If not provided, the fields will be null in the audit log.

---

## 8. Dashboard

> **Base URL:** `/api/v1/dashboard`

> **Note:** All dashboard endpoints require `Authorization: Bearer <accessToken>` header.

> **Access by Role:**
> - **Admin**: Can see all files across all departments
> - **HOD**: Can see all files in their department
> - **User**: Can see only their own files

### Get Dashboard Stats

Get dashboard statistics for the logged-in user.

**Endpoint:** `GET /api/v1/dashboard/stats`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalFiles": 150,
    "recentUploads": 12,
    "storageUsed": "1.5 GB",
    "pendingShares": 5
  }
}
```

**Stats by Role:**
- **User**: Total files owned by user, user's recent uploads, user's storage, pending shares for user
- **HOD**: All files in department, recent uploads in department, department storage, pending shares
- **Admin**: All files in system, all recent uploads, total storage, all pending shares

---

### Get Recent Files

Get recent files for the dashboard.

**Endpoint:** `GET /api/v1/dashboard/recent-files`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "fileId": "ABC123DEF456",
      "name": "document.pdf",
      "alias": "Q1 Report",
      "type": "pdf",
      "size": "2.5 MB",
      "owner": { "_id": "...", "name": "John Doe", "email": "john@example.com" },
      "confidentialityLevel": "internal",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### Get Recent Activity

Get recent activity feed for the dashboard.

**Endpoint:** `GET /api/v1/dashboard/recent-activity`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "action": "upload",
      "user": { "_id": "...", "name": "John Doe", "email": "john@example.com" },
      "resource": "file",
      "resourceId": "ABC123DEF456",
      "details": { "fileName": "report.pdf" },
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Activity Actions:** login, logout, upload, download, delete, permission_grant, permission_revoke

---

## 9. Settings (Admin Only)

> **Base URL:** `/api/v1/settings`

> **Note:** All settings endpoints require `Authorization: Bearer <accessToken>` header. Admin role only.

### Create Department

Create a new department.

**Endpoint:** `POST /api/v1/settings/departments`

**Request Body:**
```json
{
  "name": "Human Resources",
  "code": "HR",
  "description": "HR Department"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "HUMAN RESOURCES",
    "code": "HR",
    "description": "HR Department",
    "isActive": true,
    "createdBy": "...",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "Department created successfully"
}
```

---

### Get All Departments

Get all departments.

**Endpoint:** `GET /api/v1/settings/departments`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | number | Page number |
| limit | number | Items per page |
| search | string | Search by name/code |
| includeInactive | boolean | Include inactive departments |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "departments": [ ... ],
    "totalPages": 1,
    "currentPage": 1,
    "total": 5
  }
}
```

---

### Get Department By ID

Get a specific department.

**Endpoint:** `GET /api/v1/settings/departments/:id`

**Response (200):**
```json
{
  "success": true,
  "data": { ... }
}
```

---

### Update Department

Update a department.

**Endpoint:** `PUT /api/v1/settings/departments/:id`

**Request Body:**
```json
{
  "name": "Human Resources Updated",
  "code": "HR",
  "description": "Updated description",
  "isActive": true
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { ... },
  "message": "Department updated successfully"
}
```

---

### Delete Department

Deactivate a department (soft delete).

**Endpoint:** `DELETE /api/v1/settings/departments/:id`

**Note:** Cannot delete department if users are assigned to it.

**Response (200):**
```json
{
  "success": true,
  "message": "Department deactivated successfully"
}
```

---

### Create Confidentiality Level

Create a new confidentiality level.

**Endpoint:** `POST /api/v1/settings/confidentiality-levels`

**Request Body:**
```json
{
  "name": "public",
  "displayName": "Public",
  "description": "Available to all users",
  "level": 1,
  "color": "#22c55e"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": { ... },
  "message": "Confidentiality level created successfully"
}
```

---

### Get All Confidentiality Levels

Get all confidentiality levels.

**Endpoint:** `GET /api/v1/settings/confidentiality-levels`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| includeInactive | boolean | Include inactive levels |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "name": "public",
      "displayName": "Public",
      "description": "Available to all users",
      "level": 1,
      "color": "#22c55e",
      "isActive": true
    },
    {
      "name": "internal",
      "displayName": "Internal",
      "description": "Department members only",
      "level": 2,
      "color": "#3b82f6",
      "isActive": true
    },
    {
      "name": "confidential",
      "displayName": "Confidential",
      "description": "Restricted access",
      "level": 3,
      "color": "#f59e0b",
      "isActive": true
    },
    {
      "name": "highly_confidential",
      "displayName": "Highly Confidential",
      "description": "Admin only",
      "level": 4,
      "color": "#ef4444",
      "isActive": true
    }
  ]
}
```

---

### Update Confidentiality Level

Update a confidentiality level.

**Endpoint:** `PUT /api/v1/settings/confidentiality-levels/:id`

**Request Body:**
```json
{
  "displayName": "Public Level",
  "description": "Updated description",
  "color": "#00ff00"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { ... },
  "message": "Confidentiality level updated successfully"
}
```

---

### Delete Confidentiality Level

Deactivate a confidentiality level.

**Endpoint:** `DELETE /api/v1/settings/confidentiality-levels/:id`

**Response (200):**
```json
{
  "success": true,
  "message": "Confidentiality level deactivated successfully"
}
```

---

### Initialize Default Settings

Initialize default confidentiality levels.

**Endpoint:** `POST /api/v1/settings/initialize`

**Response (200):**
```json
{
  "success": true,
  "message": "Default settings initialized successfully"
}
```

---

## 10. Scanner Agent & Upload

> **Base URL:** `/api/v1/scanner`

> **Note:** Scanner upload endpoints require `Authorization: Bearer <accessToken>` header.

### Agent Management

#### Get Agent Version
Get current agent version and download URL.

**Endpoint:** `GET /api/v1/agent/version`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "minimumSupportedVersion": "1.0.0",
    "downloadUrl": "https://rhv-dms-backend.vercel.app/api/v1/scanner/auto-install-download"
  }
}
```

#### Register Agent
Register a scanner agent machine.

**Endpoint:** `POST /api/v1/agent/register`

**Request Body:**
```json
{
  "machineId": "machine-ABC123...",
  "machineName": "DESKTOP-VQC2MOD",
  "hostname": "DESKTOP-VQC2MOD",
  "os": "Windows_NT",
  "osVersion": "10.0.19045",
  "agentVersion": "1.0.0",
  "userId": "user-id",
  "department": "IT"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Agent registered successfully",
  "data": { ...agent object }
}
```

#### Download Agent Installer
Download the scanner agent installer.

**Endpoint:** `GET /api/v1/scanner/auto-install-download`

**Response:** Windows batch installer (.bat) file download

### Scanner Upload

### Upload Scanned File
Upload a file from a local scanner agent.

**Endpoint:** `POST /api/v1/scanner/upload`

**Headers:** `Authorization: Bearer <accessToken>`

**Content-Type:** `multipart/form-data`

**Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | Yes | Scanned file (PDF, JPG, PNG) |
| department | string | No | Department name |
| uploadedBy | string | No | Uploader identifier |
| alias | string | No | Friendly name |
| tags | string | No | Comma-separated tags |

**Response (201):**
```json
{
  "success": true,
  "fileUrl": "http://localhost:5000/api/v1/files/ABC123DEF456",
  "fileId": "ABC123DEF456",
  "message": "File uploaded successfully"
}
```

**Error Responses:**
- **400** - No file uploaded: `{"success": false, "message": "No file uploaded"}`
- **400** - Invalid file type: `{"success": false, "message": "Invalid scanned file type. Only PDF, JPG, PNG, TIFF allowed."}`
- **413** - File too large: `{"success": false, "message": "File too large. Maximum size is 50MB"}`

**Supported File Types:** PDF, JPG, JPEG, PNG, TIFF, BMP

**Max File Size:** 50MB (configurable via `MAX_FILE_SIZE` env variable)

---

### Upload Scanned File (Simple)
A simpler version for quick scanner uploads.

**Endpoint:** `POST /api/v1/scanner/upload-simple`

**Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | Yes | Scanned file |
| department | string | No | Department name |
| uploadedBy | string | No | Uploader identifier |

**Response (201):**
```json
{
  "success": true,
  "fileUrl": "http://localhost:5000/api/v1/files/ABC123DEF456",
  "message": "File uploaded successfully"
}
```

---

### Upload to Pending (Agent)
Upload scanned file to pending confirmation queue with machine isolation.

**Endpoint:** `POST /api/v1/scanner/pending`

**Headers:** `Authorization: Bearer <accessToken>`

**Content-Type:** `multipart/form-data`

**Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | Yes | Scanned file (PDF, JPG, PNG, TIFF, BMP) — sent as binary buffer |
| machineId | string | Yes | Machine identifier |
| fileName | string | Yes | Original filename |
| fileSize | number | Yes | Size in bytes |
| mimeType | string | Yes | e.g. "application/pdf", "image/jpeg" |
| originalPath | string | No | Full path on scanner machine (for reference) |
| department | string | No | Department name |
| machineName | string | No | Machine display name |
| hostname | string | No | Machine hostname |
| os | string | No | Operating system |
| osVersion | string | No | OS version |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "ABC123...",
    "filePath": "https://<vercel-blob-id>.public.blob.vercel-storage.com/pending/123456-scan001.pdf",
    "permanentFileUrl": "https://<vercel-blob-id>.public.blob.vercel-storage.com/pending/123456-scan001.pdf",
    "originalName": "scan001.pdf",
    "mimeType": "application/pdf",
    "fileSize": 2048000,
    "status": "pending",
    "machineId": "DESKTOP-VQC2MOD",
    "department": "Radiology",
    "assignedTo": "user-object-id"
  },
  "message": "File uploaded to pending. Confirm to finalize."
}
```

**Note:** `filePath` and `permanentFileUrl` are now always Vercel Blob HTTPS URLs. Pending scans store `mimeType`, `originalName`, `status`, `assignedTo` (uploader).

**Machine Isolation:** Each scanner agent only sees pending scans from its own machine, preventing cross-device interference.

### Get Pending Scans
Get pending scans for current user/machine.

**Endpoint:** `GET /api/v1/scanner/pending`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| machineId | string | Filter by machine (recommended) |
| status | string | Filter by status (default: pending) |
| page | number | Page number |
| limit | number | Items per page |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "pendingScans": [
      {
        "id": "ABC123...",
        "originalName": "scan001.pdf",
        "fileSize": 2048000,
        "machineId": "DESKTOP-VQC2MOD",
        "status": "pending",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "totalPages": 1,
    "currentPage": 1,
    "total": 1
  }
}
```

### Scanner Upload

**Endpoint:** `POST /api/v1/scanner/pending`

**Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | Yes | Scanned file |
| machineId | string | Yes | Scanner machine identifier |
| machineName | string | No | Human-readable machine name |
| hostname | string | No | Machine hostname |
| os | string | No | Operating system |
| osVersion | string | No | OS version |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "ABC123DEF456",
    "filePath": "/uploads/scanned/file.pdf",
    "originalName": "scan001.pdf",
    "status": "pending",
    "fileSize": 1048576,
    "machineId": "machine-abc123",
    "fileFingerprint": "sha256-hash..."
  },
  "message": "File uploaded to pending. Confirm to finalize."
}
```

**Error Response (409 - Duplicate):**
```json
{
  "success": false,
  "message": "File already processed (rejected)",
  "data": {
    "existingId": "ABC123DEF456",
    "status": "rejected",
    "processedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### Get Pending Scans
Retrieve pending scans for confirmation.

**Endpoint:** `GET /api/v1/scanner/pending`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20) |
| machineId | string | Filter by machine ID |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "pendingScans": [
      {
        "id": "ABC123DEF456",
        "originalName": "scan001.pdf",
        "fileSize": 1048576,
        "status": "pending",
        "machineId": "machine-abc123",
        "fileFingerprint": "sha256-hash...",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "totalPages": 1,
    "currentPage": 1,
    "total": 1
  }
}
```

**Note:** Only returns scans with `status = "pending"`. Rejected/uploaded scans are filtered out.

---

### Pending Scan Statistics
Get counts for dashboard widgets. **Never returns 404 or crashes on empty DB** — always returns safe zero values.

**Endpoint:** `GET /api/v1/scanner/pending/stats`

**Response (200) — always safe:**
```json
{
  "success": true,
  "data": {
    "pending": 12,
    "confirmedToday": 3,
    "cancelled": 7
  }
}
```

- `pending`: current pending for the user's scope (user/hod/admin)
- `confirmedToday`: confirmed in last 24h
- `cancelled`: total cancelled in scope

**Auth:** Required. Respects role-based filtering (admin=all, hod=dept, user=assigned).

---

### Reject Pending Scan
Permanently reject a pending scan (file stays in scan folder but won't be re-uploaded).

**Endpoint:** `PATCH /api/v1/scanner/pending/:id/reject`

**Request Body:**
```json
{
  "reason": "Poor quality scan"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Pending scan rejected successfully"
}
```

**Permissions:** Assigned user, HOD (same department), or Admin

---

## 11. Common Info

### CORS Configuration

Cross-Origin Resource Sharing (CORS) is configured to allow frontend applications to communicate with the backend.

**Configuration:**
| Setting | Value |
|---------|-------|
| Allowed Origin | `http://localhost:3000` |
| Credentials | Enabled |
| Allowed Methods | GET, POST, PUT, PATCH, DELETE |
| Allowed Headers | Content-Type, Authorization |

**Preflight Handling:**
The server handles OPTIONS preflight requests automatically for all routes.

**Middleware Order:**
```javascript
// 1. CORS (must be first)
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// 2. JSON parsing
app.use(express.json());

// 3. URL-encoded parsing
app.use(express.urlencoded({ extended: true }));

// 4. Routes (after all middleware)
app.use('/api/auth', authRoutes);
```

---

### Server Configuration

**Port:** `5000` (default, can be overridden via `PORT` environment variable)

**Base URLs:**
| Environment | URL |
|-------------|-----|
| Development | `http://localhost:5000` |
| Production | Deployed on Render |

**Keep-Alive:** The server pings the production frontend every 10 minutes to prevent idle timeout.

---

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

---

## 12. Vercel Deployment

This backend is deployed on Vercel as a Serverless Function. Below are the critical configuration files and their roles.

### `vercel.json` (Project Root)

Routes all `/api/*` requests to the Express app and sets CORS headers at the Vercel edge layer.

```json
{
  "version": 2,
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/app.js"
    }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Access-Control-Allow-Credentials",
          "value": "true"
        },
        {
          "key": "Access-Control-Allow-Origin",
          "value": "https://rhv-dms.vercel.app"
        },
        {
          "key": "Access-Control-Allow-Methods",
          "value": "GET,OPTIONS,PATCH,DELETE,POST,PUT"
        },
        {
          "key": "Access-Control-Allow-Headers",
          "value": "Content-Type, Authorization, x-platform, x-browser, x-device, x-client-type"
        }
      ]
    }
  ]
}
```

### `api/app.js` (Express Entry Point)

Main Express application file. Loaded by Vercel as a serverless function.

| Requirement | Implementation |
|-------------|---------------|
| Environment variables | `require('dotenv').config()` as **line 1** |
| CORS | `corsConfig` imported from `./src/config/cors`, used as first middleware |
| Route prefix | All routes prefixed with `/api` (e.g., `app.use('/api/v1/auth', authRoutes)`) |
| 404 fallback | `app.use((req, res) => res.status(404).json(...))` |
| Global error handler | `app.use((err, req, res, next) => console.error("🔥 Server Error:", err.stack))` |
| Export pattern | `module.exports = app` for Vercel compatibility |

**Critical — Middleware order:**

```
1. dotenv.config()           Load .env before anything else
2. process.on('unhandled...') Global promise/exception logging
3. corsConfig                CORS headers (must be first middleware)
4. express.json()            Body parsing
5. express.urlencoded()      URL-encoded body parsing
6. /api/v1/auth              Auth routes
7. /api/v1/user              User routes (guarded by checkAuth)
8. /api/v1/admin             Admin routes (guarded by checkAuth)
9. 404 fallback              Catches unmatched routes
10. Global error handler      Catches all thrown errors
```

### `api/src/config/cors.js` (CORS Middleware)

Dynamic origin whitelist used by the Express app:

| Origin | Purpose |
|--------|---------|
| `https://rhv-dms.vercel.app` | Production frontend |
| `http://192.168.0.153:3000` | Local network frontend |
| `http://localhost:3000` | Local development |
| `http://docmanager.rhv` | Internal network alias |

Headers explicitly whitelisted: `x-platform`, `x-browser`, `x-device`, `x-client-type`, `Content-Type`, `Authorization`.

### Common Vercel Issues & Fixes

#### 1. 404 "Cannot GET /api/v1/auth/me"

- **Cause**: Vercel rewrite not reaching Express, OR Express route not matching.
- **Fix**: Verify `vercel.json` rewrite `source: "/api/(.*)"` → `destination: "/api/app.js"`. Ensure Express routes are prefixed with `/api` (e.g., `app.use('/api/v1/auth', ...)`).

#### 2. CORS / Custom Header Blocked

- **Cause**: Custom headers (like `x-platform`) missing from Vercel edge headers or Express CORS middleware.
- **Fix**: Add the header to both:
  - `vercel.json` → `Access-Control-Allow-Headers`
  - `cors.js` → `allowedHeaders`

#### 3. JWT `secretOrPrivateKey must have a value`

- **Cause**: Environment variable `JWTSecret` used in code, but `.env` file defines `JWT_SECRET` (underscore).
- **Fix**: Use `process.env.JWT_SECRET` consistently. `dotenv.config()` must run before any code accesses `process.env`.

#### 4. Terminal Not Showing Error Logs

- **Cause**: Async route handlers throw errors that become unhandled promise rejections, bypassing Express error middleware.
- **Fix**: The app includes `process.on('unhandledRejection')` and `process.on('uncaughtException')` handlers that log to `console.error`. The global Express error handler at the bottom also logs `err.stack`:

```javascript
app.use((err, req, res, next) => {
  console.error("🔥 Server Error:", err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});
```