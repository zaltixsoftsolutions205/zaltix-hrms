const express = require('express');
const router = express.Router();
const { createLead, getLeads, getLead, updateLeadStatus, addActivity, updateLead, deleteLead, getPipeline, updatePipelineStage, getActivities, getOverdueAlerts, getAssignees, getAssigneeOptions, setWonActivityStage, convertToLost, reworkLead } = require('../controllers/leadController');
const { protect } = require('../middleware/auth');
const { attachCrmScope } = require('../services/crmScopeService');
const { moduleAccess } = require('../middleware/roleCheck');

router.use(protect);
// Loads the requester's product/Mandal territory (see crmScopeService).
router.use(attachCrmScope);
// Leads are used by the CRM page ('crm') and the Leads page ('lead'): either
// module works (admin bypasses). view = read-only; edit = any create/update/delete.
const LEAD_MODULES = ['crm', 'lead'];
router.use(moduleAccess(LEAD_MODULES, 'view'));
const crmEdit = moduleAccess(LEAD_MODULES, 'edit');
// Client actions live in CRM › Clients, so they need edit on the CRM page itself.
const clientEdit = moduleAccess('crm', 'edit');

// Static routes MUST come before /:id
/**
 * @swagger
 * /api/leads/territory:
 *   get:
 *     summary: Get territory
 *     tags:
 *       - Leads
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/territory', require('../controllers/crmTerritoryController').getTerritory);
/**
 * @swagger
 * /api/leads/pipeline/board:
 *   get:
 *     summary: Get pipeline
 *     tags:
 *       - Leads
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/pipeline/board', getPipeline);
/**
 * @swagger
 * /api/leads/activities/all:
 *   get:
 *     summary: Get activities
 *     tags:
 *       - Leads
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/activities/all', getActivities);
/**
 * @swagger
 * /api/leads/alerts/overdue:
 *   get:
 *     summary: Get overdue alerts
 *     tags:
 *       - Leads
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/alerts/overdue', getOverdueAlerts);
/**
 * @swagger
 * /api/leads/assignee-options:
 *   get:
 *     summary: Get assignee options
 *     tags:
 *       - Leads
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/assignee-options', getAssigneeOptions);

/**
 * @swagger
 * /api/leads:
 *   post:
 *     summary: Create lead
 *     tags:
 *       - Leads
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
router.post('/', crmEdit, createLead);
/**
 * @swagger
 * /api/leads:
 *   get:
 *     summary: Get leads
 *     tags:
 *       - Leads
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', getLeads);
/**
 * @swagger
 * /api/leads/{id}:
 *   get:
 *     summary: Get lead
 *     tags:
 *       - Leads
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
router.get('/:id', getLead);
/**
 * @swagger
 * /api/leads/{id}/assignees:
 *   get:
 *     summary: Get assignees
 *     tags:
 *       - Leads
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
router.get('/:id/assignees', getAssignees);
/**
 * @swagger
 * /api/leads/{id}:
 *   put:
 *     summary: Update lead
 *     tags:
 *       - Leads
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
router.put('/:id', crmEdit, updateLead);
/**
 * @swagger
 * /api/leads/{id}/status:
 *   put:
 *     summary: Update lead status
 *     tags:
 *       - Leads
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
router.put('/:id/status', crmEdit, updateLeadStatus);
/**
 * @swagger
 * /api/leads/{id}/pipeline-stage:
 *   put:
 *     summary: Update pipeline stage
 *     tags:
 *       - Leads
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
router.put('/:id/pipeline-stage', crmEdit, updatePipelineStage);
/**
 * @swagger
 * /api/leads/{id}/activity:
 *   post:
 *     summary: Add activity
 *     tags:
 *       - Leads
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
router.post('/:id/activity', crmEdit, addActivity);
/**
 * @swagger
 * /api/leads/{id}/won-activity-stage:
 *   put:
 *     summary: Send a client (won lead) to an activity page, or back to Clients
 *     tags:
 *       - Leads
 *     description: "The lead stays in lead-won. stage null or empty takes it off its activity page. Module access: crm edit"
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
 *             properties:
 *               stage:
 *                 type: string
 *                 nullable: true
 *                 enum: [visit, demo, data-update, registration, feedback]
 *               assignedTo:
 *                 type: string
 *                 description: Sales employee who works on the activity (becomes the lead's owner)
 *               followUpDate:
 *                 type: string
 *                 format: date
 *                 description: Required when stage is set
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: The updated lead
 *       400:
 *         description: Invalid stage, assignee or follow-up date
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 *       409:
 *         description: The lead is not won
 */
router.put('/:id/won-activity-stage', clientEdit, setWonActivityStage);
/**
 * @swagger
 * /api/leads/{id}/convert-lost:
 *   put:
 *     summary: Convert a client (won lead) to Lead Lost
 *     tags:
 *       - Leads
 *     description: "Module access: crm edit"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: The updated lead
 *       400:
 *         description: Reason missing
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 *       409:
 *         description: The lead is not won
 */
router.put('/:id/convert-lost', clientEdit, convertToLost);
/**
 * @swagger
 * /api/leads/{id}/rework:
 *   put:
 *     summary: Rework a lost lead back into the pipeline (or straight to Lead Won)
 *     tags:
 *       - Leads
 *     description: "toStage lead-won makes it a client again (shown in CRM › Clients › Won Clients). Module access: crm edit"
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
 *             properties:
 *               toStage:
 *                 type: string
 *                 enum: [lead, visit, demo, data-update, registration, feedback, lead-won]
 *                 default: lead
 *               assignedTo:
 *                 type: string
 *               followUpDate:
 *                 type: string
 *                 format: date
 *                 description: Required for every stage except lead and lead-won
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: The updated lead
 *       400:
 *         description: Invalid stage, assignee or follow-up date
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 *       409:
 *         description: The lead is not lost
 */
router.put('/:id/rework', clientEdit, reworkLead);
/**
 * @swagger
 * /api/leads/{id}:
 *   delete:
 *     summary: Delete lead
 *     tags:
 *       - Leads
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
router.delete('/:id', crmEdit, deleteLead);

module.exports = router;
