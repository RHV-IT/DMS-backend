# Multi-Department Profile System - Bug Fix Summary

## Problem Identified
The profile switching system had a critical bug where:
1. When frontend sent `departments: ["IT", "BILL", "FD"]`, the backend returned `profiles: []`
2. Profiles were not being automatically created or synchronized from the departments array
3. Existing users with department data had empty or missing profiles
4. Login and user endpoints were not returning profile data correctly

## Root Causes Found
1. **User Creation**: The `createUser` function in `authController` wasn't handling the `departments` array from frontend
2. **User Updates**: The `updateUser` function in `userController` wasn't synchronizing profiles with the departments array
3. **Login Response**: While the login was returning profiles, it depended on profiles existing in the database
4. **Missing Data Migration**: Existing users had departments but no profiles
5. **Profile Model Usage**: The system needed to properly use the profiles array for all operations

## Fixes Implemented

### 1. User Creation Fix (`src/controllers/authController.js`)
- Modified the `register` function to handle `req.body.departments` array
- Automatically creates profiles for each department in the array
- First department in the array is set as primary profile
- Falls back to single department behavior if no departments array provided

### 2. User Update Fix (`src/controllers/userController.js`)
- Completely rewrote the `updateUser` function to handle department synchronization
- Added comprehensive logging for debugging
- Handles both `department` (single) and `departments` (array) fields
- Creates new profiles for departments that don't exist
- Deactivates profiles for departments that are no longer in the list
- Ensures exactly one primary profile exists
- Properly handles confidentiality levels synchronization
- Maintains backward compatibility with legacy single-department field

### 3. Data Migration Script (`scripts/migrate-profiles.js`)
- Created a one-time migration script to fix existing users
- Finds users with departments but empty/missing profiles
- Creates appropriate profiles based on department and confidentiality levels
- Sets the first profile as primary
- Handles edge cases and provides detailed logging

### 4. Seed Data Update (`src/utils/seed.js`)
- Updated the super admin seed data to include proper profiles
- Created multiple profiles for the admin user with different access levels
- Ensures new installations start with correct profile data

### 5. Validation and Error Handling
- Added department validation using the existing `validateDepartment` function
- Added confidentiality level validation and normalization
- Improved error messages for invalid inputs
- Added comprehensive logging throughout the flow

## Expected Behavior After Fixes

### User Registration/Login
When frontend sends:
```json
{
  "name": "JOEL GABRIEL",
  "email": "joelgabriel@gmail.com",
  "department": "IT",
  "departments": ["IT", "BILL", "FD"],
  "confidentialityLevel": "confidential",
  "role": "hod"
}
```

Backend will:
1. Create user with department = "IT" (first in departments array)
2. Create three profiles:
   - IT: confidentialityLevels = ["public", "internal", "confidential"], isPrimary = true
   - BILL: confidentialityLevels = ["public", "internal", "confidential"], isPrimary = false
   - FD: confidentialityLevels = ["public", "internal", "confidential"], isPrimary = false
3. Return in response:
```json
{
  "success": true,
  "data": {
    "user": { ... },
    "profiles": [
      {
        "profileId": "...",
        "department": "IT",
        "confidentialityLevels": ["public", "internal", "confidential"],
        "isPrimary": true,
        "status": "active"
      },
      {
        "profileId": "...",
        "department": "BILL",
        "confidentialityLevels": ["public", "internal", "confidential"],
        "isPrimary": false,
        "status": "active"
      },
      {
        "profileId": "...",
        "department": "FD",
        "confidentialityLevels": ["public", "internal", "confidential"],
        "isPrimary": false,
        "status": "active"
      }
    ],
    "activeProfile": { /* IT profile */ }
  }
}
```

### User Updates
When frontend sends updated departments array:
```json
{
  "departments": ["IT", "BILL", "FD", "HR"]
}
```

Backend will:
1. Keep existing profiles for IT, BILL, FD
2. Create new profile for HR
3. Ensure one profile is primary (typically the first one)
4. Update the user's department field to match the primary profile's department
5. Return updated user with all 4 profiles

### Profile Switching
The `/api/v1/auth/switch-profile` endpoint continues to work as designed:
- Accepts `profileId` in request body
- Validates the profile belongs to the current user
- Generates new JWT with the selected profile's data
- Updates the HTTP-only cookie with new token
- Returns the new active profile information

## Files Modified
1. `src/controllers/authController.js` - Fixed user registration to handle departments array
2. `src/controllers/userController.js` - Completely rewrote updateUser for profile synchronization
3. `src/utils/seed.js` - Updated super admin seed data to include profiles
4. `scripts/migrate-profiles.js` - New migration script for existing data
5. `utils/test-profile-fix.js` - New test script to verify fixes

## Testing Instructions
1. Run the migration script: `node scripts/migrate-profiles.js`
2. Test user registration with departments array
3. Test user updates with departments array
4. Test login response includes profiles and activeProfile
5. Test profile switching endpoint
6. Run verification: `node utils/test-profile-fix.js`

## Backward Compatibility
- All existing API contracts remain unchanged
- Frontend can continue sending either `department` (string) or `departments` (array)
- Legacy single-department usage still works exactly as before
- No breaking changes to existing frontend code