/**
 * Analytics registry: the ONLY models, fields, calculations and charts the
 * analytics engine accepts. The client sends registry keys; nothing it sends is
 * used as a MongoDB field name or query without being looked up here first.
 *
 *   module   a group shown in the builder (Sales, HR, ...)
 *   source   one model of a module (Lead, Visit, ...)
 *   field    a field of a source:
 *              type      id | string | enum | ref | number | date | bool
 *              path      stored path (default: the key)
 *              via       relation key ('lead': the record's lead) -> path is on that model
 *              expr(ctx) computed field (aggregation expression)
 *              ref       labels come from REFS[ref] (users by name, ...)
 *              options   enum values in business order
 *              aliases   enum value -> every stored value meaning it (legacy names)
 *              utcDay    date stored as UTC midnight (plain calendar day)
 *              dayString date stored as text 'YYYY-MM-DD' (Attendance.date); also utcDay
 *              normalize(path) expression giving the field's value from the stored one
 *              group     may be a category / series
 *              column    may be a table column
 *              format    number display hint: currency | minutes | hours | days | rating
 *              roles     only these roles may use the field (salary); default: everyone
 *
 *   source.roles  roles that get the source without its page module (managers: HR)
 *
 * Fields come from the real schemas (models/*.js). Sensitive data (passwords,
 * tokens, bank / ID / contact details) is never registered, so it cannot be queried.
 */

const mongoose = require('mongoose');
const Lead = require('../../models/Lead');
require('../../models/Visit');
require('../../models/Demo');
require('../../models/DataUpdate');
require('../../models/Registration');
require('../../models/Feedback');
require('../../models/Attendance');
require('../../models/Leave');
require('../../models/User');
require('../../models/Department');

/* ------------------------------ reference labels ------------------------------ */

const REFS = {
  user: { model: 'User', select: 'name employeeId', label: (d) => (d.employeeId ? `${d.name} (${d.employeeId})` : d.name) },
  product: { model: 'Product', select: 'name', label: (d) => d.name },
  location: { model: 'ProductLocation', select: 'name', label: (d) => d.name },
  lead: { model: 'Lead', select: 'name', label: (d) => d.name },
  department: { model: 'Department', select: 'name', label: (d) => d.name },
};

/* ------------------------------ pipeline stages ------------------------------ */

const STAGE_LABELS = {
  lead: 'Lead',
  visit: 'Visit',
  demo: 'Demo',
  'data-update': 'Data Update',
  registration: 'Registration',
  feedback: 'Feedback',
  'lead-won': 'Lead Won',
  'lead-lost': 'Lead Lost',
};
const STAGE_OPTIONS = Lead.PIPELINE_STAGES.map((value) => ({ value, label: STAGE_LABELS[value] || value }));
const CLOSED_STAGE_VALUES = ['lead-won', 'lead-lost'].flatMap(Lead.stageValues);

// A lead without a stage is a plain 'lead'.
const stageAliases = (value) => (value === 'lead' ? [...Lead.stageValues('lead'), null, ''] : Lead.stageValues(value));

/** Aggregation expression: the current stage name for the stored value at `path`. */
const stageExpr = (path) => ({
  $switch: {
    branches: [
      ...Lead.PIPELINE_STAGES
        .map((stage) => ({ stage, legacy: Lead.stageValues(stage).filter((v) => v !== stage) }))
        .filter((s) => s.legacy.length)
        .map((s) => ({ case: { $in: [path, s.legacy] }, then: s.stage })),
      { case: { $in: [{ $ifNull: [path, ''] }, ['']] }, then: 'lead' },
    ],
    default: path,
  },
});

/* --------------------------------- fields --------------------------------- */

const LEAD_FIELDS = {
  _id: { label: 'Lead', type: 'id' },
  name: { label: 'Lead name', type: 'string', column: true },
  assignedTo: { label: 'Assigned to', type: 'ref', ref: 'user', group: true, column: true },
  product: { label: 'Product', type: 'ref', ref: 'product', group: true, column: true },
  productLocation: { label: 'Mandal (location)', type: 'ref', ref: 'location', group: true },
  mandal: { label: 'Mandal', type: 'string', group: true, column: true },
  district: { label: 'Address', type: 'string', group: true, column: true },
  pipelineStage: {
    label: 'Pipeline stage', type: 'enum', options: STAGE_OPTIONS, aliases: stageAliases, normalize: stageExpr, group: true, column: true,
  },
  followUpDate: { label: 'Next follow-up', type: 'date', utcDay: true, column: true },
  createdAt: { label: 'Created on', type: 'date', column: true },
  updatedAt: { label: 'Updated on', type: 'date', column: true },
  overdue: {
    label: 'Follow-up overdue',
    type: 'bool',
    group: true,
    column: true,
    expr: (ctx) => ({
      $and: [
        { $ne: [{ $ifNull: ['$followUpDate', null] }, null] },
        { $lt: ['$followUpDate', ctx.todayUtc] },
        { $not: [{ $in: ['$pipelineStage', CLOSED_STAGE_VALUES] }] },
      ],
    }),
  },
};

// Fields of the record's lead, for Visit / Demo / ... (via the `lead` relation).
const LEAD_VIA_FIELDS = Object.fromEntries(
  ['assignedTo', 'product', 'productLocation', 'mandal', 'district', 'pipelineStage'].map((key) => [
    `lead.${key}`,
    { ...LEAD_FIELDS[key], label: `Lead ${LEAD_FIELDS[key].label.toLowerCase()}`, via: 'lead', path: key },
  ])
);

const durationMinutes = (startPath, endPath) => ({
  $cond: [
    { $and: [{ $ne: [{ $ifNull: [startPath, null] }, null] }, { $ne: [{ $ifNull: [endPath, null] }, null] }] },
    { $divide: [{ $subtract: [endPath, startPath] }, 60000] },
    null,
  ],
});

/** A lead activity model (models/activityBase.js). */
const activitySource = ({ key, label, model, dateKey, dateLabel, access, extra = {} }) => ({
  key,
  label,
  module: 'sales',
  model,
  access,
  ownerField: 'assignedTo',
  defaultDate: dateKey,
  relations: { lead: { model: 'Lead', localField: 'lead' } },
  dimensions: { employee: 'assignedTo', product: 'lead.product', status: 'lead.pipelineStage' },
  fields: {
    _id: { label, type: 'id' },
    lead: { label: 'Lead', type: 'ref', ref: 'lead', group: true, column: true },
    [dateKey]: { label: dateLabel, type: 'date', utcDay: true, column: true },
    assignedTo: { label: 'Done by', type: 'ref', ref: 'user', group: true, column: true },
    startTime: { label: 'Start time', type: 'date', column: true },
    endTime: { label: 'End time', type: 'date', column: true },
    durationMinutes: { label: 'Duration (minutes)', type: 'number', format: 'minutes', column: true, expr: () => durationMinutes('$startTime', '$endTime') },
    ...extra,
    createdAt: { label: 'Recorded on', type: 'date', column: true },
    ...LEAD_VIA_FIELDS,
  },
});

/* -------------------------------- HR fields -------------------------------- */

// A stored yes/no; records saved before the field existed count as "No".
const isTrue = (path) => ({ $eq: [path, true] });

// Choice fields where "not set" (null / '') is a value of its own.
const withNone = (noneValue) => ({
  aliases: (v) => (v === noneValue ? [null, ''] : [v]),
  normalize: (path) => ({ $cond: [{ $in: [{ $ifNull: [path, ''] }, ['']] }, noneValue, path] }),
});

const ROLE_LABELS = {
  admin: 'Admin',
  hr: 'HR',
  manager: 'Manager',
  'team-lead': 'Team Lead',
  employee: 'Employee',
  sales: 'Sales',
  'inside-sales': 'Inside Sales',
  'product-executive': 'Product Executive',
  technical_associate: 'Technical Associate',
  bda: 'BDA',
};
const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
const EMPLOYEE_TYPE_OPTIONS = [{ value: 'fresher', label: 'Fresher' }, { value: 'experienced', label: 'Experienced' }, { value: 'intern', label: 'Intern' }];

/* Employee fields as stored on User (no salary, bank, ID or contact details). */
const EMPLOYEE_BASE = {
  department: { label: 'Department', type: 'ref', ref: 'department', group: true, column: true },
  role: { label: 'Role', type: 'enum', options: ROLE_OPTIONS, group: true, column: true },
  designation: { label: 'Designation', type: 'string', group: true, column: true },
  employeeType: { label: 'Employee type', type: 'enum', options: EMPLOYEE_TYPE_OPTIONS, group: true, column: true },
};

// The record's employee, for Attendance / Leave (via the `employee` relation).
const EMPLOYEE_VIA_FIELDS = Object.fromEntries(
  Object.entries(EMPLOYEE_BASE).map(([key, f]) => [
    `employee.${key}`,
    { ...f, label: `Employee ${f.label.toLowerCase()}`, via: 'employee', path: key },
  ])
);

const ATTENDANCE_FIELDS = {
  _id: { label: 'Attendance', type: 'id' },
  employee: { label: 'Employee', type: 'ref', ref: 'user', group: true, column: true },
  date: { label: 'Date', type: 'date', dayString: true, utcDay: true, column: true },
  status: {
    label: 'Status',
    type: 'enum',
    options: [{ value: 'present', label: 'Present' }, { value: 'half-day', label: 'Half day' }, { value: 'absent', label: 'Absent' }],
    group: true,
    column: true,
  },
  checkIn: { label: 'Check-in (HH:mm)', type: 'string', column: true },
  checkOut: { label: 'Check-out (HH:mm)', type: 'string', column: true },
  workHours: { label: 'Work hours', type: 'number', format: 'hours', column: true },
  presentDays: {
    label: 'Days present (half day = 0.5)',
    type: 'number',
    format: 'days',
    column: true,
    expr: () => ({ $switch: { branches: [{ case: { $eq: ['$status', 'present'] }, then: 1 }, { case: { $eq: ['$status', 'half-day'] }, then: 0.5 }], default: 0 } }),
  },
  isLate: { label: 'Late check-in', type: 'bool', normalize: isTrue, group: true, column: true },
  isEarlyLeave: { label: 'Left early', type: 'bool', normalize: isTrue, group: true, column: true },
  checkedOut: {
    label: 'Checked out', type: 'bool', group: true, column: true,
    expr: () => ({ $not: [{ $in: [{ $ifNull: ['$checkOut', ''] }, ['']] }] }),
  },
  regularizationStatus: {
    label: 'Regularization',
    type: 'enum',
    options: [{ value: 'none', label: 'Not requested' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }],
    ...withNone('none'),
    group: true,
    column: true,
  },
  regularizationAttempts: { label: 'Regularization attempts', type: 'number', column: true },
  createdAt: { label: 'Recorded on', type: 'date', column: true },
  ...EMPLOYEE_VIA_FIELDS,
};

const LEAVE_FIELDS = {
  _id: { label: 'Leave', type: 'id' },
  employee: { label: 'Employee', type: 'ref', ref: 'user', group: true, column: true },
  type: {
    label: 'Leave type',
    type: 'enum',
    options: [{ value: 'casual', label: 'Casual' }, { value: 'sick', label: 'Sick' }, { value: 'other', label: 'Other' }, { value: 'lop', label: 'Loss of pay' }],
    group: true,
    column: true,
  },
  status: {
    label: 'Status',
    type: 'enum',
    options: [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }],
    group: true,
    column: true,
  },
  fromDate: { label: 'From', type: 'date', utcDay: true, column: true },
  toDate: { label: 'To', type: 'date', utcDay: true, column: true },
  totalDays: { label: 'Days', type: 'number', format: 'days', column: true },
  halfDay: { label: 'Half day', type: 'bool', normalize: isTrue, group: true, column: true },
  approvedBy: { label: 'Decided by', type: 'ref', ref: 'user', group: true, column: true },
  approvalDate: { label: 'Decided on', type: 'date', column: true },
  daysToDecide: {
    label: 'Days to decide',
    type: 'number',
    format: 'days',
    column: true,
    expr: () => ({
      $cond: [
        { $and: [{ $in: ['$status', ['approved', 'rejected']] }, { $ne: [{ $ifNull: ['$approvalDate', null] }, null] }] },
        { $divide: [{ $subtract: ['$approvalDate', '$createdAt'] }, 86400000] },
        null,
      ],
    }),
  },
  createdAt: { label: 'Applied on', type: 'date', column: true },
  ...EMPLOYEE_VIA_FIELDS,
};

// Still employed on the given day: not deactivated, and no last day before it.
const employmentStatusExpr = (ctx) => ({
  $switch: {
    branches: [
      { case: { $and: [{ $ne: [{ $ifNull: ['$exitDate', null] }, null] }, { $lt: ['$exitDate', ctx.todayUtc] }] }, then: 'exited' },
      { case: { $eq: ['$isActive', false] }, then: 'inactive' },
    ],
    default: 'active',
  },
});

/*
 * Monthly salary from the employee record, worked out like a payslip:
 * gross = basic + allowances, net = gross − deductions. Admin, HR and managers only.
 */
const PAYROLL_ROLES = ['admin', 'hr', 'manager'];
const amountsTotal = (path) => ({ $sum: { $map: { input: { $ifNull: [path, []] }, as: 'x', in: { $ifNull: ['$$x.amount', 0] } } } });
const basic = { $ifNull: ['$basicSalary', 0] };
const gross = { $add: [basic, amountsTotal('$allowances')] };
const payroll = (label, expr) => ({
  label, type: 'number', format: 'currency', column: true, roles: PAYROLL_ROLES, ...(expr ? { expr: () => expr } : {}),
});
const PAYROLL_FIELDS = {
  basicSalary: payroll('Basic salary (monthly)'),
  totalAllowances: payroll('Allowances (monthly)', amountsTotal('$allowances')),
  totalDeductions: payroll('Deductions (monthly)', amountsTotal('$deductions')),
  grossSalary: payroll('Gross salary (basic + allowances)', gross),
  netSalary: payroll('Net salary (gross − deductions)', { $subtract: [gross, amountsTotal('$deductions')] }),
};

const EMPLOYEE_FIELDS = {
  _id: { label: 'Employee', type: 'id' },
  name: { label: 'Name', type: 'string', column: true },
  employeeId: { label: 'Employee ID', type: 'string', column: true },
  ...EMPLOYEE_BASE,
  status: {
    label: 'Employment status',
    type: 'enum',
    options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Deactivated' }, { value: 'exited', label: 'Exited' }],
    group: true,
    column: true,
    expr: employmentStatusExpr,
  },
  joiningDate: { label: 'Joining date', type: 'date', utcDay: true, column: true },
  exitDate: { label: 'Last working day', type: 'date', utcDay: true, column: true },
  tenureYears: {
    label: 'Years of service',
    type: 'number',
    column: true,
    expr: (ctx) => ({
      $cond: [
        { $eq: [{ $ifNull: ['$joiningDate', null] }, null] },
        null,
        {
          $divide: [
            { $subtract: [{ $min: [{ $ifNull: ['$exitDate', ctx.now] }, ctx.now] }, '$joiningDate'] },
            365.25 * 86400000,
          ],
        },
      ],
    }),
  },
  internshipStatus: {
    label: 'Internship status',
    type: 'enum',
    options: [
      { value: 'none', label: 'Not an intern' },
      { value: 'active', label: 'Active' }, { value: 'extended', label: 'Extended' }, { value: 'completed', label: 'Completed' },
      { value: 'accepted', label: 'Accepted' }, { value: 'rejected', label: 'Rejected' },
    ],
    // Only interns have an internship; everyone else is "Not an intern".
    expr: () => ({ $cond: [{ $eq: ['$employeeType', 'intern'] }, { $ifNull: ['$internship.status', 'active'] }, 'none'] }),
    group: true,
    column: true,
  },
  createdAt: { label: 'Added on', type: 'date', column: true },
  ...PAYROLL_FIELDS,
};

/* --------------------------------- sources --------------------------------- */

const MODULES = {
  sales: { key: 'sales', label: 'Sales' },
  hr: { key: 'hr', label: 'HR' },
};

const SOURCES = {
  lead: {
    key: 'lead',
    label: 'Leads',
    module: 'sales',
    model: 'Lead',
    access: ['crm', 'lead'],
    ownerField: 'assignedTo',
    defaultDate: 'createdAt',
    relations: {},
    dimensions: { employee: 'assignedTo', product: 'product', status: 'pipelineStage' },
    funnels: ['stage', 'activity'],
    fields: LEAD_FIELDS,
  },
  visit: {
    key: 'visit',
    label: 'Visits',
    module: 'sales',
    model: 'Visit',
    access: ['visits', 'crm'],
    ownerField: 'visitedBy',
    defaultDate: 'visitDate',
    relations: { lead: { model: 'Lead', localField: 'lead' } },
    dimensions: { employee: 'visitedBy', product: 'lead.product', status: 'lead.pipelineStage' },
    fields: {
      _id: { label: 'Visit', type: 'id' },
      lead: { label: 'Lead', type: 'ref', ref: 'lead', group: true, column: true },
      visitDate: { label: 'Visit date', type: 'date', utcDay: true, column: true },
      visitedBy: { label: 'Visited by', type: 'ref', ref: 'user', group: true, column: true },
      timeIn: { label: 'Time in', type: 'date', column: true },
      timeOut: { label: 'Time out', type: 'date', column: true },
      durationMinutes: { label: 'Duration (minutes)', type: 'number', format: 'minutes', column: true, expr: () => durationMinutes('$timeIn', '$timeOut') },
      createdAt: { label: 'Recorded on', type: 'date', column: true },
      ...LEAD_VIA_FIELDS,
    },
  },
  demo: activitySource({ key: 'demo', label: 'Demos', model: 'Demo', dateKey: 'demoDate', dateLabel: 'Demo date', access: ['demos', 'crm'] }),
  dataUpdate: activitySource({ key: 'dataUpdate', label: 'Data Updates', model: 'DataUpdate', dateKey: 'updateDate', dateLabel: 'Update date', access: ['data_updation', 'crm'] }),
  registration: activitySource({
    key: 'registration',
    label: 'Registrations',
    model: 'Registration',
    dateKey: 'registrationDate',
    dateLabel: 'Registration date',
    access: ['registration', 'crm'],
    extra: {
      registrationNumber: { label: 'Registration number', type: 'string', column: true },
      paymentType: {
        label: 'Payment type',
        type: 'enum',
        options: [{ value: 'cash', label: 'Cash' }, { value: 'online', label: 'Online' }, { value: 'emi', label: 'EMI' }, { value: '', label: 'Not set' }],
        group: true,
        column: true,
      },
      amount: { label: 'Amount', type: 'number', format: 'currency', column: true },
      discount: { label: 'Discount', type: 'number', format: 'currency', column: true },
      netAmount: {
        label: 'Net amount (amount − discount)', type: 'number', format: 'currency', column: true,
        expr: () => ({ $subtract: [{ $ifNull: ['$amount', 0] }, { $ifNull: ['$discount', 0] }] }),
      },
    },
  }),
  feedback: activitySource({
    key: 'feedback',
    label: 'Feedback',
    model: 'Feedback',
    dateKey: 'feedbackDate',
    dateLabel: 'Feedback date',
    access: ['feedback', 'crm'],
    extra: {
      rating: { label: 'Rating (1–5)', type: 'number', format: 'rating', group: true, column: true },
    },
  }),

  /* HR: the HR page of the model, or a manager (department data only, scope.js). */
  attendance: {
    key: 'attendance',
    label: 'Attendance',
    module: 'hr',
    model: 'Attendance',
    access: ['hr_attendance'],
    roles: ['manager'],
    ownerField: 'employee',
    defaultDate: 'date',
    relations: { employee: { model: 'User', localField: 'employee' } },
    dimensions: { employee: 'employee' },
    fields: ATTENDANCE_FIELDS,
  },
  leave: {
    key: 'leave',
    label: 'Leaves',
    module: 'hr',
    model: 'Leave',
    access: ['hr_leaves'],
    roles: ['manager'],
    ownerField: 'employee',
    defaultDate: 'fromDate',
    relations: { employee: { model: 'User', localField: 'employee' } },
    dimensions: { employee: 'employee' },
    fields: LEAVE_FIELDS,
  },
  employee: {
    key: 'employee',
    label: 'Employees',
    module: 'hr',
    model: 'User',
    access: ['hr_employees'],
    roles: ['manager'],
    ownerField: '_id',
    defaultDate: 'joiningDate',
    relations: {},
    dimensions: { employee: '_id' },
    fields: EMPLOYEE_FIELDS,
  },
};

// Activity funnel steps: leads that have at least one record of each model.
const ACTIVITY_FUNNEL = [
  { key: 'visit', label: 'With a visit', model: 'Visit' },
  { key: 'demo', label: 'With a demo', model: 'Demo' },
  { key: 'dataUpdate', label: 'With a data update', model: 'DataUpdate' },
  { key: 'registration', label: 'With a registration', model: 'Registration' },
];

/* ------------------------------ calculations ------------------------------ */

const CALCS = {
  count: { label: 'Count', fieldTypes: null },
  sum: { label: 'Sum', fieldTypes: ['number'] },
  avg: { label: 'Average', fieldTypes: ['number'] },
  min: { label: 'Minimum', fieldTypes: ['number'] },
  max: { label: 'Maximum', fieldTypes: ['number'] },
  distinct: { label: 'Distinct count', fieldTypes: ['id', 'ref', 'string', 'enum'] },
  conversion: { label: 'Conversion %', fieldTypes: null, needsWhere: true },
};

/*
 * Chart types. measures: [min, max]. category: required / optional / none.
 * Percentage of total: `percent` on bar / donut / ranking / grouped table.
 * Progress %: `target` on a score card. Growth %: the growth chart.
 */
const CHARTS = {
  score: { label: 'Score Card', measures: [1, 1], category: 'none' },
  growth: { label: 'Growth Index', measures: [1, 1], category: 'none', needsDate: true },
  ranking: { label: 'Ranking List', measures: [1, 1], category: 'required' },
  bar: { label: 'Bar Chart', measures: [1, 1], category: 'required', series: true },
  donut: { label: 'Donut Chart', measures: [1, 1], category: 'required' },
  line: { label: 'Line Chart', measures: [1, 1], category: 'none', needsDate: true, series: true },
  area: { label: 'Area Chart', measures: [1, 1], category: 'none', needsDate: true, series: true },
  butterfly: { label: 'Butterfly Chart', measures: [2, 2], category: 'required' },
  table: { label: 'Table', measures: [0, 4], category: 'optional' },
  funnel: { label: 'Funnel Chart', measures: [0, 0], category: 'none' },
};

const BUCKETS = {
  day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year', weekday: 'Weekday',
};

/* --------------------------------- helpers --------------------------------- */

const modelOf = (name) => mongoose.model(name);
const getSource = (key) => (Object.prototype.hasOwnProperty.call(SOURCES, key) ? SOURCES[key] : null);
const getField = (source, key) => (source && Object.prototype.hasOwnProperty.call(source.fields, key) ? source.fields[key] : null);

module.exports = {
  REFS, MODULES, SOURCES, CALCS, CHARTS, BUCKETS, ACTIVITY_FUNNEL, STAGE_OPTIONS, CLOSED_STAGE_VALUES, ROLE_LABELS,
  modelOf, getSource, getField,
};
