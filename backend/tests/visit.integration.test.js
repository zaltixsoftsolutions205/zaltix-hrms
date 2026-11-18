const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Loc = require('../models/ProductLocation');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Visit = require('../models/Visit');
const GlobalTable = require('../models/GlobalTable');
const scope = require('../services/crmScopeService');
const svc = require('../services/globalTableService');
const visits = require('../controllers/visitController');
const { deleteLeadsCascade } = require('../services/leadCascadeService');

// Visits page: fixed fields, access rules, required fields, cascade.
// Needs an isolated replica-set MongoDB (transactions).
const mongoUri = process.env.MONGO_TEST_URI;

const as = async (u) => { const doc = await User.findById(u._id).select('-password'); await scope.getScope(doc); return doc; };

/** Runs a controller handler and returns { status, body }. */
const call = async (handler, user, { params = {}, query = {}, body = {} } = {}) => {
  const out = { status: 200, body: null };
  const res = {
    status(code) { out.status = code; return this; },
    json(data) { out.body = data; return this; },
  };
  await handler({ user: await as(user), params, query, body }, res);
  return out;
};

test('Visits on replica-set MongoDB', {
  skip: !mongoUri && 'Set MONGO_TEST_URI to an isolated replica-set MongoDB URI',
}, async (t) => {
  await mongoose.connect(mongoUri, { dbName: `visits_${Date.now()}`, serverSelectionTimeoutMS: 10000 });
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await Promise.all([Lead, GlobalTable, Loc, User, Visit].map((m) => m.init()));

  const P1 = await Product.create({ name: 'Product-1' });
  const L1 = await Loc.create({ product: P1._id, name: 'District-1' });
  const M1 = await Loc.create({ product: P1._id, parent: L1._id, name: 'Mandal-1' });
  const mk = (id, role, extra = {}) => User.create({ employeeId: id, name: id, email: `${id}@x.io`, password: 'secret1', role, employeeType: 'experienced', ...extra });
  const admin = await mk('ADM', 'admin');
  const manager = await mk('MGR', 'manager');
  const emp1 = await mk('EMP1', 'sales', { productLocationAssignments: [{ product: P1._id, mandals: [M1._id] }] });
  const emp2 = await mk('EMP2', 'sales', { productLocationAssignments: [{ product: P1._id, mandals: [M1._id] }] });

  const T1 = await svc.createTable({ name: 'Table-1', entity: 'lead', product: String(P1._id), location: String(M1._id) }, await as(admin));
  const addLead = async (name, assignee, stage, followUpDate) => {
    const created = await svc.createRecord(String(T1._id), { native: { name, assignedTo: String(assignee._id) } }, await as(assignee));
    const id = (created.record || created)._id;
    await Lead.updateOne({ _id: id }, { $set: { pipelineStage: stage, followUpDate } });
    return String(id);
  };
  const day = (d) => new Date(`2026-10-${String(d).padStart(2, '0')}T10:00:00.000Z`);
  const leadA = await addLead('School A', emp1, 'visit', day(22));
  const leadB = await addLead('School B', emp2, 'visit', day(23));
  const leadC = await addLead('School C', emp1, 'demo', day(22));

  /* ---- calendar: own leads in the visit stage, by followUpDate ---- */
  const range = { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' };
  let r = await call(visits.getCalendar, emp1, { query: range });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.leads.map((l) => l.name), ['School A'], 'only my visit-stage leads');
  assert.equal(r.body.canFilterByEmployee, false);
  r = await call(visits.getCalendar, manager, { query: range });
  assert.deepEqual(r.body.leads.map((l) => l.name), ['School A', 'School B'], 'manager sees everyone');
  r = await call(visits.getCalendar, manager, { query: { ...range, assignedTo: String(emp2._id) } });
  assert.deepEqual(r.body.leads.map((l) => l.name), ['School B'], 'employee filter');

  /* ---- the visit fields are fixed: viewing never creates a table ---- */
  r = await call(visits.getLeadVisits, emp1, { params: { leadId: leadA } });
  assert.equal(r.status, 200);
  assert.equal(r.body.canAddVisit, true);
  assert.deepEqual(r.body.detailFields.map((f) => f.key), ['visitType', 'contactPerson', 'contactNumber', 'location', 'purpose', 'leadFeedback', 'leadFeedbackOther', 'salesComment', 'salesCommentOther', 'salesNotes']);
  assert.equal(await GlobalTable.countDocuments({ entity: { $ne: 'lead' } }), 0, 'no per-lead form tables');

  r = await call(visits.getLeadVisits, emp2, { params: { leadId: leadA } });
  assert.equal(r.status, 404, 'another employee cannot open my lead');

  /* ---- add a visit ---- */
  const visitBody = (fields) => ({ visitDate: '2026-10-22', timeIn: '2026-10-22T04:30:00.000Z', timeOut: '2026-10-22T05:15:00.000Z', ...fields });
  r = await call(visits.createVisit, emp1, { params: { leadId: leadA }, body: visitBody({ salesNotes: 'x' }) });
  assert.equal(r.status, 400, 'visit type is required');
  assert.equal(r.body.details.errors[0].field, 'visitType');
  r = await call(visits.createVisit, emp1, { params: { leadId: leadA }, body: visitBody({ visitType: 'boat' }) });
  assert.equal(r.status, 400, 'visit type must be one of the options');
  r = await call(visits.createVisit, emp1, { params: { leadId: leadA }, body: { ...visitBody({ visitType: 'field-visit' }), timeOut: '2026-10-22T04:00:00.000Z' } });
  assert.equal(r.status, 400, 'time out before time in');

  r = await call(visits.createVisit, emp1, { params: { leadId: leadA }, body: visitBody({ visitType: 'field-visit', contactNumber: '12345' }) });
  assert.equal(r.status, 400, 'contact number must be 10 digits');
  assert.equal(r.body.details.errors[0].field, 'contactNumber');
  r = await call(visits.createVisit, emp1, { params: { leadId: leadA }, body: visitBody({ visitType: 'field-visit', purpose: 'party' }) });
  assert.equal(r.status, 400, 'purpose must be one of the options');

  r = await call(visits.createVisit, emp1, {
    params: { leadId: leadA },
    body: visitBody({
      visitType: 'field-visit', leadFeedback: 'interested', salesNotes: ' Met the principal ',
      contactPerson: 'Mr. Rao', contactNumber: '+91 98765-43210', location: 'Main road', purpose: 'introduction',
    }),
  });
  assert.equal(r.status, 201);
  const v1 = r.body;
  assert.equal(v1.contactPerson, 'Mr. Rao');
  assert.equal(v1.contactNumber, '9876543210', 'phone stored as 10 digits');
  assert.equal(v1.location, 'Main road');
  assert.equal(v1.purpose, 'introduction');
  assert.equal(String(v1.visitedBy._id), String(emp1._id), 'visitor is the logged-in employee');
  assert.equal(v1.visitType, 'field-visit');
  assert.equal(v1.leadFeedback, 'interested');
  assert.equal(v1.salesNotes, 'Met the principal');
  const leadAfter = await Lead.findById(leadA).lean();
  assert.equal(leadAfter.pipelineStage, 'visit', 'adding a visit never moves the stage');
  assert.equal(leadAfter.followUpDate.toISOString(), day(22).toISOString());

  /* ---- the lead's own follow-up date moves it on the calendar ---- */
  r = await call(visits.setFollowUpDate, emp1, { params: { leadId: leadA }, body: { followUpDate: '2026-10-27' } });
  assert.equal(r.status, 200);
  assert.equal((await Lead.findById(leadA).lean()).followUpDate.toISOString(), '2026-10-27T00:00:00.000Z', 'lead moved to the new follow-up date');
  r = await call(visits.getCalendar, emp1, { query: range });
  assert.ok(r.body.leads.some((l) => l.name === 'School A' && l.followUpDate.toISOString().startsWith('2026-10-27')));
  r = await call(visits.setFollowUpDate, emp1, { params: { leadId: leadA }, body: { followUpDate: '2026-10-29T09:30:00.000Z' } });
  assert.equal((await Lead.findById(leadA).lean()).followUpDate.toISOString(), '2026-10-29T09:30:00.000Z', 'a day with a time');
  r = await call(visits.setFollowUpDate, emp2, { params: { leadId: leadA }, body: { followUpDate: '2026-10-30' } });
  assert.equal(r.status, 404, 'another employee cannot move my lead');
  r = await call(visits.setFollowUpDate, emp1, { params: { leadId: leadA }, body: { followUpDate: 'nope' } });
  assert.equal(r.status, 400);
  await Lead.updateOne({ _id: leadA }, { $set: { followUpDate: day(22) } });

  r = await call(visits.createVisit, emp1, { params: { leadId: leadC }, body: visitBody({ visitType: 'field-visit' }) });
  assert.equal(r.status, 400, 'only while the lead is in the Visit stage');

  /* ---- edit / delete: the visitor or admin/hr/manager ---- */
  await Lead.updateOne({ _id: leadA }, { $set: { assignedTo: emp2._id } });
  r = await call(visits.updateVisit, emp2, { params: { id: String(v1._id) }, body: visitBody({ visitType: 'office-visit' }) });
  assert.equal(r.status, 403, 'the new assignee did not make this visit');
  await Lead.updateOne({ _id: leadA }, { $set: { assignedTo: emp1._id } });
  r = await call(visits.updateVisit, manager, { params: { id: String(v1._id) }, body: visitBody({ visitType: 'office-visit' }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.visitType, 'office-visit');
  assert.equal(r.body.salesNotes, '', 'a field left empty is cleared');

  /* ---- delete a visit, then the lead (cascade removes its visits) ---- */
  const v2 = (await call(visits.createVisit, emp1, { params: { leadId: leadA }, body: visitBody({ visitType: 'other' }) })).body;
  r = await call(visits.deleteVisit, emp1, { params: { id: String(v2._id) } });
  assert.equal(r.status, 200);
  assert.equal(await Visit.countDocuments({ _id: v2._id }), 0);

  await deleteLeadsCascade([leadA]);
  assert.equal(await Visit.countDocuments({ lead: leadA }), 0);

  // admin/hr/manager can still open any lead's visits
  r = await call(visits.getLeadVisits, admin, { params: { leadId: leadB } });
  assert.equal(r.status, 200);
});
