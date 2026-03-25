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
const { roleCheck } = require('../middleware/roleCheck');

// Public route — proxies Google Maps image server-side (no API key referrer restriction)
router.get('/map-image', getMapImage);

router.use(protect);

router.get('/office-info', getOfficeInfo);
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/my', getMyAttendance);
router.post('/regularize', applyRegularization);
router.get('/regularizations', roleCheck('hr', 'admin'), getRegularizations);
router.patch('/regularizations/:id', roleCheck('hr', 'admin'), reviewRegularization);
router.get('/', roleCheck('hr', 'admin'), getAllAttendance);
router.post('/mark', roleCheck('hr', 'admin'), markAttendance);

module.exports = router;
