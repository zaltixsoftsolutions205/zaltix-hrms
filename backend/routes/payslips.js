const express = require('express');
const router = express.Router();
const { generatePayslip, getMyPayslips, getAllPayslips, downloadPayslip, deletePayslip } = require('../controllers/payslipController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');

const hrPayslipsView = moduleAccess('hr_payslips', 'view');
const hrPayslipsEdit = moduleAccess('hr_payslips', 'edit');

router.use(protect);

router.post('/', hrPayslipsEdit, generatePayslip);
router.get('/my', getMyPayslips);
router.get('/:id/download', downloadPayslip);
router.get('/', hrPayslipsView, getAllPayslips);
router.delete('/:id', hrPayslipsEdit, deletePayslip);

module.exports = router;
