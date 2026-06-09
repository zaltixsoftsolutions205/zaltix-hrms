const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/announcementController');
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

router.use(protect);

router.get('/', ctrl.getAnnouncements);                            // all roles
router.post('/', roleCheck('admin', 'hr'), ctrl.createAnnouncement);
router.delete('/:id', roleCheck('admin', 'hr'), ctrl.deleteAnnouncement);

module.exports = router;
