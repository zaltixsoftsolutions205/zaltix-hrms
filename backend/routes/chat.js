const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getUsers,
  getGroupMessages,
  getDirectMessages,
  getUnreadCounts,
} = require('../controllers/chatController');

router.use(protect);

/**
 * @swagger
 * /api/chat/users:
 *   get:
 *     summary: Get users
 *     tags:
 *       - Chat
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/users', getUsers);
/**
 * @swagger
 * /api/chat/group/{group}:
 *   get:
 *     summary: Get group messages
 *     tags:
 *       - Chat
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: group
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
router.get('/group/:group', getGroupMessages);
/**
 * @swagger
 * /api/chat/direct/{userId}:
 *   get:
 *     summary: Get direct messages
 *     tags:
 *       - Chat
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
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
router.get('/direct/:userId', getDirectMessages);
/**
 * @swagger
 * /api/chat/unread:
 *   get:
 *     summary: Get unread counts
 *     tags:
 *       - Chat
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/unread', getUnreadCounts);

module.exports = router;
