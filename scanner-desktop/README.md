# Document Scanner Desktop

A beginner-friendly document scanner application that automatically monitors a folder and uploads scanned documents.

## Features

- **Silent Operation**: No terminal windows or command prompts
- **Automatic Monitoring**: Watches document folder for new files
- **GUI Installer**: Standard Windows installer with Next/Next/Finish
- **System Tray**: Runs in background with status indicators
- **Auto-Start**: Launches automatically with Windows
- **Settings GUI**: Easy configuration through graphical interface

## Building the Installer

### Prerequisites

- Node.js 18+
- npm

### Build Steps

```bash
# Install dependencies
npm install

# Build Windows installer
npm run build:win
```

### Output

The installer will be created at:
```
scanner-desktop/dist/Document-Scanner-Setup-1.0.0.exe
```

## Installation Experience

1. **Download**: `Document-Scanner-Setup.exe`
2. **Install**: Standard Windows wizard (Next/Next/Finish)
3. **Setup**: App opens login/setup window
4. **Login**: User signs in via web browser
5. **Ready**: App runs silently in system tray

## User Experience

- **First Run**: Setup window guides user through login
- **Normal Use**: App runs in tray, monitors documents folder
- **Settings**: Right-click tray icon → Open Settings
- **Status**: Tray icon shows connection and activity status

## Technical Details

- Built with Electron
- Uses NSIS for Windows installer
- Auto-starts with Windows login
- Monitors folder with chokidar
- Secure token storage
- Automatic reconnection