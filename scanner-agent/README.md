# DMS Scanner Agent

Distributed file scanning agent for the Document Management System.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure backend URL:**
   Create a `.env` file (copy from `.env.example`):
   ```bash
   API_BASE_URL=http://192.168.5.25:5000
   ```

3. **Run the agent:**
   ```bash
   npm start
   # or
   node scanner-agent.js
   ```

## Requirements

- Node.js v24.13.1+ (uses built-in `crypto.randomUUID()`)
- Dependencies: `axios`, `chokidar`, `form-data`

## Features

- Watches scan directory for new files
- Automatically uploads scanned documents to DMS backend
- Uses pending scan workflow for confirmation
- Configurable via environment variables
- Self-contained with built-in Node.js crypto (no uuid dependency)

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `API_BASE_URL` | `http://localhost:5000` | Backend API endpoint |
| `SCAN_DIR` | `~/Documents/Scan` | Directory to monitor for scans |

## Troubleshooting

- **"Cannot find module" errors**: Run `npm install`
- **Connection timeouts**: Check `API_BASE_URL` in `.env`
- **Node.js version too old**: Upgrade to Node.js v24+</content>
<parameter name="filePath">agent/README.md