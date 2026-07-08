const { checkHealth } = require('../utils/mailer');

module.exports = {
  getEmailHealth: async (req, res, next) => {
    try {
      const health = await checkHealth();
      res.json({ success: true, data: health });
    } catch (error) {
      next(error);
    }
  }
};
