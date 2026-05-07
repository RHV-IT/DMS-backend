require('dotenv').config();
const { userOperations } = require('./src/utils/databaseUtils');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { name, email, password, department } = req.body;

    if (!name || !email || !password || !department) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and department are required'
      });
    }

    // Check if user already exists
    const existingUser = await userOperations.findOne({ email });
    if (existingUser) {
      if (existingUser.status === 'deleted') {
        return res.status(400).json({
          success: false,
          message: 'This account was deleted. Please contact administrator to restore.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Create new user
    const newUser = await userOperations.create({
      name,
      email,
      password,
      department,
      role: 'user',
      confidentialityLevels: ['public', 'internal'],
      passwordLastChanged: new Date()
    });

    // Generate tokens
    const authService = require('../src/services/authService');
    const accessToken = authService.generateAccessToken(newUser);
    const refreshToken = authService.generateRefreshToken(newUser);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          department: newUser.department
        },
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};