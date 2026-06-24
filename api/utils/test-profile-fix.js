const mongoose = require('mongoose');
const User = require('../src/models/User');

const testProfileFixes = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI is missing');
    process.exit(1);
  }

  console.log('Connecting to MongoDB for testing...');
  try {
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully');

    // Test 1: Find a user with departments but no profiles (if any)
    const usersWithoutProfiles = await User.find({
      $or: [
        { profiles: { $exists: false } },
        { profiles: { $size: 0 } }
      ],
      department: { $exists: true, $ne: null, $ne: '' }
    }).limit(5);

    console.log(`Found ${usersWithoutProfiles.length} users without profiles but with departments`);
    for (const user of usersWithoutProfiles) {
      console.log(`  - User: ${user.email}, Department: ${user.department}`);
    }

    // Test 2: Find a user with profiles and check their structure
    const usersWithProfiles = await User.find({
      profiles: { $exists: true, $ne: [] }
    }).limit(5);

    console.log(`Found ${usersWithProfiles.length} users with profiles`);
    for (const user of usersWithProfiles) {
      console.log(`  - User: ${user.email}`);
      console.log(`    Department field: ${user.department}`);
      console.log(`    Profiles count: ${user.profiles.length}`);
      user.profiles.forEach((p, i) => {
        console.log(`      Profile ${i+1}: ${p.department} (Primary: ${p.isPrimary}, Status: ${p.status})`);
      });
    }

// Test 3: Check if we can find primary profiles
     const usersWithPrimaryProfile = await User.find({
       'profiles.isPrimary': true,
       'profiles.status': 'active'
     }).limit(5);

     console.log(`Found ${usersWithPrimaryProfile.length} users with primary profile`);
     for (const user of usersWithPrimaryProfile) {
       console.log(`  - User: ${user.email}`);
       console.log(`    Department field: ${user.department}`);
       console.log(`    Profiles count: ${user.profiles.length}`);
       user.profiles.forEach((p, i) => {
         console.log(`      Profile ${i+1}: ${p.department} (Primary: ${p.isPrimary}, Status: ${p.status})`);
       });
     }

     await mongoose.disconnect();
  } catch (error) {
    console.error('Test error:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  testProfileFixes();
}

module.exports = { testProfileFixes };