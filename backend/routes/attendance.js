const express = require('express');
const router = express.Router();
const {
  checkIn,
  checkOut,
  getMyAttendance,
  getAllAttendance,
  markAttendance,
  applyRegularization,
  getRegularizations,
  reviewRegularization,
  getOfficeInfo,
  getMapImage,
} = require('../controllers/attendanceController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');
const { roleCheck } = require('../middleware/roleCheck');

// HR-level attendance management is gated by the 'hr_attendance' module.
// Viewing records needs view access; marking / reviewing needs edit access.
const hrAttendanceView = moduleAccess('hr_attendance', 'view');
const hrAttendanceEdit = moduleAccess('hr_attendance', 'edit');

// Public route — proxies Google Maps image server-side (no API key referrer restriction)
/**
 * @swagger
 * /api/attendance/map-image:
 *   get:
 *     summary: Get map image
 *     tags:
 *       - Attendance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/map-image', getMapImage);

router.use(protect);

/**
 * @swagger
 * /api/attendance/office-info:
 *   get:
 *     summary: Get office info
 *     tags:
 *       - Attendance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/office-info', getOfficeInfo);
/**
 * @swagger
 * /api/attendance/check-in:
 *   post:
 *     summary: Check in
 *     tags:
 *       - Attendance
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
router.post('/check-in', checkIn);
/**
 * @swagger
 * /api/attendance/check-out:
 *   post:
 *     summary: Check out
 *     tags:
 *       - Attendance
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
router.post('/check-out', checkOut);
/**
 * @swagger
 * /api/attendance/my:
 *   get:
 *     summary: Get my attendance
 *     tags:
 *       - Attendance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/my', getMyAttendance);
/**
 * @swagger
 * /api/attendance/my/{id}:
 *   get:
 *     summary: Get my attendance
 *     tags:
 *       - Attendance
 *     description: "Requires role: admin,hr"
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
router.get('/my/:id', roleCheck("admin", "hr") ,getMyAttendance);
/**
 * @swagger
 * /api/attendance/regularize:
 *   post:
 *     summary: Apply regularization
 *     tags:
 *       - Attendance
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
router.post('/regularize', applyRegularization);
/**
 * @swagger
 * /api/attendance/regularizations:
 *   get:
 *     summary: Get regularizations
 *     tags:
 *       - Attendance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/regularizations', hrAttendanceView, getRegularizations);
/**
 * @swagger
 * /api/attendance/regularizations/{id}:
 *   patch:
 *     summary: Review regularization
 *     tags:
 *       - Attendance
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
router.patch('/regularizations/:id', hrAttendanceEdit, reviewRegularization);
/**
 * @swagger
 * /api/attendance:
 *   get:
 *     summary: Get all attendance
 *     tags:
 *       - Attendance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', hrAttendanceView, getAllAttendance);
/**
 * @swagger
 * /api/attendance/mark:
 *   post:
 *     summary: Mark attendance
 *     tags:
 *       - Attendance
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
router.post('/mark', hrAttendanceEdit, markAttendance);

module.exports = router;
