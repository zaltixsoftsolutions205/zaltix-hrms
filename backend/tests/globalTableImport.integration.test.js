const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Loc = require('../models/ProductLocation');
const User = require('../models/User');
const Lead = require('../models/Lead');
const GlobalTable = require('../models/GlobalTable');
const GlobalTableValue = require('../models/GlobalTableValue');
const svc = require('../services/globalTableService');
const scope = require('../services/crmScopeService');
const importer = require('../services/globalTableImportService');

// Excel template / import / export for Mandal tables. Needs an isolated
// replica-set MongoDB (the import writes in one transaction).
const mongoUri = process.env.MONGO_TEST_URI;

const as = async (u) => { const doc = await User.findById(u._id).select('-password'); await scope.getScope(doc); return doc; };
const failure = async (p) => { try { await p; return null; } catch (e) { return e; } };
const sheet = (headers, ...rows) => ({ headers, rows: rows.map((cells, i) => ({ rowNumber: i + 2, cells })) });

test('Mandal table Excel import / export on replica-set MongoDB', {
  skip: !mongoUri && 'Set MONGO_TEST_URI to an isolated replica-set MongoDB URI',
}, async (t) => {
  await mongoose.connect(mongoUri, { dbName: `gt_import_${Date.now()}`, serverSelectionTimeoutMS: 10000 });
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await Promise.all([Lead, GlobalTable, Loc, User, GlobalTableValue].map((m) => m.init()));

  const P1 = await Product.create({ name: 'Product-1' });
  const L1 = await Loc.create({ product: P1._id, name: 'Location-1' });
  const M1 = await Loc.create({ product: P1._id, parent: L1._id, name: 'Mandal-1' });
  const M2 = await Loc.create({ product: P1._id, parent: L1._id, name: 'Mandal-2' });
  const mk = (id, role, extra = {}) => User.create({ employeeId: id, name: id, email: `${id}@x.io`, password: 'secret1', role, employeeType: 'experienced', ...extra });
  const admin = await mk('ADM1', 'admin');
  const emp1 = await mk('EMP1', 'sales', { productLocationAssignments: [{ product: P1._id, mandals: [M1._id] }] });
  const emp2 = await mk('EMP2', 'sales', { productLocationAssignments: [{ product: P1._id, mandals: [M1._id] }] });
  const emp3 = await mk('EMP3', 'sales', { productLocationAssignments: [{ product: P1._id, mandals: [M2._id] }] });

  const A = await as(admin);
  const T1 = await svc.createTable({ name: 'Table-1', entity: 'lead', product: String(P1._id), location: String(M1._id) }, A);
  const field = (key, label, type, extra = {}) => svc.createField({ tableId: String(T1._id), key, label, type, ...extra }, A);
  await field('cf_1', 'CF 1', 'text');
  await field('cf_2', 'CF 2', 'number');
  await field('cf_3', 'CF 3', 'date');
  await field('cf_4', 'CF 4', 'single-select', { options: [{ label: 'Hot', value: 'hot' }, { label: 'Cold', value: 'cold' }] });
  await field('cf_5', 'CF 5', 'checkbox');

  // Template spec: main fields + this table's custom fields; Product / Address / Mandal are not importable.
  const spec = await importer.getImportSpec(String(T1._id), A);
  const headers = spec.columns.map((c) => c.header);
  assert.equal(spec.fileName, 'Table-1');
  assert.deepEqual(headers, ['Lead ID', 'Name', 'Assign To (Employee ID)', 'Pipeline Stage', 'Next Follow-up', 'CF 1', 'CF 2', 'CF 3', 'CF 4', 'CF 5']);
  // Dropdown values for the template
  const specCol = (h) => spec.columns.find((c) => c.header === h);
  assert.deepEqual(specCol('CF 4').options, ['Hot', 'Cold']);
  assert.deepEqual(specCol('CF 5').options, ['Yes', 'No']);
  assert.ok(specCol('Pipeline Stage').options.includes('Visit'));
  assert.deepEqual(specCol('Assign To (Employee ID)').options, ['ADM1', 'EMP1', 'EMP2', 'EMP3'], 'admin may assign anyone');
  const salesSpec = await importer.getImportSpec(String(T1._id), await as(emp1));
  assert.deepEqual(salesSpec.columns.find((c) => c.header === 'Assign To (Employee ID)').options, ['ADM1', 'EMP1', 'EMP2'], 'sales: self, full-scope users and Mandal colleagues');
  assert.equal(spec.employees.length, 4);

  // Case 4: fewer columns than the table has -> fine. Empty Assign To -> not assigned, empty stage -> Lead.
  const ok = await importer.importRecords(String(T1._id), sheet(
    ['Name', 'Assign To (Employee ID)', 'CF 1', 'CF 2'],
    ['Ravi', '', 'note', '12'],
    ['Sita', 'emp2', 'x', 3.5],
  ), await as(emp1));
  assert.deepEqual(ok, { created: 2, updated: 0, total: 2 });
  const ravi = await Lead.findOne({ name: 'Ravi' }).lean();
  assert.equal(ravi.assignedTo, null, 'an empty Assign To is not filled with the importer');
  assert.equal(String(ravi.createdBy), String(emp1._id));
  assert.equal(ravi.pipelineStage, 'lead');
  assert.equal(String(ravi.globalTableId), String(T1._id));
  assert.equal(ravi.mandal, 'Mandal-1'); // case 1: system-filled from the table
  assert.equal(String((await Lead.findOne({ name: 'Sita' }).lean()).assignedTo), String(emp2._id));
  const raviValues = await GlobalTableValue.find({ recordId: ravi._id }).lean();
  assert.equal(raviValues.length, 2);

  // Extra column the table does not have -> whole import fails.
  let err = await failure(importer.importRecords(String(T1._id), sheet(['Name', 'Serial No.'], ['A', '1']), await as(emp1)));
  assert.equal(err.statusCode, 422);
  assert.match(err.details.errors[0].message, /not a column/);

  // Case 3 + 5: one bad cell anywhere fails everything and names row, column, value.
  const before = await Lead.countDocuments();
  err = await failure(importer.importRecords(String(T1._id), sheet(
    ['Name', 'CF 2', 'CF 3', 'CF 4', 'CF 5', 'Next Follow-up'],
    ['Good row', '5', '01-02-2026', 'Hot', 'yes', '25-12-2026'],
    ['Bad row', 'abc', '31-02-2026', 'Warm', 'maybe', '2026-12-25'],
  ), await as(emp1)));
  assert.equal(err.statusCode, 422);
  assert.equal(await Lead.countDocuments(), before);
  const problems = err.details.errors.map((e) => `${e.row}|${e.column}`).sort();
  assert.deepEqual(problems, ['3|CF 2', '3|CF 3', '3|CF 4', '3|CF 5', '3|Next Follow-up']);

  // Access: another Mandal's user cannot import here; assigning outside the Mandal is refused.
  err = await failure(importer.importRecords(String(T1._id), sheet(['Name'], ['X1']), await as(emp3)));
  assert.equal(err.statusCode, 404);
  err = await failure(importer.importRecords(String(T1._id), sheet(['Name', 'Assign To (Employee ID)'], ['X2', 'EMP3']), await as(emp1)));
  assert.match(err.details.errors[0].message, /colleague assigned to this Mandal/);
  err = await failure(importer.importRecords(String(T1._id), sheet(['Name', 'Assign To (Employee ID)'], ['X3', 'NOPE']), await as(emp1)));
  assert.match(err.details.errors[0].message, /No employee/);

  // Export: every column, readable values, file named after the table.
  await importer.importRecords(String(T1._id), sheet(['Lead ID', 'CF 3', 'CF 4', 'Next Follow-up'], [String(ravi._id), '05-03-2026', 'cold', '10-11-2026']), await as(emp1));
  const exported = await importer.exportRecords(String(T1._id), await as(emp2));
  assert.equal(exported.fileName, 'Table-1');
  assert.ok(exported.headers.includes('Address') && exported.headers.includes('Mandal') && exported.headers.includes('Product'));
  const raviRow = exported.rows.find((r) => r[0] === String(ravi._id));
  const col = (h) => raviRow[exported.headers.indexOf(h)];
  assert.equal(col('Assign To (Employee ID)'), 'EMP1');
  assert.equal(col('CF 3'), '05-03-2026');
  assert.equal(col('CF 4'), 'Cold');
  assert.equal(col('Next Follow-up'), '10-11-2026');
  assert.equal(col('Mandal'), 'Mandal-1');

  // Re-importing the exported file updates in place (export-only columns are skipped).
  const edited = exported.rows.map((r) => r.map((v, i) => (exported.headers[i] === 'CF 1' ? 'edited' : v)));
  const re = await importer.importRecords(String(T1._id), { headers: exported.headers, rows: edited.map((cells, i) => ({ rowNumber: i + 2, cells })) }, await as(emp1));
  assert.deepEqual(re, { created: 0, updated: 2, total: 2 });
  assert.equal(await Lead.countDocuments({ globalTableId: T1._id }), 2);

  // Stage rules on update: a won lead cannot go back into the pipeline, and
  // won -> lost (convert) is only done from CRM › Clients, never by import.
  await importer.importRecords(String(T1._id), sheet(['Lead ID', 'Pipeline Stage'], [String(ravi._id), 'Lead Won']), await as(emp1));
  assert.equal((await Lead.findById(ravi._id).lean()).wasClient, true);
  err = await failure(importer.importRecords(String(T1._id), sheet(['Lead ID', 'Pipeline Stage'], [String(ravi._id), 'Visit']), await as(emp1)));
  assert.match(err.details.errors[0].message, /can only be converted to Lead Lost/);
  err = await failure(importer.importRecords(String(T1._id), sheet(['Lead ID', 'Pipeline Stage'], [String(ravi._id), 'Lead Lost']), await as(emp1)));
  assert.match(err.details.errors[0].message, /CRM › Clients/);

  // A required custom column missing from the file fails new rows.
  await field('cf_req', 'Must Have', 'text', { required: true });
  err = await failure(importer.importRecords(String(T1._id), sheet(['Name'], ['Needs CF']), A));
  assert.equal(err.statusCode, 422);
  assert.match(err.details.errors[0].message, /required column is missing/);

  // Size limit.
  err = await failure(importer.importRecords(String(T1._id), sheet(['Name'], ...Array.from({ length: 1001 }, (_, i) => [`Row ${i}`])), A));
  assert.match(err.message, /at most 1000 rows/);
});
