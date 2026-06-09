const express = require('express');
const router = express.Router();
const { createDeal, getDeals, getDeal, updateDeal, closeDeal, getDealStats, getCommissionPreview } = require('../controllers/dealController');
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

router.use(protect);
router.use(roleCheck('sales', 'hr', 'admin'));

// Static routes before :id
router.get('/stats', getDealStats);
router.get('/commission-preview/:employeeId', getCommissionPreview);

router.post('/', createDeal);
router.get('/', getDeals);
router.get('/:id', getDeal);
router.put('/:id', updateDeal);
router.put('/:id/close', closeDeal);

module.exports = router;
