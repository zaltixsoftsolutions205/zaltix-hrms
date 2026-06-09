const User = require('../models/User');
const Department = require('../models/Department');
const LeavePolicy = require('../models/LeavePolicy');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Payslip = require('../models/Payslip');
const Task = require('../models/Task');
const Lead = require('../models/Lead');
const PurchaseOrder = require('../models/PurchaseOrder');
const Expense = require('../models/Expense');
const moment = require('moment');

// Department CRUD
exports.getDepartments = async (req, res) => {
  try {
    const departments = await Department.find().populate('headOf', 'name employeeId').sort({ name: 1 });
    const withCount = await Promise.all(
      departments.map(async (dept) => {
        const count = await User.countDocuments({ department: dept._id, isActive: true });
        return { ...dept.toObject(), employeeCount: count };
      })
    );
    res.json(withCount);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createDepartment = async (req, res) => {
  const { name, description, headOf } = req.body;
  try {
    const dept = await Department.create({ name, description, headOf: headOf || null });
    const populated = await Department.findById(dept._id).populate('headOf', 'name employeeId');
    res.status(201).json(populated);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Department already exists' });
    res.status(500).json({ message: err.message });
  }
};

exports.updateDepartment = async (req, res) => {
  try {
    const dept = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('headOf', 'name employeeId');
    if (!dept) return res.status(404).json({ message: 'Department not found' });
    res.json(dept);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const empCount = await User.countDocuments({ department: req.params.id });
    if (empCount > 0) return res.status(400).json({ message: 'Cannot delete department with active employees' });
    await Department.findByIdAndDelete(req.params.id);
    res.json({ message: 'Department deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Leave Policy CRUD
exports.getLeavePolicies = async (req, res) => {
  try {
    const policies = await LeavePolicy.find().sort({ year: -1 });
    res.json(policies);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createLeavePolicy = async (req, res) => {
  try {
    const policy = await LeavePolicy.create(req.body);
    res.status(201).json(policy);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateLeavePolicy = async (req, res) => {
  try {
    const policy = await LeavePolicy.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!policy) return res.status(404).json({ message: 'Policy not found' });
    res.json(policy);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Reports
exports.getAttendanceReport = async (req, res) => {
  const { month, year } = req.query;
  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = moment(startDate).endOf('month').format('YYYY-MM-DD');
    const employees = await User.find({ role: { $in: ['employee', 'sales', 'hr'] }, isActive: true }).select('_id name employeeId').populate('department');
    const report = await Promise.all(
      employees.map(async (emp) => {
        const records = await Attendance.find({ employee: emp._id, date: { $gte: startDate, $lte: endDate } });
        return {
          employee: emp,
          present: records.filter(r => r.status === 'present').length,
          absent: records.filter(r => r.status === 'absent').length,
          halfDay: records.filter(r => r.status === 'half-day').length,
          totalDays: records.length,
          totalHours: records.reduce((s, r) => s + (r.workHours || 0), 0).toFixed(2),
        };
      })
    );
    res.json(report);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getLeaveReport = async (req, res) => {
  const { year } = req.query;
  try {
    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year}-12-31`);
    const leaves = await Leave.find({ fromDate: { $gte: startDate, $lte: endDate } }).populate('employee', 'name employeeId department').populate('approvedBy', 'name').sort({ createdAt: -1 });
    const stats = {
      total: leaves.length,
      approved: leaves.filter(l => l.status === 'approved').length,
      rejected: leaves.filter(l => l.status === 'rejected').length,
      pending: leaves.filter(l => l.status === 'pending').length,
    };
    res.json({ leaves, stats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getPayrollReport = async (req, res) => {
  const { month, year } = req.query;
  try {
    const payslips = await Payslip.find({ month: parseInt(month), year: parseInt(year) }).populate('employee', 'name employeeId department');
    const summary = {
      totalEmployees: payslips.length,
      totalGross: payslips.reduce((s, p) => s + p.grossSalary, 0),
      totalDeductions: payslips.reduce((s, p) => s + p.deductions.reduce((ds, d) => ds + d.amount, 0), 0),
      totalNet: payslips.reduce((s, p) => s + p.netSalary, 0),
    };
    res.json({ payslips, summary });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCrmReport = async (req, res) => {
  try {
    const salesEmployees = await User.find({ role: 'sales', isActive: true }).select('_id name employeeId');
    const report = await Promise.all(
      salesEmployees.map(async (emp) => {
        const total = await Lead.countDocuments({ assignedTo: emp._id });
        const converted = await Lead.countDocuments({ assignedTo: emp._id, status: 'converted' });
        const notInterested = await Lead.countDocuments({ assignedTo: emp._id, status: 'not-interested' });
        return { employee: emp, total, converted, notInterested, conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0 };
      })
    );
    const totalLeads = await Lead.countDocuments();
    const totalConverted = await Lead.countDocuments({ status: 'converted' });
    res.json({ report, totalLeads, totalConverted, overallConversionRate: totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 100) : 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Dashboard stats
exports.getDashboardStats = async (req, res) => {
  try {
    const today = moment().format('YYYY-MM-DD');
    const totalEmployees = await User.countDocuments({ role: { $ne: 'admin' }, isActive: true });
    const presentToday = await Attendance.countDocuments({ date: today, status: { $in: ['present', 'half-day'] } });
    const pendingLeaves = await Leave.countDocuments({ status: 'pending' });
    const openTasks = await Task.countDocuments({ status: { $ne: 'completed' } });
    const totalLeads = await Lead.countDocuments();
    const convertedLeads = await Lead.countDocuments({ status: 'converted' });

    res.json({ totalEmployees, presentToday, pendingLeaves, openTasks, totalLeads, convertedLeads });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Profit summary: revenue from POs, expenses from approved Expenses
exports.getProfitSummary = async (req, res) => {
  const { month, year } = req.query;
  try {
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year)  || new Date().getFullYear();

    const monthStart = new Date(`${y}-${String(m).padStart(2, '0')}-01`);
    const monthEnd   = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const [poResult, expenseResult] = await Promise.all([
      PurchaseOrder.aggregate([
        { $match: { createdAt: { $gte: monthStart, $lt: monthEnd }, status: { $nin: ['cancelled'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Expense.aggregate([
        { $match: { date: { $gte: monthStart, $lt: monthEnd }, status: 'approved' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const revenue  = poResult[0]?.total || 0;
    const expenses = expenseResult[0]?.total || 0;
    const profit   = revenue - expenses;

    res.json({ revenue, expenses, profit, month: m, year: y });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
