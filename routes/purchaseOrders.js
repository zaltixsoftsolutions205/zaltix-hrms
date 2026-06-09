const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const ctrl = require('../controllers/purchaseOrderController');

router.use(protect);
router.use(roleCheck('sales', 'hr', 'admin'));

router.get('/',           ctrl.getPurchaseOrders);
router.get('/:id',        ctrl.getPurchaseOrder);
router.post('/',          ctrl.createPurchaseOrder);
router.put('/:id/status', ctrl.updateStatus);
router.delete('/:id',     ctrl.deletePurchaseOrder);

module.exports = router;
