# Scan → Pending → Confirm → Delete Workflow

## Overview

```
[User Machine] → [Agent] → [Backend API] → [MongoDB] → [Frontend]
                          ↓
                    [File Storage]
```

## API Endpoints

### 1. Upload to Pending
**POST** `/api/v1/scanner/pending`

- **Auth**: Bearer token required
- **Content-Type**: multipart/form-data
- **Body**: `file` (the scanned document)

**Response**:
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "id": "ABC123DEF456",
    "originalName": "scan001.jpg",
    "status": "pending",
    "fileSize": 245000,
    "mimeType": "image/jpeg",
    "department": "scanner",
    "assignedTo": "user_id",
    "createdAt": "2026-04-22T10:00:00Z"
  },
  "message": "File uploaded to pending. Confirm to finalize."
}
```

---

### 2. List Pending Scans
**GET** `/api/v1/scanner/pending`

- **Auth**: Bearer token required
- **Query**: `status=pending`, `page=1`, `limit=20`

**Response**:
```json
{
  "success": true,
  "data": {
    "pendingScans": [...],
    "totalPages": 3,
    "currentPage": 1,
    "total": 25
  }
}
```

---

### 3. Get Single Pending Scan
**GET** `/api/v1/scanner/pending/:id`

- **Auth**: Bearer token required
- Only owner, HOD of dept, or admin can view

---

### 4. Confirm Scan (with Format Conversion)
**POST** `/api/v1/scanner/confirm`

- **Auth**: Bearer token required
- **Body**:
```json
{
  "id": "ABC123DEF456",
  "alias": "Q1 Report 2026",
  "confidentialityLevel": "internal",
  "description": "Quarterly financial report",
  "format": "pdf"
}
```

**Supported formats**: `pdf`, `jpg`, `jpeg`, `png`

**Response**:
```json
{
  "success": true,
  "data": {
    "fileId": "...",
    "name": "scan001.jpg",
    "alias": "Q1 Report 2026",
    "type": "pdf",
    "size": 89000
  },
  "fileUrl": "http://localhost:5000/api/v1/files/...",
  "fileId": "...",
  "deleteLocal": true,
  "message": "File confirmed and converted to PDF successfully"
}
```

---

### 5. Cancel Scan
**POST** `/api/v1/scanner/cancel`

- **Auth**: Bearer token required
- **Body**:
```json
{
  "id": "ABC123DEF456",
  "reason": "Wrong file scanned"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Pending scan cancelled successfully"
}
```

> Note: Physical file is NOT deleted from user's machine.

---

### 6. Delete Pending Scan (Admin Only)
**DELETE** `/api/v1/scanner/pending/:id`

- **Auth**: Bearer token (admin only)
- Deletes both DB record and physical file

---

### 7. Get Statistics
**GET** `/api/v1/scanner/pending/stats`

- **Auth**: Bearer token required

**Response**:
```json
{
  "success": true,
  "data": {
    "pending": 5,
    "confirmedToday": 12,
    "cancelled": 3
  }
}
```

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  USER MACHINE                                                 │
│  ┌─────────┐    ┌─────────────────┐                          │
│  │ Scanner │───▶│ C:\Users\...\Scan│                          │
│  └─────────┘    └─────────────────┘                          │
│                            │                                │
│                            ▼                                │
│                    ┌─────────────────┐                     │
│                    │  Scanner Agent  │                      │
│                    │  (scanner-agent)│                      │
│                    └────────┬────────┘                      │
│                             │ POST multipart/form-data     │
└──────────────────────────────┼───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND                                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  POST /api/v1/scanner/pending                           │  │
│  │  - Validate JWT                                        │  │
│  │  - Store file to uploads/                             │  │
│  │  - Create PendingScan record                         │  │
│  │  - Return pending ID                                  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  GET /api/v1/scanner/pending (Frontend poll/list)       │  │
│  └─────────────────────────────────────────────────────────┘  │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  POST /api/v1/scanner/confirm                         │  │
│  │  - Convert format if needed (JPG→PDF)                  │  │
│  │  - Move to permanent storage                         │  │
│  │  - Create File record                                │  │
│  │  - Delete temp file                                 │  │
│  │  - Return { deleteLocal: true }                     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  MongoDB: pendingscans collection                     │  │
│  │  MongoDB: files collection                           │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

## File Type Validation

Only these file types are accepted for upload:
- `application/pdf`
- `image/jpeg`
- `image/png`
- `image/tiff`
- `image/bmp`

## Security

1. **JWT Authentication** - All routes require valid Bearer token
2. **Authorization** - Users can only modify their own uploads
3. **Admin Override** - Admins can view/manage all pending scans
4. **File Size Limit** - Max 50MB (configurable via `MAX_FILE_SIZE` env)

## Error Response Format

```json
{
  "success": false,
  "message": "Error description"
}
```

## TTL (Auto-Delete)

Pending scans auto-delete after 72 hours if not confirmed.

## Configuration

Environment variables:
```
MAX_FILE_SIZE=52428800
UPLOAD_PATH=./uploads
PORT=5000
MONGODB_URI=mongodb://localhost:27017/dms
```