const express = require('express');
const router = express.Router();
const controller = require('../controllers/visitController');
const { protect } = require('../middleware/auth');
const { attachCrmScope, hasFullScope } = require('../services/crmScopeService');
const { moduleAccess } = require('../middleware/roleCheck');
const { canAccessModule } = require('../constants/modules');

router.use(protect);
// Loads the requester's product/Mandal territory (see crmScopeService).
router.use(attachCrmScope);
// The 'visits' module: view = open the page and read visits; edit = add /
// change / delete visits. One lead's visits (lead page /
// drawer) can also be READ by admin / HR / managers with CRM or Leads access; the
// controller checks the lead.
const visitsEdit = moduleAccess('visits', 'edit');
const leadAccess = (req, res, next) => (canAccessModule(req.user, 'visits')
  || (hasFullScope(req.user) && (canAccessModule(req.user, 'crm') || canAccessModule(req.user, 'lead')))
  ? next() : res.status(403).json({ message: 'You do not have access to this module.' }));

/**
 * @swagger
 * /api/visits/leads/{leadId}:
 *   get:
 *     summary: Get lead visits
 *     tags:
 *       - Visits
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: leadId
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
router.get('/leads/:leadId', leadAccess, controller.getLeadVisits);
/**
 * @swagger
 * /api/visits/leads/{leadId}/visits:
 *   post:
 *     summary: Create visit
 *     tags:
 *       - Visits
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: leadId
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
router.post('/leads/:leadId/visits', visitsEdit, controller.createVisit);
/**
 * @swagger
 * /api/visits/leads/{leadId}/follow-up:
 *   put:
 *     summary: Set follow up date
 *     tags:
 *       - Visits
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: leadId
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
router.put('/leads/:leadId/follow-up', visitsEdit, controller.setFollowUpDate);
/**
 * @swagger
 * /api/visits/{id}:
 *   put:
 *     summary: Update visit
 *     tags:
 *       - Visits
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
router.put('/:id', visitsEdit, controller.updateVisit);
/**
 * @swagger
 * /api/visits/{id}:
 *   delete:
 *     summary: Delete visit
 *     tags:
 *       - Visits
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
router.delete('/:id', visitsEdit, controller.deleteVisit);

router.use(moduleAccess('visits', 'view'));
/**
 * @swagger
 * /api/visits/calendar:
 *   get:
 *     summary: Get calendar
 *     tags:
 *       - Visits
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/calendar', controller.getCalendar);

module.exports = router;
