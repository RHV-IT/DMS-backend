# Scanner Agent Startup

## Quick Start

1. **Configure** (if not done):
   ```bash
   node setup.js
   ```

2. **Start the agent**:
   ```bash
   npm start
   ```
   Or:
   ```bash
   node scanner-agent.js
   ```

## Verify Running

The agent logs to `scanner-agent.log`. Check:

```bash
type scanner-agent.log
```

Or watch console output for:
- `Scanner Agent Started`
- `Watcher ready and monitoring for files`

## Auto-Start on Windows

### Option 1: Task Scheduler (Recommended)

1. Open **Task Scheduler** (`taskschd.msc`)

2. **Create Task**:
   - Name: `DMS Scanner Agent`
   - Trigger: `At log on` or `At startup`
   - Action: `Start a program`
   - Program: `node`
   - Arguments: `C:\path\to\dms-backend\agent\scanner-agent.js`
   - Start in: `C:\path\to\dms-backend\agent`

3. Run whether user is logged on or not

### Option 2: Startup Folder

1. Create a shortcut to `scanner-agent.js`

2. Place in:
   ```
   C:\Users\{username}\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
   ```

### Option 3: Windows Service (NSSM)

```bash
# Install nssm if not installed
choco install nssm

# Install as service
nssm install DMSScannerAgent "C:\path\to\node.exe" "C:\path\to\agent\scanner-agent.js"
nssm set DMSScannerAgent AppDirectory "C:\path\to\agent"
nssm set DMSScannerAgent AppStopMethodSkip 6
```

## Auto-Start on macOS

```bash
# Using launchd
launchctl load ~/Library/LaunchAgents/com.dms.scanner-agent.plist

# Or using pm2
pm2 start scanner-agent.js --name dms-scanner
pm2 save
pm2 startup
```

## Auto-Start on Linux

### Systemd (Ubuntu/Debian)

1. Create `/etc/systemd/system/scanner-agent.service`:
   ```ini
   [Unit]
   Description=DMS Scanner Agent
   After=network.target
   
   [Service]
   Type=simple
   User=USERNAME
   WorkingDirectory=/path/to/agent
   ExecStart=/usr/bin/node /path/to/agent/scanner-agent.js
   Restart=always
   
   [Install]
   WantedBy=multi-user.target
   ```

2. Enable service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable scanner-agent
   sudo systemctl start scanner-agent
   ```

### Cron (Alternative)

```bash
@reboot cd /path/to/agent && node scanner-agent.js
```

## Scan Directory

The agent monitors:
```
C:\Users\{currentUser}\Documents\Scan
```

Place scanned files in this folder - they will be automatically uploaded.

## Stopping the Agent

```bash
# If running in console: Ctrl+C
# If as service: systemctl stop scanner-agent
```

## Logs

- Console output: Both console and `scanner-agent.log`
- Processed files: `processed-files.json` (tracks uploads to prevent duplicates)

## Multiple Machines

Each machine should:
1. Have its own scanner service account (optional)
2. Share the same backend
3. Use unique tokens per machine for tracking

To track machines, modify the scanner user or add machine identifier to file metadata.