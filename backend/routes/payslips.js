const express = require('express');
const router = express.Router();
const { generatePayslip, getMyPayslips,getEmployeePayslips, getAllPayslips, getPayslipById, updatePayslip, downloadPayslip, deletePayslip, previewPayslip } = require('../controllers/payslipController');
const { getEmployeesForPayslips } = require('../controllers/employeeController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');

const hrPayslipsView = moduleAccess('hr_payslips', 'view');
const hrPayslipsEdit = moduleAccess('hr_payslips', 'edit');
const employeePayslipsView = moduleAccess('payslips', 'view');
// const employeePayslipsEdit = moduleAccess('payslips', 'edit');
const adminPayslipsView = moduleAccess('admin_payslips', 'view');

router.use(protect);

/**
 * @swagger
 * /api/payslips:
 *   post:
 *     summary: Generate payslip
 *     tags:
 *       - Payslips
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
 */
router.post('/', hrPayslipsEdit, generatePayslip);
/**
 * @swagger
 * /api/payslips/my:
 *   get:
 *     summary: Get my payslips
 *     tags:
 *       - Payslips
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/my', employeePayslipsView, getMyPayslips);
/**
 * @swagger
 * /api/payslips/my/{id}/showall:
 *   get:
 *     summary: Get employee payslips
 *     tags:
 *       - Payslips
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
 *       404:
 *         description: Not found
 */
router.get('/my/:id/showall', employeePayslipsView, getEmployeePayslips);
/**
 * @swagger
 * /api/payslips/{id}/download:
 *   get:
 *     summary: Download payslip
 *     tags:
 *       - Payslips
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
 *       404:
 *         description: Not found
 */
router.get('/:id/download', employeePayslipsView, downloadPayslip);
/**
 * @swagger
 * /api/payslips/my/{id}/show:
 *   get:
 *     summary: Get payslip by id
 *     tags:
 *       - Payslips
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
 *       404:
 *         description: Not found
 */
router.get('/my/:id/show', employeePayslipsView, getPayslipById);
// Lean employee list for the generator — gated by hr_payslips, so this page
// no longer depends on hr_employees access.
/**
 * @swagger
 * /api/payslips/employees:
 *   get:
 *     summary: Get employees for payslips
 *     tags:
 *       - Payslips
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/employees', hrPayslipsView, getEmployeesForPayslips);
// HR preview: anyone with hr_payslips (view or edit) can preview any payslip.
/**
 * @swagger
 * /api/payslips/{id}/preview:
 *   get:
 *     summary: Preview payslip
 *     tags:
 *       - Payslips
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
 *       404:
 *         description: Not found
 */
router.get('/:id/preview', hrPayslipsView, previewPayslip);
/**
 * @swagger
 * /api/payslips:
 *   get:
 *     summary: Get all payslips
 *     tags:
 *       - Payslips
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', hrPayslipsView, getAllPayslips);
/**
 * @swagger
 * /api/payslips/admin:
 *   get:
 *     summary: Get all payslips
 *     tags:
 *       - Payslips
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/admin', adminPayslipsView, getAllPayslips);
/**
 * @swagger
 * /api/payslips/{id}:
 *   get:
 *     summary: Get payslip by id
 *     tags:
 *       - Payslips
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
 *       404:
 *         description: Not found
 */
router.get('/:id', hrPayslipsView, getPayslipById);
/**
 * @swagger
 * /api/payslips/{id}:
 *   put:
 *     summary: Update payslip
 *     tags:
 *       - Payslips
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
 *       404:
 *         description: Not found
 */
router.put('/:id', hrPayslipsEdit, updatePayslip);
/**
 * @swagger
 * /api/payslips/{id}:
 *   delete:
 *     summary: Delete payslip
 *     tags:
 *       - Payslips
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
 *       404:
 *         description: Not found
 */
router.delete('/:id', hrPayslipsEdit, deletePayslip);

module.exports = router;
