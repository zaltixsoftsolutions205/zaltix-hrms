const express = require('express');
const c = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');
const { roleCheck, moduleAccess } = require('../middleware/roleCheck');
const { ANALYTICS_ROLES } = require('../services/analytics/scope');

/**
 * /api/analytics — Global Analytics Dashboard.
 * Admin / HR / managers with the 'analytics' module. Which data each user sees is
 * decided per request (services/analytics/scope.js).
 */
const router = express.Router();
router.use(protect);
router.use(roleCheck(...ANALYTICS_ROLES));
router.use(moduleAccess('analytics', 'view'));

/**
 * @swagger
 * /api/analytics/catalog:
 *   get:
 *     summary: Get catalog
 *     tags:
 *       - Analytics
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/catalog', c.getCatalog);
/**
 * @swagger
 * /api/analytics/options/{ref}:
 *   get:
 *     summary: Get options
 *     tags:
 *       - Analytics
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ref
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
router.get('/options/:ref', c.getOptions);
/**
 * @swagger
 * /api/analytics/preview:
 *   post:
 *     summary: Preview
 *     tags:
 *       - Analytics
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
router.post('/preview', c.preview);

/**
 * @swagger
 * /api/analytics/widgets:
 *   get:
 *     summary: List widgets
 *     tags:
 *       - Analytics
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/widgets', c.listWidgets);
/**
 * @swagger
 * /api/analytics/widgets:
 *   post:
 *     summary: Create widget
 *     tags:
 *       - Analytics
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
router.post('/widgets', c.createWidget);
/**
 * @swagger
 * /api/analytics/widgets/{id}:
 *   get:
 *     summary: Get widget
 *     tags:
 *       - Analytics
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
router.get('/widgets/:id', c.getWidget);
/**
 * @swagger
 * /api/analytics/widgets/{id}:
 *   put:
 *     summary: Update widget
 *     tags:
 *       - Analytics
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
router.put('/widgets/:id', c.updateWidget);
/**
 * @swagger
 * /api/analytics/widgets/{id}:
 *   delete:
 *     summary: Delete widget
 *     tags:
 *       - Analytics
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
router.delete('/widgets/:id', c.deleteWidget);
/**
 * @swagger
 * /api/analytics/widgets/{id}/run:
 *   post:
 *     summary: Run widget
 *     tags:
 *       - Analytics
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
router.post('/widgets/:id/run', c.runWidget);

/**
 * @swagger
 * /api/analytics/dashboards:
 *   get:
 *     summary: List dashboards
 *     tags:
 *       - Analytics
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/dashboards', c.listDashboards);
/**
 * @swagger
 * /api/analytics/dashboards:
 *   post:
 *     summary: Create dashboard
 *     tags:
 *       - Analytics
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
router.post('/dashboards', c.createDashboard);
/**
 * @swagger
 * /api/analytics/dashboards/{id}:
 *   get:
 *     summary: Get dashboard
 *     tags:
 *       - Analytics
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
router.get('/dashboards/:id', c.getDashboard);
/**
 * @swagger
 * /api/analytics/dashboards/{id}:
 *   put:
 *     summary: Update dashboard
 *     tags:
 *       - Analytics
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
router.put('/dashboards/:id', c.updateDashboard);
/**
 * @swagger
 * /api/analytics/dashboards/{id}:
 *   delete:
 *     summary: Delete dashboard
 *     tags:
 *       - Analytics
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
router.delete('/dashboards/:id', c.deleteDashboard);

module.exports = router;
