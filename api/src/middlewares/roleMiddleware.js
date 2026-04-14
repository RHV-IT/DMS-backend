const Role = require('../models/Role');

const roleMiddleware = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }

      const userRole = req.user.role;
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied. Insufficient permissions.' 
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Role check failed' });
    }
  };
};

const permissionMiddleware = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }

      const role = await Role.findOne({ name: req.user.role });
      
      if (!role || !role.permissions.includes(requiredPermission)) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied. Required permission missing.' 
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Permission check failed' });
    }
  };
};

module.exports = { roleMiddleware, permissionMiddleware };