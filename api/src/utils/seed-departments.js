require('dotenv').config();
const mongoose = require('mongoose');
const Department = require('../models/Department');

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

const seedDepartments = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  console.log('Mongo URI exists:', !!mongoUri);
  if (!mongoUri) {
    console.error('MongoDB URI missing');
    process.exit(1);
  }
  console.log('Connecting to MongoDB...');
  try {
    await mongoose.connect(mongoUri);
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