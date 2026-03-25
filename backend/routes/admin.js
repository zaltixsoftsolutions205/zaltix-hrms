const express = require('express');
const router = express.Router();
const {
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getLeavePolicies, createLeavePolicy, updateLeavePolicy,
  getAttendanceReport, getLeaveReport, getPayrollReport, getCrmReport, getDashboardStats,
  getProfitSummary,
} = require('../controllers/adminController');
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

router.use(protect);
router.use(roleCheck('admin', 'hr'));

// Departments
router.get('/departments', getDepartments);
router.post('/departments', roleCheck('admin'), createDepartment);
router.put('/departments/:id', roleCheck('admin'), updateDepartment);
router.delete('/departments/:id', roleCheck('admin'), deleteDepartment);

// Leave Policies (admin + hr)
router.get('/leave-policies', getLeavePolicies);
router.post('/leave-policies', roleCheck('admin', 'hr'), createLeavePolicy);
router.put('/leave-policies/:id', roleCheck('admin', 'hr'), updateLeavePolicy);

// Reports
router.get('/reports/attendance', getAttendanceReport);
router.get('/reports/leave', getLeaveReport);
router.get('/reports/payroll', getPayrollReport);
router.get('/reports/crm', roleCheck('admin'), getCrmReport);
router.get('/dashboard-stats', getDashboardStats);
router.get('/profit-summary', getProfitSummary);

module.exports = router;
