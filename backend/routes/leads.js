const express = require('express');
const router = express.Router();
const { createLead, getLeads, getLead, updateLeadStatus, addActivity, updateLead, deleteLead, getPipeline, updatePipelineStage, getActivities, getOverdueAlerts } = require('../controllers/leadController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');

router.use(protect);
// CRM access via the 'crm' module (admin bypasses; sales/hr keep it by role default).
router.use(moduleAccess('crm', 'view'));

// Static routes MUST come before /:id
router.get('/pipeline/board', getPipeline);
router.get('/activities/all', getActivities);
router.get('/alerts/overdue', getOverdueAlerts);

router.post('/', createLead);
router.get('/', getLeads);
router.get('/:id', getLead);
router.put('/:id', updateLead);
router.put('/:id/status', updateLeadStatus);
router.put('/:id/pipeline-stage', updatePipelineStage);
router.post('/:id/activity', addActivity);
router.delete('/:id', deleteLead);

module.exports = router;
