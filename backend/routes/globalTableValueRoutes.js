const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const { attachCrmScope } = require('../services/crmScopeService');
const { validateIdParam } = require('../validator/globalTableValidator');
const {
  validateCreateValue,
  validateUpsertValue,
  validateUpdateValue,
  validateListValues,
} = require('../validator/globalTableValueValidator');
const controller = require('../controllers/globalTableValueController');

router.use(protect);
// Loads the requester's product/Mandal territory (see crmScopeService).
router.use(attachCrmScope);

// Static routes MUST come before /:id
/**
 * @swagger
 * /api/global-table-values/upsert:
 *   put:
 *     summary: Upsert value
 *     tags:
 *       - Global Table Values
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
router.put('/upsert', validateUpsertValue, controller.upsertValue);

/**
 * @swagger
 * /api/global-table-values:
 *   post:
 *     summary: Create value
 *     tags:
 *       - Global Table Values
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
router.post('/', validateCreateValue, controller.createValue);
/**
 * @swagger
 * /api/global-table-values:
 *   get:
 *     summary: Get values
 *     tags:
 *       - Global Table Values
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', validateListValues, controller.getValues);
/**
 * @swagger
 * /api/global-table-values/{id}:
 *   get:
 *     summary: Get value by id
 *     tags:
 *       - Global Table Values
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
router.get('/:id', validateIdParam, controller.getValueById);
/**
 * @swagger
 * /api/global-table-values/{id}:
 *   put:
 *     summary: Update value
 *     tags:
 *       - Global Table Values
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
router.put('/:id', validateIdParam, validateUpdateValue, controller.updateValue);
/**
 * @swagger
 * /api/global-table-values/{id}:
 *   delete:
 *     summary: Delete value
 *     tags:
 *       - Global Table Values
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
router.delete('/:id', validateIdParam, controller.deleteValue);

module.exports = router;