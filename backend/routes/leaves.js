const express = require('express');
const router = express.Router();
const { applyLeave, getMyLeaves, getAllLeaves, updateLeaveStatus, getLeaveBalance } = require('../controllers/leaveController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');

// HR-level leave management gated by the 'hr_leaves' module.
const hrLeavesView = moduleAccess('hr_leaves', 'view');
const hrLeavesEdit = moduleAccess('hr_leaves', 'edit');

router.use(protect);

router.post('/', applyLeave);
router.get('/my', getMyLeaves);
router.get('/balance', getLeaveBalance);
router.get('/balance/:employeeId', hrLeavesView, getLeaveBalance);
router.get('/', hrLeavesView, getAllLeaves);
router.put('/:id/status', hrLeavesEdit, updateLeaveStatus);

module.exports = router;
