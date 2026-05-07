# RHV DMS Scanner Agent

A production-ready Windows scanner agent for the RHV Document Management System.

## Features

- **Automatic Installation**: One-click installer for non-technical hospital staff
- **Background Service**: Runs silently in the background, auto-starts on boot
- **Folder Monitoring**: Automatically detects and uploads scanned documents
- **Secure Authentication**: Integrates with DMS backend for secure file uploads
- **Machine Registration**: Registers machines with the backend for tracking
- **Standalone Executable**: No Node.js installation required

## Installation for End Users

1. Login to the DMS frontend
2. Click "Download Scanner Agent"
3. Run the downloaded `RHV-DMS-Scanner-Setup.exe`
4. The agent installs automatically and starts monitoring the scan folder

## Development Setup

### Prerequisites

- Node.js 18+
- npm
- Windows development environment (for building Windows installer)

### Building the Installer

1. Install dependencies:
   ```bash
   cd scanner-agent
   npm install
   ```

2. Build the installer:
   ```bash
   npm run dist
   ```

3. The installer will be created in `scanner-agent/dist/`

### Project Structure

```
scanner-agent/
├── main.js                 # Electron main process
├── package.json           # Dependencies and build config
├── installer.nsh          # NSIS installer script
├── assets/                # Icons and assets
└── dist/                  # Built installers (generated)
```

## API Endpoints

The agent exposes a local API on `http://localhost:4001`:

### GET /health
Returns agent health status.

### GET /status
Returns current agent configuration and status.

### POST /set-token
Sets authentication token for backend communication.

Body:
```json
{
  "token": "jwt-token",
  "userId": "user-id",
  "userEmail": "user@example.com",
  "userName": "User Name",
  "department": "department"
}
```

## Backend Integration

The agent automatically:
- Registers with `/api/v1/agent/register`
- Uploads files to `/api/v1/scanner/upload`
- Monitors `Documents/Scan/` folder for new files
- Supports PDF, JPG, PNG, TIFF, BMP files

## Configuration

Configuration is stored in:
`%USERPROFILE%\Documents\RHV-DMS-Scanner\config.json`

## Troubleshooting

- Check Windows Event Viewer for errors
- Verify the agent is running via Task Manager
- Check `http://localhost:4001/health` for status
- Ensure scan folder exists: `Documents/Scan/`

## Security

- All communication uses HTTPS
- Files are uploaded with authentication tokens
- No sensitive data is stored locally
- Machine IDs are generated uniquely per installation