require('dotenv').config();
const mongoose = require('mongoose');
const Department = require('../models/Department');

const departments = [
  { name: 'DOCTOR', code: 'DOC', description: 'Medical Doctors and Physicians' },
  { name: 'NURSE', code: 'NUR', description: 'Nursing Services' },
  { name: 'HUMAN RESOURCE', code: 'HR', description: 'Human Resources Management' },
  { name: 'PHARMACY', code: 'PHM', description: 'Pharmaceutical Services' },
  { name: 'AUDIT', code: 'AUD', description: 'Internal Audit and Compliance' },
  { name: 'PROCUREMENT', code: 'PRO', description: 'Procurement and Supply Chain' },
  { name: 'KITCHEN', code: 'KIT', description: 'Kitchen and Catering Services' },
  { name: 'GENERAL STORE', code: 'GNS', description: 'General Store and Inventory' },
  { name: 'MEDICAL RECORDS', code: 'MCR', description: 'Medical Records Management' },
  { name: 'FRONT DESK', code: 'FDS', description: 'Reception and Patient Services' },
  { name: 'SOCIAL SERVICE', code: 'SSV', description: 'Social Services and Community Health' },
  { name: 'FINANCE', code: 'FIN', description: 'Finance and Accounting' },
  { name: 'OPERATION', code: 'OPS', description: 'Operations and Administration' },
  { name: 'FACILITY', code: 'FAC', description: 'Facility Management and Maintenance' },
  { name: 'HOUSE KEEPERS', code: 'HSK', description: 'Housekeeping Services' }
];

const seedDepartments = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const dept of departments) {
      const existing = await Department.findOne({ code: dept.code });
      if (existing) {
        console.log(`Department ${dept.name} already exists, skipping...`);
        continue;
      }
      
      await Department.create(dept);
      console.log(`Created department: ${dept.name}`);
    }

    console.log('\nAll departments seeded successfully!');
    
    const count = await Department.countDocuments();
    console.log(`Total departments in database: ${count}`);
    
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedDepartments();