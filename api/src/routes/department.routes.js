const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const auth = require('../middlewares/authMiddleware');
const { roleMiddleware } = require('../middlewares/roleMiddleware');

router.use(auth);

router.get('/', departmentController.getAllDepartments);
router.get('/:id', departmentController.getDepartmentById);

router.post('/', roleMiddleware('admin'), departmentController.createDepartment);
router.put('/:id', roleMiddleware('admin'), departmentController.updateDepartment);
router.delete('/:id', roleMiddleware('admin'), departmentController.deleteDepartment);

module.exports = router;
