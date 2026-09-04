const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Holiday = require('../models/Holiday');
const moment = require('moment');
const https = require('https');

// IST helpers — adds 5h30m to UTC, then reads as if UTC string = IST string
// Works on any server timezone (UTC, IST, anything)
const istNow = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000);
const istDate = () => istNow().toISOString().slice(0, 10);   // YYYY-MM-DD
const istTime = () => istNow().toISOString().slice(11, 16);  // HH:mm

// Office hours (IST)
const OFFICE_START = '09:00'; // late if check-in after this
const OFFICE_END = '18:00'; // early leave if check-out before this

// Find a holiday falling on the given IST calendar date (YYYY-MM-DD).
// Holiday.date is stored as a Date (often midnight UTC), so we match by a
// day range rather than exact equality — this is robust to any time component
// or timezone offset in the stored value.
const findHolidayForDate = async (ymd) => {
  const start = new Date(`${ymd}T00:00:00.000Z`);
  const end = new Date(`${ymd}T23:59:59.999Z`);
  return Holiday.findOne({ date: { $gte: start, $lte: end } });
};

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

    // Holiday check — block check-in on holidays set by admin/HR
    const holiday = await findHolidayForDate(today);
    if (holiday) {
      return res.status(403).json({
        message: `Today is a holiday: ${holiday.name}. Check-in is not allowed.`,
        code: 'HOLIDAY',
        holiday: holiday.name,
      });
    }

    // Geo-fence check
    const OFFICE_LAT = parseFloat(process.env.OFFICE_LAT);
    const OFFICE_LNG = parseFloat(process.env.OFFICE_LNG);
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
    // Holiday check — block check-out on holidays set by admin/HR
    const holiday = await findHolidayForDate(today);
    if (holiday) {
      return res.status(403).json({
        message: `Today is a holiday: ${holiday.name}. Check-out is not allowed.`,
        code: 'HOLIDAY',
        holiday: holiday.name,
      });
    }

    const record = await Attendance.findOne({ employee: req.user._id, date: today });
    if (!record) return res.status(404).json({ message: 'No check-in found for today' });
    if (record.checkOut) return res.status(400).json({ message: 'Already checked out today' });

    const OFFICE_LAT = parseFloat(process.env.OFFICE_LAT);
    const OFFICE_LNG = parseFloat(process.env.OFFICE_LNG);
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
  const lat = parseFloat(process.env.OFFICE_LAT);
  const lng = parseFloat(process.env.OFFICE_LNG);
  const radius = parseFloat(process.env.OFFICE_RADIUS_METERS) || 200;
  if (!lat || !lng) return res.json({ enabled: false });
  res.json({ enabled: true, lat, lng, radius });
};

// Employee: Get own attendance
// Employee: Get own attendance
exports.getMyAttendance = async (req, res) => {
  const { month, year } = req.query;

  try {
    // ===========================
    // CHANGE 1:
    // If an employee ID is passed in the URL (/my/:id),
    // use it. Otherwise use the logged-in user's ID.
    // This allows the same controller to be used by:
    // GET /attendance/my
    // GET /attendance/my/:id
    // ===========================
    const employeeId = req.params.id || req.user._id;

    let filter = { employee: employeeId };

    let start, end;

    if (month && year) {
      start = `${year}-${String(month).padStart(2, "0")}-01`;
      end = moment(start).endOf("month").format("YYYY-MM-DD");
      filter.date = { $gte: start, $lte: end };
    } else {
      const now = istDate();
      start = now.slice(0, 7) + "-01";
      end = moment(start).endOf("month").format("YYYY-MM-DD");
    }

    const records = await Attendance.find(filter).sort({ date: -1 });

    const today = istDate();

    // Count absent only up to yesterday — today is still in progress
    const absentCalcEnd =
      today < end
        ? moment(today).subtract(1, "day").format("YYYY-MM-DD")
        : end;

    // Count Mon–Fri working days
    let workingDays = 0;
    const cur = moment(start);
    const endM = moment(absentCalcEnd);

    while (cur.isSameOrBefore(endM)) {
      if (cur.day() !== 0 && cur.day() !== 6) {
        workingDays++;
      }
      cur.add(1, "day");
    }

    // Days employee was actually present
    const attendedDays = records.filter(
      (r) =>
        r.date <= absentCalcEnd &&
        (r.status === "present" || r.status === "half-day")
    ).length;

    const summary = {
      present: records.filter((r) => r.status === "present").length,
      absent: Math.max(0, workingDays - attendedDays),
      halfDay: records.filter((r) => r.status === "half-day").length,
      totalWorkHours: records
        .reduce((sum, r) => sum + (r.workHours || 0), 0)
        .toFixed(2),
      lateCount: records.filter((r) => r.isLate).length,
      earlyLeaveCount: records.filter((r) => r.isEarlyLeave).length,
    };

    // ===========================
    // CHANGE 2:
    // Use employeeId instead of req.user._id
    // so HR can fetch today's attendance
    // for another employee.
    // ===========================
    const todayRecord = await Attendance.findOne({
      employee: employeeId,
      date: today,
    });

    res.json({
      records,
      summary,
      todayRecord: todayRecord || null,
    });
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

    const records = await Attendance.find(filter).populate({
      path: "employee",
      select: "name employeeId role department  ",
      populate: {
        path: "department",
        select: "name",
      },
    }).sort({ date: -1 });
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
  const {
    attendanceId,
    reason,
    checkIn,
    checkOut
  } = req.body;

  try {
    if (!reason?.trim()) {
      return res.status(400).json({ message: "Reason is required" });
    }

    const record = await Attendance.findOne({
      _id: attendanceId,
      employee: req.user._id,
    });

    if (!record) {
      return res.status(404).json({
        message: "Attendance record not found",
      });
    }

    if (
      !record.isLate &&
      !record.isEarlyLeave &&
      record.checkOut
    ) {
      return res.status(400).json({
        message: "No regularization required",
      });
    }

    if (record.regularizationStatus) {
      return res.status(400).json({
        message: "Regularization already submitted",
      });
    }

    record.regularizationStatus = "pending";
    record.regularizationReason = reason.trim();

    // Employee requested timings
    record.regularizedCheckIn = checkIn || null;
    record.regularizedCheckOut = checkOut || null;

    await record.save();

    res.json(record);

  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
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

function calculateWorkHours(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;

  const [inH, inM] = checkIn.split(":").map(Number);
  const [outH, outM] = checkOut.split(":").map(Number);

  let checkInMinutes = inH * 60 + inM;
  let checkOutMinutes = outH * 60 + outM;

  // Night Shift
  if (checkOutMinutes < checkInMinutes) {
    checkOutMinutes += 24 * 60;
  }

  const totalMinutes = checkOutMinutes - checkInMinutes;

  return Number((totalMinutes / 60).toFixed(2));
}

// HR / Admin: Approve or reject a regularization request
exports.reviewRegularization = async (req, res) => {
  const { status, comment } = req.body;
  const OFFICE_START = process.env.OFFICE_START || "09:00";
  const OFFICE_END = process.env.OFFICE_END || "18:00";

  try {
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Invalid status",
      });
    }

    const record = await Attendance.findById(req.params.id)
      .populate("employee", "name employeeId");

    if (!record) {
      return res.status(404).json({
        message: "Record not found",
      });
    }

    if (record.regularizationStatus !== "pending") {
      return res.status(400).json({
        message: "Already reviewed",
      });
    }

    record.regularizationStatus = status;
    record.regularizationComment = comment?.trim() || "";

    if (status === "approved") {

      // Apply corrected check-in
      if (record.regularizedCheckIn) {
        record.checkIn = record.regularizedCheckIn;
        record.isLate = record.checkIn > OFFICE_START;
      }

      // Apply corrected check-out
      if (record.regularizedCheckOut) {
        record.checkOut = record.regularizedCheckOut;
        record.isEarlyLeave = record.checkOut < OFFICE_END;
      }

      record.workHours = calculateWorkHours(
        record.checkIn,
        record.checkOut
      );
    }

    // cal workhours
    if (record.workHours >= 8) {
      record.status = "present";
    }
    else if (record.workHours >= 4) {
      record.status = "half-day";
    }
    else {
      record.status = "absent";
    }

    await record.save();

    res.json(record);

  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
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
