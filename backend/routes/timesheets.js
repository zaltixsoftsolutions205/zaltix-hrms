const express = require('express');
const router = express.Router();
const {
  submitTimesheet,
  getMyTimesheets,
  getApprovals,
  reviewTimesheet,
} = require('../controllers/timesheetController');
const { protect } = require('../middleware/auth');

router.use(protect);

// Everyone can submit and view their own timesheets.
router.post('/', submitTimesheet);
router.get('/my', getMyTimesheets);

// Approvers (HR, technical leads, admin) see timesheets routed to them.
// Authorization is enforced per-record inside the controller, so no static
// roleCheck here — a technical lead is a regular employee by role.
router.get('/approvals', getApprovals);
router.put('/:id/review', reviewTimesheet);

module.exports = router;
