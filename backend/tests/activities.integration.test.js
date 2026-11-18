const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Loc = require('../models/ProductLocation');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Demo = require('../models/Demo');
const Registration = require('../models/Registration');
const Feedback = require('../models/Feedback');
const GlobalTable = require('../models/GlobalTable');
const scope = require('../services/crmScopeService');
const svc = require('../services/globalTableService');
const makeActivityController = require('../controllers/activityController');
const { setFollowUpDate } = require('../controllers/visitController');
const { ACTIVITY_TYPES } = require('../services/activityTypes');
const { deleteLeadsCascade } = require('../services/leadCascadeService');
const { moduleAccess } = require('../middleware/roleCheck');

// Demo / Registration / Feedback: fixed fields, stage rule, single entry,
// assignee rule, follow-up move, cascade. Needs an isolated replica-set MongoDB.
const mongoUri = process.env.MONGO_TEST_URI;

const as = async (u) => { const doc = await User.findById(u._id).select('-password'); await scope.getScope(doc); return doc; };
const call = async (handler, user, { params = {}, query = {}, body = {} } = {}) => {
  const out = { status: 200, body: null };
  const res = { status(code) { out.status = code; return this; }, json(data) { out.body = data; return this; } };
  await handler({ user: await as(user), params, query, body }, res);
  return out;
};

test('Lead activities on replica-set MongoDB', {
  skip: !mongoUri && 'Set MONGO_TEST_URI to an isolated replica-set MongoDB URI',
}, async (t) => {
  await mongoose.connect(mongoUri, { dbName: `activities_${Date.now()}`, serverSelectionTimeoutMS: 10000 });
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await Promise.all([Lead, GlobalTable, Loc, User, Demo, Registration, Feedback].map((m) => m.init()));

  const P1 = await Product.create({ name: 'Product-1' });
  const L1 = await Loc.create({ product: P1._id, name: 'District-1' });
  const M1 = await Loc.create({ product: P1._id, parent: L1._id, name: 'Mandal-1' });
  const M2 = await Loc.create({ product: P1._id, parent: L1._id, name: 'Mandal-2' });
  const mk = (id, role, extra = {}) => User.create({ employeeId: id, name: id, email: `${id}@x.io`, password: 'secret1', role, employeeType: 'experienced', ...extra });
  const admin = await mk('ADM', 'admin');
  const emp1 = await mk('EMP1', 'product-executive', { productLocationAssignments: [{ product: P1._id, mandals: [M1._id] }] });
  const emp2 = await mk('EMP2', 'product-executive', { productLocationAssignments: [{ product: P1._id, mandals: [M1._id] }] });
  const emp3 = await mk('EMP3', 'product-executive', { productLocationAssignments: [{ product: P1._id, mandals: [M2._id] }] });

  const T1 = await svc.createTable({ name: 'Table-1', entity: 'lead', product: String(P1._id), location: String(M1._id) }, await as(admin));
  const addLead = async (name, stage) => {
    const created = await svc.createRecord(String(T1._id), { native: { name } }, await as(emp1));
    const id = (created.record || created)._id;
    await Lead.updateOne({ _id: id }, { $set: { pipelineStage: stage, followUpDate: new Date('2026-10-22T00:00:00Z') } });
    return String(id);
  };
  const demoLead = await addLead('Demo School', 'demo');
  const regLead = await addLead('Reg School', 'registration');

  const demo = makeActivityController(ACTIVITY_TYPES.demo);
  const reg = makeActivityController(ACTIVITY_TYPES.registration);
  const feedback = makeActivityController(ACTIVITY_TYPES.feedback);

  /* ---- calendar + detail ---- */
  let r = await call(demo.getCalendar, emp1, { query: { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' } });
  assert.deepEqual(r.body.leads.map((l) => l.name), ['Demo School'], 'only leads in the Demo stage');
  r = await call(demo.getLeadDetail, emp1, { params: { leadId: demoLead } });
  assert.equal(r.status, 200);
  assert.equal(r.body.canAdd, true);
  assert.ok(r.body.mainFields.some((f) => f.key === 'demoNotes' && f.section === 'details'), 'demo notes is a fixed field');
  assert.deepEqual(r.body.assignees.map((u) => u.employeeId).sort(), ['ADM', 'EMP1', 'EMP2'], 'self, Mandal colleagues and admin/hr/manager');

  r = await call(feedback.getLeadDetail, emp1, { params: { leadId: demoLead } });
  assert.equal(r.body.canAdd, false, 'feedback only in the Feedback stage');
  assert.equal(await GlobalTable.countDocuments({ entity: { $ne: 'lead' } }), 0, 'no per-lead form tables');

  /* ---- add a demo: defaults, assignee rule ---- */
  const body = { demoDate: '2026-10-23', startTime: '2026-10-23T05:00:00Z', endTime: '2026-10-23T06:00:00Z' };
  r = await call(demo.createEntry, emp1, { params: { leadId: demoLead }, body: { ...body, assignedTo: String(emp3._id) } });
  assert.equal(r.status, 400, 'EMP3 does not work in this Mandal');
  r = await call(demo.createEntry, emp1, { params: { leadId: demoLead }, body: { ...body, endTime: '2026-10-23T04:00:00Z' } });
  assert.equal(r.status, 400, 'end before start');
  r = await call(demo.createEntry, emp1, {
    params: { leadId: demoLead },
    body: { ...body, assignedTo: String(emp2._id), demoNotes: 'Showed the app' },
  });
  assert.equal(r.status, 201);
  const d1 = r.body;
  assert.equal(d1.assignedTo.employeeId, 'EMP2');
  assert.equal(d1.demoNotes, 'Showed the app');
  r = await call(demo.createEntry, emp1, { params: { leadId: demoLead }, body: { ...body, demoType: 'online', meetingLink: 'zoom meeting' } });
  assert.equal(r.status, 400, 'meeting link must be an http(s) link');
  assert.equal(r.body.details.errors[0].field, 'meetingLink');
  r = await call(demo.createEntry, emp1, {
    params: { leadId: demoLead },
    body: { ...body, demoType: 'online', meetingLink: 'https://meet.example.com/abc', customerInterest: 'high', demoStatus: 'completed', customerQuestions: 'Price?' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.meetingLink, 'https://meet.example.com/abc');
  assert.equal(r.body.customerInterest, 'high');
  assert.equal(r.body.attachment, null);
  await Demo.deleteOne({ _id: r.body._id });

  /* ---- the lead's own follow-up date (lead panel) ---- */
  r = await call(setFollowUpDate, emp1, { params: { leadId: demoLead }, body: { followUpDate: '2026-10-30' } });
  assert.equal(r.status, 200);
  assert.equal((await Lead.findById(demoLead).lean()).followUpDate.toISOString(), '2026-10-30T00:00:00.000Z', 'follow-up set on the lead');
  r = await call(setFollowUpDate, emp1, { params: { leadId: demoLead }, body: { followUpDate: 'not a date' } });
  assert.equal(r.status, 400);
  r = await call(demo.createEntry, emp1, { params: { leadId: demoLead }, body });
  assert.equal(r.status, 201, 'several demos per lead; assignee defaults to the submitter');
  assert.equal(r.body.assignedTo.employeeId, 'EMP1');

  /* ---- edit / delete: recorder, assignee or admin/hr/manager ---- */
  await Lead.updateOne({ _id: demoLead }, { $set: { assignedTo: emp2._id } }); // emp2 can now open the lead
  r = await call(demo.updateEntry, emp2, { params: { id: String(d1._id) }, body: { ...body, assignedTo: String(emp2._id) } });
  assert.equal(r.status, 200, 'the assigned employee may edit');
  r = await call(demo.deleteEntry, emp1, { params: { id: String(d1._id) } });
  assert.equal(r.status, 404, 'emp1 no longer sees the lead');
  r = await call(demo.deleteEntry, admin, { params: { id: String(d1._id) } });
  assert.equal(r.status, 200);
  assert.equal(await Demo.countDocuments({ _id: d1._id }), 0);

  /* ---- registration: number required, payment type, amounts, several per lead ---- */
  r = await call(reg.getLeadDetail, emp1, { params: { leadId: regLead } });
  assert.ok(r.body.mainFields.some((f) => f.key === 'notes'));
  assert.equal(r.body.type.wins, true);
  r = await call(reg.createEntry, emp1, { params: { leadId: regLead }, body: { registrationDate: '2026-10-24', paymentType: 'cheque', amount: -5 } });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body.details.errors.map((e) => e.field).sort(), ['amount', 'paymentType', 'registrationNumber']);
  r = await call(reg.createEntry, emp1, { params: { leadId: regLead }, body: { registrationDate: '2026-10-24', registrationNumber: ' REG-001 ', paymentType: 'emi', amount: '15000.456', discount: 500 } });
  assert.equal(r.status, 201);
  assert.equal(r.body.registrationNumber, 'REG-001');
  assert.equal(r.body.paymentType, 'emi');
  assert.equal(r.body.amount, 15000.46);
  assert.equal(r.body.invoice, null);
  assert.equal(r.body.customerName, 'Reg School', 'customer name defaults to the lead name');
  r = await call(reg.createEntry, emp1, { params: { leadId: regLead }, body: { registrationDate: '2026-10-25', registrationNumber: 'REG-X', mobileNumber: '98765', paymentStatus: 'maybe' } });
  assert.deepEqual(r.body.details.errors.map((e) => e.field).sort(), ['mobileNumber', 'paymentStatus']);
  r = await call(reg.createEntry, emp1, {
    params: { leadId: regLead },
    body: { registrationDate: '2026-10-25', registrationNumber: 'REG-002', customerName: 'Principal', customerType: 'new', mobileNumber: '09876543210', paymentStatus: 'partial', registrationStatus: 'completed' },
  });
  assert.equal(r.status, 201, 'several registrations per lead');
  assert.equal(r.body.customerName, 'Principal');
  assert.equal(r.body.mobileNumber, '9876543210');
  assert.equal(r.body.paymentStatus, 'partial');
  r = await call(reg.getLeadDetail, emp1, { params: { leadId: regLead } });
  assert.equal(r.body.entries.length, 2);
  assert.equal(r.body.canAdd, true);
  r = await call(reg.createEntry, emp1, { params: { leadId: demoLead }, body: { registrationDate: '2026-10-24', registrationNumber: 'X' } });
  assert.equal(r.status, 404, 'emp1 cannot see demoLead any more');
  r = await call(reg.getCalendar, emp1, { query: { all: '1' } });
  assert.deepEqual(r.body.leads.map((l) => [l.name, l.activityCount]), [['Reg School', 2]], 'table mode: every lead in the stage');

  /* ---- data update: one per lead ---- */
  const update = makeActivityController(ACTIVITY_TYPES['data-update']);
  await Lead.updateOne({ _id: regLead }, { $set: { pipelineStage: 'data-update' } });
  assert.ok(!ACTIVITY_TYPES['data-update'].mainFields.some((f) => f.type === 'file'), 'no attachment on data updates');
  r = await call(update.createEntry, emp1, { params: { leadId: regLead }, body: { updateDate: '2026-10-25', updateType: 'fee-data', updateStatus: 'completed', updateNotes: 'Fees for 2026' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.updateType, 'fee-data');
  assert.equal(r.body.updateStatus, 'completed');
  r = await call(update.createEntry, emp1, { params: { leadId: regLead }, body: { updateDate: '2026-10-26' } });
  assert.equal(r.status, 409, 'only one data update per lead');

  /* ---- moving into a stage needs a next follow-up date ---- */
  const leads = require('../controllers/leadController');
  await Lead.updateOne({ _id: regLead }, { $set: { pipelineStage: 'lead', followUpDate: null } });
  r = await call(leads.updatePipelineStage, emp1, { params: { id: regLead }, body: { pipelineStage: 'visit' } });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'FOLLOW_UP_REQUIRED');
  r = await call(leads.updateLead, emp1, { params: { id: regLead }, body: { pipelineStage: 'visit', followUpDate: '2026-11-02', assignedTo: String(emp2._id) } });
  assert.equal(r.status, 200, 'the popup sends stage + follow-up + assignee together');
  assert.equal(r.body.pipelineStage, 'visit');
  r = await call(leads.getAssignees, emp1, { params: { id: regLead } });
  assert.ok(r.body.assignees.some((u) => u.employeeId === 'EMP2'));

  /* ---- feedback rating ---- */
  await Lead.updateOne({ _id: regLead }, { $set: { pipelineStage: 'feedback', assignedTo: emp1._id } });
  r = await call(feedback.createEntry, emp1, { params: { leadId: regLead }, body: { feedbackDate: '2026-10-26', rating: 7 } });
  assert.equal(r.status, 400, 'rating 1-5');
  r = await call(feedback.createEntry, emp1, { params: { leadId: regLead }, body: { feedbackDate: '2026-10-26', rating: 0 } });
  assert.equal(r.status, 400, 'overall rating is required');
  r = await call(feedback.createEntry, emp1, { params: { leadId: regLead }, body: { feedbackDate: '2026-10-26', rating: 4 } });
  assert.equal(r.status, 201);
  assert.equal(r.body.rating, 4);
  assert.equal(r.body.productRating, null, 'product rating is optional');
  r = await call(feedback.createEntry, emp1, {
    params: { leadId: regLead },
    body: { feedbackDate: '2026-10-27', rating: 5, productRating: 4, serviceRating: 0, feedbackType: 'service', positiveFeedback: 'Quick support' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.productRating, 4);
  assert.equal(r.body.serviceRating, null);
  assert.equal(r.body.feedbackType, 'service');
  assert.equal(r.body.positiveFeedback, 'Quick support');

  /* ---- module access: view = read only, edit = add / change ---- */
  const gate = async (mw, user) => {
    let passed = false;
    const res = { status() { return this; }, json() { return this; } };
    await mw({ user: await as(user) }, res, () => { passed = true; });
    return passed;
  };
  assert.equal(await gate(moduleAccess('feedback', 'edit'), emp1), true, 'product executive: feedback edit by role');
  assert.equal(await gate(moduleAccess('demos', 'edit'), await mk('S1', 'sales')), false, 'sales has no Demos page');
  await User.updateOne({ _id: emp1._id }, { $set: { moduleAccess: [{ module: 'feedback', permission: 'view' }, { module: 'lead', permission: 'edit' }] } });
  assert.equal(await gate(moduleAccess('feedback', 'view'), emp1), true);
  assert.equal(await gate(moduleAccess('feedback', 'edit'), emp1), false, 'granted view only');
  assert.equal(await gate(moduleAccess(['crm', 'lead'], 'edit'), emp1), true, 'leads: Leads page edit is enough');
  r = await call(feedback.getLeadDetail, emp1, { params: { leadId: regLead } });
  assert.equal(r.body.canAdd, false);
  assert.equal(r.body.canEditPage, false);
  assert.ok(r.body.entries.length && r.body.entries.every((e) => e.canEdit === false), 'entries read only');

  /* ---- deleting the lead removes every activity ---- */
  await deleteLeadsCascade([regLead, demoLead]);
  assert.equal(await Demo.countDocuments({}), 0);
  assert.equal(await Registration.countDocuments({}), 0);
  assert.equal(await Feedback.countDocuments({}), 0);
});
