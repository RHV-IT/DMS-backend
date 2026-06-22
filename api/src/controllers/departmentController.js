const Department = require('../models/Department');
const AuditLog = require('../models/AuditLog');

const departmentController = {
  createDepartment: async (req, res, next) => {
    try {
      const { name, code, description } = req.body;

      if (!name || !code) {
        return res.status(400).json({ success: false, message: 'Name and code are required' });
      }

      const existing = await Department.findOne({
        $or: [
          { name: name.trim().toUpperCase() },
          { code: code.trim().toUpperCase() }
        ]
      });

      if (existing) {
        return res.status(400).json({ success: false, message: 'Department with this name or code already exists' });
      }

      const department = await Department.create({
        name: name.trim().toUpperCase(),
        code: code.trim().toUpperCase(),
        description: description ? description.trim() : undefined,
        createdBy: req.user._id,
        updatedBy: req.user._id
      });

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'department_create',
        resource: 'department',
        resourceId: department._id.toString(),
        details: { name: department.name, code: department.code },
        ipAddress: req.ip
      });

      res.status(201).json({ success: true, data: department });
    } catch (error) {
      next(error);
    }
  },

  getAllDepartments: async (req, res, next) => {
    try {
      const { includeInactive } = req.query;
      const query = {};
      if (includeInactive !== 'true') {
        query.isActive = true;
      }

      const departments = await Department.find(query)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .sort({ name: 1 });

      res.json({ success: true, data: departments });
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

      if (name) {
        const existing = await Department.findOne({
          _id: { $ne: department._id },
          name: name.trim().toUpperCase()
        });
        if (existing) {
          return res.status(400).json({ success: false, message: 'Department with this name already exists' });
        }
        department.name = name.trim().toUpperCase();
      }

      if (code) {
        const existing = await Department.findOne({
          _id: { $ne: department._id },
          code: code.trim().toUpperCase()
        });
        if (existing) {
          return res.status(400).json({ success: false, message: 'Department with this code already exists' });
        }
        department.code = code.trim().toUpperCase();
      }

      if (description !== undefined) {
        department.description = description.trim();
      }

      if (isActive !== undefined) {
        department.isActive = isActive;
      }

      department.updatedBy = req.user._id;
      await department.save();

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'department_update',
        resource: 'department',
        resourceId: department._id.toString(),
        details: { name: department.name, code: department.code, isActive: department.isActive },
        ipAddress: req.ip
      });

      res.json({ success: true, data: department });
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

      department.isActive = false;
      department.updatedBy = req.user._id;
      await department.save();

      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        action: 'department_delete',
        resource: 'department',
        resourceId: department._id.toString(),
        details: { name: department.name, code: department.code },
        ipAddress: req.ip
      });

      res.json({ success: true, message: 'Department deactivated successfully' });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = departmentController;
