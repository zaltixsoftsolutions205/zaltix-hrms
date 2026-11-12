const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const Department = require('../models/Department');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const engine = require('../services/analytics/engine');
const { validateConfig, validateDashboardFilters } = require('../services/analytics/validate');
const { allowedSources, canUseField, ownerScope } = require('../services/analytics/scope');
const { getSource } = require('../services/analytics/registry');
const c = require('../controllers/analyticsController');

// Global Analytics on the HR models (Attendance, Leaves, Employees): day-as-text
// dates, yes/no fields, computed fields, access and department scope.
const mongoUri = process.env.MONGO_TEST_URI;

const NOW = new Date('2026-10-15T06:00:00Z'); // 15 Oct 2026, 11:30 in Asia/Kolkata
const day = (s) => new Date(`${s}T00:00:00Z`);
const as = (u) => User.findById(u._id).select('-password');

test('Global Analytics HR sources on replica-set MongoDB', {
  skip: !mongoUri && 'Set MONGO_TEST_URI to an isolated replica-set MongoDB URI',
}, async (t) => {
  await mongoose.connect(mongoUri, { dbName: `analytics_hr_${Date.now()}`, serverSelectionTimeoutMS: 10000 });
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await Promise.all([User, Attendance, Leave].map((m) => m.init()));

  const mk = (id, role, extra = {}) => User.create({
    employeeId: id, name: id, email: `${id}@x.io`, password: 'secret1', role, employeeType: 'experienced', ...extra,
  });
  const admin = await mk('ADM', 'admin');
  const D1 = await Department.create({ name: 'Ops', createdBy: admin._id });
  const D2 = await Department.create({ name: 'Sales', createdBy: admin._id });
  const hr = await mk('HR1', 'hr');
  const mgr1 = await mk('MGR1', 'manager', { department: D1._id });
  const e1 = await mk('E1', 'employee', {
    department: D1._id, joiningDate: day('2024-10-15'), basicSalary: 30000, allowances: [{ name: 'HRA', amount: 5000 }, { name: 'TA', amount: 1000 }], deductions: [{ name: 'PF', amount: 1800 }],
  });
  const e2 = await mk('E2', 'employee', { department: D1._id, joiningDate: day('2026-10-01'), employeeType: 'intern', internship: { status: 'extended' }, basicSalary: 10000 });
  const e3 = await mk('E3', 'sales', { department: D2._id, joiningDate: day('2025-04-15'), exitDate: day('2026-04-15'), basicSalary: 50000 });
  await mk('E4', 'sales', { department: D2._id, isActive: false });

  const att = (who, date, status, extra = {}) => Attendance.create({ employee: who._id, date, status, ...extra });
  await att(e1, '2026-10-01', 'present', { checkIn: '09:20', checkOut: '18:00', workHours: 8.5, isLate: true });
  await att(e1, '2026-10-02', 'half-day', { checkIn: '09:00', checkOut: '13:00', workHours: 4 });
  await att(e1, '2026-09-30', 'present', { checkIn: '09:00', checkOut: '18:00', workHours: 9 });
  await att(e2, '2026-10-01', 'absent');
  await att(e3, '2026-10-03', 'present', { checkIn: '10:00', workHours: 0, isLate: true, regularizationStatus: 'pending' });
  // Saved before isLate existed: no field at all (counts as "No").
  const legacy = await att(e2, '2026-10-05', 'present', { checkIn: '09:00', checkOut: '18:00', workHours: 9 });
  await Attendance.collection.updateOne({ _id: legacy._id }, { $unset: { isLate: '' } });

  await Leave.create({
    employee: e1._id, type: 'sick', fromDate: day('2026-10-06'), toDate: day('2026-10-07'), totalDays: 2, reason: 'flu', status: 'approved', approvedBy: hr._id, approvalDate: new Date('2026-10-05T12:00:00Z'),
  });
  await Leave.create({ employee: e3._id, type: 'casual', fromDate: day('2026-10-10'), toDate: day('2026-10-10'), totalDays: 1, reason: 'x' });
  await Leave.create({ employee: e2._id, type: 'lop', fromDate: day('2026-09-02'), toDate: day('2026-09-02'), totalDays: 0.5, halfDay: true, reason: 'y', status: 'rejected' });

  const run = async (config, { user = admin, filters = {}, page = 1 } = {}) => engine.run(validateConfig(config), {
    owners: await ownerScope(await as(user)), dashboardFilters: validateDashboardFilters(filters), page, now: NOW,
  });
  const byLabel = (rows) => Object.fromEntries(rows.map((r) => [r.label, r.value]));
  const count = { calc: 'count' };

  /* ---- who sees the HR models ---- */
  const keys = async (u) => allowedSources(await as(u)).map((s) => s.key);
  assert.ok((await keys(hr)).includes('attendance') && (await keys(hr)).includes('employee'));
  assert.ok((await keys(admin)).includes('leave'));
  assert.deepEqual((await keys(mgr1)).filter((k) => ['attendance', 'leave', 'employee'].includes(k)), ['attendance', 'leave', 'employee'], 'managers get HR by default');
  assert.ok(!(await keys(e1)).includes('attendance'));

  // Salary fields: admin / HR / manager only
  const salaryField = getSource('employee').fields.netSalary;
  assert.equal(canUseField(await as(mgr1), salaryField), true);
  assert.equal(canUseField(await as(hr), salaryField), true);
  assert.equal(canUseField(await as(e1), salaryField), false);

  /* ---- attendance: text dates in a range, status in business order ---- */
  const byStatus = { source: 'attendance', chartType: 'bar', category: { field: 'status' }, measures: [count], dateRange: { preset: 'this_month' } };
  let r = await run(byStatus);
  assert.deepEqual(r.data.rows.map((x) => [x.label, x.value]), [['Present', 3], ['Half day', 1], ['Absent', 1]], '30 Sep left out');
  r = await run(byStatus, { filters: { dateRange: { from: '2026-09-30', to: '2026-09-30' } } });
  assert.deepEqual(byLabel(r.data.rows), { Present: 1 });

  // Date filters on the text date (eq / before)
  r = await run({ source: 'attendance', chartType: 'score', measures: [count], filters: [{ field: 'date', op: 'eq', value: '2026-10-01' }] });
  assert.equal(r.data.value, 2);
  r = await run({ source: 'attendance', chartType: 'score', measures: [count], filters: [{ field: 'date', op: 'lt', value: '2026-10-01' }] });
  assert.equal(r.data.value, 1);

  // Days present (half day = 0.5), work hours
  r = await run({ source: 'attendance', chartType: 'ranking', category: { field: 'employee' }, measures: [{ calc: 'sum', field: 'presentDays' }], dateRange: { preset: 'this_month' } });
  assert.deepEqual(byLabel(r.data.rows), { 'E1 (E1)': 1.5, 'E2 (E2)': 1, 'E3 (E3)': 1 });
  assert.equal(r.data.format, 'days');
  r = await run({ source: 'attendance', chartType: 'score', measures: [{ calc: 'avg', field: 'workHours', where: [{ field: 'status', op: 'eq', value: 'present' }] }] });
  assert.equal(r.data.value, 6.63, '(8.5 + 9 + 0 + 9) / 4');

  // Yes/no: a missing value counts as "No" (filter and group)
  r = await run({ source: 'attendance', chartType: 'score', measures: [count], filters: [{ field: 'isLate', op: 'eq', value: false }] });
  assert.equal(r.data.value, 4);
  r = await run({ source: 'attendance', chartType: 'bar', category: { field: 'isLate' }, measures: [count] });
  assert.deepEqual(byLabel(r.data.rows), { Yes: 2, No: 4 });
  r = await run({ source: 'attendance', chartType: 'bar', category: { field: 'checkedOut' }, measures: [count] });
  assert.deepEqual(byLabel(r.data.rows), { Yes: 4, No: 2 });

  // Regularization: "not requested" is a value of its own
  r = await run({ source: 'attendance', chartType: 'donut', category: { field: 'regularizationStatus' }, measures: [count] });
  assert.deepEqual(byLabel(r.data.rows), { 'Not requested': 5, Pending: 1 });
  r = await run({ source: 'attendance', chartType: 'score', measures: [count], filters: [{ field: 'regularizationStatus', op: 'eq', value: 'none' }] });
  assert.equal(r.data.value, 5);

  // Employee department (relation) and the dashboard department filter
  r = await run({ source: 'attendance', chartType: 'bar', category: { field: 'employee.department' }, measures: [count] });
  assert.deepEqual(byLabel(r.data.rows), { Ops: 5, Sales: 1 });
  r = await run({ ...byStatus, dateRange: null }, { filters: { department: [String(D2._id)] } });
  assert.deepEqual(byLabel(r.data.rows), { Present: 1 });

  // Timeline by day over the text date
  r = await run({ source: 'attendance', chartType: 'line', dateField: 'date', interval: 'day', measures: [count], dateRange: { from: '2026-10-01', to: '2026-10-03' } });
  assert.deepEqual(r.data.rows.map((x) => [x.key, x.value]), [['2026-10-01', 2], ['2026-10-02', 1], ['2026-10-03', 1]]);

  // Record table: the text date comes back as a day
  r = await run({
    source: 'attendance', chartType: 'table', table: { columns: ['employee', 'date', 'status', 'isLate'], sortField: 'date', sortDir: 'asc' },
  });
  assert.equal(r.data.rows[0].cells[1], '2026-09-30T00:00:00.000Z');
  assert.deepEqual(r.data.rows[0].cells.slice(2), ['Present', 'No']);

  /* ---- leaves ---- */
  r = await run({ source: 'leave', chartType: 'bar', category: { field: 'type' }, measures: [{ calc: 'sum', field: 'totalDays' }] });
  assert.deepEqual(r.data.rows.map((x) => [x.label, x.value]), [['Casual', 1], ['Sick', 2], ['Loss of pay', 0.5]]);
  r = await run({ source: 'leave', chartType: 'funnel', funnel: { kind: 'enum', field: 'status' } });
  assert.deepEqual(r.data.steps.map((s) => [s.label, s.value]), [['Pending', 1], ['Approved', 1], ['Rejected', 1]]);
  r = await run({ source: 'leave', chartType: 'score', measures: [{ calc: 'count' }], dateRange: { preset: 'this_month' } });
  assert.equal(r.data.value, 2, 'by From date');

  /* ---- employees ---- */
  r = await run({ source: 'employee', chartType: 'donut', category: { field: 'status' }, measures: [count] });
  assert.deepEqual(byLabel(r.data.rows), { Active: 5, Deactivated: 1, Exited: 1 });
  r = await run({ source: 'employee', chartType: 'bar', category: { field: 'internshipStatus' }, measures: [count] });
  assert.deepEqual(byLabel(r.data.rows), { 'Not an intern': 6, Extended: 1 });
  r = await run({ source: 'employee', chartType: 'score', measures: [{ calc: 'max', field: 'tenureYears' }] });
  assert.equal(r.data.value, 2, 'E1: two years on 15 Oct 2026');
  r = await run({ source: 'employee', chartType: 'score', measures: [{ calc: 'avg', field: 'tenureYears', where: [{ field: 'status', op: 'eq', value: 'exited' }] }] });
  assert.equal(r.data.value, 1, 'E3 counted up to the last working day');
  r = await run({ source: 'employee', chartType: 'score', measures: [count], dateRange: { preset: 'this_month' } });
  assert.equal(r.data.value, 1, 'joined this month (by joining date)');
  r = await run({ source: 'employee', chartType: 'bar', category: { field: 'role' }, measures: [count], sort: 'label' });
  assert.equal(byLabel(r.data.rows).Sales, 2);

  /* ---- payroll (monthly, like a payslip) ---- */
  r = await run({ source: 'employee', chartType: 'score', measures: [{ calc: 'sum', field: 'netSalary' }] });
  assert.equal(r.data.value, 30000 + 6000 - 1800 + 10000 + 50000);
  assert.equal(r.data.format, 'currency');
  r = await run({
    source: 'employee', chartType: 'bar', category: { field: 'department' }, measures: [{ calc: 'sum', field: 'grossSalary', where: [{ field: 'status', op: 'eq', value: 'active' }] }],
  });
  assert.deepEqual(byLabel(r.data.rows), { Ops: 46000, Sales: 0, 'Not set': 0 }, 'exited E3 left out; admin / HR have no department');

  // Catalog and requests through the controller (manager: salary allowed, department only)
  const call = async (handler, user, body = {}) => {
    const out = { status: 200, body: null };
    const res = { status(code) { out.status = code; return this; }, json(data) { out.body = data; return this; } };
    await handler({ user: await as(user), params: {}, body, query: {} }, res);
    return out;
  };
  const cat = await call(c.getCatalog, mgr1);
  const hrModule = cat.body.modules.find((m) => m.key === 'hr');
  assert.ok(hrModule.sources.find((s) => s.key === 'employee').fields.some((f) => f.key === 'basicSalary'));
  const pay = await call(c.preview, mgr1, { config: { source: 'employee', chartType: 'score', measures: [{ calc: 'sum', field: 'basicSalary' }] } });
  assert.equal(pay.status, 200);
  assert.equal(pay.body.data.value, 40000, 'E1 + E2 (MGR1 has no salary)');

  /* ---- manager scope: own department only ---- */
  r = await run({ source: 'attendance', chartType: 'score', measures: [count] }, { user: mgr1 });
  assert.equal(r.data.value, 5, 'E1 + E2, not E3');
  r = await run({ source: 'employee', chartType: 'score', measures: [count] }, { user: mgr1 });
  assert.equal(r.data.value, 3, 'MGR1, E1, E2');
  r = await run({ source: 'employee', chartType: 'score', measures: [count] }, { user: mgr1, filters: { employee: [String(e1._id)] } });
  assert.equal(r.data.value, 1, 'dashboard employee filter on Employees');
});
