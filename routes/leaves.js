const express = require('express');
const router = express.Router();
const { applyLeave, getMyLeaves, getAllLeaves, updateLeaveStatus, getLeaveBalance } = require('../controllers/leaveController');
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

router.use(protect);

router.post('/', applyLeave);
router.get('/my', getMyLeaves);
router.get('/balance', getLeaveBalance);
router.get('/balance/:employeeId', roleCheck('hr', 'admin'), getLeaveBalance);
router.get('/', roleCheck('hr', 'admin'), getAllLeaves);
router.put('/:id/status', roleCheck('hr', 'admin'), updateLeaveStatus);

module.exports = router;
