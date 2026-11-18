const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCreateTable, validateListTables, } = require('../validator/globalTableValidator');
const { toLeadLocationFields } = require('../utils/productLocationFields');
const leadAdapter = require('../adapters/leadAdapter');
const mongoose = require('mongoose');
const GlobalTable = require('../models/GlobalTable');
const GlobalTableField = require('../models/GlobalTableField');
const Lead = require('../models/Lead');
const Product = require('../models/Product');
const ProductLocation = require('../models/ProductLocation');
const globalTableService = require('../services/globalTableService');
const leadController = require('../controllers/leadController');
const { withMongoTransaction } = require('../utils/mongoTransaction');

const id = '0123456789abcdef01234567';

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('location table creation derives scope from route IDs and defaults to Lead', () => {
  const req = { params: { productId: id, locationId: id }, body: { name: 'Schools' } };
  const res = response();
  let called = false;

  validateCreateTable(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(req.validated.product, id);
  assert.equal(req.validated.location, id);
  assert.equal(req.validated.entity, 'lead');
  assert.equal(req.validated.key, undefined);
});

test('location table creation rejects malformed scope IDs', () => {
  const req = { params: { productId: 'bad', locationId: id }, body: { name: 'Schools' } };
  const res = response();
  let called = false;

  validateCreateTable(req, res, () => { called = true; });

  assert.equal(called, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Validation failed');
});

test('table listing requires both product and location filters together', () => {
  const req = { query: { product: id, location: id } };
  const res = response();
  let called = false;

  validateListTables(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(req.validatedQuery.product, id);
  assert.equal(req.validatedQuery.location, id);
});

test('Mandal is blank when the hierarchy has one location', () => {
  assert.deepEqual(
    toLeadLocationFields(id, id, [{ name: 'Telangana' }]),
    { product: id, productLocation: id, district: 'Telangana', mandal: 'Telangana' }
  );
});

test('Mandal is the leaf location for two and three levels', () => {
  const twoLevels = toLeadLocationFields(id, id, [{ name: 'Telangana' }, { name: 'Hyderabad' }]);
  const threeLevels = toLeadLocationFields(id, id, [
    { name: 'Telangana' }, { name: 'Hyderabad' }, { name: 'Adibatla' },
  ]);

  assert.equal(twoLevels.mandal, 'Hyderabad');
  assert.equal(twoLevels.district, 'Hyderabad, Telangana');
  assert.equal(threeLevels.mandal, 'Adibatla');
  assert.equal(threeLevels.district, 'Adibatla, Hyderabad, Telangana');
});

// Who a scoped-table Lead may be assigned to (self, or a colleague whose
// product/Mandal territory covers the table) is checked by leadController
// against the database; see crmScope.integration.test.js.

test('direct Lead create and update reject client-supplied table membership fields', async () => {
  const invoke = async (handler, body) => {
    let status = 200;
    let result;
    const res = {
      status(code) { status = code; return this; },
      json(payload) { result = payload; return this; },
    };
    await handler({ body, params: { id }, user: { _id: id, role: 'admin' } }, res);
    return { status, result };
  };

  for (const field of ['globalTableId', 'productLocation']) {
    const create = await invoke(leadController.createLead, { [field]: id });
    const update = await invoke(leadController.updateLead, { [field]: id });
    assert.equal(create.status, 400);
    assert.equal(update.status, 400);
    assert.match(create.result.message, /system-managed/);
    assert.match(update.result.message, /system-managed/);
  }
});

test('custom fields are created with the selected table ID', async () => {
  const tableIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const savedFields = [];
  const originals = {
    findById: GlobalTable.findById,
    fieldFindOne: GlobalTableField.findOne,
    fieldCreate: GlobalTableField.create,
  };
  const tables = new Map(tableIds.map((tableId) => [String(tableId), {
    _id: tableId, entity: 'lead', isActive: true,
  }]));

  try {
    GlobalTable.findById = async (tableId) => tables.get(String(tableId));
    GlobalTableField.findOne = () => ({
      sort() { return this; },
      select() { return this; },
      lean: async () => null,
    });
    GlobalTableField.create = async (field) => {
      savedFields.push(field);
      return field;
    };

    for (const tableId of tableIds) {
      await globalTableService.createField({
        tableId: String(tableId), key: 'notes', label: 'Notes', type: 'text',
      }, { _id: id, role: 'admin' });
    }

    assert.deepEqual(savedFields.map((field) => String(field.tableId)), tableIds.map(String));
  } finally {
    GlobalTable.findById = originals.findById;
    GlobalTableField.findOne = originals.fieldFindOne;
    GlobalTableField.create = originals.fieldCreate;
  }
});

test('record membership queries use exact table IDs and never inspect custom values', async () => {
  const tables = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const recordIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const capturedFilters = [];
  const originalFind = Lead.find;

  try {
    Lead.find = (filter) => {
      capturedFilters.push(filter);
      return {
        distinct: () => Promise.resolve([recordIds[tables.findIndex((tableId) => String(tableId) === String(filter.globalTableId))]]),
      };
    };

    const first = await globalTableService.getTableRecordIds({ _id: tables[0], product: id }, [recordIds[0]]);
    const second = await globalTableService.getTableRecordIds({ _id: tables[1], product: id }, [recordIds[1]]);

    assert.deepEqual(first, [String(recordIds[0])]);
    assert.deepEqual(second, [String(recordIds[1])]);
    assert.equal(String(capturedFilters[0].globalTableId), String(tables[0]));
    assert.equal(String(capturedFilters[1].globalTableId), String(tables[1]));
    assert.equal(capturedFilters[0]._id.$in[0], recordIds[0]);
    assert.equal(capturedFilters[1]._id.$in[0], recordIds[1]);
  } finally {
    Lead.find = originalFind;
  }
});

test('transaction helper requires explicit fallback when MongoDB transactions are unavailable', async () => {
  let fallbackCalls = 0;
  await assert.rejects(withMongoTransaction(async () => 'unreachable'), { statusCode: 503 });
  const result = await withMongoTransaction(async () => 'transaction', {
    fallback: async () => { fallbackCalls += 1; return 'compensated'; },
  });
  assert.equal(result, 'compensated');
  assert.equal(fallbackCalls, 1);
});