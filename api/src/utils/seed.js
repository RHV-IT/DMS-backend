require('dotenv').config();
const mongoose = require('mongoose');
// const bcrypt = require('bcrypt');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Role = require('../models/Role');
const Department = require('../models/Department');

const seedDepartments = async () => {
  const departments = [
    { name: 'INFORMATION TECHNOLOGY', code: 'IT', description: 'Information Technology Services' },
    { name: 'HUMAN RESOURCES', code: 'HR', description: 'Human Resources Management' },
    { name: 'FRONT DESK', code: 'FD', description: 'Reception and Front Desk Services' },
    { name: 'FINANCE', code: 'FIN', description: 'Finance and Accounting' },
    { name: 'MEDICAL RECORDS', code: 'MR', description: 'Medical Records Management' },
    { name: 'PROCUREMENT', code: 'PROC', description: 'Procurement and Supply Chain' },
    { name: 'LEGAL', code: 'LEG', description: 'Legal Services' },
    { name: 'PHARMACY', code: 'PHARM', description: 'Pharmaceutical Services' },
    { name: 'RADIOLOGY', code: 'RAD', description: 'Radiology Department' },
    { name: 'LABORATORY', code: 'LAB', description: 'Laboratory Services' },
    { name: 'NURSING', code: 'NUR', description: 'Nursing Services' },
    { name: 'EMERGENCY', code: 'EMER', description: 'Emergency Department' },
    { name: 'OUTPATIENT', code: 'OPD', description: 'Outpatient Services' },
    { name: 'INPATIENT', code: 'IPD', description: 'Inpatient Services' },
    { name: 'SURGERY', code: 'SUR', description: 'Surgery Department' },
    { name: 'CARDIOLOGY', code: 'CARD', description: 'Cardiology Department' },
    { name: 'PEDIATRICS', code: 'PED', description: 'Pediatrics Department' },
    { name: 'DENTAL', code: 'DEN', description: 'Dental Services' },
    { name: 'PHYSIOTHERAPY', code: 'PHY', description: 'Physiotherapy Services' },
    { name: 'ADMINISTRATION', code: 'ADMIN', description: 'Administration' },
    { name: 'OPERATIONS', code: 'OPS', description: 'Operations' },
    { name: 'MAINTENANCE', code: 'MAINT', description: 'Maintenance Services' },
    { name: 'SECURITY', code: 'SEC', description: 'Security Services' },
    { name: 'CUSTOMER SERVICE', code: 'CS', description: 'Customer Service' },
    { name: 'HEALTH INFORMATION MANAGEMENT', code: 'HIM', description: 'Health Information Management' },
    { name: 'BILLING', code: 'BILL', description: 'Billing Department' },
    { name: 'INSURANCE', code: 'INS', description: 'Insurance Services' },
    { name: 'RESEARCH', code: 'RES', description: 'Research Department' },
    { name: 'ICT SUPPORT', code: 'ICT', description: 'ICT Support Services' },
    { name: 'INVENTORY', code: 'INV', description: 'Inventory Management' },
    { name: 'STORE MANAGEMENT', code: 'SM', description: 'Store Management' }
  ];

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const dept of departments) {
    try {
      const result = await Department.findOneAndUpdate(
        { name: dept.name },
        {
          $set: {
            code: dept.code,
            description: dept.description,
            isActive: true,
            updatedAt: new Date(),
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
        }
      );

      if (result && result.isNew) {
        created++;
        console.log(`Department created: ${dept.name}`);
      } else {
        updated++;
        console.log(`Department updated: ${dept.name}`);
      }
    } catch (error) {
      errors++;
      console.warn(`Failed to seed department ${dept.name}: ${error.message}`);
    }
  }

  console.log(`Seeder completed: ${created} created, ${updated} updated, ${errors} errors`);
};

const seedSuperAdmin = async () => {
  const existingAdmin = await User.findOne({ email: 'admin@dms.com' });
  if (existingAdmin) {
    console.log('✓ Super Admin already exists');
    return;
  }

  // Hash the password manually since we're not using pre-save
  const hashedPassword = await bcrypt.hash('Admin@123', 12);

  const admin = await User.create({
    name: 'System Administration',
    email: 'admin@dms.com',
    password: hashedPassword,
    role: 'admin',
    department: 'INFORMATION TECHNOLOGY',
    status: 'active',
    confidentialityLevels: ['public', 'internal', 'confidential', 'highly_confidential'],
    passwordLastChanged: new Date()
  });

  console.log('✓ Super Admin created');

  // Seed roles
  const roles = [
    {
      name: 'admin',
      permissions: [
        'file:upload', 'file:download', 'file:delete', 'file:share', 'file:update', 'file:read',
        'user:create', 'user:read', 'user:update', 'user:delete',
        'role:assign', 'permission:override',
        'logs:read', 'logs:export',
        'notification:read', 'notification:manage',
        'scanner:manage', 'archive:manage', 'audit:manage'
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

  console.log('✓ Roles seeded');
};

const runSeed = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI is missing');
    process.exit(1);
  }
  console.log('Mongo URI exists');
  console.log('Connecting to MongoDB');
  try {
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully');

    await seedDepartments();
    await seedSuperAdmin();

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    console.log('Seeding completed successfully');
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  runSeed();
}

module.exports = { seedDepartments, seedSuperAdmin };