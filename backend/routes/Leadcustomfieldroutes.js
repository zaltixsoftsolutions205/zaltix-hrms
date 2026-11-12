const express = require('express');
const router = express.Router();

// ASSUMPTION — adjust these two import paths/names to match your project:
// `protect`   = your existing JWT auth middleware that sets req.user.
// `roleCheck` = the middleware exported from middleware/roleCheck.js (provided).
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const {
  createLeadCustomField,
  getLeadCustomFields,
  getLeadCustomFieldById,
  updateLeadCustomField,
  deleteLeadCustomField,
  reorderLeadCustomFields,
} = require('../controllers/Leadcustomfieldcontroller');

router.use(protect);

// Everyone who can see Leads can see the column definitions.
/**
 * @swagger
 * /api/lead-custom-fields:
 *   get:
 *     summary: Get lead custom fields
 *     tags:
 *       - Lead Custom Fields
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', getLeadCustomFields);
/**
 * @swagger
 * /api/lead-custom-fields/{id}:
 *   get:
 *     summary: Get lead custom field by id
 *     tags:
 *       - Lead Custom Fields
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
router.get('/:id', getLeadCustomFieldById);

// Defining/reordering/removing columns is a structural change to the Lead
// table — restricted to manager/admin. Adjust roles to taste.
/**
 * @swagger
 * /api/lead-custom-fields:
 *   post:
 *     summary: Create lead custom field
 *     tags:
 *       - Lead Custom Fields
 *     description: "Requires role: manager,admin"
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
router.post('/', roleCheck('manager', 'admin'), createLeadCustomField);
/**
 * @swagger
 * /api/lead-custom-fields/reorder:
 *   patch:
 *     summary: Reorder lead custom fields
 *     tags:
 *       - Lead Custom Fields
 *     description: "Requires role: manager,admin"
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
router.patch('/reorder', roleCheck('manager', 'admin'), reorderLeadCustomFields);
/**
 * @swagger
 * /api/lead-custom-fields/{id}:
 *   patch:
 *     summary: Update lead custom field
 *     tags:
 *       - Lead Custom Fields
 *     description: "Requires role: manager,admin"
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
router.patch('/:id', roleCheck('manager', 'admin'), updateLeadCustomField);
/**
 * @swagger
 * /api/lead-custom-fields/{id}:
 *   delete:
 *     summary: Delete lead custom field
 *     tags:
 *       - Lead Custom Fields
 *     description: "Requires role: manager,admin"
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
router.delete('/:id', roleCheck('manager', 'admin'), deleteLeadCustomField);

module.exports = router;