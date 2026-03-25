const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const ctrl = require('../controllers/fieldLeadController');

router.use(protect);
router.use(roleCheck('field_sales', 'admin'));

router.get('/stats',          ctrl.getStats);
router.get('/',               ctrl.getFieldLeads);
router.post('/',              ctrl.createFieldLead);
router.put('/:id/stage',      ctrl.updateStage);
router.post('/:id/activity',  ctrl.addActivity);
router.put('/:id',            ctrl.updateFieldLead);
router.delete('/:id',         ctrl.deleteFieldLead);

module.exports = router;
