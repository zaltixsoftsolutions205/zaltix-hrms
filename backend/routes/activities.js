const express = require('express');
const makeActivityController = require('../controllers/activityController');
const { setFollowUpDate } = require('../controllers/visitController');
const { ACTIVITY_TYPES } = require('../services/activityTypes');
const { protect } = require('../middleware/auth');
const { attachCrmScope, hasFullScope } = require('../services/crmScopeService');
const { moduleAccess } = require('../middleware/roleCheck');
const { canAccessModule } = require('../constants/modules');
const { uploadActivityFile } = require('../middleware/uploadActivityFile');

/**
 * /api/activities/<type>/...  for every type of services/activityTypes.js
 * (demo, data-update, registration, feedback). Each page has its own module
 * (demos, data_updation, registration, feedback):
 *   view  open the page and read entries
 *   edit  add / change / delete entries
 * One lead's entries (lead page / drawer) can also be READ by admin / HR /
 * managers with CRM or Leads access, without the stage page's module. The controller
 * checks the lead.
 */
const router = express.Router();
router.use(protect);
router.use(attachCrmScope);
const pageOrLeadPage = (moduleKey) => (req, res, next) => (canAccessModule(req.user, moduleKey)
  || (hasFullScope(req.user) && (canAccessModule(req.user, 'crm') || canAccessModule(req.user, 'lead')))
  ? next() : res.status(403).json({ message: 'You do not have access to this module.' }));

Object.values(ACTIVITY_TYPES).forEach((type) => {
  const c = makeActivityController(type);
  const sub = express.Router();
  const pageOnly = moduleAccess(type.module, 'view');
  const pageEdit = moduleAccess(type.module, 'edit');
  const leadAccess = pageOrLeadPage(type.module);
  sub.get('/leads/:leadId', leadAccess, c.getLeadDetail);
  sub.get('/entries/:id/file', leadAccess, c.downloadFile);
  sub.post('/leads/:leadId/entries', pageEdit, c.createEntry);
  // The lead's own follow-up date (edit access to this page's module).
  sub.put('/leads/:leadId/follow-up', pageEdit, setFollowUpDate);
  sub.put('/entries/:id', pageEdit, c.updateEntry);
  sub.delete('/entries/:id', pageEdit, c.deleteEntry);
  sub.post('/entries/:id/file', pageEdit, uploadActivityFile, c.uploadFile);
  sub.use(pageOnly);
  sub.get('/calendar', c.getCalendar);
  router.use(`/${type.key}`, sub);
});

/**
 * @swagger
 * /api/activities/{type}/leads/{leadId}:
 *   get:
 *     summary: Get lead activity detail
 *     tags:
 *       - Activities
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [demo, data-update, registration, feedback]
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
 *       403:
 *         description: Forbidden
 * /api/activities/{type}/leads/{leadId}/entries:
 *   post:
 *     summary: Create activity entry
 *     tags:
 *       - Activities
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [demo, data-update, registration, feedback]
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
 *       403:
 *         description: Forbidden
 * /api/activities/{type}/leads/{leadId}/follow-up:
 *   put:
 *     summary: Set lead follow-up date
 *     tags:
 *       - Activities
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [demo, data-update, registration, feedback]
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
 *       403:
 *         description: Forbidden
 * /api/activities/{type}/entries/{id}:
 *   put:
 *     summary: Update activity entry
 *     tags:
 *       - Activities
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [demo, data-update, registration, feedback]
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
 *       403:
 *         description: Forbidden
 *   delete:
 *     summary: Delete activity entry
 *     tags:
 *       - Activities
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [demo, data-update, registration, feedback]
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
 *       403:
 *         description: Forbidden
 * /api/activities/{type}/entries/{id}/file:
 *   get:
 *     summary: Download entry file
 *     tags:
 *       - Activities
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [demo, data-update, registration, feedback]
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
 *       403:
 *         description: Forbidden
 *   post:
 *     summary: Upload entry file
 *     tags:
 *       - Activities
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [demo, data-update, registration, feedback]
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 * /api/activities/{type}/calendar:
 *   get:
 *     summary: Get activity calendar
 *     tags:
 *       - Activities
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [demo, data-update, registration, feedback]
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
module.exports = router;
