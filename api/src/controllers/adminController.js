const User = require('../models/User');
const Role = require('../models/Role');

const registerAdmin = async (req, res) => {
  try {
    // Check secret
    const { secret } = req.query;
    if (!secret || secret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const { name, email, password, department } = req.body;

    // Validate input
    if (!name || !email || !password || !department) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and department are required'
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Create admin user
    const admin = await User.create({
      name,
      email,
      password,
      department,
      role: 'admin',
      status: 'active',
      confidentialityLevels: ['public', 'internal', 'confidential', 'highly_confidential']
    });

    // Ensure admin role exists
    await Role.findOneAndUpdate(
      { name: 'admin' },
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
      { upsert: true }
    );

    res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        department: admin.department
      }
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = { registerAdmin };