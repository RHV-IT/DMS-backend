const express = require('express');
const router = express.Router();

// Public endpoint - no auth required
router.get('/confidentiality-levels', (req, res) => {
  res.json({
    success: true,
    data: {
      levels: [
        'public',
        'internal',
        'confidential',
        'highly_confidential'
      ],
      descriptions: {
        public: 'Accessible to everyone',
        internal: 'Internal company use only',
        confidential: 'Sensitive information - restricted access',
        highly_confidential: 'Extremely sensitive - very limited access'
      }
    }
  });
});

module.exports = router;