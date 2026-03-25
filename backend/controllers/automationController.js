const User              = require('../models/User');
const Task              = require('../models/Task');
const Attendance        = require('../models/Attendance');
const Lead              = require('../models/Lead');
const Deal              = require('../models/Deal');
const Document          = require('../models/Document');
const ProductivityScore = require('../models/ProductivityScore');
const {
  checkTasks,
  checkMissingCheckout,
  checkAttendancePatterns,
  checkCRMAlerts,
  checkDocumentCompliance,
  sendMorningSummary,
  sendEveningSummary,
  calculateProductivityScores,
  sendWeeklyReport,
  currentWeekLabel,
  prevWeekLabel,
} = require('../services/automationService');

// ─── GET /api/automation/dashboard ───────────────────────────────────────────
// Returns live stats for the automation admin page

exports.getDashboard = async (req, res) => {
  try {
    const now = new Date();

    // Overdue tasks
    const overdueTasks = await Task.find({
      deadline: { $lt: now },
      status: { $nin: ['completed'] },
    })
      .populate('assignedTo', 'name employeeId')
      .populate('assignedBy', 'name')
      .sort({ deadline: 1 })
      .limit(20)
      .lean();

    // Tasks due in next 48h
    const in48h = new Date(now.getTime() + 48 * 3600000);
    const upcomingTasks = await Task.find({
      deadline: { $gte: now, $lte: in48h },
      status: { $nin: ['completed'] },
    })
      .populate('assignedTo', 'name employeeId')
      .sort({ deadline: 1 })
      .limit(10)
      .lean();

    // Missing checkouts today
    const todayStr = now.toISOString().slice(0, 10);
    const missingCheckouts = await Attendance.find({
      date: todayStr,
      checkIn: { $ne: null },
      checkOut: null,
      status: 'present',
    })
      .populate('employee', 'name employeeId')
      .lean();

    // Stale CRM leads (no activity 7+ days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const staleLeads = await Lead.find({
      status: { $nin: ['converted', 'not-interested'] },
      updatedAt: { $lt: sevenDaysAgo },
    })
      .populate('assignedTo', 'name employeeId')
      .sort({ updatedAt: 1 })
      .limit(15)
      .lean();

    // Pending documents
    const pendingDocsByEmp = await Document.aggregate([
      { $match: { status: 'pending_upload' } },
      { $group: { _id: '$employee', count: { $sum: 1 }, docs: { $push: '$docType' } } },
    ]);
    const empIds = pendingDocsByEmp.map(d => d._id);
    const empNames = await User.find({ _id: { $in: empIds } }, 'name employeeId').lean();
    const empMap = Object.fromEntries(empNames.map(e => [String(e._id), e]));
    const pendingDocs = pendingDocsByEmp.map(d => ({
      ...d,
      employee: empMap[String(d._id)],
    }));

    // Latest productivity scores (current week)
    const weekLabel = currentWeekLabel();
    const latestScores = await ProductivityScore.find({ week: weekLabel })
      .populate('employee', 'name employeeId role')
      .sort({ totalScore: -1 })
      .lean();

    // Previous week scores too
    const prevLabel = prevWeekLabel();
    const prevScores = await ProductivityScore.find({ week: prevLabel })
      .populate('employee', 'name employeeId role')
      .sort({ totalScore: -1 })
      .lean();

    // Summary counts
    const totalEmployees = await User.countDocuments({ isActive: true, role: { $ne: 'admin' } });
    const totalActiveTasks = await Task.countDocuments({ status: { $nin: ['completed'] } });
    const totalOverdue = overdueTasks.length;
    const avgScore = latestScores.length
      ? Math.round(latestScores.reduce((s, x) => s + x.totalScore, 0) / latestScores.length)
      : (prevScores.length
          ? Math.round(prevScores.reduce((s, x) => s + x.totalScore, 0) / prevScores.length)
          : null);

    res.json({
      summary: { totalEmployees, totalActiveTasks, totalOverdue, avgScore, weekLabel },
      overdueTasks,
      upcomingTasks,
      missingCheckouts,
      staleLeads,
      pendingDocs,
      scores: latestScores.length ? latestScores : prevScores,
      scoresWeek: latestScores.length ? weekLabel : prevLabel,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /api/automation/scores/:employeeId ────────────────────────────────
// Last 8 weeks of productivity scores for an employee

exports.getEmployeeScores = async (req, res) => {
  try {
    const employee = await User.findById(req.params.employeeId, '_id name employeeId role').lean();
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const scores = await ProductivityScore.find({ employee: req.params.employeeId })
      .sort({ weekStart: -1 })
      .limit(8)
      .lean();

    res.json({ employee, scores });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /api/automation/my-score ─────────────────────────────────────────
// Current user's last 8 weeks of scores

exports.getMyScore = async (req, res) => {
  try {
    const scores = await ProductivityScore.find({ employee: req.user._id })
      .sort({ weekStart: -1 })
      .limit(8)
      .lean();

    const latestTask = await Task.countDocuments({ assignedTo: req.user._id, status: { $nin: ['completed'] } });
    const overdueTask = await Task.countDocuments({ assignedTo: req.user._id, status: { $nin: ['completed'] }, deadline: { $lt: new Date() } });

    res.json({ scores, pendingTasks: latestTask, overdueTasks: overdueTask });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── POST /api/automation/run/:job ───────────────────────────────────────────
// Admin-only: manually trigger an automation job

exports.runJob = async (req, res) => {
  const { job } = req.params;
  const jobs = {
    tasks:               checkTasks,
    checkout:            checkMissingCheckout,
    attendance:          checkAttendancePatterns,
    crm:                 checkCRMAlerts,
    documents:           checkDocumentCompliance,
    morning:             sendMorningSummary,
    evening:             sendEveningSummary,
    weekly:              sendWeeklyReport,
    scores:              () => calculateProductivityScores(req.body?.week),
  };

  if (!jobs[job]) return res.status(400).json({ message: `Unknown job: ${job}` });

  try {
    await jobs[job]();
    res.json({ message: `Job "${job}" completed successfully.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
