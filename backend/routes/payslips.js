const express = require('express');
const router = express.Router();
const { generatePayslip, getMyPayslips, getAllPayslips, downloadPayslip, deletePayslip } = require('../controllers/payslipController');
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

router.use(protect);

router.post('/', roleCheck('hr', 'admin'), generatePayslip);
router.get('/my', getMyPayslips);
router.get('/:id/download', downloadPayslip);
router.get('/', roleCheck('hr', 'admin'), getAllPayslips);
router.delete('/:id', roleCheck('hr', 'admin'), deletePayslip);

module.exports = router;
