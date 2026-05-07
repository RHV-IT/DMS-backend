#!/bin/bash

# Build script for RHV DMS Scanner Agent Installer

echo "Building RHV DMS Scanner Agent..."

# Navigate to scanner-agent directory
cd scanner-agent

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the Electron app
echo "Building installer..."
npm run dist

echo "Build complete! Installer available at: scanner-agent/dist/"