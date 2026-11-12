const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const Department = require('../models/Department');
const Product = require('../models/Product');
const Lead = require('../models/Lead');
const Visit = require('../models/Visit');
const Demo = require('../models/Demo');
const Registration = require('../models/Registration');
const AnalyticsWidget = require('../models/AnalyticsWidget');
const AnalyticsDashboard = require('../models/AnalyticsDashboard');
const engine = require('../services/analytics/engine');
const { validateConfig, validateDashboardFilters, AnalyticsError } = require('../services/analytics/validate');
const { canUseAnalytics, ownerScope } = require('../services/analytics/scope');
const c = require('../controllers/analyticsController');

// Global Analytics engine on the sales models: results, access scope, validation,
// dashboard filters, saved widgets / dashboards. Needs an isolated MongoDB.
const mongoUri = process.env.MONGO_TEST_URI;

const NOW = new Date('2026-10-15T06:00:00Z'); // 15 Oct 2026, 11:30 in Asia/Kolkata
const day = (s) => new Date(`${s}T00:00:00Z`);

const as = (u) => User.findById(u._id).select('-password');
const call = async (handler, user, { params = {}, body = {}, query = {} } = {}) => {
  const out = { status: 200, body: null };
  const res = { status(code) { out.status = code; return this; }, json(data) { out.body = data; return this; } };
  await handler({ user: await as(user), params, body, query }, res);
  return out;
};

test('Global Analytics on replica-set MongoDB', {
  skip: !mongoUri && 'Set MONGO_TEST_URI to an isolated replica-set MongoDB URI',
}, async (t) => {
  await mongoose.connect(mongoUri, { dbName: `analytics_${Date.now()}`, serverSelectionTimeoutMS: 10000 });
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await Promise.all([User, Lead, Visit, Demo, Registration, AnalyticsWidget, AnalyticsDashboard].map((m) => m.init()));

  const mk = (id, role, extra = {}) => User.create({ employeeId: id, name: id, email: `${id}@x.io`, password: 'secret1', role, employeeType: 'experienced', ...extra });
  const admin = await mk('ADM', 'admin');
  const D1 = await Department.create({ name: 'Sales One', createdBy: admin._id });
  const D2 = await Department.create({ name: 'Sales Two', createdBy: admin._id });
  const hr = await mk('HR1', 'hr');
  const mgr1 = await mk('MGR1', 'manager', { department: D1._id });
  const mgr0 = await mk('MGR0', 'manager');
  const emp1 = await mk('EMP1', 'sales', { department: D1._id });
  const emp2 = await mk('EMP2', 'sales', { department: D1._id });
  const emp3 = await mk('EMP3', 'sales', { department: D2._id });
  const P1 = await Product.create({ name: 'Product-1' });
  const P2 = await Product.create({ name: 'Product-2' });

  const lead = async (name, who, stage, created, extra = {}) => {
    const doc = await Lead.create({ name, assignedTo: who._id, product: P1._id, ...extra });
    // pipelineStage may hold legacy names, written straight to the collection.
    await Lead.collection.updateOne({ _id: doc._id }, { $set: { pipelineStage: stage, createdAt: day(created) } });
    return doc._id;
  };
  const L1 = await lead('L1', emp1, 'lead', '2026-09-10');
  const L2 = await lead('L2', emp1, 'visit', '2026-10-02');
  const L3 = await lead('L3', emp2, 'demo', '2026-10-05', { followUpDate: day('2026-10-10') }); // overdue on 15 Oct
  const L4 = await lead('L4', emp2, 'lead-won', '2026-10-06');
  const L5 = await lead('L5', emp3, 'registration', '2026-10-08', { product: P2._id });
  await lead('L6', emp3, 'closed-lost', '2026-10-09'); // legacy name of Lead Lost
  await lead('L7', emp1, 'converted', '2026-08-20'); // legacy name of Lead Won

  const visit = (leadId, who, date, timeIn, timeOut) => Visit.create({
    lead: leadId, visitedBy: who._id, visitDate: day(date), timeIn: timeIn ? new Date(timeIn) : null, timeOut: timeOut ? new Date(timeOut) : null,
  });
  await visit(L1, emp1, '2026-09-15');
  await visit(L2, emp1, '2026-10-02');
  await visit(L2, emp1, '2026-10-03', '2026-10-03T05:00:00Z', '2026-10-03T05:30:00Z');
  await visit(L2, emp1, '2026-10-12');
  await visit(L3, emp2, '2026-10-05');
  await visit(L5, emp3, '2026-10-08');
  await Demo.create({ lead: L3, demoDate: day('2026-10-06'), assignedTo: emp2._id });
  await Demo.create({ lead: L4, demoDate: day('2026-10-06'), assignedTo: emp2._id });
  await Registration.create({ lead: L4, registrationDate: day('2026-10-07'), registrationNumber: 'R-1', paymentType: 'cash', amount: 10000, discount: 1000, assignedTo: emp2._id });
  await Registration.create({ lead: L5, registrationDate: day('2026-10-09'), registrationNumber: 'R-2', paymentType: 'online', amount: 5000, assignedTo: emp3._id });

  const run = async (config, { user = admin, filters = {}, page = 1 } = {}) => engine.run(validateConfig(config), {
    owners: await ownerScope(await as(user)), dashboardFilters: validateDashboardFilters(filters), page, now: NOW,
  });
  const countOf = (extra = {}) => ({ calc: 'count', ...extra });
  const byLabel = (rows) => Object.fromEntries(rows.map((r) => [r.label, r.value]));

  /* ---- who may use analytics ---- */
  assert.equal(canUseAnalytics(await as(mgr1)), true);
  assert.equal(canUseAnalytics(await as(hr)), true);
  assert.equal(canUseAnalytics(await as(emp1)), false, 'sales employees do not build dashboards');

  /* ---- pipeline split (donut), legacy stage names, business order ---- */
  const pipeline = { source: 'lead', chartType: 'donut', category: { field: 'pipelineStage' }, measures: [countOf()], limit: 12, percent: true };
  let r = await run(pipeline);
  assert.deepEqual(r.data.rows.map((x) => [x.label, x.value]), [
    ['Lead', 1], ['Visit', 1], ['Demo', 1], ['Registration', 1], ['Lead Won', 2], ['Lead Lost', 1],
  ]);
  assert.equal(r.data.total, 7);
  assert.equal(r.data.rows.find((x) => x.label === 'Lead Won').pct, 28.57);

  /* ---- manager: only leads of their department's employees ---- */
  r = await run(pipeline, { user: mgr1 });
  assert.deepEqual(byLabel(r.data.rows), { Lead: 1, Visit: 1, Demo: 1, 'Lead Won': 2 }, 'EMP1 + EMP2 only');
  r = await run(pipeline, { user: mgr0 });
  assert.equal(r.data.rows.length, 0, 'a manager without a department sees nothing');

  /* ---- visits per employee this month ---- */
  const visitsPerEmployee = {
    source: 'visit', chartType: 'bar', category: { field: 'visitedBy' }, measures: [countOf()], dateRange: { preset: 'this_month' },
  };
  r = await run(visitsPerEmployee);
  assert.deepEqual(r.data.rows.map((x) => [x.label, x.value]), [['EMP1 (EMP1)', 3], ['EMP2 (EMP2)', 1], ['EMP3 (EMP3)', 1]], 'September visit left out; largest first');
  assert.deepEqual(r.range, { from: '2026-10-01', to: '2026-10-31' });

  // Filter on the visit's lead (relation), average duration (computed)
  r = await run({ ...visitsPerEmployee, filters: [{ field: 'lead.product', op: 'eq', value: String(P2._id) }] });
  assert.deepEqual(byLabel(r.data.rows), { 'EMP3 (EMP3)': 1 });
  r = await run({ source: 'visit', chartType: 'score', measures: [{ calc: 'avg', field: 'durationMinutes' }] });
  assert.equal(r.data.value, 30);
  assert.equal(r.data.format, 'minutes');

  /* ---- dashboard filters: employee / department added, date range replaces ---- */
  r = await run(visitsPerEmployee, { filters: { employee: [String(emp1._id)] } });
  assert.deepEqual(byLabel(r.data.rows), { 'EMP1 (EMP1)': 3 });
  r = await run(visitsPerEmployee, { filters: { department: [String(D2._id)] } });
  assert.deepEqual(byLabel(r.data.rows), { 'EMP3 (EMP3)': 1 });
  r = await run(visitsPerEmployee, { filters: { dateRange: { from: '2026-09-01', to: '2026-09-30' } } });
  assert.deepEqual(byLabel(r.data.rows), { 'EMP1 (EMP1)': 1 }, 'the dashboard range replaces "this month"');

  /* ---- score with comparison, growth ---- */
  const newLeads = { source: 'lead', chartType: 'score', measures: [countOf()], dateField: 'createdAt', compare: true, target: 10 };
  r = await run(newLeads);
  assert.equal(r.data.value, 5, '1–15 Oct');
  assert.equal(r.data.previous, 1, '1–15 Sep');
  assert.equal(r.data.changePct, 400);
  assert.equal(r.data.progressPct, 50);
  r = await run({ source: 'lead', chartType: 'growth', measures: [countOf()], dateField: 'createdAt', interval: 'month' });
  assert.deepEqual([r.data.current, r.data.previous, r.data.changePct, r.data.trend], [5, 1, 400, 'up']);

  /* ---- monthly trend with empty months filled ---- */
  r = await run({ source: 'lead', chartType: 'line', measures: [countOf()], dateField: 'createdAt', interval: 'month', dateRange: { preset: 'this_year' } });
  assert.equal(r.data.rows.length, 12);
  assert.deepEqual(r.data.rows.slice(7, 10).map((x) => [x.label, x.value]), [['Aug 2026', 1], ['Sep 2026', 1], ['Oct 2026', 5]]);
  assert.equal(r.data.rows[0].value, 0);

  /* ---- funnels ---- */
  r = await run({ source: 'lead', chartType: 'funnel', funnel: { kind: 'stage' } });
  assert.deepEqual(r.data.steps.map((s) => s.value), [7, 5, 4, 3, 3, 2, 2], 'a lead counts in every stage it reached');
  assert.equal(r.data.lost, 1);
  r = await run({ source: 'lead', chartType: 'funnel', funnel: { kind: 'activity' } });
  assert.deepEqual(r.data.steps.map((s) => [s.key, s.value]), [['all', 7], ['visit', 4], ['demo', 2], ['dataUpdate', 0], ['registration', 2], ['won', 2]]);

  /* ---- conversion % per employee, overdue, butterfly ---- */
  r = await run({
    source: 'lead', chartType: 'bar', category: { field: 'assignedTo' }, sort: 'label',
    measures: [{ calc: 'conversion', where: [{ field: 'pipelineStage', op: 'eq', value: 'lead-won' }] }],
  });
  assert.deepEqual(byLabel(r.data.rows), { 'EMP1 (EMP1)': 33.33, 'EMP2 (EMP2)': 50, 'EMP3 (EMP3)': 0 });
  assert.equal(r.data.format, 'percent');
  r = await run({ source: 'lead', chartType: 'score', measures: [countOf({ where: [{ field: 'overdue', op: 'eq', value: true }] })] });
  assert.equal(r.data.value, 1, 'L3 only: Won / Lost and leads without a date are never overdue');
  r = await run({
    source: 'lead', chartType: 'butterfly', category: { field: 'product' },
    measures: [countOf({ label: 'Won', where: [{ field: 'pipelineStage', op: 'eq', value: 'lead-won' }] }), countOf({ label: 'Lost', where: [{ field: 'pipelineStage', op: 'eq', value: 'lead-lost' }] })],
  });
  assert.deepEqual(r.data.labels, { a: 'Won', b: 'Lost' });
  assert.deepEqual(r.data.rows.map((x) => [x.label, x.a, x.b]), [['Product-1', 2, 1], ['Product-2', 0, 0]]);

  /* ---- stacked bar (employee × stage) and a split trend ---- */
  r = await run({ source: 'lead', chartType: 'bar', category: { field: 'assignedTo' }, series: { field: 'pipelineStage' }, measures: [countOf()] }, { user: mgr1 });
  assert.deepEqual(r.data.series.map((s) => s.label), ['Lead', 'Visit', 'Demo', 'Lead Won'], 'stages in business order');
  assert.deepEqual(r.data.rows.map((x) => [x.label, x.total, x.values]), [
    ['EMP1 (EMP1)', 3, { lead: 1, visit: 1, 'lead-won': 1 }],
    ['EMP2 (EMP2)', 2, { demo: 1, 'lead-won': 1 }],
  ]);
  r = await run({
    source: 'visit', chartType: 'area', measures: [countOf()], dateField: 'visitDate', interval: 'week', series: { field: 'visitedBy' },
    dateRange: { from: '2026-09-28', to: '2026-10-11' },
  });
  assert.deepEqual(r.data.rows.map((x) => x.key), ['2026-09-28', '2026-10-05'], 'Monday weeks');
  assert.deepEqual(r.data.rows.map((x) => x.total), [2, 2]);
  assert.equal(r.data.rows[0].values[r.data.series.find((s) => s.label === 'EMP2 (EMP2)').key], 0, 'empty cells are 0');

  /* ---- registrations: revenue by payment type ---- */
  r = await run({ source: 'registration', chartType: 'donut', category: { field: 'paymentType' }, measures: [{ calc: 'sum', field: 'amount' }], percent: true });
  assert.deepEqual(r.data.rows.map((x) => [x.label, x.value, x.pct]), [['Cash', 10000, 66.67], ['Online', 5000, 33.33]]);
  assert.equal(r.data.format, 'currency');
  r = await run({ source: 'registration', chartType: 'score', measures: [{ calc: 'sum', field: 'netAmount' }] });
  assert.equal(r.data.value, 14000);

  /* ---- record table ---- */
  r = await run({ source: 'lead', chartType: 'table', table: { columns: ['name', 'assignedTo', 'pipelineStage'], sortField: 'createdAt', pageSize: 5 } });
  assert.equal(r.data.total, 7);
  assert.equal(r.data.rows.length, 5);
  assert.deepEqual(r.data.rows[0].cells, ['L6', 'EMP3 (EMP3)', 'Lead Lost']);
  r = await run({ source: 'lead', chartType: 'table', table: { columns: ['name'], sortField: 'createdAt', pageSize: 5 } }, { page: 2 });
  assert.deepEqual(r.data.rows.map((x) => x.cells[0]), ['L1', 'L7']);

  /* ---- validation: only registry fields and matching calculations ---- */
  const refused = (config, why) => assert.throws(() => validateConfig(config), (e) => e instanceof AnalyticsError && e.status === 400, why);
  refused({ source: 'lead', chartType: 'score', measures: [{ calc: 'sum', field: 'name' }] }, 'sum of text');
  refused({ source: 'lead', chartType: 'score', measures: [{ calc: 'count', where: [{ field: 'password', op: 'eq', value: 'x' }] }] }, 'unregistered field');
  refused({ source: 'lead', chartType: 'score', measures: [{ calc: 'count', where: [{ field: '$where', op: 'eq', value: 'x' }] }] }, 'operator as a field');
  refused({ source: 'lead', chartType: 'score', measures: [{ calc: 'conversion' }] }, 'conversion without condition');
  refused({ source: 'lead', chartType: 'bar', measures: [countOf()] }, 'bar without category');
  refused({ source: 'user', chartType: 'score', measures: [countOf()] }, 'unknown model');
  refused({ source: 'lead', chartType: 'score', measures: [countOf({ where: [{ field: 'assignedTo', op: 'eq', value: { $ne: null } }] })] }, 'object as a value');

  /* ---- saved widgets and dashboards: creator only ---- */
  r = await call(c.createWidget, mgr1, { body: { title: 'Visits by employee', config: visitsPerEmployee } });
  assert.equal(r.status, 201);
  const widgetId = String(r.body._id);
  r = await call(c.runWidget, mgr1, { params: { id: widgetId }, body: { filters: { dateRange: { from: '2026-10-01', to: '2026-10-31' } } } });
  assert.equal(r.status, 200);
  assert.deepEqual(byLabel(r.body.data.rows), { 'EMP1 (EMP1)': 3, 'EMP2 (EMP2)': 1 }, 'manager scope applies to saved widgets');
  r = await call(c.getWidget, hr, { params: { id: widgetId } });
  assert.equal(r.status, 404, 'another user cannot open it');

  r = await call(c.createDashboard, mgr1, { body: { title: 'Sales', items: [{ widget: widgetId, layout: { x: 6, y: 0, w: 7, h: 4 } }] } });
  assert.equal(r.status, 400, 'x + w must stay inside 12 columns');
  r = await call(c.createDashboard, mgr1, { body: { title: 'Sales', items: [{ widget: widgetId, layout: { x: 0, y: 0, w: 6, h: 4 } }], filters: { status: ['visit'] } } });
  assert.equal(r.status, 201);
  const dashId = String(r.body._id);
  assert.equal(r.body.items[0].widget.title, 'Visits by employee');
  const hrWidget = await call(c.createWidget, hr, { body: { title: 'HR widget', config: pipeline } });
  r = await call(c.updateDashboard, mgr1, { params: { id: dashId }, body: { items: [{ widget: String(hrWidget.body._id), layout: { x: 0, y: 0, w: 6, h: 4 } }] } });
  assert.equal(r.status, 400, "someone else's widget cannot be placed");
  r = await call(c.listDashboards, hr);
  assert.equal(r.body.dashboards.length, 0);

  r = await call(c.deleteWidget, mgr1, { params: { id: widgetId } });
  assert.equal(r.status, 200);
  r = await call(c.getDashboard, mgr1, { params: { id: dashId } });
  assert.equal(r.body.items.length, 0, 'a deleted widget leaves its dashboards');

  /* ---- a saved widget that is no longer valid ---- */
  const broken = await AnalyticsWidget.create({ title: 'Old', source: 'lead', chartType: 'bar', config: { source: 'lead', chartType: 'bar', measures: [countOf()], category: { field: 'removedField' } }, createdBy: mgr1._id });
  r = await call(c.runWidget, mgr1, { params: { id: String(broken._id) } });
  assert.equal(r.status, 422);
  assert.equal(r.body.invalid, true);
  /* ---- value options for filter pickers ---- */
  const labelsOf = (r) => r.body.options.map((o) => o.label).sort();
  r = await call(c.getOptions, mgr1, { params: { ref: 'user' } });
  assert.deepEqual(labelsOf(r), ['EMP1 (EMP1)', 'EMP2 (EMP2)', 'MGR1 (MGR1)'], 'a manager picks only their department');
  r = await call(c.getOptions, mgr0, { params: { ref: 'user' } });
  assert.deepEqual(r.body.options, [], 'a manager without a department picks nobody');
  r = await call(c.getOptions, hr, { params: { ref: 'user' }, query: { q: 'emp' } });
  assert.deepEqual(labelsOf(r), ['EMP1 (EMP1)', 'EMP2 (EMP2)', 'EMP3 (EMP3)']);
  r = await call(c.getOptions, mgr1, { params: { ref: 'user' }, query: { ids: `${emp1._id},${emp3._id}` } });
  assert.deepEqual(labelsOf(r), ['EMP1 (EMP1)'], 'labels of chosen values stay inside the scope');
  r = await call(c.getOptions, admin, { params: { ref: 'product' }, query: { q: '-2' } });
  assert.deepEqual(labelsOf(r), ['Product-2']);
  r = await call(c.getOptions, mgr1, { params: { ref: 'lead' }, query: { q: 'L' } });
  assert.ok(!labelsOf(r).includes('L5'), "another department's leads are not offered");
  r = await call(c.getOptions, admin, { params: { ref: 'password' } });
  assert.equal(r.status, 404);
  r = await call(c.getCatalog, admin);
  assert.equal(r.body.modules[0].sources.find((s) => s.key === 'visit').fields.find((f) => f.key === 'visitedBy').ref, 'user');
  assert.deepEqual(r.body.stages.map((o) => o.value).slice(0, 2), ['lead', 'visit'], 'stages for the dashboard filter');
  r = await call(c.getOptions, mgr1, { params: { ref: 'department' } });
  assert.deepEqual(labelsOf(r), ['Sales One'], 'a manager filters only their own department');
  r = await call(c.getOptions, mgr0, { params: { ref: 'department' } });
  assert.deepEqual(r.body.options, []);
  r = await call(c.getOptions, hr, { params: { ref: 'department' } });
  assert.deepEqual(labelsOf(r), ['Sales One', 'Sales Two']);
});
