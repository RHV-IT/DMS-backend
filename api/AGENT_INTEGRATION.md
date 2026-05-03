# Scanner Agent Integration Guide

## Overview

The scanner agent runs on user PCs, watches a scan folder, and uploads files to the backend. The frontend syncs credentials automatically.

---

## Architecture

```
User PC:
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  Scanner Agent   │────▶│   Backend       │
│   (Browser)     │◀────│  (localhost:4001)│◀────│ (192.168.4.213) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │
        │                        ▼
        │               ┌──────────────────┐
        │               │ Documents/Scan   │
        │               │ (watch folder)   │
        │               └──────────────────┘
        │
        │ Sync token on login
        └──────────────────▶
```

---

## Backend APIs

### 1. Download Agent Startup Script
```
GET /api/v1/scanner/agent-startup-download
```
Downloads `start-agent.bat` - a simple batch file that runs the agent.

---

### 2. Download Agent Code
```
GET /api/v1/scanner/agent-download
```
Downloads `scanner-agent.js` - the main agent code.

---

### 3. Download Package Dependencies
```
GET /api/v1/scanner/package-download
```
Downloads `package.json` - npm dependencies.

---

### 4. Get Agent Config (with user's token)
```
GET /api/v1/scanner/config-download
```
Downloads `config.json` with user's JWT token already included.

---

## Frontend → Agent Sync API

The frontend syncs credentials with the agent via localhost.

### Base URL
```
http://localhost:4001
```

### Endpoints

#### 1. Set Token (Sync)
```
POST http://localhost:4001/set-token
Content-Type: application/json

Body:
{
  "token": "JWT_TOKEN_HERE",
  "userId": "USER_ID_HERE",
  "userEmail": "user@example.com",
  "apiUrl": "http://192.168.4.213:5000/api/v1/scanner/pending"
}

Response:
{
  "success": true,
  "message": "Token set",
  "userId": "USER_ID"
}
```

#### 2. Get Status
```
GET http://localhost:4001/status

Response:
{
  "running": true,
  "userId": "USER_ID",
  "userEmail": "user@example.com",
  "apiUrl": "http://192.168.4.213:5000/api/v1/scanner/pending",
  "scanPath": "C:\\Users\\username\\Documents\\Scan",
  "hasToken": true
}
```

#### 3. Delete Local File
```
POST http://localhost:4001/delete-file
Content-Type: application/json

Body:
{
  "filePath": "scanned-document.pdf"
}

Response:
{
  "success": true,
  "message": "File deleted",
  "filePath": "C:\\Users\\username\\Documents\\Scan\\scanned-document.pdf"
}
```

#### 4. Health Check
```
GET http://localhost:4001/health

Response:
{
  "status": "ok"
}
```

---

## Frontend Integration

### Step 1: On App Load / Login Success

```javascript
// Sync agent with user credentials
async function syncAgentWithToken() {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));

  if (!token || !user) return;

  try {
    const response = await fetch('http://localhost:4001/set-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token,
        userId: user._id || user.id,
        userEmail: user.email,
        apiUrl: 'http://192.168.4.213:5000/api/v1/scanner/pending'
      })
    });

    const result = await response.json();
    if (result.success) {
      console.log('Agent synced for:', user.email);
    }
  } catch (err) {
    // Agent not running on this PC - that's okay
    console.log('Scanner agent not installed on this PC');
  }
}

// Call on login success or app load
syncAgentWithToken();
```

### Step 2: Delete Local File After Confirm

```javascript
// After backend confirms scan, delete local file
async function deleteLocalScanFile(fileName) {
  try {
    const response = await fetch('http://localhost:4001/delete-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: fileName })
    });

    const result = await response.json();
    if (result.success) {
      console.log('Local file deleted:', fileName);
    }
  } catch (err) {
    console.log('Failed to delete local file');
  }
}

// Use after confirm response includes deleteLocal: true
if (confirmResult.deleteLocal) {
  deleteLocalScanFile(confirmResult.originalFileName);
}
```

### Step 3: Check Agent Status

```javascript
async function checkAgentStatus() {
  try {
    const response = await fetch('http://localhost:4001/status');
    const status = await response.json();
    
    if (status.hasToken) {
      console.log('Agent ready for user:', status.userEmail);
    } else {
      console.log('Agent running but no token - user needs to login');
    }
  } catch (err) {
    console.log('Agent not running');
  }
}
```

---

## Agent Installation (One Time)

User downloads ONE file from backend:
```
http://192.168.4.213:5000/api/v1/scanner/agent-startup-download
```

Save as `start-agent.bat`, run it once. Agent auto-starts on every login.

---

## File Flow

1. User scans document → saves to `Documents/Scan`
2. Agent detects file → uploads to backend → marks as uploaded
3. User sees file in frontend → confirms
4. Frontend calls `/delete-file` → local file deleted

---

## Error Handling

| Error | What to Do |
|-------|------------|
| Agent not running | Show message "Install scanner agent on this PC" |
| Token expired | Re-sync on next login |
| Upload failed | Agent retries, user can rescan |

---

## Quick Checklist

- [ ] Frontend calls `/set-token` on login
- [ ] Frontend calls `/delete-file` after confirm
- [ ] User runs `start-agent.bat` once on their PC
- [ ] Agent auto-starts on every login (via startup folder)