const express = require('express');
const router = express.Router();
const { getClients, getClient, updateClient, deleteClient, getClientStats } = require('../controllers/clientController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');

router.use(protect);
// Clients are part of CRM — gate by the 'crm' module like leads/deals, not a
// role allowlist, so anyone granted CRM edit can work with clients
// regardless of their base role.
router.use(moduleAccess('crm', 'view'));
const crmEdit = moduleAccess('crm', 'edit');

// Static routes before :id
/**
 * @swagger
 * /api/clients/stats:
 *   get:
 *     summary: Get client stats
 *     tags:
 *       - Clients
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/stats', getClientStats);

/**
 * @swagger
 * /api/clients:
 *   get:
 *     summary: Get clients
 *     tags:
 *       - Clients
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', getClients);
/**
 * @swagger
 * /api/clients/{id}:
 *   get:
 *     summary: Get client
 *     tags:
 *       - Clients
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
router.get('/:id', getClient);
/**
 * @swagger
 * /api/clients/{id}:
 *   put:
 *     summary: Update client
 *     tags:
 *       - Clients
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
router.put('/:id', crmEdit, updateClient);
/**
 * @swagger
 * /api/clients/{id}:
 *   delete:
 *     summary: Delete client
 *     tags:
 *       - Clients
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
router.delete('/:id', crmEdit, deleteClient);

module.exports = router;
