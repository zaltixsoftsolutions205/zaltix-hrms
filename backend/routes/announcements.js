const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/announcementController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');

const announcementsEdit = moduleAccess('announcements', 'edit');

router.use(protect);

router.get('/', ctrl.getAnnouncements);                            // all roles
router.post('/', announcementsEdit, ctrl.createAnnouncement);
router.delete('/:id', announcementsEdit, ctrl.deleteAnnouncement);

module.exports = router;
