const express    = require('express');
const router     = express.Router();
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const ctrl       = require('../controllers/productController');
const locCtrl    = require('../controllers/productLocationController');

const crmAccess = roleCheck('admin', 'sales', 'hr');

// Products
router.get('/',          protect, crmAccess, ctrl.getProducts);
router.post('/',         protect, crmAccess, ctrl.createProduct);
router.put('/:id',       protect, crmAccess, ctrl.updateProduct);
router.delete('/:id',    protect, crmAccess, ctrl.deleteProduct);

// Locations under a product — a tree, nested to any depth via `parent`
router.get('/:productId/locations',                  protect, crmAccess, locCtrl.getChildren);
router.post('/:productId/locations',                 protect, crmAccess, locCtrl.createLocation);
router.post('/:productId/locations/bulk-move',        protect, crmAccess, locCtrl.bulkSetLocation);
router.put('/:productId/locations/:locationId',       protect, crmAccess, locCtrl.renameLocation);
router.delete('/:productId/locations/:locationId',    protect, crmAccess, locCtrl.deleteLocation);

// Prospects under a product
router.get('/:productId/prospects',              protect, crmAccess, ctrl.getProspects);
router.post('/:productId/prospects',             protect, crmAccess, ctrl.createProspect);
router.post('/:productId/prospects/bulk',        protect, crmAccess, ctrl.bulkCreateProspects);
router.put('/:productId/prospects/:prospectId',  protect, crmAccess, ctrl.updateProspect);
router.delete('/:productId/prospects/:prospectId', protect, crmAccess, ctrl.deleteProspect);
router.post('/:productId/prospects/:prospectId/convert-to-lead', protect, crmAccess, ctrl.convertToLead);

module.exports = router;
