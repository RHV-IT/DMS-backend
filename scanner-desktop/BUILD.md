# Document Scanner Desktop - Build Instructions

## Prerequisites

1. **Node.js 18+** and **npm** installed on development machine
2. **Git** for cloning repositories
3. **Windows 10/11** for building Windows installer

## Development Setup

```bash
# Navigate to the project
cd scanner-desktop

# Install dependencies
npm install

# Start development version
npm run dev
```

## Building the Installer

### Step 1: Build the Application

```bash
# Build Windows installer
npm run build

# Or specifically for Windows
npm run build:win
```

### Step 2: Output Location

The installer will be created at:
```
scanner-desktop/dist/Document-Scanner-Setup-1.0.0.exe
```

## Installation Process

The generated installer provides a standard Windows setup wizard:

1. **Welcome Screen**: Introduction to Document Scanner
2. **License Agreement**: Standard software license
3. **Installation Location**: Automatic (user's AppData)
4. **Installation Progress**: Shows progress bar
5. **Completion**: Success message with launch option

The installer will automatically:
- Extract all files to user's AppData directory
- Create desktop shortcut (optional)
- Create start menu entry
- Set up auto-start with Windows login
- Create required directories:
  - `Documents/Scan`
  - `Documents/Document-Scanner`

## End User Experience

After installation:

1. **First Run**: Setup window opens for account connection
2. **System Tray**: App runs in background with status icon
3. **Auto-start**: Launches automatically with Windows
4. **File Monitoring**: Watches `Documents/Scan` folder
5. **Settings**: Right-click tray icon → Open Settings

## Configuration

The app automatically:
- Generates unique machine ID
- Connects to document management server
- Monitors scan folder for new documents
- Provides GUI for all settings

## Testing the Build

### Local Testing
```bash
# Install the built exe on your machine
# Check system tray for RHV DMS Scanner icon
# Place a PDF in Documents/Scan
# Check if it gets uploaded (after token setup)
```

### API Testing
```bash
# Check health endpoint
curl http://localhost:4001/health

# Should return:
{
  "installed": true,
  "running": true,
  "version": "1.0.0",
  "machineId": "machine-xxxx",
  "scanDirectory": "C:\\Users\\user\\Documents\\Scan",
  "pendingUploads": 0
}
```

## Distribution

- **File**: `RHV-DMS-Scanner-Setup.exe`
- **Size**: ~150-200MB (includes bundled Node.js runtime)
- **Requirements**: Windows 10/11, no admin rights needed
- **Installation**: Standard Windows installer wizard

## Troubleshooting Build Issues

### Icon Missing
```
Error: ENOENT: no such file or directory, open 'assets/icon.ico'
```
**Solution**: Create the required icon files in `assets/` directory

### Dependencies Missing
```
Error: Cannot find module 'axios'
```
**Solution**: Run `npm install` in scanner-desktop directory

### Build Fails
```
Error: electron-builder not found
```
**Solution**: Run `npm install` and check devDependencies

### NSIS Not Found
```
Error: NSIS not found
```
**Solution**: electron-builder should handle this automatically

## File Structure After Build

```
C:\Users\<user>\AppData\Local\Programs\rhv-dms-scanner\
├── RHV DMS Scanner.exe    # Main executable
├── resources/
│   ├── app.asar          # Packaged application
│   └── ...
├── swiftshader/          # Graphics libraries
└── locales/              # Language files
```

## Auto-Update (Future Enhancement)

The app is configured for auto-updates using electron-builder's built-in updater. To enable:

1. Set up a release server (GitHub Releases, etc.)
2. Configure `publish` in package.json
3. Add update check logic in main.js

## Security Considerations

- JWT tokens stored in user config files
- No sensitive data in logs
- HTTPS communication with backend
- Machine IDs are UUID-based, not personally identifiable
- Files uploaded only after user authentication

## Performance

- **Memory**: ~50-100MB RAM usage
- **CPU**: Minimal when idle, spikes during file uploads
- **Storage**: ~200MB installation size
- **Network**: Minimal, only during uploads and status checks