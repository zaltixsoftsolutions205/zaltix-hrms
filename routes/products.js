const express    = require('express');
const router     = express.Router();
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const ctrl       = require('../controllers/productController');

const crmAccess = roleCheck('admin', 'sales', 'hr');

// Products
router.get('/',          protect, crmAccess, ctrl.getProducts);
router.post('/',         protect, crmAccess, ctrl.createProduct);
router.put('/:id',       protect, crmAccess, ctrl.updateProduct);
router.delete('/:id',    protect, crmAccess, ctrl.deleteProduct);

// Prospects under a product
router.get('/:productId/prospects',              protect, crmAccess, ctrl.getProspects);
router.post('/:productId/prospects',             protect, crmAccess, ctrl.createProspect);
router.post('/:productId/prospects/bulk',        protect, crmAccess, ctrl.bulkCreateProspects);
router.put('/:productId/prospects/:prospectId',  protect, crmAccess, ctrl.updateProspect);
router.delete('/:productId/prospects/:prospectId', protect, crmAccess, ctrl.deleteProspect);
router.post('/:productId/prospects/:prospectId/convert-to-lead', protect, crmAccess, ctrl.convertToLead);

module.exports = router;
