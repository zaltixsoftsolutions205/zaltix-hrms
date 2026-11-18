const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const ProductLocation = require('../models/ProductLocation');
const Lead = require('../models/Lead');
const GlobalTable = require('../models/GlobalTable');
const GlobalTableField = require('../models/GlobalTableField');
const GlobalTableValue = require('../models/GlobalTableValue');
const service = require('../services/globalTableService');

const mongoUri = process.env.MONGO_TEST_URI;

test('Global Table membership, isolation, rollback, and serials on replica-set MongoDB', {
  skip: !mongoUri && 'Set MONGO_TEST_URI to an isolated replica-set MongoDB URI',
}, async (t) => {
  const databaseName = `myspace_global_table_test_${process.pid}_${Date.now()}`;
  await mongoose.connect(mongoUri, { dbName: databaseName, serverSelectionTimeoutMS: 10000 });
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  assert.ok(hello.setName || hello.msg === 'isdbgrid', 'MONGO_TEST_URI must point to a replica set or mongos');
  await Promise.all([
    User.syncIndexes(), Product.syncIndexes(), ProductLocation.syncIndexes(), Lead.syncIndexes(),
    GlobalTable.syncIndexes(), GlobalTableField.syncIndexes(), GlobalTableValue.syncIndexes(),
  ]);

  const user = await User.create({
    employeeId: `GT-${process.pid}`,
    name: 'Global Table Test Admin',
    email: `global-table-${process.pid}@example.invalid`,
    password: 'integration-test-password',
    employeeType: 'experienced',
    role: 'admin',
  });
  const product = await Product.create({ name: 'Integration Schools', status: 'active' });
  const location = await ProductLocation.create({ product: product._id, name: 'Adibatla', kind: 'location' });
  const context = { _id: user._id, role: 'admin', moduleAccess: [] };

  const tables = await Promise.all(['Schools Table', 'Hospitals Table', 'Colleges Table', 'Other Table'].map((name) =>
    service.createTable({ name, entity: 'lead', product: String(product._id), location: String(location._id) }, context)
  ));
  assert.equal(new Set(tables.map((table) => String(table._id))).size, 4);

  const [schoolsField, hospitalsField, collegesField] = await Promise.all([
    service.createField({ tableId: tables[0]._id, key: 'notes', label: 'Notes', type: 'text' }, context),
    service.createField({ tableId: tables[1]._id, key: 'capacity', label: 'Capacity', type: 'number' }, context),
    service.createField({ tableId: tables[2]._id, key: 'campus', label: 'Campus', type: 'text' }, context),
  ]);
  assert.notEqual(String(schoolsField._id), String(hospitalsField._id));
  assert.notEqual(String(hospitalsField._id), String(collegesField._id));

  const [schoolsRecord, hospitalsRecord, collegesRecord, emptyRecord] = await Promise.all([
    service.createRecord(tables[0]._id, { native: { name: 'Schools row', assignedTo: String(user._id) }, customValues: { notes: 'schools only' } }, context),
    service.createRecord(tables[1]._id, { native: { name: 'Hospitals row', assignedTo: String(user._id) }, customValues: { capacity: 25 } }, context),
    service.createRecord(tables[2]._id, { native: { name: 'Colleges row', assignedTo: String(user._id) }, customValues: { campus: null } }, context),
    service.createRecord(tables[3]._id, { native: { name: 'No custom fields row', assignedTo: String(user._id) }, customValues: {} }, context),
  ]);

  const recordsByTable = await Promise.all(tables.map((table) => service.listRecords(table._id, { page: 1, limit: 100 }, context)));
  assert.deepEqual(recordsByTable.map((result) => result.pagination.total), [1, 1, 1, 1]);
  assert.deepEqual(
    [schoolsRecord, hospitalsRecord, collegesRecord, emptyRecord].map((result) => String(result.record.globalTableId)),
    tables.map((table) => String(table._id))
  );

  await assert.rejects(service.getRecordById(tables[0]._id, hospitalsRecord.record._id, context), { statusCode: 404 });
  await assert.rejects(
    service.updateRecord(tables[0]._id, hospitalsRecord.record._id, { native: { name: 'cross-table edit' }, customValues: {} }, context),
    { statusCode: 404 }
  );
  await assert.rejects(service.deleteRecord(tables[0]._id, hospitalsRecord.record._id, context), { statusCode: 404 });
  await assert.rejects(
    service.createRecord(tables[0]._id, {
      native: { name: 'invalid membership', assignedTo: String(user._id), globalTableId: String(tables[1]._id) },
      customValues: {},
    }, context),
    { statusCode: 400 }
  );

  const originalBulkWrite = GlobalTableValue.bulkWrite;
  try {
    GlobalTableValue.bulkWrite = async () => { throw new Error('simulated custom-value failure'); };
    await assert.rejects(
      service.createRecord(tables[0]._id, { native: { name: 'rollback row', assignedTo: String(user._id) }, customValues: { notes: 'fail' } }, context)
    );
  } finally {
    GlobalTableValue.bulkWrite = originalBulkWrite;
  }
  assert.equal(await Lead.countDocuments({ globalTableId: tables[0]._id }), 1);

  const concurrent = await Promise.all(Array.from({ length: 8 }, (_, index) =>
    service.createRecord(tables[0]._id, {
      native: { name: `Concurrent ${index}`, assignedTo: String(user._id) },
      customValues: { notes: null },
    }, context)
  ));
  const ids = concurrent.map(({ record }) => String(record._id));
  assert.equal(new Set(ids).size, ids.length);

  const removedId = concurrent[0].record._id;
  await service.deleteRecord(tables[0]._id, removedId, context);
  assert.equal(await Lead.exists({ _id: removedId }), null);
  assert.equal(await GlobalTableValue.countDocuments({ tableId: tables[0]._id, recordId: removedId }), 0);
  assert.equal(await Lead.countDocuments({ globalTableId: tables[1]._id }), 1);

  const afterDelete = await service.createRecord(tables[0]._id, {
    native: { name: 'After deletion', assignedTo: String(user._id) },
    customValues: { notes: '' },
  }, context);
  assert.equal(String(afterDelete.record.globalTableId), String(tables[0]._id));
});
