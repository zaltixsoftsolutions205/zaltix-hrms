const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const { attachCrmScope } = require('../services/crmScopeService');
const { validateIdParam, validateDeleteQuery } = require('../validator/globalTableValidator');
const {
  validateCreateField,
  validateUpdateField,
  validateListFields,
} = require('../validator/globalTableFieldValidator');
const controller = require('../controllers/globalTableFieldController');

router.use(protect);
// Loads the requester's product/Mandal territory (see crmScopeService).
router.use(attachCrmScope);

// Edit/view permission is decided per entity inside the service
// (canEditModule / canAccessModule for the table's entity module).
/**
 * @swagger
 * /api/global-table-fields:
 *   post:
 *     summary: Create field
 *     tags:
 *       - Global Table Fields
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
router.post('/', validateCreateField, controller.createField);
/**
 * @swagger
 * /api/global-table-fields:
 *   get:
 *     summary: Get fields
 *     tags:
 *       - Global Table Fields
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', validateListFields, controller.getFields);
/**
 * @swagger
 * /api/global-table-fields/{id}:
 *   get:
 *     summary: Get field by id
 *     tags:
 *       - Global Table Fields
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
router.get('/:id', validateIdParam, controller.getFieldById);
/**
 * @swagger
 * /api/global-table-fields/{id}:
 *   put:
 *     summary: Update field
 *     tags:
 *       - Global Table Fields
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
router.put('/:id', validateIdParam, validateUpdateField, controller.updateField);
/**
 * @swagger
 * /api/global-table-fields/{id}:
 *   delete:
 *     summary: Delete field
 *     tags:
 *       - Global Table Fields
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
router.delete('/:id', validateIdParam, validateDeleteQuery, controller.deleteField);

module.exports = router;