# Watcher Update — Pending Workflow

## What Changed

The watcher now sends files to **pending** instead of uploading them directly.

### Old Behavior (Direct Upload)
```
File detected → Upload → File appears in web app immediately → File deleted from scan folder
```

### New Behavior (Pending Confirmation)
```
File detected → Send to pending → File STAYS in scan folder → 
User confirms in web app → Backend converts format → Original file deleted
```

---

## Why This Change?

Allows human review before finalizing:
- User can choose output format (PDF, JPG, PNG)
- User can set alias, confidentiality, description, tags
- Backend handles format conversion (image → PDF, etc.)
- Original file only deleted after **successful** confirmation

---

## Configuration

Update `watcher/.env`:

```env
SCAN_DIR=C:/Users/user/Documents/Scan
PENDING_API_URL=http://localhost:5000/api/v1/scanner/pending
SCANNER_TOKEN=eyJhbGciOiJIUzI1NiIs...
UPLOAD_DELAY_MS=2000
```

**Key changes:**
- `PENDING_API_URL` instead of `SCANNER_API_URL`
- `UPLOAD_DELAY_MS` (single value, 2000ms)
- No `DELETE_AFTER_UPLOAD` — files are never deleted by watcher

---

## New API Endpoints (Backend)

### POST /api/v1/scanner/pending
Upload file to pending state (watcher calls this).

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "ABC123DEF",
    "filePath": "C:/.../Scan/Scan_20260420_162642.jpg",
    "originalName": "Scan_20260420_162642.jpg",
    "status": "pending",
    "fileSize": 7520000,
    "mimeType": "image/jpeg",
    "department": "HR",
    "createdAt": "2026-04-20T16:26:42.000Z"
  },
  "message": "File uploaded to pending. Confirm to finalize."
}
```

### GET /api/v1/scanner/pending
List pending scans (user sees their assigned scans).

### POST /api/v1/scanner/confirm
Confirm and finalize. Body:
```json
{
  "id": "ABC123DEF",
  "alias": "Q1 Report",
  "confidentialityLevel": "internal",
  "description": "Scanned document",
  "format": "pdf",  // "pdf" | "jpg" | "png"
  "tags": "report,q1"
}
```

This endpoint:
1. Converts file to target format (using sharp/pdfkit)
2. Saves final file to storage
3. Creates File record in MongoDB
4. **Deletes original file** from scan folder
5. Updates pending scan status to "confirmed"

### POST /api/v1/scanner/cancel
Cancel a pending scan. File remains in scan folder. Status → "cancelled".

---

## Frontend Integration (Pending Management)

Your web app needs a **Pending Scans** page where users can:

1. **View pending scans** — `GET /api/v1/scanner/pending`
2. **See file details** — `GET /api/v1/scanner/pending/:id`
3. **Confirm with format selection** — `POST /api/v1/scanner/confirm`
4. **Cancel** — `POST /api/v1/scanner/cancel`

### Example: Pending List UI

```
Pending Scans (3)

┌─────────────────────────────────────────────────────────────┐
│ Scan_20260420_162642.jpg   7.43 MB   HR   2 min ago       │
│ [Preview]  [Confirm]  [Cancel]                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Scan_20260420_163259.jpg   7.46 MB   HR   5 min ago       │
│ [Preview]  [Confirm]  [Cancel]                             │
└─────────────────────────────────────────────────────────────┘
```

### Example: Confirm Dialog

```
Confirm Scan

Original: Scan_20260420_162642.jpg (7.43 MB, JPG)

Convert to: [PDF ▼]

Alias:        [Q1 Report                ]
Confidentiality: [Internal ▼]
Description:  [Scanned Q1 financial report]
Tags:         [report, q1, finance      ]

[Cancel]  [Confirm & Upload]
```

On confirm → backend converts JPG → PDF, saves to files collection, deletes original JPG from scan folder. File appears in main file list.

---

## File Lifecycle (Pending Workflow)

```
1. Scanner drops file in C:\...\Scan
   ↓
2. Watcher detects → waits 2s → POST /api/v1/scanner/pending
   ↓
3. Backend creates PendingScan record (status: "pending")
   ↓
4. File stays in C:\...\Scan (NOT deleted)
   ↓
5. User logs into web app → goes to "Pending Scans" page
   ↓
6. User clicks "Confirm" → selects format (PDF/JPG/PNG) → submits
   ↓
7. Backend:
   - Converts file if needed (sharp/pdfkit)
   - Saves to ./uploads/ (final storage)
   - Creates File record in MongoDB
   - Deletes original from scan folder
   - Updates PendingScan status = "confirmed"
   ↓
8. File appears in main Files list ✅
```

---

## Migration from Old Workflow

If you were using the old direct-upload endpoint (`/api/v1/scanner/upload`):

1. **Old files already in system** — They're fine. No migration needed.
2. **Old watcher** — Replace `SCANNER_API_URL` with `PENDING_API_URL` in `.env`
3. **Restart watcher** — It will now send to pending instead of direct upload
4. **Add "Pending Scans" page** to frontend (or have admin auto-confirm all)

**Quick switch:** Just change `.env`:
```diff
- SCANNER_API_URL=http://localhost:5000/api/v1/scanner/upload
+ PENDING_API_URL=http://localhost:5000/api/v1/scanner/pending
```

---

## File Format Conversion

**Supported conversions:**

| From → To | PDF | JPG/JPEG | PNG |
|-----------|-----|----------|-----|
| PDF | ✅ Pass-through | ❌ Not supported | ❌ Not supported |
| JPG/JPEG | ✅ Image → PDF | ✅ Pass-through | ✅ JPG → PNG |
| PNG | ✅ Image → PDF | ✅ PNG → JPG | ✅ Pass-through |
| TIFF/BMP | ✅ Image → PDF | ✅ → JPG/PNG | ✅ → PNG |

**Note:** PDF → Image requires ghostscript (not included). If needed, add `pdf-poppler` or similar.

---

## Testing the Pending Workflow

1. **Start backend:**
   ```bash
   cd api
   npm start
   ```

2. **Start watcher (pending mode):**
   ```bash
   cd watcher
   npm start
   ```

3. **Drop a scanned JPG** into `C:\Users\user\Documents\Scan`

4. **Watcher logs:**
   ```
   File detected: Scan_xxx.jpg (7.43 MB)
   Waiting 2000ms before sending to pending...
   Sending to pending: Scan_xxx.jpg (7.43 MB)
   ✓ Sent to pending: Scan_xxx.jpg (ID: ABC123)
   ```

5. **Check pending scans** via API or web UI:
   ```bash
   curl -H "Authorization: Bearer <user_token>" \
     http://localhost:5000/api/v1/scanner/pending
   ```

6. **Confirm via web UI** (you need to build this page):
   - User selects format (PDF)
   - Clicks Confirm
   - Backend converts, saves, deletes original
   - File appears in main file list

7. **Verify original deleted:**
   ```powershell
   dir C:\Users\user\Documents\Scan
   # Original file should be gone
   ```

---

## API Summary (Scanner Endpoints)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/scanner/pending` | Upload to pending (watcher) |
| GET | `/api/v1/scanner/pending` | List pending scans |
| GET | `/api/v1/scanner/pending/:id` | Get single pending |
| POST | `/api/v1/scanner/confirm` | Confirm & convert (final upload) |
| POST | `/api/v1/scanner/cancel` | Cancel (keeps file) |
| DELETE | `/api/v1/scanner/pending/:id` | Force delete (admin only) |
| GET | `/api/v1/scanner/pending/stats` | Pending statistics |

---

## Security Notes

- All endpoints require `Authorization: Bearer <token>`
- `POST /pending` uses scanner token (long-lived)
- `POST /confirm` uses **user's token** (human confirming)
- Permission check: only assigned user, HOD, or admin can confirm
- Original file deletion only after **successful** conversion + DB save
- If conversion fails, file remains in scan folder for retry

---

## Next Steps for Frontend

1. **Create "Pending Scans" page** (or tab in Files page)
2. **List pending items** from `GET /api/v1/scanner/pending`
3. **Show preview** (use `filePath` to display image/PDF preview)
4. **Confirm dialog** with format dropdown (PDF/JPG/PNG)
5. **On confirm success** → refresh file list or show toast
6. **Cancel button** → calls `/cancel`, file stays in scan folder

---

## Unchanged: Scanner Token

The same `SCANNER_TOKEN` works for both old and new endpoints. Just change the API URL in `.env` to switch modes.

---

**Files modified:**
- `watcher/scanner-watcher.js` — Now sends to `/pending`, fixed 2s delay, no delete
- `watcher/.env.example` — Updated to pending mode
- `watcher/.env` — Updated with PENDING_API_URL and UPLOAD_DELAY_MS

**New backend files (already created):**
- `api/src/models/PendingScan.js`
- `api/src/controllers/pendingScanController.js`
- `api/src/routes/pendingScan.routes.js`
- `api/src/utils/fileConverter.js`

---

**Ready to test:**
1. Restart watcher (`npm start` in watcher folder)
2. Drop a file in Scan folder
3. Call `GET /api/v1/scanner/pending` → should see the pending record
4. (Need frontend confirm UI to complete flow)
