# Scanner Agent Configuration

## Overview

The agent uses **frontend-controlled authentication**. After installation, simply log in to the DMS web interface and the frontend will automatically send your JWT token to the agent running on your machine.

## Quick Setup

1. **Install dependencies**:
   ```bash
   cd agent
   npm install
   ```

2. **Run the installer** (server URL only):
   ```bash
   node setup.js
   ```
   Enter the server URL (e.g., `http://192.168.4.213:5000`). No credentials required.

3. **Authenticate via frontend**:
   Log in to the DMS web app — the token is sent automatically to `http://localhost:4001/set-token`.

   **Or use the CLI tool**:
   ```bash
   npm run set-token -- --token <JWT_TOKEN> --userId <USER_ID> --userEmail <you@example.com>
   ```

4. **Start the agent**:
   ```bash
   npm start
   ```

## Manual Configuration

Edit `agent/config.json` directly:

```json
{
  "apiUrl": "http://192.168.4.213:5000/api/v1/scanner/pending",
  "token": "YOUR_JWT_TOKEN_FROM_FRONTEND",
  "userId": "USER_ID_FROM_TOKEN",
  "userEmail": "user@example.com"
}
```

**Important:** The `token` field is required for file uploads. Without it, the agent will log **"No token set"** and will not upload files.

## Token Endpoint

The agent exposes a local REST API for setting the token:

**POST** `http://localhost:4001/set-token`

**Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "userId": "user_12345",
  "userEmail": "user@example.com",
  "apiUrl": "http://192.168.4.213:5000/api/v1/scanner/pending"  // optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token set",
  "userId": "user_12345"
}
```

The token is saved to `config.json` and overwrites any previous token. Upon success, the agent logs: **"Authenticated as <userEmail>"**.

## Agent Status

Check if the agent is authenticated:

**GET** `http://localhost:4001/status`

```json
{
  "running": true,
  "userId": "user_12345",
  "userEmail": "user@example.com",
  "apiUrl": "http://192.168.4.213:5000/api/v1/scanner/pending",
  "scanPath": "C:\\Users\\YourName\\Documents\\Scan",
  "hasToken": true
}
```

## How the Frontend Sends the Token

When you log in to the DMS web application, the frontend should call the agent's `/set-token` endpoint with your JWT token. This happens automatically if:

- You are accessing the DMS from `http://localhost` or `127.0.0.1`
- Or from the same machine where the agent is running
- The frontend is configured to communicate with the local agent

The token is stored locally on your machine and used for all file uploads.

## Configuration Fields

| Field | Description |
|-------|-------------|
| `apiUrl` | Backend API endpoint URL (your server) |
| `token` | JWT token received after frontend login |
| `userId` | Your unique user ID from the token |
| `userEmail` | Your email address (for logging) |

## Duplicate Protection

The agent tracks already-uploaded files in `processed-files.json`. Files are identified by `filename:size:mtime` hash. Even if the token is changed, previously processed files remain tracked to prevent re-uploads.

## Updating the Token

When your JWT token expires, log in again to the frontend to receive a new token. The agent's `/set-token` endpoint will overwrite the old token automatically.

## Troubleshooting

- **No token set**: The agent has not received a token yet. Log in to the frontend or use `npm run set-token` to provide one manually.
- **Connection refused**: Verify the agent is running (`http://localhost:4001/status`)
- **Unauthorized errors**: Token may be expired - re-authenticate via frontend
- **Scan folder not found**: Agent creates `Documents/Scan` automatically on first run

## Security Notes

- The JWT token is stored in plain text in `config.json`. Only the local user should have read access to this file.
- The local API (`localhost:4001`) is only accessible from the local machine. No remote access is allowed.
- Token is sent as `Authorization: Bearer <token>` header to the backend server.
