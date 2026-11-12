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
/**
 * @swagger
 * /api/timesheets:
 *   post:
 *     summary: Submit timesheet
 *     tags:
 *       - Timesheets
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
router.post('/', submitTimesheet);
/**
 * @swagger
 * /api/timesheets/my:
 *   get:
 *     summary: Get my timesheets
 *     tags:
 *       - Timesheets
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/my', getMyTimesheets);

// Approvers (HR, technical leads, admin) see timesheets routed to them.
// Authorization is enforced per-record inside the controller, so no static
// roleCheck here — a technical lead is a regular employee by role.
/**
 * @swagger
 * /api/timesheets/approvals:
 *   get:
 *     summary: Get approvals
 *     tags:
 *       - Timesheets
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/approvals', getApprovals);
/**
 * @swagger
 * /api/timesheets/{id}/review:
 *   put:
 *     summary: Review timesheet
 *     tags:
 *       - Timesheets
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
router.put('/:id/review', reviewTimesheet);

module.exports = router;
