const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead, markAllAsRead, savePushToken, removePushToken, testPush } = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.use(protect);
/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get notifications
 *     tags:
 *       - Notifications
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', getNotifications);
/**
 * @swagger
 * /api/notifications/{id}/read:
 *   put:
 *     summary: Mark as read
 *     tags:
 *       - Notifications
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
router.put('/:id/read', markAsRead);
/**
 * @swagger
 * /api/notifications/read-all:
 *   put:
 *     summary: Mark all as read
 *     tags:
 *       - Notifications
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
router.put('/read-all', markAllAsRead);
/**
 * @swagger
 * /api/notifications/push-token:
 *   post:
 *     summary: Save push token
 *     tags:
 *       - Notifications
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
router.post('/push-token', savePushToken);
/**
 * @swagger
 * /api/notifications/push-token:
 *   delete:
 *     summary: Remove push token
 *     tags:
 *       - Notifications
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.delete('/push-token', removePushToken);

/**
 * @swagger
 * /api/notifications/test-push:
 *   post:
 *     summary: Test push
 *     tags:
 *       - Notifications
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
router.post('/test-push', testPush);

module.exports = router;
