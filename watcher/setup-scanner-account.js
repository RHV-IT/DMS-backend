const mongoose = require('mongoose');
// const bcrypt = require('bcrypt');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

// Load .env from both possible locations
const envPaths = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '../api/.env')
];

for (const envPath of envPaths) {
  if (require('fs').existsSync(envPath)) {
    console.log(`Loading .env from: ${envPath}`);
    require('dotenv').config({ path: envPath });
    break;
  }
}

// Resolve the User model path relative to this script
const apiDir = path.resolve(__dirname, '../api');
const User = require(path.join(apiDir, 'src', 'models', 'User'));

const setupScannerAccount = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dms';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB\n');

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      console.error('ERROR: JWT_SECRET not found in .env');
      console.error('Make sure you are running this from the watcher directory with access to the api/.env');
      process.exit(1);
    }

    // Check if scanner account already exists
    let scannerUser = await User.findOne({ email: 'scanner@dms.local' });

    if (scannerUser) {
      console.log('Scanner account already exists');
      console.log(`User ID: ${scannerUser._id}`);
      console.log(`Status: ${scannerUser.status}`);

      // Generate new token
      const token = jwt.sign(
        {
          id: scannerUser._id,
          email: scannerUser.email,
          name: scannerUser.name,
          role: scannerUser.role,
          department: scannerUser.department,
          scanner: true
        },
        JWT_SECRET,
        { expiresIn: '365d' }
      );

      console.log('\n=== Scanner Token ===');
      console.log(token);
      console.log('====================\n');

      console.log('Add this to watcher/.env:');
      console.log(`SCANNER_TOKEN=${token}\n`);

    } else {
      // Create scanner service account
      console.log('Creating scanner service account...');

      const hashedPassword = await bcrypt.hash('ScannerService2024!', 12);

      scannerUser = await User.create({
        name: 'Scanner Service',
        email: 'scanner@dms.local',
        password: hashedPassword,
        role: 'admin',  // Adjust role as needed
        department: 'scanner',
        status: 'active',
        confidentialityLevels: ['public', 'internal']
      });

      console.log('Scanner account created!');
      console.log(`User ID: ${scannerUser._id}`);
      console.log(`Email: ${scannerUser.email}`);
      console.log(`Role: ${scannerUser.role}`);

      // Generate token
      const token = jwt.sign(
        {
          id: scannerUser._id,
          email: scannerUser.email,
          name: scannerUser.name,
          role: scannerUser.role,
          department: scannerUser.department,
          scanner: true
        },
        JWT_SECRET,
        { expiresIn: '365d' }
      );

      console.log('\n=== Scanner Token ===');
      console.log(token);
      console.log('====================\n');

      console.log('Add this to watcher/.env:');
      console.log(`SCANNER_TOKEN=${token}\n`);
    }

    console.log('Setup complete!');
    console.log('\nNext steps:');
    console.log('1. Ensure SCANNER_TOKEN is set in watcher/.env');
    console.log('2. Start the watcher: cd watcher && npm start');
    console.log('3. Place scanned files in C:/Users/user/Documents/Scan');

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');

  } catch (error) {
    console.error('Error:', error.message);
    if (error.name === 'MongoServerSelectionError') {
      console.error('\nMake sure MongoDB is running on localhost:27017');
    }
    process.exit(1);
  }
};

setupScannerAccount();
