const express             = require('express');
const router              = express.Router();
const { protect }         = require('../middleware/auth');
const { roleCheck }       = require('../middleware/roleCheck');
const ctrl                = require('../controllers/ktController');

router.use(protect);

// Specific paths BEFORE generic /:id
router.get('/progress/me',     ctrl.getMyProgress);
router.get('/progress/report', roleCheck('admin', 'hr'), ctrl.getProgressReport);

// Topics
router.get('/',     ctrl.getTopics);
router.get('/:id',  ctrl.getTopic);
router.post('/',    roleCheck('admin'), ctrl.createTopic);
router.put('/:id',  roleCheck('admin'), ctrl.updateTopic);
router.delete('/:id', roleCheck('admin'), ctrl.deleteTopic);

// Progress
router.post('/:id/start',    ctrl.markStarted);
router.post('/:id/complete', ctrl.markComplete);

module.exports = router;
