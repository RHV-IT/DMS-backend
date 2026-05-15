#!/bin/bash

# Build script for RHV DMS Scanner Desktop Installer

echo "Building RHV DMS Scanner Desktop..."

# Navigate to scanner-desktop directory
cd scanner-desktop

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the Electron app
echo "Building installer..."
npm run build:win

echo "Build complete! Installer available at: scanner-desktop/dist/"