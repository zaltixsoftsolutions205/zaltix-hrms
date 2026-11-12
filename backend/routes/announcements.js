const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/announcementController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');

const announcementsEdit = moduleAccess('announcements', 'edit');

router.use(protect);

/**
 * @swagger
 * /api/announcements:
 *   get:
 *     summary: Get announcements
 *     tags:
 *       - Announcements
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', ctrl.getAnnouncements);                            // all roles
/**
 * @swagger
 * /api/announcements:
 *   post:
 *     summary: Create announcement
 *     tags:
 *       - Announcements
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
router.post('/', announcementsEdit, ctrl.createAnnouncement);
/**
 * @swagger
 * /api/announcements/{id}:
 *   delete:
 *     summary: Delete announcement
 *     tags:
 *       - Announcements
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
router.delete('/:id', announcementsEdit, ctrl.deleteAnnouncement);

module.exports = router;
