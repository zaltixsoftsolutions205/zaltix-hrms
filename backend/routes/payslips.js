const express = require('express');
const router = express.Router();
const { generatePayslip, getMyPayslips,getEmployeePayslips, getAllPayslips, getPayslipById, updatePayslip, downloadPayslip, deletePayslip } = require('../controllers/payslipController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');

const hrPayslipsView = moduleAccess('hr_payslips', 'view');
const hrPayslipsEdit = moduleAccess('hr_payslips', 'edit');
const employeePayslipsView = moduleAccess('payslips', 'view');
// const employeePayslipsEdit = moduleAccess('payslips', 'edit');
const adminPayslipsView = moduleAccess('admin_payslips', 'view');

router.use(protect);

router.post('/', hrPayslipsEdit, generatePayslip);
router.get('/my', employeePayslipsView, getMyPayslips);
router.get('/my/:id/showall', employeePayslipsView, getEmployeePayslips);
router.get('/:id/download', employeePayslipsView, downloadPayslip);
router.get('/my/:id/show', employeePayslipsView, getPayslipById);
router.get('/', hrPayslipsView, getAllPayslips);
router.get('/admin', adminPayslipsView, getAllPayslips);
router.get('/:id', hrPayslipsView, getPayslipById);
router.put('/:id', hrPayslipsEdit, updatePayslip);
router.delete('/:id', hrPayslipsEdit, deletePayslip);

module.exports = router;
