const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const ctrl = require('../controllers/quotationController');

router.use(protect);
router.use(roleCheck('sales', 'hr', 'admin'));

router.get('/',          ctrl.getQuotations);
router.get('/:id',       ctrl.getQuotation);
router.post('/',         ctrl.createQuotation);
router.put('/:id/status', ctrl.updateStatus);
router.post('/:id/convert-to-po', ctrl.convertToPO);
router.get('/:id/pdf',   ctrl.downloadPDF);
router.delete('/:id',    ctrl.deleteQuotation);

module.exports = router;
