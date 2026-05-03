const jwt = require('jsonwebtoken');
require('dotenv').config();

// Token generator for scanner service account
// Run: node generate-scanner-token.js

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('ERROR: JWT_SECRET not found in .env');
  process.exit(1);
}

// Scanner service account payload (adjust as needed)
const scannerPayload = {
  id: 'scanner-service-account',
  email: 'scanner@dms.local',
  name: 'Scanner Service',
  role: 'admin',  // Use appropriate role
  department: 'scanner',
  scanner: true
};

// Generate token with 1 year expiry (or adjust as needed)
const token = jwt.sign(
  scannerPayload,
  JWT_SECRET,
  { expiresIn: '365d' }
);

console.log('\n=== Scanner Token Generated ===');
console.log('Token:', token);
console.log('\nAdd this to your watcher .env file:');
console.log(`SCANNER_TOKEN=${token}`);
console.log('\nToken expires in 365 days');
console.log('=============================\n');
