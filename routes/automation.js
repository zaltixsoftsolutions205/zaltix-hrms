const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const {
  getDashboard,
  getEmployeeScores,
  getMyScore,
  runJob,
} = require('../controllers/automationController');

// All routes require login
router.use(protect);

// Employee: own productivity score
router.get('/my-score', getMyScore);

// HR + Admin: full dashboard
router.get('/dashboard', roleCheck('hr', 'admin'), getDashboard);
router.get('/scores/:employeeId', roleCheck('hr', 'admin'), getEmployeeScores);

// Admin only: run a job manually
router.post('/run/:job', roleCheck('admin'), runJob);

module.exports = router;
