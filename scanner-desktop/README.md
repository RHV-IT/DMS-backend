# RHV Scanner Agent - Windows Desktop Build

## Prerequisites

- Node.js 18+ and npm
- Windows 10/11 for building
- Git

## Development Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

## Building the Windows Installer

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Build the Application
```bash
npm run build
```

### Step 3: Output Location
The installer will be created at:
```
scanner-desktop/dist/RHV Scanner Agent Setup 1.0.0.exe
```

## Installation Process

The generated installer provides a standard Windows setup wizard:

1. **Welcome Screen**: Introduction to RHV Scanner Agent
2. **Installation Location**: Automatic (user's AppData)
3. **Installation Progress**: Shows progress bar
4. **Completion**: Success message with launch option

The installer will automatically:
- Extract all files to user's AppData directory
- Create desktop shortcut
- Create start menu entry
- Set up auto-start with Windows login
- Create required directories:
  - `Documents/RHV Scanner`

## End User Experience

After installation:
1. **Auto-start**: App launches automatically with Windows
2. **System Tray**: App runs in background with status icon
3. **File Monitoring**: Watches `Documents/RHV Scanner` folder
4. **Dashboard**: Right-click tray icon → Open Dashboard
5. **Local Server**: Runs on http://localhost:4001/health

## Configuration

The app automatically:
- Generates unique machine ID
- Creates scan directory in Documents
- Provides GUI dashboard for settings

## Testing the Build

### Local Testing
```bash
# Install the built exe on your machine
# Check system tray for RHV Scanner Agent icon
# Place a PDF in Documents/RHV Scanner
# Check localhost:4001/health endpoint
```

### API Testing
```bash
# Check health endpoint
curl http://localhost:4001/health

# Should return:
{
  "status": "running",
  "machineId": "machine-xxxx",
  "scanDirectory": "C:\\Users\\user\\Documents\\RHV Scanner",
  "timestamp": "2026-05-15T...",
  "version": "1.0.0"
}
```

## Icons

Replace the placeholder files in `assets/` with actual icons:
- `assets/icon.png` - 512x512 PNG for main app
- `assets/tray-icon.png` - 32x32 PNG for system tray

## Distribution

- **File**: `RHV Scanner Agent Setup.exe`
- **Size**: ~150MB (includes bundled Node.js runtime)
- **Requirements**: Windows 10/11, no admin rights needed
- **Installation**: Standard Windows installer wizard

## Troubleshooting

### Build Fails
```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

### Icons Missing
The app will use default Electron icons if custom icons are missing.

### Permission Issues
Run the build command as administrator if needed.

## Security Notes

- JWT tokens stored in user config files
- No sensitive data in logs
- HTTPS communication with backend
- Machine IDs are UUID-based
- Files uploaded only after user authentication