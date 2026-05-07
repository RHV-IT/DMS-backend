# RHV DMS Scanner Desktop Application

This is the desktop version of the RHV DMS Scanner Agent, built with Electron for Windows deployment.

## Features

- **Standalone Installation**: No Node.js or npm required
- **System Tray**: Runs in background with system tray icon
- **Auto-start**: Launches automatically with Windows
- **Local API Server**: Provides health endpoint on port 4001
- **File Monitoring**: Watches Documents/Scan folder automatically
- **Machine Registration**: Auto-registers with backend
- **Professional UI**: Settings window accessible from system tray

## Installation

The application will be packaged as `RHV-DMS-Scanner-Setup.exe` using electron-builder with NSIS.

### For End Users:
1. Download `RHV-DMS-Scanner-Setup.exe`
2. Run the installer
3. Application starts automatically
4. Access settings via system tray icon

### For Developers:
```bash
cd scanner-desktop
npm install
npm run dev    # Development
npm run build  # Build installer
```

## Configuration

- **API URL**: Automatically set to `https://rhv-dms-backend.vercel.app`
- **Scan Folder**: `Documents/Scan`
- **Config Folder**: `Documents/RHV-DMS-Scanner`
- **Local API**: `http://localhost:4001`

## API Endpoints

### Health Check
```
GET http://localhost:4001/health
```

Response:
```json
{
  "installed": true,
  "running": true,
  "version": "1.0.0",
  "machineId": "machine-xxxx",
  "scanDirectory": "C:\\Users\\user\\Documents\\Scan",
  "pendingUploads": 0,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Set Token (Configuration)
```
POST http://localhost:4001/set-token
Content-Type: application/json

{
  "token": "jwt-token",
  "userId": "user-id",
  "userEmail": "user@domain.com",
  "userName": "User Name"
}
```

### Get Config
```
GET http://localhost:4001/config
```

## Architecture

- **Main Process**: `main.js` - System tray, file watching, API server
- **Renderer Process**: `src/index.html` - Settings UI
- **Auto-updater**: Built-in update mechanism
- **Single Instance**: Prevents multiple instances

## Build Process

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build Windows installer
npm run build

# Output: dist/RHV-DMS-Scanner-Setup.exe
```

## File Structure

```
scanner-desktop/
├── main.js              # Main Electron process
├── src/
│   └── index.html       # Settings UI
├── assets/
│   └── icon.ico         # Application icon
├── package.json         # Dependencies and build config
└── README.md           # This file
```

## Security

- JWT tokens stored securely in user config
- Machine ID generated uniquely per installation
- No sensitive data logged
- HTTPS communication with backend

## Troubleshooting

1. **Application won't start**: Check Windows Event Viewer
2. **Files not uploading**: Verify token configuration
3. **API not responding**: Check port 4001 availability
4. **Scan folder not monitored**: Ensure Documents/Scan exists