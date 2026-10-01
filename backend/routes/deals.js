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
router.get('/stats', getDealStats);
router.get('/commission-preview/:employeeId', getCommissionPreview);

router.post('/', crmEdit, createDeal);
router.get('/', getDeals);
router.get('/:id', getDeal);
router.put('/:id', crmEdit, updateDeal);
router.put('/:id/close', crmEdit, closeDeal);

module.exports = router;
