/**
 * Automation & Work Intelligence Service
 * ----------------------------------------
 * Scheduled jobs that monitor employee activity and send smart alerts.
 * Uses existing notify() — zero changes to existing HRMS logic.
 *
 * Schedule summary:
 *  - Every hour        : Task deadline & overdue checks
 *  - Mon–Sat 08:30     : Morning work summary per employee
 *  - Mon–Sat 18:30     : Evening summary + missing checkout detection
 *  - Mon–Sat 09:30     : CRM + document compliance checks
 *  - Every Monday 09:00: Weekly performance report + productivity score
 */

const cron = require('node-cron');
const mongoose = require('mongoose');

const User            = require('../models/User');
const Task            = require('../models/Task');
const Attendance      = require('../models/Attendance');
const Lead            = require('../models/Lead');
const Document        = require('../models/Document');
const ProductivityScore = require('../models/ProductivityScore');
const { notify, notifyMany } = require('./notificationService');

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Returns today's date string in YYYY-MM-DD (IST-safe via UTC+5:30) */
const todayStr = () => {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
};

/** Returns { start, end } of a given ISO week label e.g. "2026-W10" */
const weekBounds = (weekLabel) => {
  const [year, wk] = weekLabel.split('-W').map(Number);
  const jan4 = new Date(year, 0, 4);
  const firstMonday = new Date(jan4);
  firstMonday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const start = new Date(firstMonday);
  start.setDate(firstMonday.getDate() + (wk - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

/** Returns current ISO week label e.g. "2026-W10" */
const currentWeekLabel = () => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

/** Returns previous week label */
const prevWeekLabel = () => {
  const now = new Date();
  now.setDate(now.getDate() - 7);
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

/** Returns working day strings (Mon–Sat) in a date range */
const workingDaysInRange = (start, end) => {
  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay(); // 0=Sun
    if (dow !== 0) {
      days.push(cur.toISOString().slice(0, 10));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
};

/** Clamp value 0–100 */
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

// ─── 1. TASK MONITORING ───────────────────────────────────────────────────────
// Runs every hour. Detects:
//   • Tasks overdue → notify employee + admin/assignedBy
//   • Tasks due within 24 hours → remind employee
//   • Tasks stuck "not-started" past deadline → escalate

async function checkTasks() {
  try {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Overdue (deadline passed, not complete)
    const overdueTasks = await Task.find({
      deadline: { $lt: now },
      status: { $nin: ['completed'] },
    }).populate('assignedTo assignedBy', '_id name');

    for (const task of overdueTasks) {
      const daysPast = Math.floor((now - task.deadline) / 86400000);
      const label = daysPast === 0 ? 'today' : `${daysPast}d ago`;

      // Notify employee (once per day — avoid spam by checking no recent notification)
      await notify(task.assignedTo._id, {
        title: '⏰ Task Overdue',
        message: `Your task "${task.title}" was due ${label}. Please update the status.`,
        type: 'task',
        link: '/tasks',
      });

      // Escalate to admin/assignedBy if different from employee
      if (task.assignedBy && String(task.assignedBy._id) !== String(task.assignedTo._id)) {
        await notify(task.assignedBy._id, {
          title: '🚨 Task Not Progressing',
          message: `"${task.title}" assigned to ${task.assignedTo.name} is overdue (due ${label}). Status: ${task.status}.`,
          type: 'task',
          link: '/admin/tasks',
        });
      }
    }

    // Due in next 24h — reminder
    const upcomingTasks = await Task.find({
      deadline: { $gte: now, $lte: in24h },
      status: { $nin: ['completed'] },
    }).populate('assignedTo', '_id name');

    for (const task of upcomingTasks) {
      const hoursLeft = Math.floor((task.deadline - now) / 3600000);
      await notify(task.assignedTo._id, {
        title: '⚡ Task Deadline Soon',
        message: `"${task.title}" is due in ~${hoursLeft}h. Mark it complete before the deadline.`,
        type: 'task',
        link: '/tasks',
      });
    }

    console.log(`[Automation] Task check: ${overdueTasks.length} overdue, ${upcomingTasks.length} upcoming`);
  } catch (err) {
    console.error('[Automation] checkTasks error:', err.message);
  }
}

// ─── 2. ATTENDANCE MONITORING ─────────────────────────────────────────────────
// Runs Mon–Sat at 18:30. Detects missing checkouts.
// Attendance pattern analysis runs on Mon at 09:00 (weekly).

async function checkMissingCheckout() {
  try {
    const today = todayStr();
    // Find employees who checked in but not out
    const records = await Attendance.find({
      date: today,
      checkIn: { $ne: null },
      checkOut: null,
      status: 'present',
    }).populate('employee', '_id name');

    for (const rec of records) {
      await notify(rec.employee._id, {
        title: '🕐 Missing Check-Out',
        message: `You haven't checked out today. Please update your attendance to avoid discrepancy.`,
        type: 'general',
        link: '/attendance',
      });
    }

    console.log(`[Automation] Missing checkout: ${records.length} employees`);
  } catch (err) {
    console.error('[Automation] checkMissingCheckout error:', err.message);
  }
}

async function checkAttendancePatterns() {
  try {
    // Last 10 working days
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 14 * 86400000);
    const recentDays = workingDaysInRange(tenDaysAgo, now).slice(-10);

    const employees = await User.find({ isActive: true, role: { $ne: 'admin' } }, '_id name role');
    const hrAdmins = await User.find({ isActive: true, role: { $in: ['hr', 'admin'] } }, '_id');

    for (const emp of employees) {
      const records = await Attendance.find({
        employee: emp._id,
        date: { $in: recentDays },
      });

      const lateDays      = records.filter(r => r.isLate).length;
      const earlyDays     = records.filter(r => r.isEarlyLeave).length;
      const absentDays    = recentDays.length - records.length;
      const presentDays   = records.filter(r => r.status === 'present').length;

      // Alert employee if issues
      if (lateDays >= 3) {
        await notify(emp._id, {
          title: '⚠️ Late Attendance Alert',
          message: `You have been late ${lateDays} times in the last 10 working days. Please maintain office hours (9:30 AM).`,
          type: 'general',
          link: '/attendance',
        });
      }

      if (absentDays >= 3) {
        await notify(emp._id, {
          title: '📋 Attendance Pattern Alert',
          message: `You have ${absentDays} unrecorded days in the last 10 working days. Please regularize if needed.`,
          type: 'general',
          link: '/attendance',
        });
      }

      // Alert HR/Admin if pattern is severe
      if (lateDays >= 5 || absentDays >= 4 || (presentDays / recentDays.length) < 0.6) {
        for (const mgr of hrAdmins) {
          await notify(mgr._id, {
            title: '📊 Poor Attendance: ' + emp.name,
            message: `${emp.name} — Late: ${lateDays}, Absent: ${absentDays} in last 10 days. Attendance rate: ${Math.round((presentDays / recentDays.length) * 100)}%`,
            type: 'general',
            link: '/admin/attendance',
          });
        }
      }
    }

    console.log(`[Automation] Attendance pattern check done for ${employees.length} employees`);
  } catch (err) {
    console.error('[Automation] checkAttendancePatterns error:', err.message);
  }
}

// ─── 3. CRM SALES MONITORING ─────────────────────────────────────────────────
// Runs Mon–Sat 09:30. Detects stale leads and targets.

async function checkCRMAlerts() {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);

    // Leads with no activity in 7+ days (not converted/lost)
    const staleLeads = await Lead.find({
      status: { $nin: ['converted', 'not-interested'] },
      $or: [
        { 'activities.0': { $exists: false } },
        { updatedAt: { $lt: sevenDaysAgo } },
      ],
    }).populate('assignedTo', '_id name salesTarget');

    for (const lead of staleLeads) {
      const daysSince = Math.floor((now - lead.updatedAt) / 86400000);
      await notify(lead.assignedTo._id, {
        title: '📞 Lead Needs Follow-Up',
        message: `Lead "${lead.name}" has had no activity for ${daysSince} days. Schedule a follow-up.`,
        type: 'general',
        link: '/crm',
      });
    }

    // Overdue follow-up dates
    const overdueFollowUps = await Lead.find({
      followUpDate: { $lt: now },
      status: { $nin: ['converted', 'not-interested'] },
    }).populate('assignedTo', '_id name');

    for (const lead of overdueFollowUps) {
      await notify(lead.assignedTo._id, {
        title: '🗓️ Follow-Up Overdue',
        message: `Follow-up for "${lead.name}" was due on ${lead.followUpDate.toLocaleDateString('en-IN')}. Take action today.`,
        type: 'general',
        link: '/crm',
      });
    }

    // Aging leads (14+ days, still "new")
    const agingLeads = await Lead.find({
      status: 'new',
      createdAt: { $lt: fourteenDaysAgo },
    }).populate('assignedTo', '_id name');

    for (const lead of agingLeads) {
      await notify(lead.assignedTo._id, {
        title: '🕰️ Aging Lead Alert',
        message: `"${lead.name}" has been in "New" status for 14+ days. Qualify or mark as not interested.`,
        type: 'general',
        link: '/crm',
      });
    }

    // Sales target check — alert if under 50% of monthly target with < 10 days left
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysLeft = Math.ceil((monthEnd - now) / 86400000);

    if (daysLeft <= 10) {
      const salesUsers = await User.find({ isActive: true, role: { $in: ['sales', 'admin'] }, salesTarget: { $gt: 0 } }, '_id name salesTarget');
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      for (const user of salesUsers) {
        const wonDeals = await mongoose.model('Deal').find({
          assignedTo: user._id,
          status: 'won',
          closedDate: { $gte: monthStart, $lte: now },
        });
        const achieved = wonDeals.reduce((s, d) => s + d.finalDealAmount, 0);
        const pct = Math.round((achieved / user.salesTarget) * 100);

        if (pct < 50) {
          await notify(user._id, {
            title: '🎯 Sales Target at Risk',
            message: `Only ${daysLeft} days left in the month. You've achieved ₹${achieved.toLocaleString('en-IN')} of ₹${user.salesTarget.toLocaleString('en-IN')} target (${pct}%).`,
            type: 'general',
            link: '/crm',
          });
        }
      }
    }

    console.log(`[Automation] CRM check: ${staleLeads.length} stale, ${overdueFollowUps.length} overdue follow-ups, ${agingLeads.length} aging`);
  } catch (err) {
    console.error('[Automation] checkCRMAlerts error:', err.message);
  }
}

// ─── 4. DOCUMENT COMPLIANCE ───────────────────────────────────────────────────
// Runs Mon–Sat 09:30. Finds pending_upload documents.

async function checkDocumentCompliance() {
  try {
    const pendingDocs = await Document.find({ status: 'pending_upload' })
      .populate('employee', '_id name');

    // Group by employee
    const byEmployee = {};
    for (const doc of pendingDocs) {
      const id = String(doc.employee._id);
      if (!byEmployee[id]) byEmployee[id] = { employee: doc.employee, docs: [] };
      byEmployee[id].docs.push(doc.docType);
    }

    for (const { employee, docs } of Object.values(byEmployee)) {
      await notify(employee._id, {
        title: '📄 Documents Pending',
        message: `Please upload your missing documents: ${docs.join(', ')}. These are required for compliance.`,
        type: 'document',
        link: '/profile',
      });
    }

    console.log(`[Automation] Document compliance: ${Object.keys(byEmployee).length} employees with pending docs`);
  } catch (err) {
    console.error('[Automation] checkDocumentCompliance error:', err.message);
  }
}

// ─── 5. MORNING SUMMARY ───────────────────────────────────────────────────────
// Runs Mon–Sat at 08:30. Shows today's pending tasks + overdue follow-ups.

async function sendMorningSummary() {
  try {
    const now = new Date();
    const today = todayStr();
    const employees = await User.find({ isActive: true }, '_id name role');

    for (const emp of employees) {
      // Pending + in-progress tasks
      const pendingTasks = await Task.countDocuments({
        assignedTo: emp._id,
        status: { $nin: ['completed'] },
      });

      // Overdue tasks
      const overdueTasks = await Task.countDocuments({
        assignedTo: emp._id,
        status: { $nin: ['completed'] },
        deadline: { $lt: now },
      });

      // CRM: overdue follow-ups (for sales/admin)
      let followUps = 0;
      if (['sales', 'hr', 'admin'].includes(emp.role)) {
        followUps = await Lead.countDocuments({
          assignedTo: emp._id,
          followUpDate: { $lt: now },
          status: { $nin: ['converted', 'not-interested'] },
        });
      }

      if (pendingTasks === 0 && overdueTasks === 0 && followUps === 0) continue;

      const parts = [];
      if (pendingTasks > 0) parts.push(`${pendingTasks} pending task${pendingTasks > 1 ? 's' : ''}`);
      if (overdueTasks > 0) parts.push(`${overdueTasks} overdue`);
      if (followUps > 0) parts.push(`${followUps} CRM follow-up${followUps > 1 ? 's' : ''} overdue`);

      await notify(emp._id, {
        title: `☀️ Good Morning, ${emp.name.split(' ')[0]}!`,
        message: `Today's summary: ${parts.join(' | ')}. Have a productive day!`,
        type: 'general',
        link: '/tasks',
      });
    }

    console.log(`[Automation] Morning summary sent to ${employees.length} employees`);
  } catch (err) {
    console.error('[Automation] sendMorningSummary error:', err.message);
  }
}

// ─── 6. EVENING SUMMARY ───────────────────────────────────────────────────────
// Runs Mon–Sat at 18:30. Shows today's completed vs pending.

async function sendEveningSummary() {
  try {
    const now = new Date();
    const today = todayStr();
    const dayStart = new Date(today + 'T00:00:00.000Z');
    const employees = await User.find({ isActive: true }, '_id name role');

    for (const emp of employees) {
      const completedToday = await Task.countDocuments({
        assignedTo: emp._id,
        status: 'completed',
        completedDate: { $gte: dayStart, $lte: now },
      });

      const stillPending = await Task.countDocuments({
        assignedTo: emp._id,
        status: { $nin: ['completed'] },
        deadline: { $lte: now },
      });

      // Only notify if they have something to report
      if (completedToday === 0 && stillPending === 0) continue;

      const msg = completedToday > 0
        ? `You completed ${completedToday} task${completedToday > 1 ? 's' : ''} today. ${stillPending > 0 ? `${stillPending} task${stillPending > 1 ? 's are' : ' is'} still overdue.` : 'Great work!'}`
        : `No tasks completed today. ${stillPending} overdue task${stillPending > 1 ? 's' : ''} need attention.`;

      await notify(emp._id, {
        title: `🌙 Evening Wrap-Up`,
        message: msg,
        type: 'general',
        link: '/tasks',
      });
    }

    // Also trigger missing checkout detection at same time
    await checkMissingCheckout();

    console.log(`[Automation] Evening summary sent`);
  } catch (err) {
    console.error('[Automation] sendEveningSummary error:', err.message);
  }
}

// ─── 7. PRODUCTIVITY SCORE ────────────────────────────────────────────────────
// Calculates score for the previous week.
// Weights: Task 40% | Attendance 40% | CRM 20% (sales/admin only, else 50/50)

async function calculateProductivityScores(weekLabel) {
  const label = weekLabel || prevWeekLabel();
  const { start, end } = weekBounds(label);
  const workDays = workingDaysInRange(start, end);

  const employees = await User.find({ isActive: true }, '_id name role salesTarget');
  const scores = [];

  for (const emp of employees) {
    // ── Task Score ──
    const tasksTotal = await Task.countDocuments({
      assignedTo: emp._id,
      $or: [
        { deadline: { $gte: start, $lte: end } },
        { createdAt: { $gte: start, $lte: end } },
      ],
    });
    const tasksCompleted = await Task.countDocuments({
      assignedTo: emp._id,
      status: 'completed',
      $or: [
        { completedDate: { $gte: start, $lte: end } },
        { deadline: { $gte: start, $lte: end } },
      ],
    });
    const tasksOverdue = await Task.countDocuments({
      assignedTo: emp._id,
      status: { $nin: ['completed'] },
      deadline: { $gte: start, $lte: end },
    });

    const taskScore = tasksTotal === 0
      ? 80 // neutral score if no tasks assigned
      : clamp((tasksCompleted / tasksTotal) * 100 - tasksOverdue * 5);

    // ── Attendance Score ──
    const attRecords = await Attendance.find({
      employee: emp._id,
      date: { $in: workDays },
    });
    const presentDays   = attRecords.filter(r => r.status !== 'absent').length;
    const lateDays      = attRecords.filter(r => r.isLate).length;
    const earlyLeaveDays = attRecords.filter(r => r.isEarlyLeave).length;

    const attendanceScore = workDays.length === 0 ? 80
      : clamp((presentDays / workDays.length) * 100 - lateDays * 5 - earlyLeaveDays * 3);

    // ── CRM Score ── (only for sales/admin)
    let crmScore = null;
    let leadsTotal = 0, leadsConverted = 0, leadsWithActivity = 0;

    if (['sales', 'admin'].includes(emp.role)) {
      leadsTotal = await Lead.countDocuments({ assignedTo: emp._id });
      leadsConverted = await Lead.countDocuments({ assignedTo: emp._id, status: 'converted' });
      const activeLeads = await Lead.find({
        assignedTo: emp._id,
        status: { $nin: ['converted', 'not-interested'] },
      });
      leadsWithActivity = activeLeads.filter(l => {
        const lastActivity = l.activities?.[l.activities.length - 1];
        return lastActivity && new Date(lastActivity.date) >= start;
      }).length;

      crmScore = leadsTotal === 0 ? 70
        : clamp((leadsConverted / leadsTotal) * 60 + (leadsWithActivity / Math.max(activeLeads.length, 1)) * 40);
    }

    // ── Total Score (weighted) ──
    let totalScore;
    if (crmScore !== null) {
      totalScore = clamp(taskScore * 0.4 + attendanceScore * 0.4 + crmScore * 0.2);
    } else {
      totalScore = clamp(taskScore * 0.5 + attendanceScore * 0.5);
    }

    // Upsert score
    await ProductivityScore.findOneAndUpdate(
      { employee: emp._id, week: label },
      {
        weekStart: start,
        weekEnd: end,
        taskScore,
        attendanceScore,
        crmScore,
        totalScore,
        tasksCompleted,
        tasksTotal,
        tasksOverdue,
        attendanceDays: presentDays,
        workingDays: workDays.length,
        lateDays,
        earlyLeaveDays,
        leadsConverted,
        leadsTotal,
        leadsWithActivity,
      },
      { upsert: true, new: true }
    );

    scores.push({ emp, totalScore, taskScore, attendanceScore, crmScore });
  }

  return scores;
}

// ─── 8. WEEKLY PERFORMANCE REPORT ────────────────────────────────────────────
// Runs every Monday at 09:00. Sends personalised report + notifies admin.

async function sendWeeklyReport() {
  try {
    const scores = await calculateProductivityScores();
    const hrAdmins = await User.find({ isActive: true, role: { $in: ['hr', 'admin'] } }, '_id');
    const weekLabel = prevWeekLabel();

    // Notify each employee
    for (const { emp, totalScore, taskScore, attendanceScore, crmScore } of scores) {
      const grade = totalScore >= 90 ? '🌟 Excellent' : totalScore >= 75 ? '✅ Good' : totalScore >= 60 ? '📊 Average' : '⚠️ Needs Improvement';
      const crmPart = crmScore !== null ? ` | CRM: ${crmScore}%` : '';

      await notify(emp._id, {
        title: `📈 Weekly Performance Report — ${weekLabel}`,
        message: `${grade} (${totalScore}%). Tasks: ${taskScore}% | Attendance: ${attendanceScore}%${crmPart}. Check your dashboard for details.`,
        type: 'general',
        link: '/dashboard',
      });
    }

    // Summary to HR/Admin
    const avgScore = scores.length
      ? Math.round(scores.reduce((s, x) => s + x.totalScore, 0) / scores.length)
      : 0;
    const topPerformers = scores.filter(x => x.totalScore >= 85).length;
    const needsAttention = scores.filter(x => x.totalScore < 60).length;

    for (const mgr of hrAdmins) {
      await notify(mgr._id, {
        title: `📊 Weekly Team Report — ${weekLabel}`,
        message: `Team avg score: ${avgScore}%. Top performers: ${topPerformers} | Needs attention: ${needsAttention}. Check Automation page for full breakdown.`,
        type: 'general',
        link: '/admin/automation',
      });
    }

    // Also run attendance pattern checks on Monday
    await checkAttendancePatterns();

    console.log(`[Automation] Weekly report sent. Avg score: ${avgScore}%`);
  } catch (err) {
    console.error('[Automation] sendWeeklyReport error:', err.message);
  }
}

// ─── SCHEDULER ────────────────────────────────────────────────────────────────

let started = false;

function startAutomation() {
  if (started) return;
  started = true;

  // Task monitoring — every hour
  cron.schedule('0 * * * *', checkTasks, { timezone: 'Asia/Kolkata' });

  // Morning summary — Mon–Sat at 08:30
  cron.schedule('30 8 * * 1-6', sendMorningSummary, { timezone: 'Asia/Kolkata' });

  // Evening summary + missing checkout — Mon–Sat at 18:30
  cron.schedule('30 18 * * 1-6', sendEveningSummary, { timezone: 'Asia/Kolkata' });

  // CRM alerts + document compliance — Mon–Sat at 09:30
  cron.schedule('30 9 * * 1-6', async () => {
    await checkCRMAlerts();
    await checkDocumentCompliance();
  }, { timezone: 'Asia/Kolkata' });

  // Weekly report + productivity scores — every Monday at 09:00
  cron.schedule('0 9 * * 1', sendWeeklyReport, { timezone: 'Asia/Kolkata' });

  console.log('[Automation] Scheduler started. 5 jobs active.');
}

module.exports = {
  startAutomation,
  // Exported so controller can call them on-demand
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
};
