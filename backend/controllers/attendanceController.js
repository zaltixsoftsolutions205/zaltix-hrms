const Attendance = require('../models/Attendance');
const User = require('../models/User');
const moment = require('moment');
const https = require('https');

// IST helpers — adds 5h30m to UTC, then reads as if UTC string = IST string
// Works on any server timezone (UTC, IST, anything)
const istNow = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000);
const istDate = () => istNow().toISOString().slice(0, 10);   // YYYY-MM-DD
const istTime = () => istNow().toISOString().slice(11, 16);  // HH:mm

// Office hours (IST)
const OFFICE_START = '09:30'; // late if check-in after this
const OFFICE_END   = '18:30'; // early leave if check-out before this

// Haversine formula — returns distance in metres between two GPS coordinates
const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000; // Earth radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Employee: Check-in
exports.checkIn = async (req, res) => {
  const today = istDate();
  const now = istTime();
  try {
    const existing = await Attendance.findOne({ employee: req.user._id, date: today });
    if (existing) return res.status(400).json({ message: 'Already checked in today' });

    // Geo-fence check
    const OFFICE_LAT    = parseFloat(process.env.OFFICE_LAT);
    const OFFICE_LNG    = parseFloat(process.env.OFFICE_LNG);
    const OFFICE_RADIUS = parseFloat(process.env.OFFICE_RADIUS_METERS) || 200;

    if (OFFICE_LAT && OFFICE_LNG) {
      const { lat, lng } = req.body;
      if (lat == null || lng == null) {
        return res.status(400).json({ message: 'Location is required to check in. Please allow location access and try again.', code: 'LOCATION_REQUIRED' });
      }
      const distance = Math.round(haversineDistance(parseFloat(lat), parseFloat(lng), OFFICE_LAT, OFFICE_LNG));
      if (distance > OFFICE_RADIUS) {
        return res.status(403).json({
          message: `You are ${distance}m away from the office. Check-in is only allowed within ${OFFICE_RADIUS}m of the office.`,
          code: 'OUT_OF_RANGE',
          distance,
          allowed: OFFICE_RADIUS,
        });
      }
    }

    const { lat, lng } = req.body;
    const isLate = now > OFFICE_START;
    const record = await Attendance.create({
      employee: req.user._id,
      date: today,
      checkIn: now,
      status: 'present',
      isLate,
      checkInLocation: (lat != null && lng != null) ? { lat: parseFloat(lat), lng: parseFloat(lng) } : undefined,
    });
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Employee: Check-out
exports.checkOut = async (req, res) => {
  const today = istDate();
  const now = istTime();
  try {
    const record = await Attendance.findOne({ employee: req.user._id, date: today });
    if (!record) return res.status(404).json({ message: 'No check-in found for today' });
    if (record.checkOut) return res.status(400).json({ message: 'Already checked out today' });

    const OFFICE_LAT    = parseFloat(process.env.OFFICE_LAT);
    const OFFICE_LNG    = parseFloat(process.env.OFFICE_LNG);
    const OFFICE_RADIUS = parseFloat(process.env.OFFICE_RADIUS_METERS) || 50;

    if (OFFICE_LAT && OFFICE_LNG) {
      const { lat, lng } = req.body;
      if (lat == null || lng == null) {
        return res.status(400).json({ message: 'Location is required to check out. Please allow location access.', code: 'LOCATION_REQUIRED' });
      }
      const checkoutDistance = Math.round(haversineDistance(parseFloat(lat), parseFloat(lng), OFFICE_LAT, OFFICE_LNG));
      if (checkoutDistance > OFFICE_RADIUS) {
        return res.status(403).json({
          message: `You are ${checkoutDistance}m away from the office. Check-out is only allowed within ${OFFICE_RADIUS}m of the office.`,
          code: 'OUT_OF_RANGE',
          distance: checkoutDistance,
          allowed: OFFICE_RADIUS,
        });
      }
    }

    const checkInTime = moment(`${today} ${record.checkIn}`, 'YYYY-MM-DD HH:mm');
    const checkOutTime = moment(`${today} ${now}`, 'YYYY-MM-DD HH:mm');
    const workHours = parseFloat((checkOutTime.diff(checkInTime, 'minutes') / 60).toFixed(2));

    record.checkOut = now;
    record.workHours = workHours;
    record.isEarlyLeave = now < OFFICE_END;
    if (workHours < 4) record.status = 'half-day';

    await record.save();
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Authenticated: office location info for frontend geo-fence + map
exports.getOfficeInfo = (req, res) => {
  const lat    = parseFloat(process.env.OFFICE_LAT);
  const lng    = parseFloat(process.env.OFFICE_LNG);
  const radius = parseFloat(process.env.OFFICE_RADIUS_METERS) || 200;
  if (!lat || !lng) return res.json({ enabled: false });
  res.json({ enabled: true, lat, lng, radius });
};

// Employee: Get own attendance
exports.getMyAttendance = async (req, res) => {
  const { month, year } = req.query;
  try {
    let filter = { employee: req.user._id };
    let start, end;
    if (month && year) {
      start = `${year}-${String(month).padStart(2, '0')}-01`;
      end = moment(start).endOf('month').format('YYYY-MM-DD');
      filter.date = { $gte: start, $lte: end };
    } else {
      const now = istDate();
      start = now.slice(0, 7) + '-01';
      end = moment(start).endOf('month').format('YYYY-MM-DD');
    }
    const records = await Attendance.find(filter).sort({ date: -1 });

    const today = istDate();
    // Count absent only up to yesterday — today is still in progress
    const absentCalcEnd = today < end ? moment(today).subtract(1, 'day').format('YYYY-MM-DD') : end;

    // Count Mon–Fri working days from start through absentCalcEnd
    let workingDays = 0;
    const cur = moment(start);
    const endM = moment(absentCalcEnd);
    while (cur.isSameOrBefore(endM)) {
      if (cur.day() !== 0 && cur.day() !== 6) workingDays++;
      cur.add(1, 'day');
    }

    // Days employee was actually present (present or half-day) up to absentCalcEnd
    const attendedDays = records.filter(r =>
      r.date <= absentCalcEnd && (r.status === 'present' || r.status === 'half-day')
    ).length;

    const summary = {
      present: records.filter(r => r.status === 'present').length,
      absent: Math.max(0, workingDays - attendedDays),
      halfDay: records.filter(r => r.status === 'half-day').length,
      totalWorkHours: records.reduce((sum, r) => sum + (r.workHours || 0), 0).toFixed(2),
      lateCount: records.filter(r => r.isLate).length,
      earlyLeaveCount: records.filter(r => r.isEarlyLeave).length,
    };

    const todayRecord = await Attendance.findOne({ employee: req.user._id, date: today });

    res.json({ records, summary, todayRecord: todayRecord || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR / Admin: Get all attendance
exports.getAllAttendance = async (req, res) => {
  const { month, year, employeeId, departmentId, date, fromDate, toDate } = req.query;
  try {
    let empFilter = {};
    if (departmentId) empFilter.department = departmentId;
    if (employeeId) empFilter._id = employeeId;

    const employees = await User.find({ ...empFilter, role: { $nin: ['admin'] } }).select('_id name employeeId');
    const empIds = employees.map(e => e._id);

    let filter = { employee: { $in: empIds } };
    if (date) {
      filter.date = date;
    } else if (fromDate && toDate) {
      filter.date = { $gte: fromDate, $lte: toDate };
    } else if (month && year) {
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const end = moment(start).endOf('month').format('YYYY-MM-DD');
      filter.date = { $gte: start, $lte: end };
    }

    const records = await Attendance.find(filter).populate('employee', 'name employeeId department').sort({ date: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR: Mark attendance manually
exports.markAttendance = async (req, res) => {
  const { employeeId, date, status, checkIn, checkOut } = req.body;
  try {
    let record = await Attendance.findOne({ employee: employeeId, date });
    if (record) {
      record.status = status;
      if (checkIn) record.checkIn = checkIn;
      if (checkOut) record.checkOut = checkOut;
      await record.save();
    } else {
      record = await Attendance.create({ employee: employeeId, date, status, checkIn, checkOut });
    }
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Employee: Apply for regularization (late / early leave)
exports.applyRegularization = async (req, res) => {
  const { attendanceId, reason } = req.body;
  try {
    if (!reason?.trim()) return res.status(400).json({ message: 'Reason is required' });
    const record = await Attendance.findOne({ _id: attendanceId, employee: req.user._id });
    if (!record) return res.status(404).json({ message: 'Attendance record not found' });
    if (!record.isLate && !record.isEarlyLeave) return res.status(400).json({ message: 'No late/early issue on this record' });
    if (record.regularizationStatus) return res.status(400).json({ message: 'Regularization already submitted' });

    record.regularizationStatus = 'pending';
    record.regularizationReason = reason.trim();
    await record.save();
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR / Admin: Get all regularization requests
exports.getRegularizations = async (req, res) => {
  try {
    const { status } = req.query; // optional: 'pending' | 'approved' | 'rejected'
    const filter = { regularizationStatus: { $in: ['pending', 'approved', 'rejected'] } };
    if (status) filter.regularizationStatus = status;
    const records = await Attendance.find(filter)
      .populate('employee', 'name employeeId department')
      .sort({ date: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR / Admin: Approve or reject a regularization request
exports.reviewRegularization = async (req, res) => {
  const { status, comment } = req.body; // status: 'approved' | 'rejected'
  try {
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
    const record = await Attendance.findById(req.params.id).populate('employee', 'name employeeId');
    if (!record) return res.status(404).json({ message: 'Record not found' });
    if (record.regularizationStatus !== 'pending') return res.status(400).json({ message: 'Already reviewed' });

    record.regularizationStatus = status;
    record.regularizationComment = comment?.trim() || '';
    await record.save();
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Public: Proxy Google Maps static image through backend (avoids API key referrer restrictions)
exports.getMapImage = (req, res) => {
  const { userLat, userLng } = req.query;
  const officeLat = parseFloat(process.env.OFFICE_LAT);
  const officeLng = parseFloat(process.env.OFFICE_LNG);
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey || !officeLat || !officeLng || !userLat || !userLng) {
    return res.status(400).end();
  }

  const mapUrl =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?size=600x240&scale=2&zoom=17` +
    `&markers=color:red%7Clabel:O%7C${officeLat},${officeLng}` +
    `&markers=color:blue%7Clabel:U%7C${userLat},${userLng}` +
    `&path=color:0x7C3AED80%7Cweight:2%7C${userLat},${userLng}%7C${officeLat},${officeLng}` +
    `&key=${apiKey}`;

  https.get(mapUrl, (googleRes) => {
    res.setHeader('Content-Type', googleRes.headers['content-type'] || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    googleRes.pipe(res);
  }).on('error', () => res.status(502).end());
};
