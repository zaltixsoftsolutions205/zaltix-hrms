/**
 * Automation & Work Intelligence Service
 * ----------------------------------------
 * Scheduled jobs that monitor employee activity and send smart alerts.
 * Uses existing notify() — zero changes to existing HRMS logic.
 *
 * Schedule summary:
 *  - Every hour        : Task deadline & overdue checks
 *  - Mon–Sat 08:30     : Morning work summary per employee
 *  - Mon–Sat 09:00–10:00: Check-in reminders every 15 min until checked in
 *  - Mon–Sat 18:00     : Evening summary + missing checkout detection
 *  - Mon–Sat 09:30     : CRM + document compliance checks
 *  - Every Monday 09:00: Weekly performance report + productivity score
 */

const cron = require('node-cron');
const mongoose = require('mongoose');

const User            = require('../models/User');
const Task            = require('../models/Task');
const Attendance      = require('../models/Attendance');
const Lead            = require('../models/Lead');
const Leave           = require('../models/Leave');
const Holiday         = require('../models/Holiday');
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

/** Returns the current IST time as HH:mm */
const istHM = () => {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(11, 16);
};

/** Office start time (IST) — matches attendanceController's late detection */
const OFFICE_START = '09:00';

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

    // Overdue (deadline passed, not complete) — exclude admin self-tasks
    const overdueTasks = await Task.find({
      deadline: { $lt: now },
      status: { $nin: ['completed'] },
      isSelfTask: { $ne: true },
    }).populate('assignedTo assignedBy', '_id name');

    for (const task of overdueTasks) {
      const daysPast = Math.floor((now - task.deadline) / 86400000);
      const label = daysPast === 0 ? 'today' : `${daysPast}d ago`;

      // Notify employee once per day
      await notify(task.assignedTo._id, {
        title: '⏰ Task Overdue',
        message: `Your task "${task.title}" was due ${label}. Please update the status.`,
        type: 'task',
        link: '/tasks',
        dedupKey: `overdue-emp-${task._id}`,
        dedupWindowMs: 24 * 60 * 60 * 1000,
      });

      // Escalate to admin/assignedBy if different from employee
      if (task.assignedBy && String(task.assignedBy._id) !== String(task.assignedTo._id)) {
        await notify(task.assignedBy._id, {
          title: '🚨 Task Not Progressing',
          message: `"${task.title}" assigned to ${task.assignedTo.name} is overdue (due ${label}). Status: ${task.status}.`,
          type: 'task',
          link: '/admin/tasks',
          dedupKey: `overdue-mgr-${task._id}`,
          dedupWindowMs: 24 * 60 * 60 * 1000,
        });
      }
    }

    // Due in next 24h — reminder (exclude admin self-tasks)
    const upcomingTasks = await Task.find({
      deadline: { $gte: now, $lte: in24h },
      status: { $nin: ['completed'] },
      isSelfTask: { $ne: true },
    }).populate('assignedTo', '_id name');

    for (const task of upcomingTasks) {
      const hoursLeft = Math.floor((task.deadline - now) / 3600000);
      await notify(task.assignedTo._id, {
        title: '⚡ Task Deadline Soon',
        message: `"${task.title}" is due in ~${hoursLeft}h. Mark it complete before the deadline.`,
        type: 'task',
        link: '/tasks',
        dedupKey: `upcoming-${task._id}`,
        dedupWindowMs: 6 * 60 * 60 * 1000,
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
        dedupKey: `checkout-${rec.employee._id}-${today}`,
        dedupWindowMs: 24 * 60 * 60 * 1000,
      });
    }

    console.log(`[Automation] Missing checkout: ${records.length} employees`);
  } catch (err) {
    console.error('[Automation] checkMissingCheckout error:', err.message);
  }
}

/** IST-adjusted Date for "now". */
const istNow = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000);

/** YYYY-MM-DD for an IST Date. */
const ymdOf = (d) => d.toISOString().slice(0, 10);

/** Whole-day UTC bounds for a YYYY-MM-DD, for matching Holiday.date. */
const dayBounds = (ymd) => ({
  $gte: new Date(`${ymd}T00:00:00.000Z`),
  $lte: new Date(`${ymd}T23:59:59.999Z`),
});

/**
 * The next working day strictly after `fromIst` (Mon–Sat; Sunday is skipped as
 * the weekly off). Returns an IST Date at that day.
 */
const nextWorkingDay = (fromIst) => {
  const d = new Date(fromIst);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0); // 0 = Sunday
  return d;
};

/**
 * Runs each evening. Reminds employees the evening of the LAST WORKING DAY
 * before a holiday — not literally the calendar day before. So a Monday
 * holiday reminds on Saturday evening (Sunday is the weekly off and people
 * aren't working), while Tue–Sat holidays still remind the day before.
 *
 * Mechanism: look at the next working day after today; if that day is a
 * holiday, tonight is the right time to remind. The job does not fire its
 * notice on Sundays. Only actual Holiday records count, so a plain Sunday is
 * never treated as a holiday.
 */
async function remindUpcomingHoliday() {
  try {
    const today = istNow();
    // Don't run the reminder on a Sunday — nobody's at work to see it, and the
    // Saturday run already covered a Monday holiday.
    if (today.getUTCDay() === 0) {
      console.log('[Automation] Holiday reminder skipped — Sunday (off day)');
      return;
    }

    const target = nextWorkingDay(today);
    const targetYmd = ymdOf(target);
    const holiday = await Holiday.findOne({ date: dayBounds(targetYmd) });
    if (!holiday) {
      console.log('[Automation] Holiday reminder: next working day is not a holiday');
      return;
    }

    const employees = await User.find({ isActive: true }, '_id');
    if (employees.length === 0) return;

    // "tomorrow" vs "on Monday" — word it by how far off the holiday is.
    const todayYmd = ymdOf(today);
    const dayGap = Math.round(
      (new Date(`${targetYmd}T00:00:00Z`) - new Date(`${todayYmd}T00:00:00Z`)) / 86400000
    );
    const weekday = new Date(`${targetYmd}T00:00:00.000Z`)
      .toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    const whenWord = dayGap === 1 ? 'Tomorrow' : `On ${weekday.split(',')[0]}`;

    await notifyMany(employees.map((e) => e._id), {
      title: '🎉 Holiday Coming Up',
      message: `${whenWord} (${weekday}) is a holiday: ${holiday.name}. Enjoy your day off!`,
      type: 'general',
      // Everyone can see upcoming holidays on the dashboard widget; there is
      // no employee-facing /holidays route (only the admin one).
      link: '/dashboard',
      // One notice per holiday per employee, even if the job runs twice.
      dedupKey: `holiday-${targetYmd}`,
      dedupWindowMs: 30 * 60 * 60 * 1000,
    });

    console.log(`[Automation] Holiday reminder sent to ${employees.length} employees for "${holiday.name}" (${targetYmd}, ${dayGap}d ahead)`);
  } catch (err) {
    console.error('[Automation] remindUpcomingHoliday error:', err.message);
  }
}

/**
 * Runs every 15 minutes between 09:00 and 10:00 IST (Mon–Sat), i.e. at
 * 09:00, 09:15, 09:30, 09:45 and 10:00. Reminds employees who have not
 * checked in yet; the reminders stop as soon as they check in, and never
 * run past 10:00.
 *
 * Skipped: public holidays, employees on approved leave, and admins.
 */
async function remindPendingCheckIn() {
  try {
    const today = todayStr();

    // Nothing to chase on a public holiday.
    const holiday = await Holiday.findOne({
      date: { $gte: new Date(`${today}T00:00:00.000Z`), $lte: new Date(`${today}T23:59:59.999Z`) },
    });
    if (holiday) {
      console.log(`[Automation] Check-in reminder skipped — holiday: ${holiday.name}`);
      return;
    }

    const employees = await User.find({ isActive: true, role: { $ne: 'admin' } }, '_id name');
    if (employees.length === 0) return;

    const employeeIds = employees.map((e) => e._id);

    // Anyone who already has a check-in time, or whom HR has already marked
    // absent/half-day, should not be chased.
    const records = await Attendance.find(
      { employee: { $in: employeeIds }, date: today },
      'employee checkIn status'
    ).lean();
    const settled = new Set(
      records
        .filter((r) => r.checkIn || r.status === 'absent' || r.status === 'half-day')
        .map((r) => String(r.employee))
    );

    // Approved leave covering today. fromDate/toDate are Dates, so compare
    // against the day's bounds rather than the YYYY-MM-DD string.
    const dayStart = new Date(`${today}T00:00:00.000Z`);
    const dayEnd = new Date(`${today}T23:59:59.999Z`);
    const onLeave = await Leave.find(
      {
        employee: { $in: employeeIds },
        status: 'approved',
        fromDate: { $lte: dayEnd },
        toDate: { $gte: dayStart },
      },
      'employee'
    ).lean();
    const onLeaveIds = new Set(onLeave.map((l) => String(l.employee)));

    const pending = employees.filter(
      (e) => !settled.has(String(e._id)) && !onLeaveIds.has(String(e._id))
    );

    // Past 09:00 the check-in would be recorded as late, so say so rather
    // than repeating the same nudge. Strictly greater-than, matching
    // attendanceController's own late detection — 09:00 exactly is on time.
    const isLate = istHM() > OFFICE_START;

    for (const emp of pending) {
      await notify(emp._id, {
        title: isLate ? '⏰ You are marked late' : '🕘 Check-In Reminder',
        message: isLate
          ? `You still haven't checked in. Office hours start at ${OFFICE_START} AM — please check in now.`
          : `Good morning, ${emp.name.split(' ')[0]}! Please remember to check in for today.`,
        type: 'general',
        link: '/attendance',
        // One reminder per 15-minute slot; the dedupKey keeps a restarted or
        // double-scheduled job from sending the same slot twice.
        dedupKey: `checkin-${emp._id}-${today}-${istHM()}`,
        dedupWindowMs: 14 * 60 * 1000,
      });
    }

    console.log(`[Automation] Check-in reminder (${istHM()}): ${pending.length} pending of ${employees.length}`);
  } catch (err) {
    console.error('[Automation] remindPendingCheckIn error:', err.message);
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
          dedupKey: `late-att-${emp._id}`,
          dedupWindowMs: 7 * 24 * 60 * 60 * 1000,
        });
      }

      if (absentDays >= 3) {
        await notify(emp._id, {
          title: '📋 Attendance Pattern Alert',
          message: `You have ${absentDays} unrecorded days in the last 10 working days. Please regularize if needed.`,
          type: 'general',
          link: '/attendance',
          dedupKey: `absent-att-${emp._id}`,
          dedupWindowMs: 7 * 24 * 60 * 60 * 1000,
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
            dedupKey: `poor-att-mgr-${mgr._id}-${emp._id}`,
            dedupWindowMs: 7 * 24 * 60 * 60 * 1000,
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
        dedupKey: `stale-lead-${lead._id}`,
        dedupWindowMs: 24 * 60 * 60 * 1000,
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
        dedupKey: `followup-overdue-${lead._id}`,
        dedupWindowMs: 24 * 60 * 60 * 1000,
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
        dedupKey: `aging-lead-${lead._id}`,
        dedupWindowMs: 7 * 24 * 60 * 60 * 1000,
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
            dedupKey: `sales-target-${user._id}-${now.getFullYear()}-${now.getMonth()}`,
            dedupWindowMs: 24 * 60 * 60 * 1000,
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
        dedupKey: `doc-pending-${employee._id}`,
        dedupWindowMs: 24 * 60 * 60 * 1000,
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
      // Pending + in-progress tasks (exclude self-tasks)
      const pendingTasks = await Task.countDocuments({
        assignedTo: emp._id,
        status: { $nin: ['completed'] },
        isSelfTask: { $ne: true },
      });

      // Overdue tasks (exclude self-tasks)
      const overdueTasks = await Task.countDocuments({
        assignedTo: emp._id,
        status: { $nin: ['completed'] },
        deadline: { $lt: now },
        isSelfTask: { $ne: true },
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
        isSelfTask: { $ne: true },
      });

      const stillPending = await Task.countDocuments({
        assignedTo: emp._id,
        status: { $nin: ['completed'] },
        deadline: { $lte: now },
        isSelfTask: { $ne: true },
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
    // ── Task Score (exclude self-tasks) ──
    const tasksTotal = await Task.countDocuments({
      assignedTo: emp._id,
      isSelfTask: { $ne: true },
      $or: [
        { deadline: { $gte: start, $lte: end } },
        { createdAt: { $gte: start, $lte: end } },
      ],
    });
    const tasksCompleted = await Task.countDocuments({
      assignedTo: emp._id,
      isSelfTask: { $ne: true },
      status: 'completed',
      $or: [
        { completedDate: { $gte: start, $lte: end } },
        { deadline: { $gte: start, $lte: end } },
      ],
    });
    const tasksOverdue = await Task.countDocuments({
      assignedTo: emp._id,
      isSelfTask: { $ne: true },
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

// ─── TASK DURATION REMINDERS ─────────────────────────────────────────────────
/**
 * Runs every 15 minutes.
 * - Duration ≤ 1 day (1440 min): sends ONE reminder when the timer expires.
 * - Duration > 1 day            : sends a reminder every 3 hours (180 min).
 */
async function checkTaskDurationReminders() {
  try {
    const now = new Date();

    const activeTasks = await Task.find({
      isSelfTask: true,
      status: 'in-progress',
      duration: { $ne: null, $gt: 0 },
      startedAt: { $ne: null },
    }).populate('assignedTo', 'name _id').lean();

    for (const task of activeTasks) {
      const durationMs = task.duration * 60 * 1000;
      const expiresAt  = new Date(task.startedAt.getTime() + durationMs);
      const isExpired  = now >= expiresAt;
      const lastRemind = task.lastReminderAt ? new Date(task.lastReminderAt) : null;

      let shouldRemind = false;
      let reminderMsg  = '';

      if (task.duration <= 1440) {
        // Short task (≤ 1 day): send once when expired, only if not reminded yet after start
        if (isExpired && (!lastRemind || lastRemind < task.startedAt)) {
          shouldRemind = true;
          reminderMsg = `⏰ Time's up! Your task "${task.title}" timer (${task.duration < 60 ? task.duration + ' min' : Math.round(task.duration / 60) + ' hr'}) has expired. Please update its status.`;
        }
      } else {
        // Long task (> 1 day): remind every 3 hours
        const threeHoursAgo = new Date(now.getTime() - 180 * 60 * 1000);
        if (!lastRemind || lastRemind < threeHoursAgo) {
          shouldRemind = true;
          const elapsed = Math.round((now - task.startedAt) / 3600000);
          const days    = Math.floor(task.duration / 1440);
          reminderMsg = `🔔 Progress check: "${task.title}" has been running for ${elapsed}h (target: ${days}d). Update your status if done.`;
        }
      }

      if (shouldRemind) {
        await notify(task.assignedTo._id, {
          title: 'Task Reminder',
          message: reminderMsg,
          type: 'task',
          link: '/admin/tasks',
        });
        await Task.findByIdAndUpdate(task._id, { lastReminderAt: now });
      }
    }
  } catch (err) {
    console.error('[Automation] checkTaskDurationReminders error:', err.message);
  }
}

// ─── SCHEDULER ────────────────────────────────────────────────────────────────

let started = false;

function startAutomation() {
  if (started) return;
  started = true;

  // Task monitoring — every hour
  cron.schedule('0 * * * *', checkTasks, { timezone: 'Asia/Kolkata' });

  // Task duration reminders — every 15 minutes
  cron.schedule('*/15 * * * *', checkTaskDurationReminders, { timezone: 'Asia/Kolkata' });

  // Morning summary — Mon–Sat at 08:30
  cron.schedule('30 8 * * 1-6', sendMorningSummary, { timezone: 'Asia/Kolkata' });

  // Evening summary + missing checkout — Mon–Sat at 18:00
  cron.schedule('0 18 * * 1-6', sendEveningSummary, { timezone: 'Asia/Kolkata' });

  // Check-in reminders — Mon–Sat at 09:00, 09:15, 09:30, 09:45, 10:00.
  cron.schedule('0,15,30,45 9 * * 1-6', remindPendingCheckIn, { timezone: 'Asia/Kolkata' });
  cron.schedule('0 10 * * 1-6', remindPendingCheckIn, { timezone: 'Asia/Kolkata' });

  // CRM alerts + document compliance — Mon–Sat at 09:30
  cron.schedule('30 9 * * 1-6', async () => {
    await checkCRMAlerts();
    await checkDocumentCompliance();
  }, { timezone: 'Asia/Kolkata' });

  // Weekly report + productivity scores — every Monday at 09:00
  cron.schedule('0 9 * * 1', sendWeeklyReport, { timezone: 'Asia/Kolkata' });

  // Holiday reminder — every evening at 18:00: if tomorrow is a holiday,
  // tell everyone. Runs all 7 days so a holiday before a Sunday is covered.
  cron.schedule('0 18 * * *', remindUpcomingHoliday, { timezone: 'Asia/Kolkata' });

  console.log('[Automation] Scheduler started. 9 jobs active.');
}

module.exports = {
  startAutomation,
  checkTasks,
  remindPendingCheckIn,
  remindUpcomingHoliday,
  checkMissingCheckout,
  checkAttendancePatterns,
  checkCRMAlerts,
  checkDocumentCompliance,
  checkTaskDurationReminders,
  sendMorningSummary,
  sendEveningSummary,
  calculateProductivityScores,
  sendWeeklyReport,
  currentWeekLabel,
  prevWeekLabel,
};
