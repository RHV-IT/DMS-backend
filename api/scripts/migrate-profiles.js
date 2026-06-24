require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

// Local copy of normalizeConfidentialityValue to avoid import issues
const normalizeConfidentialityValue = (value) => {
   const CONFIDENTIALITY_LEVELS = ['public', 'internal', 'confidential', 'highly_confidential'];
   const normalized = String(value || '').trim().toLowerCase();

   if (CONFIDENTIALITY_LEVELS.includes(normalized)) {
     return normalized;
   }

   if (normalized.includes('high')) {
     return 'highly_confidential';
   }

   if (normalized.includes('conf')) {
     return 'confidential';
   }

   if (normalized.includes('int')) {
     return 'internal';
   }

   if (normalized === 'public') {
     return 'public';
   }

   return null;
};

const migrateProfiles = async () => {
  const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
     console.error('MONGODB_URI is missing');
     process.exit(1);
   }
  try {
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully');

    // Find users who have a department but no profiles or empty profiles
    const users = await User.find({
      $or: [
        { profiles: { $exists: false } },
        { profiles: { $size: 0 } }
      ],
      department: { $exists: true, $ne: null, $ne: '' }
    });

    console.log(`Found ${users.length} users needing profile migration`);

    let processed = 0;
    let created = 0;
    let errors = 0;

    for (const user of users) {
      try {
        console.log(`Processing user ${user._id} (${user.email}) with department: ${user.department}`);

        // Determine confidentiality levels for the new profile
        let confidentialityLevels = ['public', 'internal']; // Default
        if (user.confidentialityLevels && Array.isArray(user.confidentialityLevels) && user.confidentialityLevels.length > 0) {
          confidentialityLevels = user.confidentialityLevels;
        } else if (user.confidentialityLevel) {
          const normalizedLevel = normalizeConfidentialityValue(user.confidentialityLevel);
          if (normalizedLevel) {
            const levels = ['public', 'internal', 'confidential', 'highly_confidential'];
            const index = levels.indexOf(normalizedLevel);
            confidentialityLevels = levels.slice(0, index + 1);
          }
        }

        // Create the profile
        const profile = {
          profileId: new mongoose.Types.ObjectId(),
          department: user.department.toUpperCase(),
          confidentialityLevels: confidentialityLevels,
          isPrimary: true, // Since this is the only profile, make it primary
          status: 'active'
        };

        // Update the user with the profile
        user.profiles = [profile];
        await user.save();

        console.log(`  → Created profile for department: ${user.department}`);
        processed++;
        created++;
      } catch (error) {
        console.error(`  → Error processing user ${user._id}:`, error.message);
        errors++;
      }
    }

    // Also handle users who have profiles but they might be inconsistent
    // For example, if they have departments array in legacy data but profiles don't match
    const usersWithDepartments = await User.find({
      department: { $exists: true, $ne: null, $ne: '' }
    });

    console.log(`\nChecking ${usersWithDepartments.length} users for profile consistency...`);

    for (const user of usersWithDepartments) {
      try {
        // Skip if we already processed this user in the first loop
        if (!user.profiles || user.profiles.length === 0) {
          continue; // Already handled
        }

        const needsUpdate = [];
        const profileDepartments = user.profiles
          .filter(p => p.status === 'active')
          .map(p => p.department);

        // Check if user's department matches any active profile
        const userDeptUpper = user.department.toUpperCase();
        const hasMatchingProfile = profileDepartments.includes(userDeptUpper);

        if (!hasMatchingProfile && user.department.trim().length > 0) {
          // Need to add a profile for the user's department
          let confidentialityLevels = user.confidentialityLevels || ['public', 'internal'];
          if (!Array.isArray(confidentialityLevels)) {
            confidentialityLevels = ['public', 'internal'];
          }

          const newProfile = {
            profileId: new mongoose.Types.ObjectId(),
            department: userDeptUpper,
            confidentialityLevels: confidentialityLevels,
            isPrimary: false,
            status: 'active'
          };

          user.profiles.push(newProfile);
          needsUpdate.push(`Added missing profile for ${user.department}`);
        }

        // Ensure exactly one primary profile exists
        const activeProfiles = user.profiles.filter(p => p.status === 'active');
        const primaryCount = activeProfiles.filter(p => p.isPrimary).length;

        if (primaryCount === 0 && activeProfiles.length > 0) {
          // No primary set, make the first one primary
          user.profiles[0].isPrimary = true;
          needsUpdate.push('Set first profile as primary');
        } else if (primaryCount > 1) {
          // Multiple primaries, keep only the first one as primary
user.profiles.forEach((profile, index) => {
             if (profile.status === 'active') {
               profile.isPrimary = (index === 0);
             } else {
               profile.isPrimary = false;
             }
           });
          needsUpdate.push('Fixed multiple primary profiles');
        }

        if (needsUpdate.length > 0) {
          await user.save();
          console.log(`User ${user._id}: ${needsUpdate.join(', ')}`);
          processed++;
        }
      } catch (error) {
        console.error(`Error checking user ${user._id}:`, error.message);
        errors++;
      }
    }

    console.log(`\nMigration completed:`);
    console.log(`  - Users processed: ${processed}`);
    console.log(`  - Profiles created: ${created}`);
    console.log(`  - Errors: ${errors}`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  migrateProfiles();
}

module.exports = { migrateProfiles };