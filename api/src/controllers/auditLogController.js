const AuditLog = require('../models/AuditLog');

const auditLogController = {
  getLogs: async (req, res, next) => {
    try {
      const { 
        page = 1, 
        limit = 50, 
        userId, 
        action, 
        fromDate, 
        toDate, 
        search 
      } = req.query;

      const query = {};

      if (userId) query.userId = userId;
      if (action) query.action = action;
      
      if (fromDate || toDate) {
        query.timestamp = {};
        if (fromDate) query.timestamp.$gte = new Date(fromDate);
        if (toDate) query.timestamp.$lte = new Date(toDate);
      }

      if (search) {
        query.$or = [
          { userEmail: { $regex: search, $options: 'i' } },
          { resource: { $regex: search, $options: 'i' } }
        ];
      }

      const logs = await AuditLog.find(query)
        .populate('userId', 'name email')
        .sort({ timestamp: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await AuditLog.countDocuments(query);

      res.json({
        success: true,
        data: {
          logs,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          total
        }
      });
    } catch (error) {
      next(error);
    }
  },

  getUserLogs: async (req, res, next) => {
    try {
      const { page = 1, limit = 50 } = req.query;

      const logs = await AuditLog.find({ userId: req.user._id })
        .sort({ timestamp: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      res.json({ success: true, data: logs });
    } catch (error) {
      next(error);
    }
  },

  exportLogs: async (req, res, next) => {
    try {
      const { fromDate, toDate, format = 'json' } = req.query;

      const query = {};
      if (fromDate || toDate) {
        query.timestamp = {};
        if (fromDate) query.timestamp.$gte = new Date(fromDate);
        if (toDate) query.timestamp.$lte = new Date(toDate);
      }

      const logs = await AuditLog.find(query)
        .populate('userId', 'name email')
        .sort({ timestamp: -1 });

      if (format === 'csv') {
        const csv = [
          'Timestamp,User Email,Action,Resource,Resource ID,IP Address',
          ...logs.map(l => 
            `${l.timestamp},${l.userEmail},${l.action},${l.resource || ''},${l.resourceId || ''},${l.ipAddress || ''}`
          )
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=audit_logs.csv');
        return res.send(csv);
      }

      res.json({ success: true, data: logs });
    } catch (error) {
      next(error);
    }
  },

  getLogStats: async (req, res, next) => {
    try {
      const { days = 7 } = req.query;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      const stats = await AuditLog.aggregate([
        { 
          $match: { 
            timestamp: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$action',
            count: { $sum: 1 }
          }
        }
      ]);

      const dailyStats = await AuditLog.aggregate([
        {
          $match: {
            timestamp: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      res.json({ success: true, data: { actionStats: stats, dailyStats } });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = auditLogController;