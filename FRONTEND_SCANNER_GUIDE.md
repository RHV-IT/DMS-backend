# How Scanner Files Reach the Frontend

## Quick Answer

**Scanner uploads automatically appear in the regular file list.** No special frontend changes needed — just use `GET /api/v1/files` like you already do. Scanner files are tagged with:

- `uploadSource: "scanner"`
- `isScanned: true`

You can optionally display a "Scanner" badge or filter by `isScanned=true`.

---

## Full Explanation

### 1. Backend Side (already done)

The scanner watcher (`watcher/scanner-watcher.js`) watches `C:\Users\user\Documents\Scan` for new files and POSTs them to:

```
POST http://localhost:5000/api/v1/scanner/upload
Headers: Authorization: Bearer <SCANNER_TOKEN>
Content-Type: multipart/form-data
Body: { file: <binary> }
```

The backend endpoint `api/src/controllers/scannerController.js:uploadScannerFile` receives it and creates a File record in MongoDB with:

```javascript
{
  name: "Scan_20260420_152957.jpg",
  type: "jpg",
  size: 7520000,
  owner: ObjectId("scanner-user-id"),  // the scanner service user
  department: "HR",                     // from scanner user's department
  isScanned: true,
  uploadSource: "scanner",
  storagePath: "a1b2c3d4.jpg",         // UUID filename on disk
  tags: [],
  confidentialityLevel: "internal",
  // ... plus timestamps
}
```

### 2. File Visibility Rules

Scanner files obey the **same permission rules** as regular files:

| User Role | Sees Scanner Files From |
|-----------|------------------------|
| **Admin** | All departments |
| **HOD** | Own department only |
| **User** | Own department + shared files |

So if the scanner user's department is `HR`, then:
- HR users see scanner files on the file list
- Non-HR users don't see them (unless admin or file is shared)

### 3. Frontend Integration

#### Option A — No Changes Needed (Files Appear Automatically)

If your frontend already calls `GET /api/v1/files`, you'll see scanner files immediately after the watcher uploads them.

```javascript
// Existing code — works as-is
fetch('/api/v1/files', {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(res => res.json())
.then(data => {
  console.log(data.data.files); // ← Includes scanner files
});
```

#### Option B — Add a "Scanner Files" Filter

Add a toggle or filter to show only scanner uploads:

```javascript
// Filter for scanner files only
GET /api/v1/files?isScanned=true

// Or filter by department + scanner files
GET /api/v1/files?department=HR&isScanned=true
```

**Frontend UI Example:**
```
[All Files] [My Uploads] [Scanner Documents] [Shared With Me]
```

Active "Scanner Documents" tab → calls `GET /api/v1/files?isScanned=true`.

#### Option C — Show a Scanner Badge

Highlight scanner files in the list:

```jsx
function FileRow({ file }) {
  return (
    <tr>
      <td>
        {file.name}
        {file.uploadSource === 'scanner' && (
          <span style={{
            background: '#10b981',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.75rem',
            marginLeft: '8px'
          }}>
            Scanner
          </span>
        )}
      </td>
      {/* ... other columns */}
    </tr>
  );
}
```

### 4. Download & Preview

Same as regular files:

```javascript
// Download
window.open(`/api/v1/files/${fileId}/download`);

// Preview (PDF/images show in browser)
<iframe src={`/api/v1/files/${fileId}/preview`} />
```

### 5. File Metadata Received

The frontend receives the full File object:

```json
{
  "fileId": "ABC123DEF456",
  "name": "Scan_20260420_152957.jpg",
  "type": "jpg",
  "size": 7520000,
  "owner": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "name": "Scanner Service",
    "email": "scanner@dms.local"
  },
  "department": "HR",
  "confidentialityLevel": "internal",
  "isScanned": true,           // ← Key field
  "uploadSource": "scanner",   // ← Key field
  "ocrStatus": "pending",      // PDFs/images get OCR processed
  "createdAt": "2026-04-20T15:29:57.000Z",
  "currentVersion": 1
}
```

### 6. What the Frontend Should NOT Do

- ❌ Don't call the scanner endpoint directly — the watcher does that
- ❌ Don't use the scanner token — use the logged-in user's token
- ❌ Don't try to access scanner files on disk directly — go through `/api/v1/files/:fileId/download`
- ❌ Don't worry about file cleanup — the watcher deletes them from the scan folder automatically

### 7. Optional: Real-Time Updates

If you want files to appear immediately without page refresh, implement polling:

```javascript
useEffect(() => {
  const interval = setInterval(() => {
    fetchFiles(); // Re-fetch file list
  }, 5000); // Every 5 seconds

  return () => clearInterval(interval);
}, []);
```

Polling is acceptable since scans are infrequent (every few minutes/hours, not seconds).

---

## Quick Checklist for Frontend

- [x] **Auth** — User logs in normally (no scanner token needed)
- [x] **File listing** — Already calls `GET /api/v1/files` → scanner files included
- [ ] **Optional filter** — Add "Scanner Files" tab with `?isScanned=true`
- [ ] **Optional badge** — Show "Scanner" tag on scanner-originated files
- [ ] **Preview/download** — Works same as any file via `/:fileId/preview` or `/:fileId/download`
- [ ] **Permissions** — Scanner files respect department-based access (HOD sees dept files, admin sees all)

---

## Example: Full File List Page (React)

```jsx
import React, { useState } from 'react';
import useScannerFiles from './hooks/useScannerFiles';

export default function FilesPage() {
  const [filter, setFilter] = useState('all'); // 'all' | 'scanner' | 'mine'
  
  const { files, loading, pagination } = useScannerFiles({
    page: 1,
    limit: 20,
    ...(filter === 'scanner' && { isScanned: true })
  });

  const scannerCount = files.filter(f => f.uploadSource === 'scanner').length;

  return (
    <div>
      <h1>Documents</h1>
      
      {/* Filter Tabs */}
      <div className="tabs">
        <button 
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All Files
        </button>
        <button 
          className={filter === 'scanner' ? 'active' : ''}
          onClick={() => setFilter('scanner')}
        >
          📄 Scanner ({scannerCount})
        </button>
        <button 
          className={filter === 'mine' ? 'active' : ''}
          onClick={() => setFilter('mine')}
        >
          My Uploads
        </button>
      </div>

      {/* File Table */}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Size</th>
              <th>Uploaded By</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {files.map(file => (
              <tr key={file.fileId} className={
                file.uploadSource === 'scanner' ? 'scanner-row' : ''
              }>
                <td>
                  {file.name}
                  {file.uploadSource === 'scanner' && (
                    <span className="badge scanner">Scanner</span>
                  )}
                </td>
                <td>{file.type.toUpperCase()}</td>
                <td>{formatBytes(file.size)}</td>
                <td>
                  {file.uploadSource === 'scanner' 
                    ? 'Scanner Service' 
                    : file.owner?.name}
                </td>
                <td>{new Date(file.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

---

## Backend API Reference

### Scanner Upload Endpoint

**This is only for the watcher — not called by frontend.**

```
POST /api/v1/scanner/upload
Authorization: Bearer <SCANNER_SERVICE_TOKEN>
Content-Type: multipart/form-data

Form data: { file: <binary> }
```

Response:
```json
{
  "success": true,
  "fileUrl": "http://localhost:5000/api/v1/files/ABC123",
  "fileId": "ABC123DEF456",
  "message": "File uploaded successfully"
}
```

### Files List Endpoint (**Used by Frontend**)

```
GET /api/v1/files
Authorization: Bearer <USER_TOKEN>
Query: ?page=1&limit=20&isScanned=true&department=HR
```

Response:
```json
{
  "success": true,
  "data": {
    "files": [ ...file objects... ],
    "totalPages": 5,
    "currentPage": 1,
    "total": 87
  }
}
```

---

## Summary Table

| Info | Where to Get It |
|------|----------------|
| File list | `GET /api/v1/files` |
| File details | `GET /api/v1/files/:fileId` |
| Download | `GET /api/v1/files/:fileId/download` |
| Preview | `GET /api/v1/files/:fileId/preview` |
| Scanner marker | `file.uploadSource === 'scanner'` or `file.isScanned === true` |
| Uploader name | `file.owner.name` (will be "Scanner Service" for scanner files) |
| Department | `file.department` |
| File type | `file.type` (pdf, jpg, png, tiff, bmp) |

---

## Troubleshooting

### "Scanner files not showing"

**Check:**
1. Scanner user's department matches viewing user's department
2. Scanner token is valid (watcher logs show "✓ Success")
3. Backend is running and database connected
4. File's `isDeleted: false` (scanner uploads are never soft-deleted)

### "Scanner files show but download fails (403)"

**Cause:** Permission check failed.

**Fix:** Ensure file `owner` department and file `department` align. Scanned files use scanner user's department.

### "Duplicate files appear"

**Cause:** Scanner temp files (`4tmp_*.jpg`) being detected before final write.

**Fix:** Already handled by watcher's `awaitWriteFinish` + 1500ms threshold. If still seeing duplicates, increase threshold.

### "Files upload but OCR not processing"

**Cause:** OCR service may be separate/not implemented.

**Fix:** Check `file.ocrStatus` — if `pending`, OCR is queued. If `failed`, check backend logs.

---

## Support

Full API docs: `api/DOCUMENTATION.md` (lines 1753–1818 cover scanner uploads)
