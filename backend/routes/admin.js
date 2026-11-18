const express = require('express');
const router = express.Router();
const {
  getLeavePolicies, createLeavePolicy, updateLeavePolicy,
  getAttendanceReport, getLeaveReport, getPayrollReport, getCrmReport, getDashboardStats,
  getProfitSummary,
} = require('../controllers/adminController');
const { createDepartment,getDepartments,getDepartment,updateDepartment,deleteDepartment} = require('../controllers/departmentController');
const { protect } = require('../middleware/auth');
const { roleCheck, moduleAccess } = require('../middleware/roleCheck');

router.use(protect);

// Reading department names is needed by anyone who can manage employees
// (the Add/Edit Employee department dropdown), so allow hr_employees view
// access here — BEFORE the admin/hr router guard below. Mutations stay admin.
/**
 * @swagger
 * /api/admin/departments:
 *   get:
 *     summary: Get departments
 *     tags:
 *       - Admin
 *     description: "Module access: hr_employees,view"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.get('/departments', moduleAccess('hr_employees', 'view'), getDepartments);

router.use(roleCheck('admin', 'hr'));

// Departments
/**
 * @swagger
 * /api/admin/departments:
 *   post:
 *     summary: Create department
 *     tags:
 *       - Admin
 *     description: "Requires role: admin"
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.post('/departments', roleCheck('admin'), createDepartment);
/**
 * @swagger
 * /api/admin/departments/{id}:
 *   put:
 *     summary: Update department
 *     tags:
 *       - Admin
 *     description: "Requires role: admin"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.put('/departments/:id', roleCheck('admin'), updateDepartment);
/**
 * @swagger
 * /api/admin/departments/{id}:
 *   delete:
 *     summary: Delete department
 *     tags:
 *       - Admin
 *     description: "Requires role: admin"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete('/departments/:id', roleCheck('admin'), deleteDepartment);

// Leave Policies (admin + hr)
/**
 * @swagger
 * /api/admin/leave-policies:
 *   get:
 *     summary: Get leave policies
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/leave-policies', getLeavePolicies);
/**
 * @swagger
 * /api/admin/leave-policies:
 *   post:
 *     summary: Create leave policy
 *     tags:
 *       - Admin
 *     description: "Requires role: admin,hr"
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.post('/leave-policies', roleCheck('admin', 'hr'), createLeavePolicy);
/**
 * @swagger
 * /api/admin/leave-policies/{id}:
 *   put:
 *     summary: Update leave policy
 *     tags:
 *       - Admin
 *     description: "Requires role: admin,hr"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.put('/leave-policies/:id', roleCheck('admin', 'hr'), updateLeavePolicy);

// Reports
/**
 * @swagger
 * /api/admin/reports/attendance:
 *   get:
 *     summary: Get attendance report
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/reports/attendance', getAttendanceReport);
/**
 * @swagger
 * /api/admin/reports/leave:
 *   get:
 *     summary: Get leave report
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/reports/leave', getLeaveReport);
/**
 * @swagger
 * /api/admin/reports/payroll:
 *   get:
 *     summary: Get payroll report
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/reports/payroll', getPayrollReport);
/**
 * @swagger
 * /api/admin/reports/crm:
 *   get:
 *     summary: Get crm report
 *     tags:
 *       - Admin
 *     description: "Requires role: admin"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.get('/reports/crm', roleCheck('admin'), getCrmReport);
/**
 * @swagger
 * /api/admin/dashboard-stats:
 *   get:
 *     summary: Get dashboard stats
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/dashboard-stats', getDashboardStats);
/**
 * @swagger
 * /api/admin/profit-summary:
 *   get:
 *     summary: Get profit summary
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/profit-summary', getProfitSummary);

module.exports = router;
