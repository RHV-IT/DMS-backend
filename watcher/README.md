# Scanner File Watcher

Automatically detects scanned files in a folder and uploads them to the DMS backend API.

## Features

- **Automatic detection** — Uses chokidar to watch folder with `awaitWriteFinish` for robust temp file handling
- **Smart delay** — Random 1–2 second delay ensures files are fully written before upload
- **Secure upload** — Multipart/form-data with Bearer token authentication
- **Auto-cleanup** — Deletes files from scan folder after successful upload (configurable)
- **Temp file filtering** — Ignores scanner temp files (4tmp_*, ~*, .tmp, hidden files)
- **Detailed logs** — Color-coded console output with file size, timing, and error details
- **Auto-restart** — Windows Scheduled Task support for production deployment

## File Flow

```
Scanner → Scan Folder (C:\Users\user\Documents\Scan) 
         ↓ [watcher detects new file after write complete]
         ↓ [random 1-2s delay]
         ↓ [multipart upload with Bearer token]
Backend API: POST http://localhost:5000/api/v1/scanner/upload
         ↓
    MongoDB (files collection)
         ↓
    Web App displays file
         ↓
    File deleted from scan folder (or archived)
```

## Prerequisites

- Node.js v16+ installed
- MongoDB running on `localhost:27017`
- DMS backend server running on `localhost:5000`
- Valid JWT token with scanner permissions

## Quick Setup (5 minutes)

### Step 1: Install Watcher Dependencies

```bash
cd watcher
npm install
```

### Step 2: Create Scanner User & Generate Token

**From the `api` directory:**

```bash
cd api
node src/utils/create-scanner-user.js
```

This script:
- Connects to MongoDB
- Creates a "Scanner Service" user if it doesn't exist
- Generates a JWT token valid for 365 days
- **Automatically writes** the configuration to `watcher/.env`

Expected output:
```
✓ Connected to MongoDB
✓ Scanner account created!
  User ID: 507f1f77bcf86cd799439011
  Email: scanner@dms.local
  Role: admin

=== Scanner Token ===
eyJhbGciOiJIUzI1NiIsInR5cCI6...
=============================

✓ Created watcher/.env with scanner credentials

Setup complete!
```

### Step 3: Verify Configuration

Check that `watcher/.env` was created with:
```
SCAN_DIR=C:/Users/user/Documents/Scan
SCANNER_API_URL=http://localhost:5000/api/v1/scanner/upload
SCANNER_TOKEN=<your-generated-token>
DELETE_AFTER_UPLOAD=true
UPLOAD_DELAY_MIN=1000
UPLOAD_DELAY_MAX=2000
```

### Step 4: Start the Watcher

```bash
cd watcher
npm start
```

You should see:
```
╔═══════════════════════════════════╗
║   Scanner File Watcher (v1.0)     ║
╚═══════════════════════════════════╝
Scan directory:     C:/Users/user/Documents/Scan
API endpoint:       http://localhost:5000/api/v1/scanner/upload
Upload delay:       1000ms – 2000ms
After upload:       🗑 DELETE
─────────────────────────────────────
├─ Token decoded:
│  Subject: 507f1f77bcf86cd799439011
│  Email: scanner@dms.local
│  Role: admin
│  Expires: 2027-04-20T12:00:00.000Z
 Waiting for scanned files...

Watcher is ready and actively monitoring
Watching: C:/Users/user/Documents/Scan
----------------------------------------
```

### Step 5: Test

Drop a PDF or JPG file into `C:\Users\user\Documents\Scan`. Expected output:
```
File detected: mydoc.pdf (1.23 MB)
Waiting 1435ms before upload...
Uploading: mydoc.pdf (1.23 MB)
✓ Success: mydoc.pdf -> file_abc123
Deleted: mydoc.pdf
```

### Step 6: Verify in Web App

- Login to the DMS web app
- Check the files list — the uploaded document should appear
- If it doesn't appear, check filters (date, department, tags)

## Windows Auto-Start (Run on Boot)

### Option A: Scheduled Task (Recommended — Robust)

Run PowerShell **as Administrator**:
```powershell
cd C:\Users\user\Documents\sam\dms-backend\watcher
.\setup-autostart.ps1
```

This creates a task `DMS_Scanner_Watcher` that starts at user logon and auto-restarts on crash.

**Manage:**
```powershell
Start-ScheduledTask -TaskName "DMS_Scanner_Watcher"
Stop-ScheduledTask -TaskName "DMS_Scanner_Watcher"
Get-ScheduledTaskInfo -TaskName "DMS_Scanner_Watcher"
```

**Uninstall:**
```powershell
schtasks /Delete /TN "DMS_Scanner_Watcher" /F
```

### Option B: Startup Folder (Simple)

```powershell
copy start-watcher.bat "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
```

Note: No auto-restart on crash.

## Manual Token Generation

If you already have a user account and want to generate a token manually:

```bash
# From the api directory
cd api

# 1. Find your user ID in MongoDB
# In mongo shell: db.users.find({ email: "your-email" }).pretty()

# 2. Generate token
node src/utils/generate-scanner-token.js
```

Then manually copy the token to `watcher/.env`:
```
SCANNER_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6...
```

## Configuration Options

Set in `watcher/.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SCAN_DIR` | No | `C:/Users/user/Documents/Scan` | Folder to watch for scanned files |
| `SCANNER_API_URL` | No | `http://localhost:5000/api/v1/scanner/upload` | Backend endpoint |
| `SCANNER_TOKEN` | **Yes** | — | JWT Bearer token (use setup script to generate) |
| `DELETE_AFTER_UPLOAD` | No | `true` | `true` = delete file; `false` = archive to `ARCHIVE_DIR` |
| `ARCHIVE_DIR` | No* | `SCAN_DIR/uploaded` | Where to move files if DELETE_AFTER_UPLOAD=false |
| `UPLOAD_DELAY_MIN` | No | `1000` | Min wait before upload (ms) |
| `UPLOAD_DELAY_MAX` | No | `2000` | Max wait before upload (ms) |

*Only required when `DELETE_AFTER_UPLOAD=false`

## Troubleshooting

### "Invalid or expired token"

**Symptom:** Upload fails with `✗ Upload error: ... - Invalid or expired token`

**Fix:**
1. Run the account creation script again:
   ```bash
   cd api
   node src/utils/create-scanner-user.js
   ```
2. Restart the watcher (`Ctrl+C` then `npm start`)

### "File no longer exists" (temp files)

**Symptom:** You see `File no longer exists: 4tmp_XXX.jpg - skipping`

**Cause:** Scanner creates a temp file (`4tmp_*`) then renames it to final name (`Scan_*`). The temp file is detected then renamed before upload.

**Fix:** Normal behavior. The watcher uses `awaitWriteFinish` (1.5s stability threshold) to avoid this issue for most files. The messages are informational — the final file uploads correctly.

### Watcher doesn't detect files

**Fix:**
1. Verify `SCAN_DIR` exists in `.env`
2. Check Node.js has read permission on the folder
3. Confirm chokidar is installed: `npm ls chokidar`
4. Look for chokidar errors in console

### Upload fails with 401/403

**Cause:** Token lacks permissions or scanner user is not active.

**Fix:**
1. Check MongoDB: `db.users.find({ email: "scanner@dms.local" })`
2. Ensure `status: "active"` and role is not `user` if that lacks permission
3. Verify token hasn't expired (check `exp` claim via jwt.io)
4. Regenerate with `create-scanner-user.js`

### File uploads but doesn't appear in web app

**Fix:**
1. Confirm backend logs show success
2. Check file record exists: `db.files.find({ name: /your-file/ })`
3. Check frontend filters (date range, department, tags)
4. Confirm backend `app.js` has scanner routes mounted at `/api/v1/scanner`

### "Cannot find module 'mongoose'"

**Cause:** Running the setup script from the wrong directory.

**Fix:** Run from the `api` directory:
```bash
cd api
node src/utils/create-scanner-user.js
```

## Build Your Own Token

If you need to manually construct a token (developer):

```javascript
const jwt = require('jsonwebtoken');
require('dotenv').config();

const payload = {
  id: 'YOUR_MONGO_USER_ID',
  email: 'scanner@dms.local',
  name: 'Scanner Service',
  role: 'admin',
  department: 'scanner',
  scanner: true
};

const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '365d' });
console.log(token);
```

## Architecture Notes

- **No database in watcher:** The watcher is stateless; all state is in MongoDB via the backend
- **Random delay:** Prevents race conditions where scanner is still writing file
- **awaitWriteFinish:** Chokidar waits for file stability before emitting `add` event
- **Retry logic:** If upload fails, file remains in folder for manual retry
- **No dependencies on watcher for token gen:** Token generation uses api's `jsonwebtoken` (already in backend)

## Project Files

```
dms-backend/
├── watcher/
│   ├── scanner-watcher.js       # Main watcher (production)
│   ├── create-scanner-user.js   # Generator (run from api/ dir)
│   ├── generate-scanner-token.js# Manual token gen (requires USER_ID)
│   ├── start-watcher.bat        # Double-click starter
│   ├── setup-autostart.ps1      # Windows Task Scheduler installer
│   ├── .env.example            # Config template
│   ├── .env                    # Your config (created by setup script)
│   ├── package.json            # Dependencies
│   └── node_modules/
├── api/
│   ├── src/
│   │   ├── controllers/scannerController.js
│   │   ├── routes/scanner.routes.js
│   │   ├── middlewares/authMiddleware.js
│   │   ├── middlewares/uploadMiddleware.js
│   │   └── utils/
│   │       ├── create-scanner-user.js   # ← Run this!
│   │       └── generate-scanner-token.js
│   └── .env                    # Contains JWT_SECRET for token signing
└── README.md
```

## Support

Open an issue: https://github.com/your-org/dms-backend/issues
