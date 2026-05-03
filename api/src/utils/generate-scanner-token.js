const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Scanner Token Generator
 * 
 * This generates a JWT token for the scanner service.
 * The token is signed with the same JWT_SECRET as the backend.
 * 
 * IMPORTANT: The user ID embedded in the token must exist in the database.
 * 
 * Usage:
 *   1. Create a scanner user in the database first (see create-scanner-user.js)
 *   2. Replace 'USER_ID_HERE' with the actual MongoDB ObjectId
 *   3. Run: node generate-token.js
 *   4. Copy the output token to watcher/.env
 */

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('ERROR: JWT_SECRET not found in .env');
  console.error('Make sure api/.env exists and contains JWT_SECRET');
  process.exit(1);
}

// You need to replace this with an actual user ID from your database
// Run: db.users.find({ email: "scanner@dms.local" }).toArray() in mongo shell
const SCANNER_USER_ID = process.env.SCANNER_USER_ID || 'REPLACE_WITH_USER_ID';

if (SCANNER_USER_ID === 'REPLACE_WITH_USER_ID') {
  console.error('ERROR: SCANNER_USER_ID not set');
  console.error('Set it in environment or edit this script:');
  console.error('  SCANNER_USER_ID=your-mongodb-objectid');
  console.error('\nOr run create-scanner-user.js first to auto-create the user');
  process.exit(1);
}

const tokenPayload = {
  id: SCANNER_USER_ID,
  email: 'scanner@dms.local',
  name: 'Scanner Service',
  role: 'admin',
  department: 'scanner',
  scanner: true
};

const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '365d' });

console.log('\n=== Scanner Token (valid 365 days) ===');
console.log(token);
console.log('=====================================\n');
console.log('Copy this to watcher/.env:');
console.log(`SCANNER_TOKEN=${token}\n`);
