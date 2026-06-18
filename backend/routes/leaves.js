const express = require('express');
const router = express.Router();
const { applyLeave, getMyLeaves, getAllLeaves, updateLeaveStatus, getLeaveBalance } = require('../controllers/leaveController');
const { protect } = require('../middleware/auth');
const { roleOrEmployee } = require('../middleware/roleCheck');

// Employee IDs granted HR-level leave management individually
const LEAVE_MANAGERS = ['ZSSE0023'];
const hrLeaves = roleOrEmployee(['hr', 'admin'], LEAVE_MANAGERS);

router.use(protect);

router.post('/', applyLeave);
router.get('/my', getMyLeaves);
router.get('/balance', getLeaveBalance);
router.get('/balance/:employeeId', hrLeaves, getLeaveBalance);
router.get('/', hrLeaves, getAllLeaves);
router.put('/:id/status', hrLeaves, updateLeaveStatus);

module.exports = router;
