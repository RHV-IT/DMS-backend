# RHV DMS Scanner Desktop - Build Instructions

## Prerequisites

1. **Node.js 18+** and **npm** installed on development machine
2. **Git** for cloning repositories
3. **Windows 10/11** for building Windows installer
4. **Icon files** (see assets/README.md)

## Development Setup

```bash
# Clone or navigate to the project
cd scanner-desktop

# Install dependencies
npm install

# Start development version
npm run dev
```

## Building the Installer

### Step 1: Create Icon Files

Before building, you must create icon files in the `assets/` directory:

1. **icon.ico** - Windows icon with multiple sizes (256x256, 48x48, 32x32, 16x16)
2. **icon.png** - High-resolution PNG (512x512 recommended)
3. **tray-icon.png** - Small icon for system tray (32x32)

You can create these using:
- Online tools: https://favicon.io/favicon-converter/
- Image editors: GIMP, Photoshop, Paint.NET

### Step 2: Build the Application

```bash
# Build Windows installer
npm run build

# Or specifically for Windows
npm run build:win
```

### Step 3: Output Location

The installer will be created at:
```
scanner-desktop/dist/RHV-DMS-Scanner-Setup-1.0.0.exe
```

## Installation Process

The generated installer will:

1. **Extract** all files to user's AppData directory
2. **Create** desktop shortcut
3. **Create** start menu entry
4. **Set up** auto-start with Windows login
5. **Launch** the application automatically
6. **Create** required directories:
   - `Documents/Scan`
   - `Documents/RHV-DMS-Scanner`

## End User Experience

After installation:

1. **System Tray**: App runs in background with tray icon
2. **Auto-start**: Launches automatically with Windows
3. **File Monitoring**: Watches `Documents/Scan` folder
4. **Local API**: Runs on `http://localhost:4001`
5. **Settings**: Right-click tray icon → Settings

## Configuration

The app automatically:
- Generates unique machine ID
- Connects to `https://rhv-dms-backend.vercel.app`
- Registers with backend (when token is configured)
- Monitors scan folder for new files

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