const Timesheet = require('../models/Timesheet');
const Project = require('../models/Project');
const User = require('../models/User');
const Department = require('../models/Department');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const ProductivityScore = require('../models/ProductivityScore');
const notificationService = require('../services/notificationService');
const generateTimesheetReportPDF = require('../utils/generateTimesheetReportPDF');
const { analyseEntry, findOverlap, summariseEntries, verdictFor } = require('../services/taskIntelligence');
const fs = require('fs');
const moment = require('moment');

// Normalise a date to the start of its day (midnight) so the per-day unique index
// and lookups are stable regardless of the time component sent by the client.
// All timesheet days are Indian-business days (IST, UTC+05:30). Pinning the offset here
// keeps "which day is this?" identical on a UTC server (prod/Docker) and an IST dev
// machine that share one database — otherwise a day saved from one shows up as the
// previous/next day on the other.
const IST_OFFSET_MIN = 330;
const DATE_ONLY = /^d{4}-d{1,2}-d{1,2}$/;
// IST-view moment for a Date / ISO string / 'YYYY-MM-DD' (date-only = that IST calendar day).
const ist = (d) => {
  if (typeof d === 'string' && DATE_ONLY.test(d)) return moment.utc(d, 'YYYY-M-DD').utcOffset(IST_OFFSET_MIN, true);
  return (d === undefined ? moment() : moment(d)).utcOffset(IST_OFFSET_MIN);
};
const startOfDay = (d) => ist(d).startOf('day').toDate();
const ymd = (d) => ist(d).format('YYYY-MM-DD');
// A day's timesheet is found by range, not exact instant, so days stored as midnight-UTC
// by an older UTC server and as midnight-IST by an IST server both resolve to one day.
const dayFilter = (day) => ({ $gte: day, $lt: new Date(day.getTime() + 24 * 60 * 60 * 1000) });

// Match a department name against a keyword, case-insensitively.
const deptNameMatches = (name, keyword) =>
  !!name && name.toLowerCase().includes(keyword);

/**
 * Resolve who an employee's timesheet should be routed to for approval.
 * Kept only for the legacy review flow (getApprovals/reviewTimesheet) — the
 * new daily-work flow no longer routes or requires approval.
 * Returns { approverId, routedRole } where routedRole is 'admin' | 'hr' | 'lead'.
 */
const resolveApprover = async (user) => {
  const admin = await User.findOne({ role: 'admin', isActive: true }).select('_id').lean();
  const adminRoute = { approverId: admin?._id || null, routedRole: 'admin' };

  if (user.role === 'hr') return adminRoute;

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

  if (isMarketing || isSales) {
    const hr = await User.findOne({ role: 'hr', isActive: true }).select('_id').lean();
    if (hr) return { approverId: hr._id, routedRole: 'hr' };
    return adminRoute;
  }

  if (isTechnical) {
    const leadId = dept?.headOf;
    if (leadId && String(leadId) !== String(user._id)) {
      return { approverId: leadId, routedRole: 'lead' };
    }
    return adminRoute;
  }

  return adminRoute;
};

// Is this user the head of their own department (the "manager" concept used
// for Team View, mirroring Sidebar.jsx's isTechLead check)?
const isDeptHeadOf = async (userId, departmentId) => {
  if (!departmentId) return false;
  const dept = await Department.findById(departmentId).select('headOf').lean();
  return !!dept && String(dept.headOf) === String(userId);
};

// Same visibility rule as getDayDetail: self, or HR/admin/the employee's dept head.
const canViewEmployee = async (viewer, employeeId) => {
  if (String(employeeId) === String(viewer._id)) return true;
  if (['hr', 'admin'].includes(viewer.role)) return true;
  const target = await User.findById(employeeId).select('department').lean();
  return isDeptHeadOf(viewer._id, target?.department);
};

const overlapMessage = (other) =>
  `This time overlaps with "${other.task}" (${other.startTime}–${other.endTime}). Adjust the start or end time.`;

// ─── Employee: daily work log ────────────────────────────────────────────────

// Create or update a day's timesheet (whole-day upsert — used by legacy bulk
// submit and still useful for seeding a day). No approval gating: employees can
// always edit their own entries regardless of status.
exports.submitTimesheet = async (req, res) => {
  try {
    const { date, entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ message: 'At least one timesheet entry is required.' });
    }
    for (const e of entries) {
      if (!e.task) return res.status(400).json({ message: 'Each entry needs a task, start time and end time.' });
    }
    // Hours/estimate/insight are system-derived from start/end time.
    for (let i = 0; i < entries.length; i++) {
      const analysed = await analyseEntry(entries[i]);
      if (analysed.error) return res.status(400).json({ message: analysed.error });
      entries[i] = analysed.entry;
    }

    const day = startOfDay(date || new Date());
    let timesheet = await Timesheet.findOne({ employee: req.user._id, date: dayFilter(day) });

    if (timesheet) {
      timesheet.entries = entries;
      await timesheet.save();
    } else {
      timesheet = await Timesheet.create({ employee: req.user._id, date: day, entries });
    }

    const populated = await Timesheet.findById(timesheet._id)
      .populate('employee', 'name employeeId')
      .populate('entries.project', 'name');
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
      const start = ist(`${year}-${month}-01`).startOf('month').toDate();
      const end = ist(start).endOf('month').toDate();
      filter.date = { $gte: start, $lte: end };
    }
    const timesheets = await Timesheet.find(filter)
      .populate('routedTo', 'name role')
      .populate('reviewedBy', 'name')
      .populate('entries.project', 'name')
      .sort({ date: -1 });
    res.json(timesheets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Add one task entry to a day (find-or-create the day's doc).
exports.addEntry = async (req, res) => {
  try {
    const { date, entry } = req.body;
    if (!entry || !entry.task) {
      return res.status(400).json({ message: 'Entry needs a task, start time and end time.' });
    }

    let project = null, projectLabel = entry.projectLabel || '';
    if (entry.project) {
      const proj = await Project.findById(entry.project).select('name').lean();
      if (proj) { project = proj._id; projectLabel = proj.name; }
    }

    // Hours come from start/end time; estimate + insight are decided by the system.
    const analysed = await analyseEntry({ ...entry, project, projectLabel });
    if (analysed.error) return res.status(400).json({ message: analysed.error });
    const entryDoc = analysed.entry;

    const day = startOfDay(date || new Date());
    let timesheet = await Timesheet.findOne({ employee: req.user._id, date: dayFilter(day) });

    if (timesheet) {
      const clash = findOverlap(timesheet.entries, entryDoc);
      if (clash) return res.status(409).json({ message: overlapMessage(clash) });
      timesheet.entries.push(entryDoc);
      await timesheet.save();
    } else {
      timesheet = await Timesheet.create({ employee: req.user._id, date: day, entries: [entryDoc] });
    }

    const populated = await Timesheet.findById(timesheet._id).populate('entries.project', 'name');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update a single entry by id. Owner-only (or admin).
exports.updateEntry = async (req, res) => {
  try {
    const timesheet = await Timesheet.findById(req.params.timesheetId);
    if (!timesheet) return res.status(404).json({ message: 'Timesheet not found.' });
    if (String(timesheet.employee) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You can only edit your own entries.' });
    }

    const entry = timesheet.entries.id(req.params.entryId);
    if (!entry) return res.status(404).json({ message: 'Entry not found.' });

    const body = { ...req.body };
    if (body.project) {
      const proj = await Project.findById(body.project).select('name').lean();
      if (proj) body.projectLabel = proj.name;
    }
    // Never trust client-supplied hours/estimate/insight — recompute from the merged entry.
    delete body.hours; delete body.estimatedHours; delete body.insight;
    Object.assign(entry, body);

    const analysed = await analyseEntry(
      { task: entry.task, workCategory: entry.workCategory, status: entry.status, startTime: entry.startTime, endTime: entry.endTime },
      { excludeEntryId: entry._id }
    );
    if (analysed.error) return res.status(400).json({ message: analysed.error });
    const clash = findOverlap(timesheet.entries, entry, entry._id);
    if (clash) return res.status(409).json({ message: overlapMessage(clash) });
    entry.hours = analysed.entry.hours;
    entry.estimatedHours = analysed.entry.estimatedHours;
    entry.insight = analysed.entry.insight;
    await timesheet.save();

    const populated = await Timesheet.findById(timesheet._id).populate('entries.project', 'name');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete a single entry by id. Owner-only (or admin).
exports.deleteEntry = async (req, res) => {
  try {
    const timesheet = await Timesheet.findById(req.params.timesheetId);
    if (!timesheet) return res.status(404).json({ message: 'Timesheet not found.' });
    if (String(timesheet.employee) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You can only edit your own entries.' });
    }

    const entry = timesheet.entries.id(req.params.entryId);
    if (!entry) return res.status(404).json({ message: 'Entry not found.' });
    entry.deleteOne();
    await timesheet.save();

    const populated = await Timesheet.findById(timesheet._id).populate('entries.project', 'name');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Save the day's Daily Update (no approval — visible immediately to managers/HR/Admin).
exports.saveDailyUpdate = async (req, res) => {
  try {
    const { date, completedToday, continuingTomorrow, blockers, dayStatus } = req.body;
    const day = startOfDay(date || new Date());

    let timesheet = await Timesheet.findOne({ employee: req.user._id, date: dayFilter(day) });
    const dailyUpdate = {
      completedToday: completedToday || '',
      continuingTomorrow: continuingTomorrow || '',
      blockers: blockers || '',
      dayStatus: dayStatus || null,
      savedAt: new Date(),
    };

    if (timesheet) {
      timesheet.dailyUpdate = dailyUpdate;
      await timesheet.save();
    } else {
      timesheet = await Timesheet.create({ employee: req.user._id, date: day, entries: [], dailyUpdate });
    }

    res.json(timesheet);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Calendar ─────────────────────────────────────────────────────────────────

exports.getCalendarMonth = async (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month) || now.getMonth() + 1;
    const year = parseInt(req.query.year) || now.getFullYear();
    const start = ist(`${year}-${month}-01`).startOf('month');
    const end = ist(start).endOf('month');

    const [timesheets, holidays] = await Promise.all([
      Timesheet.find({ employee: req.user._id, date: { $gte: start.toDate(), $lte: end.toDate() } }),
      Holiday.find({ year }),
    ]);
    const holidaySet = new Set(holidays.map(h => ymd(h.date)));
    const tsByDay = new Map(timesheets.map(t => [ymd(t.date), t]));

    const today = ist().startOf('day');
    const days = {};
    const cur = ist(start);
    while (cur.isSameOrBefore(end)) {
      const key = cur.format('YYYY-MM-DD');
      const isFuture = cur.isAfter(today);
      const isWeekOff = cur.day() === 0; // Sunday, matching attendance convention
      const isHoliday = holidaySet.has(key);
      const ts = tsByDay.get(key);
      const hasEntries = !!ts && ts.entries.length > 0;
      const hasUpdate = !!ts?.dailyUpdate?.savedAt;

      let status;
      if (isHoliday || isWeekOff) status = 'holiday';
      else if (isFuture) status = 'future';
      else if (hasEntries && hasUpdate) status = 'complete';
      else if (hasEntries || hasUpdate) status = 'partial';
      else status = 'not-updated';

      days[key] = {
        status,
        totalHours: ts?.totalHours || 0,
        entryCount: ts?.entries.length || 0,
        dailyUpdateSaved: hasUpdate,
      };
      cur.add(1, 'day');
    }

    res.json({ month, year, days });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDayDetail = async (req, res) => {
  try {
    const day = startOfDay(req.params.date);
    const employeeId = req.query.employeeId || req.user._id;

    // Only self, or a dept-head/HR/admin viewing a report, may view another's day.
    if (String(employeeId) !== String(req.user._id)) {
      const target = await User.findById(employeeId).select('department').lean();
      const allowed =
        ['hr', 'admin'].includes(req.user.role) ||
        (await isDeptHeadOf(req.user._id, target?.department));
      if (!allowed) return res.status(403).json({ message: 'Not authorized to view this timesheet.' });
    }

    const timesheet = await Timesheet.findOne({ employee: employeeId, date: dayFilter(day) })
      .populate('entries.project', 'name');
    const attendance = await Attendance.findOne({ employee: employeeId, date: ymd(day) }).lean();

    if (!timesheet) {
      return res.json({
        date: ymd(day), entries: [], totalHours: 0, dailyUpdate: null,
        attendance: attendance ? { checkIn: attendance.checkIn, checkOut: attendance.checkOut, workHours: attendance.workHours } : null,
      });
    }

    res.json({
      ...timesheet.toObject(),
      attendance: attendance ? { checkIn: attendance.checkIn, checkOut: attendance.checkOut, workHours: attendance.workHours } : null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Self-service overdue-task alert: any of the employee's own task entries
// (across all days, not just today) with a past dueDate and not Completed.
exports.getMyOverdueTasks = async (req, res) => {
  try {
    const now = new Date();
    const timesheets = await Timesheet.find({
      employee: req.user._id,
      'entries.dueDate': { $lt: now },
    }).populate('entries.project', 'name').lean();

    const overdue = [];
    for (const ts of timesheets) {
      for (const entry of ts.entries || []) {
        if (entry.dueDate && new Date(entry.dueDate) < now && entry.status !== 'Completed') {
          overdue.push({
            timesheetId: ts._id,
            entryId: entry._id,
            date: ymd(ts.date),
            task: entry.task,
            project: entry.project?.name || entry.projectLabel || '',
            dueDate: ymd(entry.dueDate),
            status: entry.status,
          });
        }
      }
    }
    overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    res.json(overdue);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Self-service "This Week" view: every day's entries + daily update for the
// current (or given) week, so an employee can spot gaps before Friday instead
// of only seeing one day at a time on the Today tab.
exports.getMyWeek = async (req, res) => {
  try {
    const { start, end } = weekRange(req.query.date);
    const timesheets = await Timesheet.find({ employee: req.user._id, date: { $gte: start, $lte: end } })
      .populate('entries.project', 'name')
      .lean();
    const byDay = new Map(timesheets.map(t => [ymd(t.date), t]));

    const days = [];
    const cur = ist(start);
    const endM = ist(end);
    while (cur.isSameOrBefore(endM, 'day')) {
      const key = cur.format('YYYY-MM-DD');
      const ts = byDay.get(key);
      days.push({
        date: key,
        isWeekOff: cur.day() === 0,
        totalHours: ts?.totalHours || 0,
        entries: ts?.entries || [],
        dailyUpdateSaved: !!ts?.dailyUpdate?.savedAt,
      });
      cur.add(1, 'day');
    }

    res.json({ weekStart: ymd(start), weekEnd: ymd(end), days });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Shared rollup helper (Team View / Org View / Reports) ──────────────────

const buildEmployeeRollup = async (employeeIds, start, end) => {
  const timesheets = await Timesheet.find({
    employee: { $in: employeeIds },
    date: { $gte: start, $lte: end },
  }).lean();

  const byEmployee = new Map(employeeIds.map(id => [String(id), {
    totalHours: 0, totalTasks: 0, completedTasks: 0, pendingTasks: 0, blockedTasks: 0,
    daysUpdated: 0,
  }]));

  for (const ts of timesheets) {
    const row = byEmployee.get(String(ts.employee));
    if (!row) continue;
    row.totalHours += ts.totalHours || 0;
    // "Updated" = touched their timesheet that day at all — either saved a
    // Daily Update or logged at least one task entry — not just completed work.
    if (ts.dailyUpdate?.savedAt || (ts.entries || []).length > 0) row.daysUpdated += 1;
    for (const entry of ts.entries || []) {
      row.totalTasks += 1;
      if (entry.status === 'Completed') row.completedTasks += 1;
      else if (entry.status === 'Blocked') row.blockedTasks += 1;
      else row.pendingTasks += 1;
    }
  }

  for (const row of byEmployee.values()) {
    row.productivityPct = row.totalTasks === 0 ? 0 : Math.round((row.completedTasks / row.totalTasks) * 100);
    row.totalHours = Math.round(row.totalHours * 10) / 10;
  }

  return byEmployee;
};

const monthRange = (req) => {
  const now = new Date();
  const month = parseInt(req.query.month) || now.getMonth() + 1;
  const year = parseInt(req.query.year) || now.getFullYear();
  const start = ist(`${year}-${month}-01`).startOf('month').toDate();
  const end = ist(start).endOf('month').toDate();
  return { start, end, month, year };
};

// The calendar month immediately before the one monthRange(req) resolved to.
const prevMonthRange = ({ month, year }) => {
  const start = ist(`${year}-${month}-01`).subtract(1, 'month').startOf('month').toDate();
  const end = ist(start).endOf('month').toDate();
  return { start, end };
};

// Week containing `anchorDate` (defaults to today), Monday–Sunday.
const weekRange = (anchorDate) => {
  const start = ist(anchorDate || new Date()).startOf('isoWeek').toDate();
  const end = ist(start).endOf('isoWeek').toDate();
  return { start, end };
};

// Count Mon–Sat days in [start, end] (Sunday-off convention used elsewhere in
// this codebase, e.g. attendanceController's working-days calculation).
const countWorkingDays = (start, end) => {
  let count = 0;
  const cur = ist(start);
  const endM = ist(end);
  while (cur.isSameOrBefore(endM, 'day')) {
    if (cur.day() !== 0) count += 1;
    cur.add(1, 'day');
  }
  return count;
};

// Days-updated consistency % per employee for [start, end] — a lighter query
// than the full rollup, used just for the previous-period trend comparison.
const daysUpdatedPctMap = async (employeeIds, start, end) => {
  const workingDays = countWorkingDays(start, ist(end).isAfter(new Date()) ? new Date() : end);
  const timesheets = await Timesheet.find(
    { employee: { $in: employeeIds }, date: { $gte: start, $lte: end } },
    'employee entries dailyUpdate'
  ).lean();
  const daysUpdated = new Map(employeeIds.map(id => [String(id), 0]));
  for (const ts of timesheets) {
    if (ts.dailyUpdate?.savedAt || (ts.entries || []).length > 0) {
      const key = String(ts.employee);
      daysUpdated.set(key, (daysUpdated.get(key) || 0) + 1);
    }
  }
  const pctMap = new Map();
  for (const [id, count] of daysUpdated) {
    pctMap.set(id, workingDays === 0 ? null : Math.round((count / workingDays) * 100));
  }
  return pctMap;
};

// ─── Manager Team View ───────────────────────────────────────────────────────

exports.getTeamView = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select('department role').lean();
    const isHead = req.user.role === 'admin' || (await isDeptHeadOf(req.user._id, me?.department));
    if (!isHead) return res.status(403).json({ message: 'Only a department head can view Team View.' });
    if (!me?.department) return res.json({ workingDaysInRange: 0, rows: [] });

    const { start, end, month, year } = monthRange(req);
    const workingDaysInRange = countWorkingDays(start, ist(end).isAfter(new Date()) ? new Date() : end);
    const teamMembers = await User.find({ department: me.department, isActive: true })
      .select('name employeeId role');
    const employeeIds = teamMembers.map(m => m._id);
    const rollup = await buildEmployeeRollup(employeeIds, start, end);

    const prev = prevMonthRange({ month, year });
    const prevPctMap = await daysUpdatedPctMap(employeeIds, prev.start, prev.end);

    const rows = teamMembers.map(m => {
      const row = rollup.get(String(m._id));
      const curPct = workingDaysInRange === 0 ? null : Math.round((row.daysUpdated / workingDaysInRange) * 100);
      const prevPct = prevPctMap.get(String(m._id));
      return {
        employee: { _id: m._id, name: m.name, employeeId: m.employeeId },
        ...row,
        daysUpdatedTrend: (curPct != null && prevPct != null) ? curPct - prevPct : null,
      };
    });
    res.json({ workingDaysInRange, rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── HR/Admin Org View ───────────────────────────────────────────────────────

exports.getOrgView = async (req, res) => {
  try {
    const { start, end, month, year } = monthRange(req);
    const workingDaysInRange = countWorkingDays(start, ist(end).isAfter(new Date()) ? new Date() : end);
    const userFilter = { isActive: true };
    if (req.query.departmentId) userFilter.department = req.query.departmentId;
    if (req.query.role) userFilter.role = req.query.role;
    if (req.query.employeeId) userFilter._id = req.query.employeeId;

    const employees = await User.find(userFilter).select('name employeeId role department').populate('department', 'name');
    const employeeIds = employees.map(e => e._id);
    const rollup = await buildEmployeeRollup(employeeIds, start, end);

    const prev = prevMonthRange({ month, year });
    const prevPctMap = await daysUpdatedPctMap(employeeIds, prev.start, prev.end);

    const today = ymd(new Date());
    const todayTimesheets = await Timesheet.find({
      employee: { $in: employeeIds },
      date: { $gte: startOfDay(today), $lte: ist(today).endOf('day').toDate() },
    }).select('employee dailyUpdate').lean();
    const updatedToday = new Set(todayTimesheets.filter(t => t.dailyUpdate?.savedAt).map(t => String(t.employee)));

    let totalHours = 0, totalCompletedTasks = 0;
    const workCategoryTotals = {};
    const blockers = [];
    const workload = [];

    const tsDocs = await Timesheet.find({ employee: { $in: employeeIds }, date: { $gte: start, $lte: end } })
      .populate('employee', 'name employeeId');
    for (const ts of tsDocs) {
      totalHours += ts.totalHours || 0;
      for (const entry of ts.entries || []) {
        if (entry.status === 'Completed') totalCompletedTasks += 1;
        workCategoryTotals[entry.workCategory] = (workCategoryTotals[entry.workCategory] || 0) + (entry.hours || 0);
        if (entry.status === 'Blocked') {
          blockers.push({
            employee: ts.employee?.name, date: ymd(ts.date), task: entry.task, blocker: entry.blocker,
          });
        }
      }
    }

    for (const emp of employees) {
      const row = rollup.get(String(emp._id));
      const curPct = workingDaysInRange === 0 ? null : Math.round((row.daysUpdated / workingDaysInRange) * 100);
      const prevPct = prevPctMap.get(String(emp._id));
      workload.push({
        employee: emp.name, employeeId: emp.employeeId, department: emp.department?.name,
        ...row,
        daysUpdatedTrend: (curPct != null && prevPct != null) ? curPct - prevPct : null,
      });
    }

    res.json({
      totalEmployees: employees.length,
      updatedToday: updatedToday.size,
      missingToday: employees.length - updatedToday.size,
      totalHours: Math.round(totalHours * 10) / 10,
      totalCompletedTasks,
      workCategoryDistribution: workCategoryTotals,
      workingDaysInRange,
      workload,
      blockers,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Analytics ────────────────────────────────────────────────────────────────

exports.getWorkCategoryAnalytics = async (req, res) => {
  try {
    const employeeId = req.query.employeeId || req.user._id;
    if (String(employeeId) !== String(req.user._id) && !['hr', 'admin'].includes(req.user.role)) {
      const target = await User.findById(employeeId).select('department').lean();
      if (!(await isDeptHeadOf(req.user._id, target?.department))) {
        return res.status(403).json({ message: 'Not authorized.' });
      }
    }

    const { start, end } = monthRange(req);
    const timesheets = await Timesheet.find({ employee: employeeId, date: { $gte: start, $lte: end } }).lean();

    const totals = {};
    for (const ts of timesheets) {
      for (const entry of ts.entries || []) {
        totals[entry.workCategory] = (totals[entry.workCategory] || 0) + (entry.hours || 0);
      }
    }
    res.json(Object.entries(totals).map(([category, hours]) => ({ category, hours: Math.round(hours * 10) / 10 })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Attendance office-hours vs Timesheet logged-hours comparison (read-only).
exports.getAttendanceComparison = async (req, res) => {
  try {
    const employeeId = req.query.employeeId || req.user._id;
    if (String(employeeId) !== String(req.user._id) && !['hr', 'admin'].includes(req.user.role)) {
      const target = await User.findById(employeeId).select('department').lean();
      if (!(await isDeptHeadOf(req.user._id, target?.department))) {
        return res.status(403).json({ message: 'Not authorized.' });
      }
    }

    const { start, end } = monthRange(req);
    const [timesheets, attendance] = await Promise.all([
      Timesheet.find({ employee: employeeId, date: { $gte: start, $lte: end } }).lean(),
      Attendance.find({ employee: employeeId, date: { $gte: ymd(start), $lte: ymd(end) } }).lean(),
    ]);

    const tsByDay = new Map(timesheets.map(t => [ymd(t.date), t]));
    const attByDay = new Map(attendance.map(a => [a.date, a]));
    const allDays = new Set([...tsByDay.keys(), ...attByDay.keys()]);

    const rows = [...allDays].sort().map(date => {
      const att = attByDay.get(date);
      const ts = tsByDay.get(date);
      const officeHours = att?.workHours || 0;
      const loggedHours = ts?.totalHours || 0;
      return { date, officeHours, loggedHours, delta: Math.round((loggedHours - officeHours) * 10) / 10 };
    });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Daily history + time intelligence ───────────────────────────────────────

const byStartTime = (a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99');

// Past days (up to yesterday) of work slots + the Daily Update posted each day,
// each with its own time-intelligence summary. Self by default; HR/admin/dept
// head may pass ?employeeId=.
exports.getHistory = async (req, res) => {
  try {
    const employeeId = req.query.employeeId || req.user._id;
    if (!(await canViewEmployee(req.user, employeeId))) {
      return res.status(403).json({ message: 'Not authorized to view this history.' });
    }
    const days = Math.min(Math.max(parseInt(req.query.days) || 14, 1), 90);
    const start = ist().subtract(days, 'days').startOf('day').toDate();
    const end = ist().subtract(1, 'day').endOf('day').toDate();

    const [employee, timesheets] = await Promise.all([
      User.findById(employeeId).select('name employeeId').lean(),
      Timesheet.find({ employee: employeeId, date: { $gte: start, $lte: end } })
        .populate('entries.project', 'name')
        .sort({ date: -1 })
        .lean(),
    ]);

    const rows = timesheets
      .filter(ts => (ts.entries || []).length > 0 || ts.dailyUpdate?.savedAt)
      .map(ts => {
        const entries = [...(ts.entries || [])].sort(byStartTime);
        return {
          _id: ts._id,
          date: ymd(ts.date),
          dailyUpdate: ts.dailyUpdate?.savedAt ? ts.dailyUpdate : null,
          entries,
          summary: summariseEntries(entries),
        };
      });

    res.json({
      employee,
      days: rows,
      overall: summariseEntries(rows.flatMap(r => r.entries)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/Admin Org view: what every employee posted — work slots, hours, Daily Update
// text and time intelligence — for one day or one Mon–Sun week.
exports.getOrgUpdates = async (req, res) => {
  try {
    const view = req.query.view === 'week' ? 'week' : 'day';
    const anchor = req.query.date || ymd(new Date());
    const { start, end } = view === 'week'
      ? weekRange(anchor)
      : { start: startOfDay(anchor), end: ist(anchor).endOf('day').toDate() };

    const userFilter = { isActive: true };
    if (req.query.departmentId) userFilter.department = req.query.departmentId;
    if (req.query.role) userFilter.role = req.query.role;
    const employees = await User.find(userFilter).select('name employeeId department').populate('department', 'name').lean();

    const timesheets = await Timesheet.find({
      employee: { $in: employees.map(e => e._id) },
      date: { $gte: start, $lte: end },
    }).populate('entries.project', 'name').sort({ date: 1 }).lean();

    const daysByEmp = new Map();
    for (const ts of timesheets) {
      const entries = [...(ts.entries || [])].sort(byStartTime);
      const hasUpdate = !!ts.dailyUpdate?.savedAt;
      if (entries.length === 0 && !hasUpdate) continue;
      const k = String(ts.employee);
      if (!daysByEmp.has(k)) daysByEmp.set(k, []);
      daysByEmp.get(k).push({
        date: ymd(ts.date),
        dailyUpdate: hasUpdate ? ts.dailyUpdate : null,
        entries,
        summary: summariseEntries(entries),
      });
    }

    const rows = employees.map(e => {
      const days = daysByEmp.get(String(e._id)) || [];
      const allEntries = days.flatMap(d => d.entries);
      return {
        employee: { _id: e._id, name: e.name, employeeId: e.employeeId, department: e.department?.name || '' },
        days,
        daysPosted: days.filter(d => d.dailyUpdate).length,
        taskCount: allEntries.length,
        completedCount: allEntries.filter(en => en.status === 'Completed').length,
        summary: summariseEntries(allEntries),
      };
    }).sort((a, b) => (b.days.length > 0) - (a.days.length > 0) || a.employee.name.localeCompare(b.employee.name));

    res.json({
      view, start: ymd(start), end: ymd(end),
      totals: {
        employees: rows.length,
        posted: rows.filter(r => r.daysPosted > 0).length,
        noActivity: rows.filter(r => r.days.length === 0).length,
        totalHours: Math.round(rows.reduce((s, r) => s + r.summary.totalHours, 0) * 10) / 10,
      },
      employees: rows,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin/HR: time intelligence across everyone for a month — who runs over/under
// estimates, which kinds of work overrun, and the biggest individual overruns.
exports.getIntelligence = async (req, res) => {
  try {
    const { start, end } = monthRange(req);
    const userFilter = { isActive: true };
    if (req.query.departmentId) userFilter.department = req.query.departmentId;
    if (req.query.employeeId) userFilter._id = req.query.employeeId;

    const employees = await User.find(userFilter).select('name employeeId department').populate('department', 'name').lean();
    const empById = new Map(employees.map(e => [String(e._id), e]));
    const timesheets = await Timesheet.find({
      employee: { $in: employees.map(e => e._id) },
      date: { $gte: start, $lte: end },
    }).populate('entries.project', 'name').lean();

    const entriesByEmp = new Map();
    const entriesByCategory = new Map();
    const allEntries = [];
    const overruns = [];

    for (const ts of timesheets) {
      const emp = empById.get(String(ts.employee));
      for (const entry of ts.entries || []) {
        allEntries.push(entry);
        const k = String(ts.employee);
        if (!entriesByEmp.has(k)) entriesByEmp.set(k, []);
        entriesByEmp.get(k).push(entry);
        const cat = entry.workCategory || 'Other';
        if (!entriesByCategory.has(cat)) entriesByCategory.set(cat, []);
        entriesByCategory.get(cat).push(entry);

        if (entry.status === 'Completed' && entry.estimatedHours > 0 && entry.hours > 0
          && verdictFor(entry.hours, entry.estimatedHours) === 'over') {
          overruns.push({
            employee: emp?.name || '', employeeId: String(ts.employee), date: ymd(ts.date), task: entry.task,
            category: cat, project: entry.projectLabel || entry.project?.name || '',
            actualHours: entry.hours, estimatedHours: entry.estimatedHours,
            overBy: Math.round((entry.hours - entry.estimatedHours) * 10) / 10,
            remarks: entry.remarks || '',
          });
        }
      }
    }

    const statusOf = (s) => s.analysedTasks === 0 ? 'no-data' : s.ratioPct > 120 ? 'over' : s.ratioPct < 80 ? 'fast' : 'on-target';

    const employeeRows = employees.map(e => {
      const s = summariseEntries(entriesByEmp.get(String(e._id)) || []);
      return {
        employee: { _id: e._id, name: e.name, employeeId: e.employeeId, department: e.department?.name || '' },
        ...s, status: statusOf(s),
      };
    }).sort((a, b) => (b.ratioPct ?? -1) - (a.ratioPct ?? -1));

    const categoryRows = [...entriesByCategory.entries()].map(([category, list]) => {
      const s = summariseEntries(list);
      return { category, ...s, status: statusOf(s) };
    }).filter(c => c.analysedTasks > 0).sort((a, b) => b.ratioPct - a.ratioPct);

    const overall = summariseEntries(allEntries);

    // Plain-language highlights for the CEO (≥3 analysed tasks before naming anyone).
    const highlights = [overall.message];
    const names = list => list.slice(0, 3).map(r => `${r.employee.name} (${r.ratioPct}%)`).join(', ');
    const overEmps = employeeRows.filter(r => r.status === 'over' && r.analysedTasks >= 3);
    if (overEmps.length) highlights.push(`Running over estimated time: ${names(overEmps)}.`);
    const worstCat = categoryRows.find(c => c.status === 'over' && c.analysedTasks >= 3);
    if (worstCat) highlights.push(`${worstCat.category} work is the biggest overrun — ${worstCat.ratioPct}% of estimated time on average.`);
    const fastEmps = employeeRows.filter(r => r.status === 'fast' && r.analysedTasks >= 3);
    if (fastEmps.length) highlights.push(`Finishing faster than estimated: ${names(fastEmps)}.`);
    const accurate = employeeRows
      .filter(r => r.status === 'on-target' && r.analysedTasks >= 3)
      .sort((a, b) => Math.abs(a.ratioPct - 100) - Math.abs(b.ratioPct - 100))[0];
    if (accurate) highlights.push(`Most consistent with estimates: ${accurate.employee.name} (${accurate.ratioPct}%).`);

    overruns.sort((a, b) => b.overBy - a.overBy);

    res.json({ overall, highlights, employees: employeeRows, categories: categoryRows, overruns: overruns.slice(0, 15) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Reports ──────────────────────────────────────────────────────────────────

const buildReportRows = async (query) => {
  const { start, end } = monthRange({ query });
  const userFilter = { isActive: true };
  if (query.employeeId) userFilter._id = query.employeeId;
  if (query.departmentId) userFilter.department = query.departmentId;
  if (query.role) userFilter.role = query.role;

  const employees = await User.find(userFilter).select('name employeeId department').populate('department', 'name');
  const employeeIds = employees.map(e => e._id);
  const empById = new Map(employees.map(e => [String(e._id), e]));

  const tsFilter = { employee: { $in: employeeIds }, date: { $gte: start, $lte: end } };
  const timesheets = await Timesheet.find(tsFilter).populate('entries.project', 'name').lean();

  const rows = [];
  for (const ts of timesheets) {
    const emp = empById.get(String(ts.employee));
    for (const entry of ts.entries || []) {
      if (query.status && entry.status !== query.status) continue;
      if (query.workCategory && entry.workCategory !== query.workCategory) continue;
      if (query.projectId && String(entry.project?._id || entry.project) !== String(query.projectId)) continue;
      rows.push({
        date: ymd(ts.date),
        employee: emp?.name || '',
        employeeId: emp?.employeeId || '',
        department: emp?.department?.name || '',
        project: entry.projectLabel || entry.project?.name || '',
        task: entry.task,
        workCategory: entry.workCategory,
        status: entry.status,
        hours: entry.hours,
        estimatedHours: entry.estimatedHours ?? '',
        timeVerdict: entry.insight?.verdict || '',
        completionPercentage: entry.completionPercentage ?? '',
        dueDate: entry.dueDate ? ymd(entry.dueDate) : '',
        blocker: entry.blocker || '',
      });
    }
  }
  return rows;
};

exports.getReportsData = async (req, res) => {
  try {
    const rows = await buildReportRows(req.query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.downloadReportPDF = async (req, res) => {
  try {
    const rows = await buildReportRows(req.query);
    const columns = [
      { key: 'date', label: 'Date' },
      { key: 'employee', label: 'Employee' },
      { key: 'department', label: 'Department' },
      { key: 'project', label: 'Project' },
      { key: 'task', label: 'Task' },
      { key: 'workCategory', label: 'Category' },
      { key: 'status', label: 'Status' },
      { key: 'hours', label: 'Hours' },
      { key: 'estimatedHours', label: 'Est. Hrs' },
      { key: 'dueDate', label: 'Due Date' },
    ];
    const filepath = await generateTimesheetReportPDF({ title: 'Timesheet Report', columns, rows });
    const filename = 'Timesheet_Report.pdf';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    fs.createReadStream(filepath).pipe(res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Weekly Report (self-service, with a plain-language intelligence summary) ─

// Builds the week's row data plus a short auto-generated summary paragraph —
// computed entirely from existing fields, no external AI call.
const buildWeeklySummary = async (employeeId, anchorDate) => {
  const { start, end } = weekRange(anchorDate);
  const employee = await User.findById(employeeId).select('name employeeId').lean();
  const timesheets = await Timesheet.find({ employee: employeeId, date: { $gte: start, $lte: end } })
    .populate('entries.project', 'name')
    .sort({ date: 1 })
    .lean();

  const rows = [];
  let totalHours = 0, tasksTotal = 0, tasksCompleted = 0, tasksOverdue = 0, blockedCount = 0, daysUpdated = 0;
  const categoryTotals = {};
  const blockers = [];

  for (const ts of timesheets) {
    totalHours += ts.totalHours || 0;
    if (ts.dailyUpdate?.savedAt) daysUpdated += 1;
    for (const entry of ts.entries || []) {
      tasksTotal += 1;
      if (entry.status === 'Completed') tasksCompleted += 1;
      if (entry.status === 'Blocked') { blockedCount += 1; blockers.push({ date: ymd(ts.date), task: entry.task, blocker: entry.blocker }); }
      if (entry.dueDate && entry.status !== 'Completed' && new Date(entry.dueDate) < new Date()) tasksOverdue += 1;
      categoryTotals[entry.workCategory] = (categoryTotals[entry.workCategory] || 0) + (entry.hours || 0);
      rows.push({
        date: ymd(ts.date),
        task: entry.task,
        project: entry.projectLabel || entry.project?.name || '',
        workCategory: entry.workCategory,
        status: entry.status,
        hours: entry.hours,
        dueDate: entry.dueDate ? ymd(entry.dueDate) : '',
      });
    }
  }

  const workingDaysInWeek = 6; // Mon-Sat, matching this codebase's Sunday-off convention
  const completionPct = tasksTotal === 0 ? 0 : Math.round((tasksCompleted / tasksTotal) * 100);
  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];

  // Previous week, for the trend comparison.
  const prevWeek = weekRange(ist(start).subtract(1, 'week').toDate());
  const prevTimesheets = await Timesheet.find({ employee: employeeId, date: { $gte: prevWeek.start, $lte: prevWeek.end } }).lean();
  let prevHours = 0, prevTasksTotal = 0, prevTasksCompleted = 0;
  for (const ts of prevTimesheets) {
    prevHours += ts.totalHours || 0;
    for (const entry of ts.entries || []) {
      prevTasksTotal += 1;
      if (entry.status === 'Completed') prevTasksCompleted += 1;
    }
  }
  const prevCompletionPct = prevTasksTotal === 0 ? null : Math.round((prevTasksCompleted / prevTasksTotal) * 100);
  const hoursTrend = prevHours > 0 ? Math.round(((totalHours - prevHours) / prevHours) * 100) : null;
  const completionTrend = prevCompletionPct != null ? completionPct - prevCompletionPct : null;

  // Performance score for this week, if already calculated.
  const weekLabel = ist(start).format('GGGG-[W]WW');
  const score = await ProductivityScore.findOne({ employee: employeeId, week: weekLabel }).lean();

  const summaryParts = [
    `Logged ${Math.round(totalHours * 10) / 10}h across ${tasksTotal} task${tasksTotal === 1 ? '' : 's'}, ${tasksCompleted} completed (${completionPct}%).`,
  ];
  if (topCategory) summaryParts.push(`Mostly ${topCategory[0]} work (${Math.round(topCategory[1] * 10) / 10}h).`);
  if (blockedCount > 0) summaryParts.push(`${blockedCount} blocker${blockedCount === 1 ? '' : 's'} reported.`);
  if (tasksOverdue > 0) summaryParts.push(`${tasksOverdue} task${tasksOverdue === 1 ? '' : 's'} overdue.`);
  if (daysUpdated < workingDaysInWeek) summaryParts.push(`Daily update saved on ${daysUpdated}/${workingDaysInWeek} working days.`);
  if (hoursTrend != null) summaryParts.push(`Hours ${hoursTrend >= 0 ? 'up' : 'down'} ${Math.abs(hoursTrend)}% vs last week.`);
  if (completionTrend != null) summaryParts.push(`Completion ${completionTrend >= 0 ? 'up' : 'down'} ${Math.abs(completionTrend)} pts vs last week.`);
  if (score?.timesheetScore != null) summaryParts.push(`Performance (Timesheet) score this week: ${score.timesheetScore}%.`);

  return {
    employee,
    weekStart: ymd(start),
    weekEnd: ymd(end),
    totalHours: Math.round(totalHours * 10) / 10,
    tasksTotal,
    tasksCompleted,
    tasksOverdue,
    completionPct,
    daysUpdated,
    workingDaysInWeek,
    categoryTotals,
    blockers,
    trend: { hoursTrend, completionTrend, prevHours: Math.round(prevHours * 10) / 10, prevCompletionPct },
    performanceScore: score ? { timesheetScore: score.timesheetScore, totalScore: score.totalScore } : null,
    summary: summaryParts.join(' '),
    rows,
  };
};

exports.getWeeklySummary = async (req, res) => {
  try {
    const summary = await buildWeeklySummary(req.user._id, req.query.date);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const WEEKLY_REPORT_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'task', label: 'Task' },
  { key: 'project', label: 'Project' },
  { key: 'workCategory', label: 'Category' },
  { key: 'status', label: 'Status' },
  { key: 'hours', label: 'Hours' },
  { key: 'dueDate', label: 'Due Date' },
];

// Shared by the download endpoint and the Monday auto-email cron job.
const buildWeeklyReportPDF = (summary) => generateTimesheetReportPDF({
  title: `Weekly Report — ${summary.weekStart} to ${summary.weekEnd}`,
  columns: WEEKLY_REPORT_COLUMNS,
  rows: summary.rows,
  summary: summary.summary,
});

exports.buildWeeklySummary = buildWeeklySummary;
exports.buildWeeklyReportPDF = buildWeeklyReportPDF;

exports.downloadWeeklyReportPDF = async (req, res) => {
  try {
    const summary = await buildWeeklySummary(req.user._id, req.query.date);
    const filepath = await buildWeeklyReportPDF(summary);
    res.setHeader('Content-Disposition', `attachment; filename="Weekly_Report_${summary.weekStart}.pdf"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    fs.createReadStream(filepath).pipe(res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Legacy review flow (unchanged — sidelined from the new daily-work flow) ──

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
      message: `Your timesheet for ${ist(timesheet.date).format('DD MMM YYYY')} has been ${status}.`,
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
