const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const {
  getDashboard,
  getEmployeeScores,
  getMyScore,
  runJob,
} = require('../controllers/automationController');

// All routes require login
router.use(protect);

// Employee: own productivity score
/**
 * @swagger
 * /api/automation/my-score:
 *   get:
 *     summary: Get my score
 *     tags:
 *       - Automation
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/my-score', getMyScore)
// router.get('/my-score/:employeeId', roleCheck('hr', 'admin'), getMyScore);

// HR + Admin: full dashboard
/**
 * @swagger
 * /api/automation/dashboard:
 *   get:
 *     summary: Get dashboard
 *     tags:
 *       - Automation
 *     description: "Requires role: hr,admin"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.get('/dashboard', roleCheck('hr', 'admin'), getDashboard);
/**
 * @swagger
 * /api/automation/scores/{employeeId}:
 *   get:
 *     summary: Get employee scores
 *     tags:
 *       - Automation
 *     description: "Requires role: hr,admin"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.get('/scores/:employeeId', roleCheck('hr', 'admin'), getEmployeeScores);

// Admin only: run a job manually
/**
 * @swagger
 * /api/automation/run/{job}:
 *   post:
 *     summary: Run job
 *     tags:
 *       - Automation
 *     description: "Requires role: admin"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: job
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.post('/run/:job', roleCheck('admin'), runJob);

module.exports = router;
