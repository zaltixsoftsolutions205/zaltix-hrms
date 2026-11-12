const express             = require('express');
const router              = express.Router();
const { protect }         = require('../middleware/auth');
const { roleCheck }       = require('../middleware/roleCheck');
const ctrl                = require('../controllers/ktController');

router.use(protect);

// Specific paths BEFORE generic /:id
/**
 * @swagger
 * /api/kt/progress/me:
 *   get:
 *     summary: Get my progress
 *     tags:
 *       - Kt
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/progress/me',     ctrl.getMyProgress);
/**
 * @swagger
 * /api/kt/progress/report:
 *   get:
 *     summary: Get progress report
 *     tags:
 *       - Kt
 *     description: "Requires role: admin,hr"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.get('/progress/report', roleCheck('admin', 'hr'), ctrl.getProgressReport);

// Topics
/**
 * @swagger
 * /api/kt:
 *   get:
 *     summary: Get topics
 *     tags:
 *       - Kt
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/',     ctrl.getTopics);
/**
 * @swagger
 * /api/kt/{id}:
 *   get:
 *     summary: Get topic
 *     tags:
 *       - Kt
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
router.get('/:id',  ctrl.getTopic);
/**
 * @swagger
 * /api/kt:
 *   post:
 *     summary: Create topic
 *     tags:
 *       - Kt
 *     description: "Requires role: admin"
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
 *       403:
 *         description: Forbidden
 */
router.post('/',    roleCheck('admin'), ctrl.createTopic);
/**
 * @swagger
 * /api/kt/{id}:
 *   put:
 *     summary: Update topic
 *     tags:
 *       - Kt
 *     description: "Requires role: admin"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.put('/:id',  roleCheck('admin'), ctrl.updateTopic);
/**
 * @swagger
 * /api/kt/{id}:
 *   delete:
 *     summary: Delete topic
 *     tags:
 *       - Kt
 *     description: "Requires role: admin"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete('/:id', roleCheck('admin'), ctrl.deleteTopic);

// Progress
/**
 * @swagger
 * /api/kt/{id}/start:
 *   post:
 *     summary: Mark started
 *     tags:
 *       - Kt
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
router.post('/:id/start',    ctrl.markStarted);
/**
 * @swagger
 * /api/kt/{id}/complete:
 *   post:
 *     summary: Mark complete
 *     tags:
 *       - Kt
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
router.post('/:id/complete', ctrl.markComplete);

module.exports = router;
