const express    = require('express');
const router     = express.Router();
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');
const ctrl       = require('../controllers/productController');
const locCtrl    = require('../controllers/productLocationController');
const catCtrl    = require('../controllers/productCategoryController');

router.use(protect);
// CRM access via the 'crm' module (admin bypasses; sales/hr keep it by role
// default; anyone else needs it granted per-employee). view = read-only;
// edit = required for any create/update/delete.
router.use(moduleAccess('crm', 'view'));
const crmEdit = moduleAccess('crm', 'edit');

// Products
router.get('/',          ctrl.getProducts);
router.post('/',         crmEdit, ctrl.createProduct);
router.put('/:id',       crmEdit, ctrl.updateProduct);
router.delete('/:id',    crmEdit, ctrl.deleteProduct);

// Locations under a product — a tree, nested to any depth via `parent`
router.get('/:productId/locations/all-flat',          locCtrl.getAllLocationsFlat);
router.get('/:productId/locations',                  locCtrl.getChildren);
router.post('/:productId/locations',                 crmEdit, locCtrl.createLocation);
router.post('/:productId/locations/bulk-move',        crmEdit, locCtrl.bulkSetLocation);
router.put('/:productId/locations/:locationId',       crmEdit, locCtrl.renameLocation);
router.delete('/:productId/locations/:locationId',    crmEdit, locCtrl.deleteLocation);

// Category rows — 'schools'-type products only; a category node's data
router.get('/:productId/categories/all-rows',                    catCtrl.getAllRows);
router.get('/:productId/categories/:categoryId/rows',            catCtrl.getRows);
router.post('/:productId/categories/:categoryId/rows/upload',    crmEdit, catCtrl.uploadRows);
router.post('/:productId/categories/:categoryId/rows',           crmEdit, catCtrl.addRow);
router.put('/:productId/categories/:categoryId/rows/:rowId',     crmEdit, catCtrl.updateRow);
router.delete('/:productId/categories/:categoryId/rows/:rowId',  crmEdit, catCtrl.deleteRow);
router.post('/:productId/categories/:categoryId/fields',         crmEdit, catCtrl.addField);

// Prospects under a product
router.get('/:productId/prospects',              ctrl.getProspects);
router.post('/:productId/prospects',             crmEdit, ctrl.createProspect);
router.post('/:productId/prospects/bulk',        crmEdit, ctrl.bulkCreateProspects);
router.put('/:productId/prospects/:prospectId',  crmEdit, ctrl.updateProspect);
router.delete('/:productId/prospects/:prospectId', crmEdit, ctrl.deleteProspect);
router.post('/:productId/prospects/:prospectId/convert-to-lead', crmEdit, ctrl.convertToLead);

module.exports = router;
