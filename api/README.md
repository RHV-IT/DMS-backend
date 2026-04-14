# Enterprise Document Management System (DMS) Backend

A production-ready REST API backend for an Enterprise Document Management System built with Node.js, Express.js, and MongoDB.

## Features

### Authentication & Security
- User registration and JWT-based login
- Token refresh system
- Password hashing with bcrypt
- Password expiry enforcement (90 days)
- Password history to prevent reuse
- Role-based access control (Admin, HOD, User)
- Session timeout (30 minutes inactivity auto-logout)
- JWT token expires in 24 hours

### File Management
- Single and bulk file uploads
- Scanned document support (PDF, JPG, PNG, TIFF)
- File versioning with rollback
- Soft delete with 30-day recycle bin
- Permanent delete (admin only)
- File preview for PDF/images

### Access Control
- **User**: Can only see their own files
- **HOD**: Can see all files in their department
- **Admin**: Can see all files across all departments
- File sharing between any users (cross-department allowed)
- Confidentiality levels: Public, Internal, Confidential, Highly Confidential
- HOD override for department files

### Admin Features
- User management (create, edit, suspend, restore, delete)
- All deleted files visibility
- Manual cleanup of expired files
- Audit log access and export
- User creation requires department and role

### Additional Features
- Search and filtering (by type, date, owner, tags)
- Pagination and sorting
- Notifications for file events
- Comprehensive audit logging
- Swagger API documentation

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (jsonwebtoken)
- **File Upload**: Multer
- **Password Hashing**: bcrypt
- **Validation**: express-validator
- **Logging**: Winston
- **API Docs**: Swagger (swagger-jsdoc, swagger-ui-express)

## Project Structure

```
api/
├── src/
│   ├── app.js                 # Main Express application
│   ├── config/
│   │   ├── database.js        # MongoDB connection
│   │   └── logger.js          # Winston logger configuration
│   ├── models/
│   │   ├── User.js            # User model with auth fields
│   │   ├── Role.js            # Role and permissions
│   │   ├── File.js            # File metadata
│   │   ├── FileVersion.js     # File versioning
│   │   ├── Permission.js      # Access control
│   │   ├── AuditLog.js        # Activity logging
│   │   └── Notification.js    # User notifications
│   ├── controllers/          # Request handlers
│   ├── routes/               # API route definitions
│   ├── middlewares/          # Auth, upload, error handling
│   ├── services/             # Business logic
│   └── utils/                 # Seed script, swagger config
├── uploads/                  # File storage directory
├── .env                      # Environment variables
├── .env.example              # Example environment file
├── package.json
└── README.md
```

## Setup Instructions

### Prerequisites
- Node.js (v14+)
- MongoDB (local or cloud instance)

### Installation

1. **Navigate to the API directory**:
   ```bash
   cd api
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create environment file**:
   ```bash
   cp .env.example .env
   ```

4. **Configure `.env` file**:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/dms
   JWT_SECRET=your-secret-key
   JWT_REFRESH_SECRET=your-refresh-secret
   JWT_EXPIRE=24h
   JWT_REFRESH_EXPIRE=24h
   SESSION_TIMEOUT=30
   PASSWORD_EXPIRE_DAYS=90
   PASSWORD_HISTORY_LIMIT=5
   MAX_FILE_SIZE=52428800
   UPLOAD_PATH=./uploads
   ENABLE_SWAGGER=true
   ```

5. **Run the seed script** (creates admin user):
   ```bash
   npm run seed
   ```

6. **Start the server**:
   ```bash
   npm start
   # Or for development with auto-reload:
   npm run dev
   ```

### Access Points

- **API Base URL**: http://localhost:3000
- **Health Check**: http://localhost:3000/health
- **Swagger Docs**: http://localhost:3000/api-docs

### Default Admin Credentials

After running the seed script:
- **Email**: admin@dms.com
- **Password**: Admin@123

## User Roles & Permissions

| Role | File Access | User Management | Department Access |
|------|-------------|-----------------|-------------------|
| **admin** | All files (all departments) | Full (create, edit, suspend, delete) | All |
| **hod** | All files in their department | Read, update | Own department only |
| **user** | Own files only | Own profile only | N/A |

### File Access Rules
1. **Regular User**: Can only see files they uploaded
2. **HOD**: Can see all files uploaded by users in their department (e.g., HR HOD sees all HR staff files)
3. **Admin**: Can see all files across all departments

### File Sharing
- Any user can share their files with any other user on the system
- Cross-department sharing is allowed (no restrictions)
- Only file owner or admin can grant/revoke permissions

## Creating Users (Admin Only)

When creating a user, both `department` and `role` are **required**:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "department": "HR",
  "role": "user"
}
```

Valid roles: `admin`, `hod`, `user`

## Confidentiality Levels

| Level | Description |
|-------|-------------|
| **public** | Can be shared with anyone |
| **internal** | Department members only |
| **confidential** | Restricted access |
| **highly_confidential** | Admin only |

## Recycle Bin

- Deleted files stay in recycle bin for 30 days
- Users can only see their own deleted files
- HOD can see deleted files from their department
- Admin can see all deleted files with `showAll=true`
- Files are automatically deleted after 30 days
- Admin can manually trigger cleanup with `/api/v1/files/clean-expired`

## Session & Token Settings

| Setting | Value | Description |
|---------|-------|-------------|
| JWT_EXPIRE | 24h | Token valid for 24 hours |
| JWT_REFRESH_EXPIRE | 24h | Refresh token valid for 24 hours |
| SESSION_TIMEOUT | 30 minutes | Auto-logout after 30 mins inactivity |

The frontend should:
- Track user activity (mouse movement, keyboard, clicks)
- Show a warning modal at 25 minutes of inactivity
- Auto-logout at 30 minutes of inactivity
- Use refresh token to get new access token before expiry

## API Documentation

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/register` | POST | Register new user |
| `/api/v1/auth/login` | POST | Login user |
| `/api/v1/auth/refresh` | POST | Refresh access token |
| `/api/v1/auth/logout` | POST | Logout user |
| `/api/v1/auth/change-password` | POST | Change password |
| `/api/v1/auth/profile` | GET | Get current user profile |
| `/api/v1/auth/profile` | PUT | Update profile |

### Users (Admin only)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/users` | GET | Get all users |
| `/api/v1/users/:id` | GET | Get user by ID |
| `/api/v1/users` | POST | Create new user (requires department & role) |
| `/api/v1/users/:id` | PUT | Update user |
| `/api/v1/users/:id/reset` | POST | Reset user password |
| `/api/v1/users/:id/suspend` | POST | Suspend user |
| `/api/v1/users/:id/restore` | POST | Restore suspended user |
| `/api/v1/users/:id/delete` | POST | Delete user (soft) |
| `/api/v1/users/:id/activate` | POST | Activate user |

### Files

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/files` | GET | Get accessible files |
| `/api/v1/files` | POST | Upload single file |
| `/api/v1/files/bulk` | POST | Bulk upload (max 10) |
| `/api/v1/files/scan` | POST | Upload scanned document |
| `/api/v1/files/scan/bulk` | POST | Bulk scan upload (max 20) |
| `/api/v1/files/deleted` | GET | Get recycle bin files |
| `/api/v1/files/:fileId` | GET | Get file metadata |
| `/api/v1/files/:fileId/download` | GET | Download file |
| `/api/v1/files/:fileId/preview` | GET | Preview file |
| `/api/v1/files/:fileId` | PUT | Update file (new version) |
| `/api/v1/files/:fileId` | DELETE | Soft delete file |
| `/api/v1/files/:fileId/permanent-delete` | POST | Permanent delete (admin) |
| `/api/v1/files/:fileId/restore` | POST | Restore from recycle bin |
| `/api/v1/files/:fileId/versions` | GET | Get version history |
| `/api/v1/files/:fileId/rollback` | POST | Rollback to version |
| `/api/v1/files/clean-expired` | POST | Clean expired files (admin) |
| `/api/v1/files/types/supported` | GET | Get supported file types |

### Permissions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/permissions/my` | GET | Get files shared with me |
| `/api/v1/permissions/file/:fileId` | GET | Get file permissions |
| `/api/v1/permissions/file/:fileId` | POST | Grant permission (any user) |
| `/api/v1/permissions/:permissionId/revoke` | POST | Revoke permission |
| `/api/v1/permissions/hod-override` | POST | HOD permission override |

### Notifications

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/notifications` | GET | Get my notifications |
| `/api/v1/notifications/read-all` | POST | Mark all as read |
| `/api/v1/notifications/:id/read` | POST | Mark as read |
| `/api/v1/notifications/:id` | DELETE | Delete notification |

### Audit Logs (Admin/HOD)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/logs` | GET | Get all logs |
| `/api/v1/logs/my` | GET | Get my activity logs |
| `/api/v1/logs/export` | GET | Export logs (CSV/JSON) |
| `/api/v1/logs/stats` | GET | Get log statistics |

---

### Example: Login Request

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@dms.com", "password": "Admin@123"}'
```

### Example: Create User (Admin)

```bash
curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","password":"password123","department":"HR","role":"user"}'
```

### Example: Get Files by Role

```bash
# Regular user - sees only their own files + shared files
curl -X GET http://localhost:3000/api/v1/files \
  -H "Authorization: Bearer <token>"

# HOD - sees all files in their department
curl -X GET http://localhost:3000/api/v1/files \
  -H "Authorization: Bearer <token>"

# Admin - sees all files across all departments
curl -X GET http://localhost:3000/api/v1/files \
  -H "Authorization: Bearer <token>"
```

---

## Changelog

### v1.0.0 (2026-04-14)
- Initial release
- JWT authentication with 24h expiry
- Session timeout (30 min inactivity)
- Role-based file access (Admin/HOD/User)
- File upload with versioning
- Scanned document support
- Recycle bin with 30-day auto-delete
- Cross-department file sharing
- User management with required department & role

---

## License

ISC