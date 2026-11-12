const express = require('express');
const router = express.Router();
const { createDeal, getDeals, getDeal, updateDeal, closeDeal, getDealStats, getCommissionPreview } = require('../controllers/dealController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');

router.use(protect);
// Deals are part of CRM — gate by the 'crm' module like leads/clients, not a
// role allowlist, so anyone granted CRM edit can work with deals regardless
// of their base role.
router.use(moduleAccess('crm', 'view'));
const crmEdit = moduleAccess('crm', 'edit');

// Static routes before :id
/**
 * @swagger
 * /api/deals/stats:
 *   get:
 *     summary: Get deal stats
 *     tags:
 *       - Deals
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/stats', getDealStats);
/**
 * @swagger
 * /api/deals/commission-preview/{employeeId}:
 *   get:
 *     summary: Get commission preview
 *     tags:
 *       - Deals
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
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
router.get('/commission-preview/:employeeId', getCommissionPreview);

/**
 * @swagger
 * /api/deals:
 *   post:
 *     summary: Create deal
 *     tags:
 *       - Deals
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
router.post('/', crmEdit, createDeal);
/**
 * @swagger
 * /api/deals:
 *   get:
 *     summary: Get deals
 *     tags:
 *       - Deals
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', getDeals);
/**
 * @swagger
 * /api/deals/{id}:
 *   get:
 *     summary: Get deal
 *     tags:
 *       - Deals
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
router.get('/:id', getDeal);
/**
 * @swagger
 * /api/deals/{id}:
 *   put:
 *     summary: Update deal
 *     tags:
 *       - Deals
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
router.put('/:id', crmEdit, updateDeal);
/**
 * @swagger
 * /api/deals/{id}/close:
 *   put:
 *     summary: Close deal
 *     tags:
 *       - Deals
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
router.put('/:id/close', crmEdit, closeDeal);

module.exports = router;
