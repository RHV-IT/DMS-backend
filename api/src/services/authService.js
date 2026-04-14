const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

class AuthService {
  generateAccessToken(user) {
    return jwt.sign(
      {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '15m' }
    );
  }

  generateRefreshToken(user) {
    return jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
    );
  }

  async verifyAccessToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  async verifyRefreshToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      return null;
    }
  }

  async refreshAccessToken(refreshToken) {
    const decoded = await this.verifyRefreshToken(refreshToken);
    if (!decoded) {
      throw new Error('Invalid refresh token');
    }

    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      throw new Error('Refresh token revoked');
    }

    const newAccessToken = this.generateAccessToken(user);
    return { accessToken: newAccessToken };
  }

  async logout(userId, ipAddress, userAgent) {
    await User.findByIdAndUpdate(userId, { refreshToken: null });
    
    await AuditLog.create({
      userId,
      userEmail: (await User.findById(userId))?.email,
      action: 'logout',
      ipAddress,
      userAgent
    });
  }

  async checkPasswordExpiry(user) {
    const expireDays = parseInt(process.env.PASSWORD_EXPIRE_DAYS) || 90;
    const lastChanged = user.passwordLastChanged || user.createdAt;
    const diffDays = Math.floor((Date.now() - new Date(lastChanged).getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= expireDays;
  }
}

module.exports = new AuthService();