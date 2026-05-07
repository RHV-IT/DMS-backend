require('dotenv').config();
const { userOperations } = require('./src/utils/databaseUtils');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user with retry logic
    const user = await userOperations.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is suspended or deleted
    if (user.status === 'suspended') {
      return res.status(401).json({
        success: false,
        message: 'Account has been suspended'
      });
    }

    if (user.status === 'deleted') {
      return res.status(401).json({
        success: false,
        message: 'Account has been deleted'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate tokens (assuming you have an auth service)
    const authService = require('../src/services/authService');
    const accessToken = authService.generateAccessToken(user);
    const refreshToken = authService.generateRefreshToken(user);

    // Update user login info
    await userOperations.findOneAndUpdate(
      { _id: user._id },
      {
        $inc: { loginCount: 1 },
        lastLogin: new Date()
      }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department
        },
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};