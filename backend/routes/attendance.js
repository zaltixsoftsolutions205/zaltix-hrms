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
const { roleCheck, roleOrEmployee } = require('../middleware/roleCheck');

// Employee IDs granted HR-level attendance access individually
const ATTENDANCE_MANAGERS = ['ZSSE0023'];
const hrAttendance = roleOrEmployee(['hr', 'admin'], ATTENDANCE_MANAGERS);

// Public route — proxies Google Maps image server-side (no API key referrer restriction)
router.get('/map-image', getMapImage);

router.use(protect);

router.get('/office-info', getOfficeInfo);
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/my', getMyAttendance);
router.post('/regularize', applyRegularization);
router.get('/regularizations', hrAttendance, getRegularizations);
router.patch('/regularizations/:id', hrAttendance, reviewRegularization);
router.get('/', hrAttendance, getAllAttendance);
router.post('/mark', hrAttendance, markAttendance);

module.exports = router;
