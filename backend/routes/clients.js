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
router.get('/stats', getClientStats);

router.get('/', getClients);
router.get('/:id', getClient);
router.put('/:id', crmEdit, updateClient);
router.delete('/:id', crmEdit, deleteClient);

module.exports = router;
