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

const mongoUri = process.env.MONGO_STANDALONE_TEST_URI;

test('standalone MongoDB record create/delete compensations restore consistent state', {
  skip: !mongoUri && 'Set MONGO_STANDALONE_TEST_URI to an isolated standalone MongoDB URI',
}, async (t) => {
  const databaseName = `myspace_global_table_standalone_${process.pid}_${Date.now()}`;
  await mongoose.connect(mongoUri, { dbName: databaseName, serverSelectionTimeoutMS: 10000 });
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  assert.equal(Boolean(hello.setName) || hello.msg === 'isdbgrid', false, 'URI must point to standalone MongoDB');
  await Promise.all([
    User.syncIndexes(), Product.syncIndexes(), ProductLocation.syncIndexes(), Lead.syncIndexes(),
    GlobalTable.syncIndexes(), GlobalTableField.syncIndexes(), GlobalTableValue.syncIndexes(),
  ]);

  const user = await User.create({
    employeeId: `GTS-${process.pid}`,
    name: 'Standalone Compensation Test',
    email: `global-table-standalone-${process.pid}@example.invalid`,
    password: 'integration-test-password',
    employeeType: 'experienced',
    role: 'admin',
  });
  const product = await Product.create({ name: 'Standalone Schools', status: 'active' });
  const location = await ProductLocation.create({ product: product._id, name: 'Standalone Location', kind: 'location' });
  const table = await service.createTable({
    name: 'Standalone Table', entity: 'lead', product: String(product._id), location: String(location._id),
  }, { _id: user._id, role: 'admin' });
  await service.createField({ tableId: table._id, key: 'notes', label: 'Notes', type: 'text' }, { _id: user._id, role: 'admin' });

  const originalBulkWrite = GlobalTableValue.bulkWrite;
  try {
    GlobalTableValue.bulkWrite = async () => { throw new Error('simulated custom value write failure'); };
    await assert.rejects(service.createRecord(table._id, {
      native: { name: 'Create rollback', assignedTo: String(user._id) },
      customValues: { notes: 'failure' },
    }, { _id: user._id, role: 'admin' }));
  } finally {
    GlobalTableValue.bulkWrite = originalBulkWrite;
  }
  assert.equal(await Lead.countDocuments({ globalTableId: table._id }), 0);

  const created = await service.createRecord(table._id, {
    native: { name: 'Delete rollback', assignedTo: String(user._id) },
    customValues: { notes: 'preserve me' },
  }, { _id: user._id, role: 'admin' });
  const originalDeleteMany = GlobalTableValue.deleteMany;
  let failOnce = true;
  try {
    GlobalTableValue.deleteMany = async function (...args) {
      if (failOnce) {
        failOnce = false;
        throw new Error('simulated value deletion failure');      }
     return originalDeleteMany.apply(this, args);
    };
    await assert.rejects(service.deleteRecord(table._id, created.record._id, { _id: user._id, role: 'admin' }));
  } finally {
    GlobalTableValue.deleteMany = originalDeleteMany;
  }
  const restoredLead = await Lead.findOne({ _id: created.record._id, globalTableId: table._id }).lean();
  assert.ok(restoredLead);
  assert.equal(await GlobalTableValue.countDocuments({ tableId: table._id, recordId: created.record._id }), 1);
});
