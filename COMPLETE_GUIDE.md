# COMPLETE SETUP & FRONTEND INTEGRATION GUIDE

## Everything You Need to Know

### WE FIXED TWO PROBLEMS:

1. **"Invalid or expired token"** → Created automated token generation
2. **"Files not deleting"** → Configured watcher to delete files after upload

---

## 🎯 QUICK START (3 Commands)

```bash
# 1. Install watcher dependencies
cd watcher && npm install

# 2. Create scanner account & get token (run from api)
cd ../api
node src/utils/create-scanner-user.js

# 3. Start the watcher
cd ../watcher
npm start
```

**Done!** Files dropped in `C:\Users\user\Documents\Scan` will upload and delete automatically.

---

## 📁 PROJECT FILES CREATED/UPDATED

```
dms-backend/
├── watcher/                          ← Scanner watcher (NEW/UPDATED)
│   ├── scanner-watcher.js           (main watcher - chokidar)
│   ├── package.json                 (dependencies: chokidar, axios, form-data)
│   ├── .env.example                 (config template)
│   ├── .env                         (AUTO-CREATED by create-scanner-user.js)
│   ├── README.md                    (complete documentation)
│   ├── start-watcher.bat            (double-click starter)
│   ├── setup-autostart.ps1          (Windows Task Scheduler installer)
│   ├── generate-scanner-token.js    (manual token generator)
│   ├── renew-token.js               (token renewal helper)
│   └── frontend/                    (FRONTEND INTEGRATION)
│       ├── ScannerBadge.jsx         (React component for scanner badge)
│       ├── useScannerFiles.js       (React hook for easy fetching)
│       └── scanner-styles.css       (scanner-specific styles)
│
├── api/src/utils/                   ← Token generation utilities (NEW)
│   ├── create-scanner-user.js       (FULL SETUP - creates user + token + .env)
│   └── generate-scanner-token.js    (token only, requires existing user)
│
├── FIX_SUMMARY.md                   (technical details of fixes)
├── FRONTEND_SCANNER_GUIDE.md        (FRONTEND INTEGRATION GUIDE)
└── setup-scanner.bat               (one-click batch setup)
```

---

## 🔧 HOW THE WATCHER WORKS

```
Scanner → C:\Users\user\Documents\Scan\file.jpg
         ↓ (chokidar detects file after 1.5s stability)
         ↓ (waits random 1-2 seconds)
         ↓ (POST multipart with Bearer token)
Backend: POST /api/v1/scanner/upload
         ↓
MongoDB: Insert File record
  {
    fileId: "ABC123...",
    name: "file.jpg",
    uploadSource: "scanner",
    isScanned: true,
    owner: ObjectId("scanner-user-id"),
    department: "HR"
  }
         ↓
Frontend: GET /api/v1/files ← sees scanner files automatically!
```

---

## 🎨 FRONTEND INTEGRATION

### **IT'S AUTOMATIC** — No special API calls needed!

Just use your existing file list endpoint:

```javascript
// This already includes scanner files!
fetch('/api/v1/files', {
  headers: { 'Authorization': `Bearer ${userToken}` }
})
.then(res => res.json())
.then(data => {
  const files = data.data.files;
  // Scanner files have uploadSource === 'scanner'
});
```

### Optional: Add a "Scanner Files" Filter

```javascript
// Fetch only scanner files
GET /api/v1/files?isScanned=true

// React hook already created for you:
import { useScannerFiles } from './useScannerFiles';

const { files, loading } = useScannerFiles({ onlyScanner: true });
```

### Optional: Show a Scanner Badge

```jsx
import { ScannerBadge } from './ScannerBadge';

{file.uploadSource === 'scanner' && <ScannerBadge file={file} />}
```

**Result:** Green "Scanner" badge appears next to scanner-originated files.

---

## 📊 SCANNER FILE OBJECT (What Frontend Receives)

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
  "isScanned": true,                   // ← Scanner flag
  "uploadSource": "scanner",           // ← Scanner flag
  "currentVersion": 1,
  "createdAt": "2026-04-20T15:29:57.000Z"
}
```

---

## 🔍 IDENTIFYING SCANNER FILES

Check either field:

```javascript
if (file.uploadSource === 'scanner') {   // Preferred
  // Show scanner badge
}

// OR

if (file.isScanned === true) {
  // Show scanner badge
}
```

---

## 📥 DOWNLOAD & PREVIEW (Same as Regular Files)

```javascript
// Download
window.open(`/api/v1/files/${fileId}/download`);

// Preview PDF/image
<iframe src={`/api/v1/files/${fileId}/preview`} width="100%" height="600px" />
```

---

## 🚨 COMMON ISSUES & SOLUTIONS

### Issue 1: "Invalid or expired token"

**Fix:**
```bash
cd api
node src/utils/create-scanner-user.js
# This creates account & writes token to watcher/.env automatically
```

### Issue 2: File detected but not uploaded

**Check:**
1. Is `DELETE_AFTER_UPLOAD=true` in `watcher/.env`? ✅
2. Are you watching the right folder? Check `SCAN_DIR` in `.env`
3. Is backend running on port 5000? Verify: `curl http://localhost:5000/health`
4. Check watcher logs for errors

### Issue 3: Files not showing in frontend

**Check:**
1. Login to frontend → verify token is valid
2. Call `GET /api/v1/files` directly in browser/Postman → see if files appear
3. If files are in DB but not showing → check frontend filters (date range, department, etc.)
4. Check file `isDeleted` flag → should be `false` (scanner sets this automatically)

### Issue 4: Scanner files show "Scanner Service" as owner

**Expected behavior:** Scanner files are owned by the scanner service account. To show who actually scanned:

**Option A — Modify scanner payload** (requires backend change):
In `scannerController.js:uploadScannerFile`, read `uploadedBy` from body and include in file record or show in UI separately.

**Option B — Use department** → files are grouped by department anyway, so users see "HR Department" in the department column.

---

## 🎨 FRONTEND UI RECOMMENDATIONS

### 1. Add a Scanner Filter Tab

```
[ All Files ] [ My Uploads ] [ Scanner Documents ] [ Shared ]
```

```javascript
// On "Scanner Documents" tab click:
setFilter('scanner');
fetchFiles({ isScanned: true });
```

### 2. Show a Scanner Badge

| File Name | Type | Size | Uploaded By |
|-----------|------|------|-------------|
| `Scan_20260420_152957.jpg` | JPG | 7.5 MB | **Scanner** 🟢 |

```css
.scanner-badge {
  background: #10b981;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
}
```

### 3. Highlight Scanner File Rows

```css
.file-row--scanner {
  background: linear-gradient(90deg, #f0fdf4 0%, #ffffff 100%);
  border-left: 3px solid #10b981;
}
```

---

## 📚 API REFERENCE (Frontend-Facing)

### Get All Files (Includes Scanner Files)

```
GET /api/v1/files
Headers: Authorization: Bearer <user_token>
Query: ?page=1&limit=20&department=HR&isScanned=true
```

**Response:**
```json
{
  "success": true,
  "data": {
    "files": [ /* array of File objects */ ],
    "totalPages": 5,
    "total": 87
  }
}
```

### Get Single File

```
GET /api/v1/files/:fileId
```

### Download File

```
GET /api/v1/files/:fileId/download
```

### Preview File

```
GET /api/v1/files/:fileId/preview
```

---

## 🔐 AUTHENTICATION FLOW

### For Human Users (Frontend)

1. User logs in via form
2. Frontend stores token (localStorage/sessionStorage/cookie)
3. All API calls include: `Authorization: Bearer <user_token>`
4. Token expires → re-login or refresh token

### For Scanner (Watcher)

1. Run `create-scanner-user.js` → generates long-lived token (365 days)
2. Token stored in `watcher/.env` as `SCANNER_TOKEN`
3. Watcher uses this token for **its own uploads only**
4. Frontend **never** uses the scanner token

---

## 🗂️ FILE VISIBILITY MATRIX

| User Role | Sees Scanner Files From | Notes |
|-----------|------------------------|-------|
| **Admin** | All departments | Sees everything |
| **HOD** | Their department only | E.g., HR HOD sees HR scanner files |
| **User** | Their department | E.g., HR user sees HR scanner files |

**Scanner user's department matters.** When you create the scanner account, assign it to the department whose scans should be visible.

**To change scanner's department:**
```javascript
// Update scanner user in MongoDB
db.users.updateOne(
  { email: "scanner@dms.local" },
  { $set: { department: "FINANCE" } }
);
```

---

## 📈 REAL-TIME UPDATES (Optional)

If you want files to appear immediately (without refresh):

```javascript
useEffect(() => {
  const interval = setInterval(() => {
    fetchFiles(); // Re-fetch every 5s
  }, 5000);
  
  return () => clearInterval(interval);
}, []);
```

**No WebSocket needed** — polling every 5-10 seconds is fine for scanner use case (not high-frequency).

---

## 🎯 CHECKLIST — Before Going Live

- [ ] Run `create-scanner-user.js` → scanner account exists
- [ ] `watcher/.env` has valid `SCANNER_TOKEN`
- [ ] Backend is running (`api/.env` has `JWT_SECRET`)
- [ ] MongoDB is running
- [ ] `C:\Users\user\Documents\Scan` folder exists
- [ ] Start watcher: `cd watcher && npm start` → shows green "Watcher is ready"
- [ ] Drop a test PDF → see "✓ Success" in watcher console
- [ ] Call `GET /api/v1/files?isScanned=true` in Postman → file appears
- [ ] Frontend file list shows the file (with scanner badge if added)
- [ ] Download/preview works
- [ ] File is deleted from `C:\Users\user\Documents\Scan` after upload

---

## 🚀 DEPLOYMENT

### Windows Production (as service):

```powershell
# As Administrator
cd C:\path\to\dms-backend\watcher
.\setup-autostart.ps1

# Verify
Get-ScheduledTask -TaskName "DMS_Scanner_Watcher"
Start-ScheduledTask -TaskName "DMS_Scanner_Watcher"
```

The task will auto-start on user logon and restart on crash.

---

## 📖 ADDITIONAL RESOURCES

| What | Where |
|------|-------|
| Full API docs | `api/DOCUMENTATION.md` (lines 1753–1818 for scanner) |
| Watcher setup | `watcher/README.md` |
| Frontend guide | `FRONTEND_SCANNER_GUIDE.md` |
| Backend controller | `api/src/controllers/scannerController.js` |
| Backend routes | `api/src/routes/scanner.routes.js` |
| File model | `api/src/models/File.js` |

---

## 🎓 KEY TAKEAWAYS

1. **Scanner uploads use POST /api/v1/scanner/upload** (handled by watcher only)
2. **Frontend uses GET /api/v1/files** (includes scanner files automatically)
3. **Scanner files marked** with `uploadSource: 'scanner'` and `isScanned: true`
4. **Visibility rules** same as regular files (department-based)
5. **No frontend changes required** — existing file list shows scanner files
6. **Optional:** Add filter/tab for scanner files using `?isScanned=true`
7. **Optional:** Add green "Scanner" badge UI

---

## NEED HELP?

1. Read `watcher/README.md` for watcher-specific issues
2. Read `FRONTEND_SCANNER_GUIDE.md` for frontend integration details
3. Check logs:
   - Watcher console → watcher errors
   - Backend console (Port 5000) → API errors
   - MongoDB logs → database errors

**That's it!** The system is complete. Scanner → Backend → Frontend → User.
