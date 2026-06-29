const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');
const ctrl = require('../controllers/fieldLeadController');

router.use(protect);
// Field-sales access via the 'field_sales' module (admin bypasses; field_sales role keeps it by default).
router.use(moduleAccess('field_sales', 'view'));

router.get('/stats',          ctrl.getStats);
router.get('/',               ctrl.getFieldLeads);
router.post('/',              ctrl.createFieldLead);
router.put('/:id/stage',      ctrl.updateStage);
router.post('/:id/activity',  ctrl.addActivity);
router.put('/:id',            ctrl.updateFieldLead);
router.delete('/:id',         ctrl.deleteFieldLead);

module.exports = router;
