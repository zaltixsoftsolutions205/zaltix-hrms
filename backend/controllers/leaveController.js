const Leave = require('../models/Leave');
const LeavePolicy = require('../models/LeavePolicy');
const { sendMail } = require('../config/mail');
const { leaveStatusTemplate } = require('../utils/emailTemplates');
const moment = require('moment');
const User = require('../models/User');
const notificationService = require('../services/notificationService');

const getWorkingDays = (fromDate, toDate) => {
  let count = 0;
  const current = moment(fromDate);
  const end = moment(toDate);
  while (current <= end) {
    if (current.day() !== 0 && current.day() !== 6) count++;
    current.add(1, 'days');
  }
  return count;
};

// Get leave balance for an employee
const getLeaveBalance = async (userId, year) => {
  const policy = await LeavePolicy.findOne({ year, appliesTo: 'all' });
  if (!policy) return {
    casual: { total: 0, used: 0, remaining: 0 },
    sick: { total: 0, used: 0, remaining: 0 },
    other: { total: 0, used: 0, remaining: 0 },
    lop: { total: null, used: 0, remaining: null },
  };

  const startOfYear = new Date(`${year}-01-01`);
  const endOfYear = new Date(`${year}-12-31`);
  const approvedLeaves = await Leave.find({ employee: userId, status: 'approved', fromDate: { $gte: startOfYear, $lte: endOfYear } });

  const used = { casual: 0, sick: 0, other: 0, lop: 0 };
  approvedLeaves.forEach(l => { used[l.type] = (used[l.type] || 0) + l.totalDays; });

  return {
    casual: { total: policy.casualLeaves, used: used.casual, remaining: policy.casualLeaves - used.casual },
    sick: { total: policy.sickLeaves, used: used.sick, remaining: policy.sickLeaves - used.sick },
    other: { total: policy.otherLeaves, used: used.other, remaining: policy.otherLeaves - used.other },
    lop: { total: null, used: used.lop, remaining: null },
  };
};

// Employee: Apply leave
exports.applyLeave = async (req, res) => {
  const { type, fromDate, toDate, reason, halfDay, session } = req.body;
  try {
    let totalDays;
    let actualToDate = toDate;
    if (halfDay) {
      totalDays = 0.5;
      actualToDate = fromDate; // half day is always a single day
    } else {
      totalDays = getWorkingDays(fromDate, toDate);
      if (totalDays <= 0) return res.status(400).json({ message: 'Invalid date range' });
    }

    const leave = await Leave.create({
      employee: req.user._id,
      type, fromDate: new Date(fromDate), toDate: new Date(actualToDate), totalDays, reason,
      halfDay: !!halfDay, session: halfDay ? (session || 'morning') : null,
    });

    // Notify HR
    const hrUsers = await User.find({ role: { $in: ['hr', 'admin'] } });
    const halfDayLabel = halfDay ? `half-day (${session || 'morning'}) ` : '';
    const dateLabel = halfDay
      ? `on ${moment(fromDate).format('DD MMM')}`
      : `from ${moment(fromDate).format('DD MMM')} to ${moment(toDate).format('DD MMM')}`;
    await notificationService.notifyMany(hrUsers.map(hr => hr._id), {
      title: 'New Leave Request',
      message: `${req.user.name} applied for ${halfDayLabel}${type} leave ${dateLabel}.`,
      type: 'leave',
      link: '/hr/leaves',
    });

    const populated = await Leave.findById(leave._id).populate('employee', 'name employeeId');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Employee: Get own leaves
exports.getMyLeaves = async (req, res) => {
  try {
    const leaves = await Leave.find({ employee: req.user._id }).sort({ createdAt: -1 });
    const year = new Date().getFullYear();
    const balance = await getLeaveBalance(req.user._id, year);
    res.json({ leaves, balance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR / Admin: Get all leaves
exports.getAllLeaves = async (req, res) => {
  const { status, employeeId } = req.query;
  try {
    let filter = {};
    if (status) filter.status = status;
    if (employeeId) filter.employee = employeeId;
    const leaves = await Leave.find(filter).populate('employee', 'name employeeId department').populate('approvedBy', 'name').sort({ createdAt: -1 });
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR / Admin: Approve or Reject
exports.updateLeaveStatus = async (req, res) => {
  const { status, comments } = req.body;
  try {
    const leave = await Leave.findById(req.params.id).populate('employee');
    if (!leave) return res.status(404).json({ message: 'Leave not found' });

    leave.status = status;
    leave.approvedBy = req.user._id;
    leave.approvalDate = new Date();
    leave.approverComments = comments || '';
    await leave.save();

    // Notify employee
    await notificationService.notify(leave.employee._id, {
      title: `Leave ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message: `Your ${leave.type} leave request has been ${status}.`,
      type: 'leave',
      link: '/leaves',
    });

    // Email employee
    try {
      await sendMail({
        to: leave.employee.email,
        subject: `Leave Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        html: leaveStatusTemplate({
          employeeName: leave.employee.name,
          leaveType: leave.type,
          fromDate: moment(leave.fromDate).format('DD MMM YYYY'),
          toDate: moment(leave.toDate).format('DD MMM YYYY'),
          status,
          comments,
        }),
      });
    } catch (_) {}

    const updated = await Leave.findById(leave._id).populate('employee', 'name employeeId').populate('approvedBy', 'name');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get leave balance (accessible by employee for own, HR for any)
exports.getLeaveBalance = async (req, res) => {
  const empId = req.params.employeeId || req.user._id;
  const year = parseInt(req.query.year) || new Date().getFullYear();
  try {
    const balance = await getLeaveBalance(empId, year);
    res.json(balance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
