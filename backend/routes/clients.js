const express = require('express');
const router = express.Router();
const { getClients, getClient, updateClient, deleteClient, getClientStats } = require('../controllers/clientController');
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

router.use(protect);
router.use(roleCheck('sales', 'hr', 'admin'));

// Static routes before :id
router.get('/stats', getClientStats);

router.get('/', getClients);
router.get('/:id', getClient);
router.put('/:id', updateClient);
router.delete('/:id', roleCheck('hr', 'admin'), deleteClient);

module.exports = router;
