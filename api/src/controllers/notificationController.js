const Notification = require('../models/Notification');

const notificationController = {
  getNotifications: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, unreadOnly } = req.query;
      
      const query = { userId: req.user._id };
      if (unreadOnly === 'true') {
        query.isRead = false;
      }

      const notifications = await Notification.find(query)
        .populate('sharedBy', 'name email')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const unreadCount = await Notification.countDocuments({ 
        userId: req.user._id, 
        isRead: false 
      });

      res.json({
        success: true,
        data: {
          notifications,
          unreadCount,
          currentPage: parseInt(page)
        }
      });
    } catch (error) {
      next(error);
    }
  },

  markAsRead: async (req, res, next) => {
    try {
      const { notificationId } = req.params;
      
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId: req.user._id },
        { isRead: true, readAt: new Date() },
        { new: true }
      );

      if (!notification) {
        return res.status(404).json({ success: false, message: 'Notification not found' });
      }

      res.json({ success: true, data: notification });
    } catch (error) {
      next(error);
    }
  },

  markAllAsRead: async (req, res, next) => {
    try {
      await Notification.updateMany(
        { userId: req.user._id, isRead: false },
        { isRead: true, readAt: new Date() }
      );

      res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
      next(error);
    }
  },

  deleteNotification: async (req, res, next) => {
    try {
      const { notificationId } = req.params;
      
      await Notification.findOneAndDelete({ 
        _id: notificationId, 
        userId: req.user._id 
      });

      res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = notificationController;