const express = require('express');
const router = express.Router();
const { applyLeave, getMyLeaves, getAllLeaves, updateLeaveStatus, getLeaveBalance } = require('../controllers/leaveController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');
const { roleCheck } = require('../middleware/roleCheck');

// HR-level leave management gated by the 'hr_leaves' module.
const hrLeavesView = moduleAccess('hr_leaves', 'view');
const hrLeavesEdit = moduleAccess('hr_leaves', 'edit');

router.use(protect);

/**
 * @swagger
 * /api/leaves:
 *   post:
 *     summary: Apply leave
 *     tags:
 *       - Leaves
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
router.post('/', applyLeave);
/**
 * @swagger
 * /api/leaves/my:
 *   get:
 *     summary: Get my leaves
 *     tags:
 *       - Leaves
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/my', getMyLeaves);
// get all leaves of the emp
/**
 * @swagger
 * /api/leaves/my/{id}:
 *   get:
 *     summary: Get my leaves
 *     tags:
 *       - Leaves
 *     description: "Requires role: hr,admin"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.get('/my/:id' ,roleCheck("hr", "admin"), getMyLeaves);
/**
 * @swagger
 * /api/leaves/balance:
 *   get:
 *     summary: Get leave balance
 *     tags:
 *       - Leaves
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/balance', getLeaveBalance);
/**
 * @swagger
 * /api/leaves/balance/{employeeId}:
 *   get:
 *     summary: Get leave balance
 *     tags:
 *       - Leaves
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
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
router.get('/balance/:employeeId', hrLeavesView, getLeaveBalance);
/**
 * @swagger
 * /api/leaves:
 *   get:
 *     summary: Get all leaves
 *     tags:
 *       - Leaves
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', hrLeavesView, getAllLeaves);
/**
 * @swagger
 * /api/leaves/{id}/status:
 *   put:
 *     summary: Update leave status
 *     tags:
 *       - Leaves
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
router.put('/:id/status', hrLeavesEdit, updateLeaveStatus);

module.exports = router;
