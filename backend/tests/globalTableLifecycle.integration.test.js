const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Loc = require('../models/ProductLocation');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Visit = require('../models/Visit');
const ProductProspect = require('../models/ProductProspect');
const GlobalTable = require('../models/GlobalTable');
const GlobalTableField = require('../models/GlobalTableField');
const GlobalTableValue = require('../models/GlobalTableValue');
const svc = require('../services/globalTableService');
const scope = require('../services/crmScopeService');

// Row multi-delete, table restore / permanent delete / move between Mandals.
// Needs an isolated replica-set MongoDB (transactions).
const mongoUri = process.env.MONGO_TEST_URI;

const as = async (u) => { const doc = await User.findById(u._id).select('-password'); await scope.getScope(doc); return doc; };
const failure = async (p) => { try { await p; return null; } catch (e) { return e; } };
const rowId = (created) => String((created.record || created)._id);

test('Mandal table lifecycle on replica-set MongoDB', {
  skip: !mongoUri && 'Set MONGO_TEST_URI to an isolated replica-set MongoDB URI',
}, async (t) => {
  await mongoose.connect(mongoUri, { dbName: `gt_lifecycle_${Date.now()}`, serverSelectionTimeoutMS: 10000 });
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await Promise.all([Lead, GlobalTable, GlobalTableField, GlobalTableValue, Loc, User, Visit].map((m) => m.init()));

  const P1 = await Product.create({ name: 'Product-1' });
  const L1 = await Loc.create({ product: P1._id, name: 'Location-1' });
  const M1 = await Loc.create({ product: P1._id, parent: L1._id, name: 'Mandal-1' });
  const M2 = await Loc.create({ product: P1._id, parent: L1._id, name: 'Mandal-2' });
  const mk = (id, role, extra = {}) => User.create({ employeeId: id, name: id, email: `${id}@x.io`, password: 'secret1', role, employeeType: 'experienced', ...extra });
  const admin = await mk('ADM', 'admin');
  const emp1 = await mk('EMP1', 'sales', { productLocationAssignments: [{ product: P1._id, mandals: [M1._id] }] });
  const emp3 = await mk('EMP3', 'sales', { productLocationAssignments: [{ product: P1._id, mandals: [M2._id] }] });

  const A = await as(admin);
  const T1 = await svc.createTable({ name: 'Table-1', entity: 'lead', product: String(P1._id), location: String(M1._id) }, A);
  await svc.createField({ tableId: String(T1._id), key: 'notes', label: 'Notes', type: 'text' }, A);
  // Sales users assign the lead to themselves explicitly (it is never filled in automatically);
  // the admin's lead stays unassigned.
  const add = async (name, user, tableId = T1._id) => rowId(await svc.createRecord(String(tableId), {
    native: { name, ...(user.role === 'admin' ? {} : { assignedTo: String(user._id) }) },
    customValues: { notes: `${name} note` },
  }, await as(user)));

  /* ---- multi-select row delete ---- */
  const r1 = await add('Row 1', emp1);
  const r2 = await add('Row 2', emp1);
  const r3 = await add('Row 3', emp1);
  await Visit.create({ lead: r1, visitDate: new Date(), visitedBy: emp1._id });
  const prospect = await ProductProspect.create({ product: P1._id, companyName: 'Acme', convertedToLead: r1 });

  let err = await failure(svc.deleteRecords(String(T1._id), [r1, r2], await as(emp3)));
  assert.equal(err.statusCode, 404, 'another Mandal cannot delete these rows');

  const T2 = await svc.createTable({ name: 'Table-2', entity: 'lead', product: String(P1._id), location: String(M1._id) }, A);
  await svc.createField({ tableId: String(T2._id), key: 'notes', label: 'Notes', type: 'text' }, A);
  const other = await add('Other table row', emp1, T2._id);
  err = await failure(svc.deleteRecords(String(T1._id), [r1, other], await as(emp1)));
  assert.equal(err.statusCode, 404);
  assert.equal(await Lead.countDocuments({ _id: { $in: [r1, other] } }), 2, 'nothing deleted when one id is foreign');

  const del = await svc.deleteRecords(String(T1._id), [r1, r2], await as(emp1));
  assert.equal(del.deleted, 2);
  assert.equal(await Lead.countDocuments({ _id: { $in: [r1, r2] } }), 0);
  assert.equal(await Visit.countDocuments({ lead: r1 }), 0, 'visits of deleted leads are deleted');
  assert.equal(await GlobalTableValue.countDocuments({ recordId: { $in: [r1, r2] } }), 0);
  assert.equal((await ProductProspect.findById(prospect._id).lean()).convertedToLead, null, 'prospect kept, link cleared');

  /* ---- permanent delete only when empty ---- */
  err = await failure(svc.deleteTablePermanently(String(T1._id), A));
  assert.equal(err.statusCode, 409);
  assert.match(err.message, /Delete the rows first/);
  await svc.updateTable(String(T1._id), { isActive: false }, A);
  err = await failure(svc.deleteTablePermanently(String(T1._id), A));
  assert.match(err.message, /Restore it, delete the rows/);
  await svc.reactivateTable(String(T1._id), A);
  await svc.deleteRecords(String(T1._id), [r3], await as(emp1));
  await svc.deleteTablePermanently(String(T1._id), A);
  assert.equal(await GlobalTable.exists({ _id: T1._id }), null);
  assert.equal(await GlobalTableField.countDocuments({ tableId: T1._id }), 0);

  /* ---- restore refuses when the location is no longer a Mandal ---- */
  const Mx = await Loc.create({ product: P1._id, parent: L1._id, name: 'Mandal-X' });
  const TX = await svc.createTable({ name: 'Table-X', entity: 'lead', product: String(P1._id), location: String(Mx._id) }, A);
  await svc.updateTable(String(TX._id), { isActive: false }, A);
  await Loc.create({ product: P1._id, parent: Mx._id, name: 'Under X' }); // allowed: its only table is archived
  err = await failure(svc.reactivateTable(String(TX._id), A));
  assert.equal(err.statusCode, 400);
  assert.match(err.message, /no longer a Mandal/);

  /* ---- move to another Mandal, reassigning leads that would lose access ---- */
  const T3 = await svc.createTable({ name: 'Table-3', entity: 'lead', product: String(P1._id), location: String(M1._id) }, A);
  await svc.createField({ tableId: String(T3._id), key: 'notes', label: 'Notes', type: 'text' }, A);
  const m1 = await add('Move me 1', emp1, T3._id);
  await add('Move me 2', emp1, T3._id);
  const adminLead = await add('Admin owned', admin, T3._id);

  const preview = await svc.previewTableMove(String(T3._id), String(M2._id), A);
  assert.equal(preview.leadCount, 3);
  assert.equal(preview.affectedCount, 2, "emp1's two leads; admin keeps access everywhere");
  const candidateIds = preview.candidates.map((u) => String(u._id));
  assert.ok(candidateIds.includes(String(emp3._id)) && candidateIds.includes(String(admin._id)));
  assert.ok(!candidateIds.includes(String(emp1._id)));

  err = await failure(svc.moveTable(String(T3._id), { targetLocationId: String(M2._id) }, A));
  assert.equal(err.statusCode, 409);
  assert.equal(err.details.code, 'REASSIGN_REQUIRED');
  err = await failure(svc.moveTable(String(T3._id), { targetLocationId: String(M2._id), reassignTo: String(emp1._id) }, A));
  assert.equal(err.statusCode, 400);
  err = await failure(svc.moveTable(String(T3._id), { targetLocationId: String(L1._id), reassignTo: String(emp3._id) }, A));
  assert.equal(err.statusCode, 400, 'a location with sub-locations is not a Mandal');

  const moved = await svc.moveTable(String(T3._id), { targetLocationId: String(M2._id), reassignTo: String(emp3._id) }, A);
  assert.equal(moved.movedLeads, 3);
  assert.equal(moved.reassigned, 2);
  const lead = await Lead.findById(m1).lean();
  assert.equal(String(lead.productLocation), String(M2._id));
  assert.equal(lead.mandal, 'Mandal-2');
  assert.equal(String(lead.assignedTo), String(emp3._id));
  assert.equal((await Lead.findById(adminLead).lean()).assignedTo, null, 'an unassigned lead moves with the table and stays unassigned');
  assert.equal(await GlobalTableValue.countDocuments({ tableId: T3._id }), 3, 'values move with the table');

  err = await failure(svc.listRecords(String(T3._id), { page: 1, limit: 50 }, await as(emp1)));
  assert.equal(err.statusCode, 404, 'old Mandal loses access');
  const list = await svc.listRecords(String(T3._id), { page: 1, limit: 50 }, await as(emp3));
  assert.equal(list.records.length, 3, 'new Mandal sees every lead');

  // Name clash at the target
  const T4 = await svc.createTable({ name: 'Table-3', entity: 'lead', product: String(P1._id), location: String(M1._id) }, A);
  err = await failure(svc.moveTable(String(T4._id), { targetLocationId: String(M2._id) }, A));
  assert.equal(err.statusCode, 409);
  assert.match(err.message, /already has a table named/);
});
