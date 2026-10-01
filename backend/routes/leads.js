const express = require('express');
const router = express.Router();
const { createLead, getLeads, getLead, updateLeadStatus, addActivity, updateLead, deleteLead, getPipeline, updatePipelineStage, getActivities, getOverdueAlerts } = require('../controllers/leadController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');

router.use(protect);
// CRM access via the 'crm' module (admin bypasses; sales/hr keep it by role
// default). view = read-only; edit = required for any create/update/delete.
router.use(moduleAccess('crm', 'view'));
const crmEdit = moduleAccess('crm', 'edit');

// Static routes MUST come before /:id
router.get('/pipeline/board', getPipeline);
router.get('/activities/all', getActivities);
router.get('/alerts/overdue', getOverdueAlerts);

router.post('/', crmEdit, createLead);
router.get('/', getLeads);
router.get('/:id', getLead);
router.put('/:id', crmEdit, updateLead);
router.put('/:id/status', crmEdit, updateLeadStatus);
router.put('/:id/pipeline-stage', crmEdit, updatePipelineStage);
router.post('/:id/activity', crmEdit, addActivity);
router.delete('/:id', crmEdit, deleteLead);

module.exports = router;
