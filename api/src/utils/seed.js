require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Role = require('../models/Role');

const seedAdminUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const existingAdmin = await User.findOne({ email: 'admin@dms.com' });
    if (existingAdmin) {
      console.log('Admin user already exists');
      await mongoose.disconnect();
      return;
    }
    
    const admin = await User.create({
      name: 'System Administrator',
      email: 'admin@dms.com',
      password: 'Admin@123',
      role: 'admin',
      department: 'IT',
      status: 'active',
      confidentialityLevels: ['public', 'internal', 'confidential', 'highly_confidential'],
      passwordLastChanged: new Date()
    });

    console.log('Admin user created:', admin.email);

    const roles = [
      {
        name: 'admin',
        permissions: [
          'file:upload', 'file:download', 'file:delete', 'file:share', 'file:update', 'file:read',
          'user:create', 'user:read', 'user:update', 'user:delete',
          'role:assign', 'permission:override',
          'logs:read', 'logs:export',
          'notification:read', 'notification:manage'
        ]
      },
      {
        name: 'hod',
        permissions: [
          'file:upload', 'file:download', 'file:delete', 'file:share', 'file:update', 'file:read',
          'user:read', 'user:update',
          'logs:read',
          'notification:read', 'notification:manage'
        ]
      },
      {
        name: 'user',
        permissions: [
          'file:upload', 'file:download', 'file:read',
          'file:share',
          'notification:read'
        ]
      }
    ];

    for (const roleData of roles) {
      await Role.findOneAndUpdate(
        { name: roleData.name },
        roleData,
        { upsert: true }
      );
    }

    console.log('Roles seeded');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    console.log('Seed completed successfully');
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedAdminUser();