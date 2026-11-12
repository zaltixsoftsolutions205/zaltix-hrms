const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Loc = require('../models/ProductLocation');
const User = require('../models/User');
const Lead = require('../models/Lead');
const GlobalTable = require('../models/GlobalTable');
const svc = require('../services/globalTableService');
const scope = require('../services/crmScopeService');
const leadCtrl = require('../controllers/leadController');
const terr = require('../controllers/crmTerritoryController');
const locCtrl = require('../controllers/productLocationController');

// Product/Mandal CRM scope end to end: who sees, edits, assigns and creates
// leads in which tables. Needs an isolated replica-set MongoDB (transactions).
const mongoUri = process.env.MONGO_TEST_URI;

const res = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } });
const http = async (fn, req) => { await scope.getScope(req.user); const r = res(); await fn({ params: {}, query: {}, body: {}, headers: {}, ...req }, r); return r; };
const unwrap = (x) => (x && x.record) || x;
const rid = (x) => String(unwrap(x)._id);
const status = async (p) => { try { await p; return 200; } catch (e) { return e.statusCode || 500; } };
// Fresh user object per "request", as the auth middleware provides.
const as = async (u) => { const doc = await User.findById(u._id).select('-password'); await scope.getScope(doc); return doc; };

test('CRM product/Mandal scope on replica-set MongoDB', {
  skip: !mongoUri && 'Set MONGO_TEST_URI to an isolated replica-set MongoDB URI',
}, async (t) => {
  await mongoose.connect(mongoUri, { dbName: `crm_scope_${Date.now()}`, serverSelectionTimeoutMS: 10000 });
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await Promise.all([Lead, GlobalTable, Loc, User].map((m) => m.init()));

  const failures = [];
  const check = (name, ok, extra = '') => { if (!ok) failures.push(`${name}${extra ? ` (${extra})` : ''}`); };

  const P1 = await Product.create({ name: 'Product-1' }), P2 = await Product.create({ name: 'Product-2' });
  const L1 = await Loc.create({ product: P1._id, name: 'Location-1' });
  const S1 = await Loc.create({ product: P1._id, parent: L1._id, name: 'Sub-location-1' });
  const M1 = await Loc.create({ product: P1._id, parent: S1._id, name: 'Mandal-1' });
  const L2 = await Loc.create({ product: P1._id, name: 'Location-2' });
  const M2 = await Loc.create({ product: P1._id, parent: L2._id, name: 'Mandal-2' });
  const Lx = await Loc.create({ product: P2._id, name: 'P2-Loc' });
  const M3 = await Loc.create({ product: P2._id, parent: Lx._id, name: 'P2-Mandal' });

  const mk = (id, role, extra = {}) => User.create({ employeeId: id, name: id, email: `${id}@x.io`, password: 'secret1', role, employeeType: 'experienced', ...extra });
  const admin = await mk('admin', 'admin'), mgr = await mk('mgr', 'manager'), tl = await mk('tl', 'team-lead');
  const emp1 = await mk('emp1', 'sales', { productLocationAssignments: [{ product: P1._id, mandals: [M1._id] }] });
  const emp2 = await mk('emp2', 'inside-sales', { productLocationAssignments: [{ product: P1._id, mandals: [M1._id] }] });
  const emp3 = await mk('emp3', 'product-executive', { productLocationAssignments: [{ product: P1._id, mandals: [M2._id] }] });
  const empNone = await mk('empNone', 'sales');

  const A = await as(admin);
  const flat = await svc.createTable({ name: 'Leads', key: 'leads', entity: 'lead' }, A);
  const T1 = await svc.createTable({ name: 'Table-1', entity: 'lead', product: String(P1._id), location: String(M1._id) }, A);
  await svc.createTable({ name: 'Table-2', entity: 'lead', product: String(P1._id), location: String(M1._id) }, A);
  const T3 = await svc.createTable({ name: 'Table-M2', entity: 'lead', product: String(P1._id), location: String(M2._id) }, A);

  // --- tree rules
  check('table on a node with sub-locations is refused', await status(svc.createTable({ name: 'X', entity: 'lead', product: String(P1._id), location: String(S1._id) }, A)) === 400);
  let r = await http(locCtrl.createLocation, { user: A, params: { productId: String(P1._id) }, body: { name: 'child', parent: String(M1._id) } });
  check('sub-location under a Mandal with tables is refused', r.statusCode === 400, r.body?.message);

  // --- create in a Mandal table
  const rec1 = unwrap(await svc.createRecord(String(T1._id), { native: { name: 'Ravi' }, customValues: {} }, await as(emp1)));
  check('emp1 creates a lead in Table-1 (Mandal-1)', !!rec1?._id);
  const list2 = await svc.listRecords(String(T1._id), { page: 1, limit: 50 }, await as(emp2));
  check("emp2 (same Mandal) sees emp1's lead", list2.records.some((x) => rid(x) === String(rec1._id)));
  const upd = unwrap(await svc.updateRecord(String(T1._id), String(rec1._id), { native: { name: 'Ravi K' }, customValues: {} }, await as(emp2)));
  check("emp2 edits emp1's lead", upd.name === 'Ravi K');
  check('emp2 assigns it to itself (colleague swap)', await status(svc.updateRecord(String(T1._id), String(rec1._id), { native: { assignedTo: String(emp2._id) }, customValues: {} }, await as(emp2))) === 200);
  check('emp2 assigns it back to colleague emp1', await status(svc.updateRecord(String(T1._id), String(rec1._id), { native: { assignedTo: String(emp1._id) }, customValues: {} }, await as(emp2))) === 200);
  check('emp2 cannot assign it to emp3 (other Mandal)', await status(svc.updateRecord(String(T1._id), String(rec1._id), { native: { assignedTo: String(emp3._id) }, customValues: {} }, await as(emp2))) === 403);

  // --- other Mandal is blocked (API manipulation)
  check('emp3 cannot list Table-1', await status(svc.listRecords(String(T1._id), { page: 1, limit: 50 }, await as(emp3))) === 404);
  check('emp3 cannot read the lead by id via Table-1', await status(svc.getRecordById(String(T1._id), String(rec1._id), await as(emp3))) === 404);
  check('emp3 cannot create in Table-1', await status(svc.createRecord(String(T1._id), { native: { name: 'Hack' }, customValues: {} }, await as(emp3))) === 404);
  check('emp3 cannot delete via Table-1', await status(svc.deleteRecord(String(T1._id), String(rec1._id), await as(emp3))) === 404);
  check('emp3 cannot add columns to own table', await status(svc.createField({ tableId: String(T3._id), key: 'x', label: 'X', type: 'text' }, await as(emp3))) === 403);
  const tables3 = await svc.getTables({ page: 1, limit: 50, entity: 'lead' }, await as(emp3));
  const names3 = tables3.items.map((t) => t.name).sort();
  check('emp3 table list = Leads + own Mandal table', JSON.stringify(names3) === JSON.stringify(['Leads', 'Table-M2']), names3.join(','));
  r = await http(leadCtrl.getLead, { user: await as(emp3), params: { id: String(rec1._id) } });
  check('emp3 GET /leads/:id of Mandal-1 lead -> 404', r.statusCode === 404);
  r = await http(leadCtrl.getLeads, { user: await as(emp3), query: { search: 'Ravi' } });
  check('emp3 search does not reveal Mandal-1 lead', r.body.leads.length === 0);
  r = await http(leadCtrl.updateLead, { user: await as(emp3), params: { id: String(rec1._id) }, body: { name: 'pwn' } });
  check('emp3 PUT /leads/:id -> 404', r.statusCode === 404);

  // --- single Leads table create with Product + Mandal
  // Sales roles create leads only inside a Mandal table; admin may still place a single-table lead on a Mandal.
  check('emp1 cannot create in the single Leads table, even on own Mandal', await status(svc.createRecord(String(flat._id), { native: { name: 'Flat-0', product: String(P1._id), productLocation: String(M1._id) }, customValues: {} }, await as(emp1))) === 400);
  r = await http(leadCtrl.createLead, { user: await as(emp1), body: { name: 'Direct', product: String(P1._id), productLocation: String(M1._id) } });
  check('emp1 cannot create via POST /leads either', r.statusCode === 400, r.body?.message);
  const flatOk = unwrap(await svc.createRecord(String(flat._id), { native: { name: 'Flat-1', product: String(P1._id), productLocation: String(M1._id) }, customValues: {} }, await as(admin)));
  check('admin places a single-table lead on Mandal-1', String(flatOk.productLocation) === String(M1._id) && flatOk.mandal === 'Mandal-1', `district=${flatOk.district} mandal=${flatOk.mandal}`);
  check('emp1 flat lead without Mandal refused', await status(svc.createRecord(String(flat._id), { native: { name: 'Flat-3' }, customValues: {} }, await as(emp1))) === 400);
  check('Mandal from other product refused', await status(svc.createRecord(String(flat._id), { native: { name: 'Flat-4', product: String(P1._id), productLocation: String(M3._id) }, customValues: {} }, await as(admin))) === 400);
  check('district node as Mandal refused', await status(svc.createRecord(String(flat._id), { native: { name: 'Flat-5', product: String(P1._id), productLocation: String(S1._id) }, customValues: {} }, await as(admin))) === 400);
  const flat2 = await svc.listRecords(String(flat._id), { page: 1, limit: 50 }, await as(emp2));
  check("emp2 sees the Mandal-1 lead in the Leads table", flat2.records.some((x) => rid(x) === String(flatOk._id)));
  const flat3 = await svc.listRecords(String(flat._id), { page: 1, limit: 50 }, await as(emp3));
  check('emp3 does not see it', !flat3.records.some((x) => rid(x) === String(flatOk._id)));
  const t1list = await svc.listRecords(String(T1._id), { page: 1, limit: 50 }, await as(emp1));
  check('Mandal-1 tables do not include the flat lead', !t1list.records.some((x) => rid(x) === String(flatOk._id)));

  // --- district-level record visible to holders of a Mandal beneath
  const districtLead = await Lead.create({ name: 'District lead', assignedTo: admin._id, product: P1._id, productLocation: S1._id });
  r = await http(leadCtrl.getLeads, { user: await as(emp1), query: {} });
  check('district-level lead visible to emp1', r.body.leads.some((l) => String(l._id) === String(districtLead._id)));
  r = await http(leadCtrl.getLeads, { user: await as(emp3), query: {} });
  check('district-level lead hidden from emp3', !r.body.leads.some((l) => String(l._id) === String(districtLead._id)));

  // --- full-scope roles and others
  const total = await Lead.countDocuments();
  r = await http(leadCtrl.getLeads, { user: await as(mgr), query: { limit: 100 } });
  check('manager sees every lead', r.body.pagination.total === total, `${r.body.pagination.total}/${total}`);
  r = await http(leadCtrl.getLeads, { user: await as(admin), query: { limit: 100 } });
  check('admin sees every lead', r.body.pagination.total === total);
  r = await http(leadCtrl.getLeads, { user: await as(empNone), query: {} });
  check('sales with no assignments sees nothing', r.body.leads.length === 0 && r.body.stats.total === 0);
  r = await http(leadCtrl.getLeads, { user: await as(tl), query: {} });
  check('team-lead keeps "own leads" rule', r.body.leads.length === 0);

  // --- fail closed when middleware skipped
  const raw = await User.findById(emp1._id);
  check('territory user without loaded scope matches nothing', JSON.stringify(scope.leadFilter(raw)) === JSON.stringify({ _id: { $in: [] } }));

  // --- territory endpoint
  r = await http(terr.getTerritory, { user: await as(emp1) });
  const b = r.body;
  check('territory: emp1 products', b.products.map((p) => p.name).join() === 'Product-1');
  check('territory: emp1 locations are the path only', b.locations.map((l) => l.name).sort().join() === 'Location-1,Mandal-1,Sub-location-1', b.locations.map((l) => l.name).join());
  check('territory: emp1 tables with counts', b.tables.map((t) => `${t.name}:${t.count}`).sort().join() === 'Table-1:1,Table-2:0', b.tables.map((t) => `${t.name}:${t.count}`).join());
  check('territory: create Mandals = [Mandal-1]', JSON.stringify(b.mandals) === JSON.stringify([String(M1._id)]));
  const lr = await http(leadCtrl.getLeads, { user: await as(emp1), query: { createdBy: 'me' } });
  check('territory: allLeadsCount = leads I created, in scope (All my leads total)', b.allLeadsCount === lr.body.pagination.total, `${b.allLeadsCount} vs ${lr.body.pagination.total}`);
  r = await http(terr.getTerritory, { user: await as(mgr) });
  check('territory: manager sees whole tree + can manage', r.body.canManageTree && r.body.tables.length === 3 && r.body.mandals.length === 3, `tables=${r.body.tables.length} mandals=${r.body.mandals.length}`);

  // --- setting a Mandal on an existing lead (Leads page Mandal dropdown)
  const loose = await Lead.create({ name: 'No location', assignedTo: admin._id });
  r = await http(leadCtrl.updateLead, { user: await as(admin), params: { id: String(loose._id) }, body: { productLocation: String(M1._id) } });
  check('admin places a single-table lead on Mandal-1', r.statusCode === 200 && String(r.body.productLocation) === String(M1._id) && String(r.body.product?._id || r.body.product) === String(P1._id), r.body?.message);
  r = await http(leadCtrl.updateLead, { user: await as(emp1), params: { id: String(unwrap(flatOk)._id) }, body: { productLocation: String(M2._id) } });
  check('emp1 cannot move a lead to an unassigned Mandal', r.statusCode === 403, r.body?.message);
  r = await http(leadCtrl.updateLead, { user: await as(emp1), params: { id: String(rec1._id) }, body: { productLocation: String(M1._id) } });
  check("a Mandal-table lead's Mandal cannot be changed", r.statusCode === 400, r.body?.message);
  r = await http(leadCtrl.updateLead, { user: await as(admin), params: { id: String(loose._id) }, body: { productLocation: String(S1._id) } });
  check('a node with sub-locations is not accepted as Mandal', r.statusCode === 400, r.body?.message);

  assert.deepEqual(failures, []);
});
