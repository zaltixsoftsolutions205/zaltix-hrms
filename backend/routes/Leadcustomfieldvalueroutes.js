const express = require('express');
// mergeParams: true lets this router read :leadId from wherever it's mounted
// (see the app.js mount line in the README below).
const router = express.Router({ mergeParams: true });

// ASSUMPTION — same auth middleware as leadCustomFieldRoutes.js.
const { protect } = require('../middleware/auth');

const { getLeadCustomFieldValues, getLeadCustomFieldValue, upsertLeadCustomFieldValue, deleteLeadCustomFieldValue, } = require('../controllers/Leadcustomfieldvaluecontroller');

router.use(protect);

/**
 * @swagger
 * /api/leads/{leadId}/custom-fields:
 *   get:
 *     summary: Get lead custom field values
 *     tags:
 *       - Lead Custom Field Values
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: leadId
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
router.get('/', getLeadCustomFieldValues);
/**
 * @swagger
 * /api/leads/{leadId}/custom-fields/{fieldId}:
 *   get:
 *     summary: Get lead custom field value
 *     tags:
 *       - Lead Custom Field Values
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: leadId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: fieldId
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
router.get('/:fieldId', getLeadCustomFieldValue);
/**
 * @swagger
 * /api/leads/{leadId}/custom-fields/{fieldId}:
 *   put:
 *     summary: Upsert lead custom field value
 *     tags:
 *       - Lead Custom Field Values
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: leadId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: fieldId
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
router.put('/:fieldId', upsertLeadCustomFieldValue);
/**
 * @swagger
 * /api/leads/{leadId}/custom-fields/{fieldId}:
 *   delete:
 *     summary: Delete lead custom field value
 *     tags:
 *       - Lead Custom Field Values
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: leadId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: fieldId
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
router.delete('/:fieldId', deleteLeadCustomFieldValue);

module.exports = router;