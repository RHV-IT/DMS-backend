const Department = require('../models/Department');
const ConfidentialityLevel = require('../models/ConfidentialityLevel');
const User = require('../models/User');

const settingsController = {
  // =====================
  // DEPARTMENT APIs
  // =====================
  
  createDepartment: async (req, res, next) => {
    try {
      const { name, code, description } = req.body;
      
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ 
          success: false, 
          message: 'Department name is required' 
        });
      }
      
      if (!code || typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ 
          success: false, 
          message: 'Department code is required' 
        });
      }
      
      const existingDept = await Department.findOne({ 
        $or: [{ name: name.toUpperCase().trim() }, { code: code.toUpperCase().trim() }] 
      });
      
      if (existingDept) {
        return res.status(400).json({ 
          success: false, 
          message: 'Department with this name or code already exists' 
        });
      }
      
      const department = await Department.create({
        name: name.toUpperCase().trim(),
        code: code.toUpperCase().trim(),
        description: description?.trim() || '',
        createdBy: req.user._id
      });
      
      res.status(201).json({
        success: true,
        data: department,
        message: 'Department created successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  getDepartments: async (req, res, next) => {
    try {
      const { page = 1, limit = 50, search, includeInactive } = req.query;
      
      const query = {};
      if (includeInactive !== 'true') {
        query.isActive = true;
      }
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } }
        ];
      }
      
      const departments = await Department.find(query)
        .populate('createdBy', 'name email')
        .sort({ name: 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
      
      const total = await Department.countDocuments(query);
      
      res.json({
        success: true,
        data: {
          departments,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          total
        }
      });
    } catch (error) {
      next(error);
    }
  },

  getDepartmentById: async (req, res, next) => {
    try {
      const department = await Department.findById(req.params.id)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email');
      
      if (!department) {
        return res.status(404).json({ success: false, message: 'Department not found' });
      }
      
      res.json({ success: true, data: department });
    } catch (error) {
      next(error);
    }
  },

  updateDepartment: async (req, res, next) => {
    try {
      const { name, code, description, isActive } = req.body;
      
      const department = await Department.findById(req.params.id);
      if (!department) {
        return res.status(404).json({ success: false, message: 'Department not found' });
      }
      
      if (name && typeof name === 'string' && name.trim()) {
        if (name.toUpperCase().trim() !== department.name) {
          const existing = await Department.findOne({ name: name.toUpperCase().trim(), _id: { $ne: department._id } });
          if (existing) {
            return res.status(400).json({ success: false, message: 'Department name already exists' });
          }
          department.name = name.toUpperCase().trim();
        }
      }
      
      if (code && typeof code === 'string' && code.trim()) {
        if (code.toUpperCase().trim() !== department.code) {
          const existing = await Department.findOne({ code: code.toUpperCase().trim(), _id: { $ne: department._id } });
          if (existing) {
            return res.status(400).json({ success: false, message: 'Department code already exists' });
          }
          department.code = code.toUpperCase().trim();
        }
      }
      
      if (description !== undefined) department.description = description?.trim() || '';
      if (isActive !== undefined) department.isActive = isActive;
      department.updatedBy = req.user._id;
      
      await department.save();
      
      res.json({
        success: true,
        data: department,
        message: 'Department updated successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  deleteDepartment: async (req, res, next) => {
    try {
      const department = await Department.findById(req.params.id);
      if (!department) {
        return res.status(404).json({ success: false, message: 'Department not found' });
      }
      
      const usersInDept = await User.countDocuments({ department: department.name });
      if (usersInDept > 0) {
        return res.status(400).json({ 
          success: false, 
          message: `Cannot delete department. ${usersInDept} user(s) are assigned to this department.` 
        });
      }
      
      department.isActive = false;
      await department.save();
      
      res.json({ success: true, message: 'Department deactivated successfully' });
    } catch (error) {
      next(error);
    }
  },

  // =====================
  // CONFIDENTIALITY LEVEL APIs
  // =====================

  createConfidentialityLevel: async (req, res, next) => {
    try {
      const { name, displayName, description, level, color } = req.body;
      
      const existing = await ConfidentialityLevel.findOne({ name });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Confidentiality level already exists' });
      }
      
      const confidentialityLevel = await ConfidentialityLevel.create({
        name,
        displayName,
        description,
        level: level || 1,
        color: color || '#000000',
        createdBy: req.user._id
      });
      
      res.status(201).json({
        success: true,
        data: confidentialityLevel,
        message: 'Confidentiality level created successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  getConfidentialityLevels: async (req, res, next) => {
    try {
      const { includeInactive } = req.query;
      
      const query = {};
      if (includeInactive !== 'true') {
        query.isActive = true;
      }
      
      const levels = await ConfidentialityLevel.find(query)
        .populate('createdBy', 'name email')
        .sort({ level: 1 });
      
      res.json({
        success: true,
        data: levels
      });
    } catch (error) {
      next(error);
    }
  },

  getConfidentialityLevelById: async (req, res, next) => {
    try {
      const level = await ConfidentialityLevel.findById(req.params.id)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email');
      
      if (!level) {
        return res.status(404).json({ success: false, message: 'Confidentiality level not found' });
      }
      
      res.json({ success: true, data: level });
    } catch (error) {
      next(error);
    }
  },

  updateConfidentialityLevel: async (req, res, next) => {
    try {
      const { displayName, description, level, color, isActive } = req.body;
      
      const levelObj = await ConfidentialityLevel.findById(req.params.id);
      if (!levelObj) {
        return res.status(404).json({ success: false, message: 'Confidentiality level not found' });
      }
      
      if (displayName) levelObj.displayName = displayName;
      if (description !== undefined) levelObj.description = description;
      if (level) levelObj.level = level;
      if (color) levelObj.color = color;
      if (isActive !== undefined) levelObj.isActive = isActive;
      levelObj.updatedBy = req.user._id;
      
      await levelObj.save();
      
      res.json({
        success: true,
        data: levelObj,
        message: 'Confidentiality level updated successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  deleteConfidentialityLevel: async (req, res, next) => {
    try {
      const level = await ConfidentialityLevel.findById(req.params.id);
      if (!level) {
        return res.status(404).json({ success: false, message: 'Confidentiality level not found' });
      }
      
      level.isActive = false;
      await level.save();
      
      res.json({ success: true, message: 'Confidentiality level deactivated successfully' });
    } catch (error) {
      next(error);
    }
  },

  // =====================
  // INITIALIZE DEFAULT DATA
  // =====================

  initializeDefaults: async (req, res, next) => {
    try {
      const defaultLevels = [
        { name: 'public', displayName: 'Public', description: 'Available to all users', level: 1, color: '#22c55e' },
        { name: 'internal', displayName: 'Internal', description: 'Department members only', level: 2, color: '#3b82f6' },
        { name: 'confidential', displayName: 'Confidential', description: 'Restricted access', level: 3, color: '#f59e0b' },
        { name: 'highly_confidential', displayName: 'Highly Confidential', description: 'Admin only', level: 4, color: '#ef4444' }
      ];

      for (const level of defaultLevels) {
        await ConfidentialityLevel.findOneAndUpdate(
          { name: level.name },
          level,
          { upsert: true, new: true }
        );
      }

      res.json({
        success: true,
        message: 'Default settings initialized successfully'
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = settingsController;