const Timesheet = require('../models/Timesheet');
const User = require('../models/User');
const Department = require('../models/Department');
const notificationService = require('../services/notificationService');
const moment = require('moment');

// Normalise a date to the start of its day (midnight) so the per-day unique index
// and lookups are stable regardless of the time component sent by the client.
const startOfDay = (d) => moment(d).startOf('day').toDate();

// Match a department name against a keyword, case-insensitively.
const deptNameMatches = (name, keyword) =>
  !!name && name.toLowerCase().includes(keyword);

/**
 * Resolve who an employee's timesheet should be routed to for approval.
 * Returns { approverId, routedRole } where routedRole is 'admin' | 'hr' | 'lead'.
 *
 * Rules:
 *   - HR              -> Admin
 *   - Marketing/Sales -> HR
 *   - Technical       -> Technical department head (tech lead)
 *                        (the tech lead's own timesheet -> Admin)
 *   - anyone else / fallback -> Admin
 */
const resolveApprover = async (user) => {
  const admin = await User.findOne({ role: 'admin', isActive: true }).select('_id').lean();
  const adminRoute = { approverId: admin?._id || null, routedRole: 'admin' };

  // HR -> Admin
  if (user.role === 'hr') return adminRoute;

  // Load the employee's department (name + head) once.
  const dept = user.department
    ? await Department.findById(user.department).select('name headOf').lean()
    : null;
  const deptName = dept?.name || '';

  const isSales = user.role === 'sales' || deptNameMatches(deptName, 'sales');
  const isMarketing = deptNameMatches(deptName, 'marketing');
  const isTechnical =
    deptNameMatches(deptName, 'technical') ||
    deptNameMatches(deptName, 'tech') ||
    deptNameMatches(deptName, 'engineering') ||
    deptNameMatches(deptName, 'development');

  // Marketing / Sales -> HR
  if (isMarketing || isSales) {
    const hr = await User.findOne({ role: 'hr', isActive: true }).select('_id').lean();
    if (hr) return { approverId: hr._id, routedRole: 'hr' };
    return adminRoute; // no HR configured — fall back to Admin
  }

  // Technical -> tech lead (department head); the lead themselves -> Admin
  if (isTechnical) {
    const leadId = dept?.headOf;
    if (leadId && String(leadId) !== String(user._id)) {
      return { approverId: leadId, routedRole: 'lead' };
    }
    return adminRoute;
  }

  // Everyone else -> Admin
  return adminRoute;
};

// Employee: create or update today's (or a given date's) timesheet.
exports.submitTimesheet = async (req, res) => {
  try {
    const { date, entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ message: 'At least one timesheet entry is required.' });
    }
    for (const e of entries) {
      if (!e.task || e.hours == null || e.hours < 0) {
        return res.status(400).json({ message: 'Each entry needs a task and valid hours.' });
      }
    }

    const day = startOfDay(date || new Date());
    const { approverId, routedRole } = await resolveApprover(req.user);

    let timesheet = await Timesheet.findOne({ employee: req.user._id, date: day });

    if (timesheet) {
      // Don't allow editing an already-approved timesheet.
      if (timesheet.status === 'approved') {
        return res.status(400).json({ message: 'An approved timesheet cannot be edited.' });
      }
      timesheet.entries = entries;
      timesheet.status = 'pending';
      timesheet.routedTo = approverId;
      timesheet.routedRole = routedRole;
      timesheet.reviewedBy = null;
      timesheet.reviewDate = null;
      timesheet.reviewerComments = '';
      await timesheet.save();
    } else {
      timesheet = await Timesheet.create({
        employee: req.user._id,
        date: day,
        entries,
        routedTo: approverId,
        routedRole,
      });
    }

    // Notify the approver.
    if (approverId) {
      await notificationService.notify(approverId, {
        title: 'Timesheet Submitted',
        message: `${req.user.name} submitted a timesheet for ${moment(day).format('DD MMM YYYY')} (${timesheet.totalHours}h).`,
        type: 'task',
        link: '/timesheets/approvals',
      });
    }

    const populated = await Timesheet.findById(timesheet._id)
      .populate('employee', 'name employeeId')
      .populate('routedTo', 'name role');
    res.status(201).json(populated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A timesheet for this date already exists.' });
    }
    res.status(500).json({ message: err.message });
  }
};

// Employee: own timesheets (optionally filtered by month/year).
exports.getMyTimesheets = async (req, res) => {
  try {
    const filter = { employee: req.user._id };
    const { month, year } = req.query;
    if (month && year) {
      const start = moment(`${year}-${month}-01`, 'YYYY-M-DD').startOf('month').toDate();
      const end = moment(start).endOf('month').toDate();
      filter.date = { $gte: start, $lte: end };
    }
    const timesheets = await Timesheet.find(filter)
      .populate('routedTo', 'name role')
      .populate('reviewedBy', 'name')
      .sort({ date: -1 });
    res.json(timesheets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Approver: timesheets routed to me awaiting (or already actioned) review.
// Admin sees everything; others see only what was routed to them.
exports.getApprovals = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (req.user.role !== 'admin') {
      filter.routedTo = req.user._id;
    }
    if (status) filter.status = status;

    const timesheets = await Timesheet.find(filter)
      .populate('employee', 'name employeeId department role')
      .populate('routedTo', 'name role')
      .populate('reviewedBy', 'name')
      .sort({ date: -1 });
    res.json(timesheets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Approver: approve or reject a timesheet routed to them (admin may action any).
exports.reviewTimesheet = async (req, res) => {
  try {
    const { status, comments } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved or rejected.' });
    }

    const timesheet = await Timesheet.findById(req.params.id).populate('employee', 'name');
    if (!timesheet) return res.status(404).json({ message: 'Timesheet not found.' });

    const isAdmin = req.user.role === 'admin';
    const isRoutedApprover =
      timesheet.routedTo && String(timesheet.routedTo) === String(req.user._id);
    if (!isAdmin && !isRoutedApprover) {
      return res.status(403).json({ message: 'You are not the assigned approver for this timesheet.' });
    }

    timesheet.status = status;
    timesheet.reviewedBy = req.user._id;
    timesheet.reviewDate = new Date();
    timesheet.reviewerComments = comments || '';
    await timesheet.save();

    await notificationService.notify(timesheet.employee._id, {
      title: `Timesheet ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message: `Your timesheet for ${moment(timesheet.date).format('DD MMM YYYY')} has been ${status}.`,
      type: 'task',
      link: '/timesheets',
    });

    const updated = await Timesheet.findById(timesheet._id)
      .populate('employee', 'name employeeId')
      .populate('routedTo', 'name role')
      .populate('reviewedBy', 'name');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  submitTimesheet: exports.submitTimesheet,
  getMyTimesheets: exports.getMyTimesheets,
  getApprovals: exports.getApprovals,
  reviewTimesheet: exports.reviewTimesheet,
};
