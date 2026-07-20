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
router.get('/map-image', getMapImage);

router.use(protect);

router.get('/office-info', getOfficeInfo);
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/my', getMyAttendance);
router.get('/my/:id', roleCheck("admin", "hr") ,getMyAttendance);
router.post('/regularize', applyRegularization);
router.get('/regularizations', hrAttendanceView, getRegularizations);
router.patch('/regularizations/:id', hrAttendanceEdit, reviewRegularization);
router.get('/', hrAttendanceView, getAllAttendance);
router.post('/mark', hrAttendanceEdit, markAttendance);

module.exports = router;
