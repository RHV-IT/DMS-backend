const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const auth = require('../middlewares/authMiddleware');
const { roleMiddleware } = require('../middlewares/roleMiddleware');

router.use(auth);
router.use(roleMiddleware('admin'));

// =====================
// DEPARTMENT Routes
// =====================

router.post('/departments', settingsController.createDepartment);

router.get('/departments', settingsController.getDepartments);

router.get('/departments/:id', settingsController.getDepartmentById);

router.put('/departments/:id', settingsController.updateDepartment);

router.delete('/departments/:id', settingsController.deleteDepartment);

// =====================
// CONFIDENTIALITY LEVEL Routes
// =====================

router.post('/confidentiality-levels', settingsController.createConfidentialityLevel);

router.get('/confidentiality-levels', settingsController.getConfidentialityLevels);

router.get('/confidentiality-levels/:id', settingsController.getConfidentialityLevelById);

router.put('/confidentiality-levels/:id', settingsController.updateConfidentialityLevel);

router.delete('/confidentiality-levels/:id', settingsController.deleteConfidentialityLevel);

// =====================
// INITIALIZE
// =====================

router.post('/initialize', settingsController.initializeDefaults);

module.exports = router;