const express    = require('express');
const router     = express.Router();
const { protect } = require('../middleware/auth');
const { moduleAccess, roleCheck } = require('../middleware/roleCheck');
const { TREE_MANAGER_ROLES } = require('../services/crmScopeService');
const ctrl       = require('../controllers/productController');
const locCtrl    = require('../controllers/productLocationController');
const catCtrl    = require('../controllers/productCategoryController');
const globalTableCtrl = require('../controllers/globalTableController');
const { validateCreateTable, validateUpdateTable, validateScopedTableParams } = require('../validator/globalTableValidator');

router.use(protect);
// CRM access via the 'crm' module (admin bypasses; sales/hr keep it by role
// default; anyone else needs it granted per-employee). view = read-only;
// edit = required for any create/update/delete. Reading also works with the
// Leads page module ('lead'): its tables show the Product column.
router.use(moduleAccess(['crm', 'lead'], 'view'));
const crmEdit = moduleAccess('crm', 'edit');

// Products (the list is shared: lead screens show product names)
/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get products
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/',          ctrl.getProducts);

// Everything else is the product -> location -> table tree, which only
// admin / hr / manager may browse or change. Sales roles reach their part of
// it through GET /api/leads/territory.
router.use(roleCheck(...TREE_MANAGER_ROLES));
/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create product
 *     tags:
 *       - Products
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
router.post('/',         crmEdit, ctrl.createProduct);
/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Update product
 *     tags:
 *       - Products
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
router.put('/:id',       crmEdit, ctrl.updateProduct);
/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Delete product
 *     tags:
 *       - Products
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
router.delete('/:id',    crmEdit, ctrl.deleteProduct);

// Locations under a product — a tree, nested to any depth via `parent`
/**
 * @swagger
 * /api/products/{productId}/locations:
 *   get:
 *     summary: Get children
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
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
router.get('/:productId/locations',                  locCtrl.getChildren);
/**
 * @swagger
 * /api/products/{productId}/locations:
 *   post:
 *     summary: Create location
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
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
router.post('/:productId/locations',                 crmEdit, locCtrl.createLocation);
/**
 * @swagger
 * /api/products/{productId}/locations/bulk-move:
 *   post:
 *     summary: Bulk set location
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
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
router.post('/:productId/locations/bulk-move',        crmEdit, locCtrl.bulkSetLocation);
/**
 * @swagger
 * /api/products/{productId}/locations/{locationId}:
 *   put:
 *     summary: Rename location
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: locationId
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
router.put('/:productId/locations/:locationId',       crmEdit, locCtrl.renameLocation);
/**
 * @swagger
 * /api/products/{productId}/locations/{locationId}:
 *   delete:
 *     summary: Delete location
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: locationId
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
router.delete('/:productId/locations/:locationId',    crmEdit, locCtrl.deleteLocation);
/**
 * @swagger
 * /api/products/{productId}/locations/{locationId}/tables:
 *   post:
 *     summary: Create product location table
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: locationId
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
router.post('/:productId/locations/:locationId/tables', crmEdit, validateCreateTable, globalTableCtrl.createProductLocationTable);
/**
 * @swagger
 * /api/products/{productId}/locations/{locationId}/tables/{tableId}:
 *   put:
 *     summary: Update product location table
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: tableId
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
router.put('/:productId/locations/:locationId/tables/:tableId', crmEdit, validateScopedTableParams, validateUpdateTable, globalTableCtrl.updateProductLocationTable);
/**
 * @swagger
 * /api/products/{productId}/locations/{locationId}/tables/{tableId}:
 *   delete:
 *     summary: Deactivate product location table
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: tableId
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
router.delete('/:productId/locations/:locationId/tables/:tableId', crmEdit, validateScopedTableParams, globalTableCtrl.deactivateProductLocationTable);
/**
 * @swagger
 * /api/products/{productId}/locations/{locationId}/tables/{tableId}/reactivate:
 *   patch:
 *     summary: Reactivate product location table
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: tableId
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
router.patch('/:productId/locations/:locationId/tables/:tableId/reactivate', crmEdit, validateScopedTableParams, globalTableCtrl.reactivateProductLocationTable);
/**
 * @swagger
 * /api/products/{productId}/locations/{locationId}/tables/{tableId}/permanent:
 *   delete:
 *     summary: Delete product location table permanently
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: tableId
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
router.delete('/:productId/locations/:locationId/tables/:tableId/permanent', crmEdit, validateScopedTableParams, globalTableCtrl.deleteProductLocationTablePermanently);
/**
 * @swagger
 * /api/products/{productId}/locations/{locationId}/tables/{tableId}/move-preview:
 *   get:
 *     summary: Preview product location table move
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: tableId
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
router.get('/:productId/locations/:locationId/tables/:tableId/move-preview', crmEdit, validateScopedTableParams, globalTableCtrl.previewProductLocationTableMove);
/**
 * @swagger
 * /api/products/{productId}/locations/{locationId}/tables/{tableId}/move:
 *   post:
 *     summary: Move product location table
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: tableId
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
router.post('/:productId/locations/:locationId/tables/:tableId/move', crmEdit, validateScopedTableParams, globalTableCtrl.moveProductLocationTable);

// Category rows — 'schools'-type products only; a category node's data
/**
 * @swagger
 * /api/products/{productId}/categories/all-rows:
 *   get:
 *     summary: Get all rows
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
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
router.get('/:productId/categories/all-rows',                    catCtrl.getAllRows);
/**
 * @swagger
 * /api/products/{productId}/categories/{categoryId}/rows:
 *   get:
 *     summary: Get rows
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: categoryId
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
router.get('/:productId/categories/:categoryId/rows',            catCtrl.getRows);
/**
 * @swagger
 * /api/products/{productId}/categories/{categoryId}/rows/upload:
 *   post:
 *     summary: Upload rows
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
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
router.post('/:productId/categories/:categoryId/rows/upload',    crmEdit, catCtrl.uploadRows);
/**
 * @swagger
 * /api/products/{productId}/categories/{categoryId}/rows:
 *   post:
 *     summary: Add row
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: categoryId
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
router.post('/:productId/categories/:categoryId/rows',           crmEdit, catCtrl.addRow);
/**
 * @swagger
 * /api/products/{productId}/categories/{categoryId}/rows/{rowId}:
 *   put:
 *     summary: Update row
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: rowId
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
router.put('/:productId/categories/:categoryId/rows/:rowId',     crmEdit, catCtrl.updateRow);
/**
 * @swagger
 * /api/products/{productId}/categories/{categoryId}/rows/{rowId}:
 *   delete:
 *     summary: Delete row
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: rowId
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
router.delete('/:productId/categories/:categoryId/rows/:rowId',  crmEdit, catCtrl.deleteRow);
/**
 * @swagger
 * /api/products/{productId}/categories/{categoryId}/fields:
 *   post:
 *     summary: Add field
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: categoryId
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
router.post('/:productId/categories/:categoryId/fields',         crmEdit, catCtrl.addField);
/**
 * @swagger
 * /api/products/{productId}/categories/{categoryId}/fields/{fieldName}:
 *   delete:
 *     summary: Delete field
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: fieldName
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
router.delete('/:productId/categories/:categoryId/fields/:fieldName', crmEdit, catCtrl.deleteField);

// Prospects under a product
/**
 * @swagger
 * /api/products/{productId}/prospects:
 *   get:
 *     summary: Get prospects
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
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
router.get('/:productId/prospects',              ctrl.getProspects);
/**
 * @swagger
 * /api/products/{productId}/prospects:
 *   post:
 *     summary: Create prospect
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
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
router.post('/:productId/prospects',             crmEdit, ctrl.createProspect);
/**
 * @swagger
 * /api/products/{productId}/prospects/bulk:
 *   post:
 *     summary: Bulk create prospects
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
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
router.post('/:productId/prospects/bulk',        crmEdit, ctrl.bulkCreateProspects);
/**
 * @swagger
 * /api/products/{productId}/prospects/{prospectId}:
 *   put:
 *     summary: Update prospect
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: prospectId
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
router.put('/:productId/prospects/:prospectId',  crmEdit, ctrl.updateProspect);
/**
 * @swagger
 * /api/products/{productId}/prospects/{prospectId}:
 *   delete:
 *     summary: Delete prospect
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: prospectId
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
router.delete('/:productId/prospects/:prospectId', crmEdit, ctrl.deleteProspect);
/**
 * @swagger
 * /api/products/{productId}/prospects/{prospectId}/convert-to-lead:
 *   post:
 *     summary: Convert to lead
 *     tags:
 *       - Products
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: prospectId
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
router.post('/:productId/prospects/:prospectId/convert-to-lead', crmEdit, ctrl.convertToLead);

module.exports = router;
