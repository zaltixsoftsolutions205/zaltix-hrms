const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const { attachCrmScope } = require('../services/crmScopeService');
const { roleCheck } = require('../middleware/roleCheck');
const {
  validateCreateTable,
  validateUpdateTable,
  validateListTables,
  validateIdParam,
  validateDeleteQuery,
} = require('../validator/globalTableValidator');
const {
  validateRecordParams,
  validateListRecords,
  validateCreateRecord,
  validateUpdateRecord,
} = require('../validator/globalTableValueValidator');
const controller = require('../controllers/globalTableController');

router.use(protect);
// Loads the requester's product/Mandal territory (see crmScopeService).
router.use(attachCrmScope);

// Table definitions are schema-level: admin only for writes.
// Reads are filtered by module access inside the service.
/**
 * @swagger
 * /api/global-tables:
 *   post:
 *     summary: Create table
 *     tags:
 *       - Global Tables
 *     description: "Requires role: admin"
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
 *       403:
 *         description: Forbidden
 */
router.post('/', roleCheck('admin'), validateCreateTable, controller.createTable);
/**
 * @swagger
 * /api/global-tables:
 *   get:
 *     summary: Get tables
 *     tags:
 *       - Global Tables
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', validateListTables, controller.getTables);

// Records: native entity rows + custom values. Permission (module access,
// record ownership, adapter capability) is enforced in the service/adapter.
/**
 * @swagger
 * /api/global-tables/{id}/records:
 *   get:
 *     summary: List records
 *     tags:
 *       - Global Tables
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
router.get('/:id/records', validateListRecords, controller.listRecords);
/**
 * @swagger
 * /api/global-tables/{id}/records:
 *   post:
 *     summary: Create record
 *     tags:
 *       - Global Tables
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
router.post('/:id/records', validateCreateRecord, controller.createRecord);
/**
 * @swagger
 * /api/global-tables/{id}/records/bulk-delete:
 *   post:
 *     summary: Delete records
 *     tags:
 *       - Global Tables
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
router.post('/:id/records/bulk-delete', validateIdParam, controller.deleteRecords);
/**
 * @swagger
 * /api/global-tables/{id}/records/{recordId}:
 *   get:
 *     summary: Get record by id
 *     tags:
 *       - Global Tables
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: recordId
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
router.get('/:id/records/:recordId', validateRecordParams, controller.getRecordById);
/**
 * @swagger
 * /api/global-tables/{id}/records/{recordId}:
 *   put:
 *     summary: Update record
 *     tags:
 *       - Global Tables
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: recordId
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
router.put('/:id/records/:recordId', validateUpdateRecord, controller.updateRecord);
/**
 * @swagger
 * /api/global-tables/{id}/records/{recordId}:
 *   delete:
 *     summary: Delete record
 *     tags:
 *       - Global Tables
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: recordId
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
router.delete('/:id/records/:recordId', validateRecordParams, controller.deleteRecord);

// Excel template / import / export (Mandal tables; access checked in the service)
/**
 * @swagger
 * /api/global-tables/{id}/import-spec:
 *   get:
 *     summary: Get import spec
 *     tags:
 *       - Global Tables
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
router.get('/:id/import-spec', validateIdParam, controller.getImportSpec);
/**
 * @swagger
 * /api/global-tables/{id}/export:
 *   get:
 *     summary: Export records
 *     tags:
 *       - Global Tables
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
router.get('/:id/export', validateIdParam, controller.exportRecords);
/**
 * @swagger
 * /api/global-tables/{id}/import:
 *   post:
 *     summary: Import records
 *     tags:
 *       - Global Tables
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
router.post('/:id/import', validateIdParam, controller.importRecords);

/**
 * @swagger
 * /api/global-tables/{id}:
 *   get:
 *     summary: Get table by id
 *     tags:
 *       - Global Tables
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
router.get('/:id', validateIdParam, controller.getTableById);
/**
 * @swagger
 * /api/global-tables/{id}:
 *   put:
 *     summary: Update table
 *     tags:
 *       - Global Tables
 *     description: "Requires role: admin"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.put('/:id', roleCheck('admin'), validateIdParam, validateUpdateTable, controller.updateTable);
/**
 * @swagger
 * /api/global-tables/{id}:
 *   delete:
 *     summary: Delete table
 *     tags:
 *       - Global Tables
 *     description: "Requires role: admin"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete('/:id', roleCheck('admin'), validateIdParam, validateDeleteQuery, controller.deleteTable);

module.exports = router;