const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Token Renewal Helper
 * 
 * This script can be scheduled (e.g., via Task Scheduler) to renew
 * the scanner token before it expires, ensuring continuous operation.
 * 
 * Setup: Run this script once a week/month to generate a fresh token.
 * Then update watcher/.env with the new token.
 */

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('ERROR: JWT_SECRET not found in environment');
  console.error('Ensure api/.env is accessible or JWT_SECRET is set');
  process.exit(1);
}

// Read existing scanner user ID if available
const watcherEnvPath = path.resolve(__dirname, '.env');
let scannerUserId = null;

if (fs.existsSync(watcherEnvPath)) {
  const envContent = fs.readFileSync(watcherEnvPath, 'utf8');
  const match = envContent.match(/SCANNER_USER_ID=([a-f0-9]+)/);
  if (match) {
    scannerUserId = match[1];
    console.log(`Found existing scanner user ID: ${scannerUserId}`);
  }
}

if (!scannerUserId) {
  console.log('No SCANNER_USER_ID found in .env');
  console.log('Please run setup-scanner-account.js first to create the scanner user.');
  process.exit(1);
}

// Generate new token for the existing scanner user
const token = jwt.sign(
  {
    id: scannerUserId,
    email: 'scanner@dms.local',
    name: 'Scanner Service',
    role: 'admin',
    department: 'scanner',
    scanner: true
  },
  JWT_SECRET,
  { expiresIn: '365d' }
);

console.log('\n=== Scanner Token Renewed ===');
console.log(`Generated: ${new Date().toISOString()}`);
console.log(`Expires: ${new Date(Date.now() + 365*24*60*60*1000).toISOString()}`);
console.log('');
console.log(token);
console.log('=============================\n');

// Offer to update .env
const updateEnv = process.env.UPDATE_ENV === 'true';
if (updateEnv) {
  let envContent = '';
  if (fs.existsSync(watcherEnvPath)) {
    envContent = fs.readFileSync(watcherEnvPath, 'utf8');
  }
  
  // Update or add SCANNER_TOKEN
  if (envContent.includes('SCANNER_TOKEN=')) {
    envContent = envContent.replace(/SCANNER_TOKEN=.*/, `SCANNER_TOKEN=${token}`);
  } else {
    envContent += `\nSCANNER_TOKEN=${token}\n`;
  }
  
  fs.writeFileSync(watcherEnvPath, envContent);
  console.log('✓ Updated watcher/.env with new token\n');
}

console.log('Manual steps:');
console.log('1. Copy the token above');
console.log('2. Paste into watcher/.env as SCANNER_TOKEN=...');
console.log('3. Restart the watcher if running\n');
