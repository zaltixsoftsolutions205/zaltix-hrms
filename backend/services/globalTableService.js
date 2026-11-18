/**
 * globalTableService.js
 * ---------------------------------------------------------------------------
 * All business logic for GlobalTable, GlobalTableField, GlobalTableValue and
 * the generic record operations that go through entity adapters.
 *
 * Errors: throw ServiceError(statusCode, message, details). Controllers turn
 * any thrown error into an HTTP response via toHttpError().
 *
 * Permission model
 *   - table create/update/delete  -> admin only (enforced in routes)
 *   - table/field/value/record reads -> canAccessModule(entity's module)
 *   - field create/update/delete  -> canEditModule(entity's module)
 *   - value writes                -> canEditModule + access to that record
 *                                    (via the entity adapter, e.g. a sales
 *                                    user only touches their own leads)
 *   - record create/update/delete -> canEditModule + adapter capability +
 *                                    the entity's own business rules (the
 *                                    adapter runs them; this service never
 *                                    writes native records itself)
 *
 * Transactions
 *   Record create / update / delete run inside ONE MongoDB transaction
 *   (withTransaction below). The same session is handed to the adapter (which
 *   hands it to the entity's controller) and to every custom-value write, so
 *   native and custom data commit together or not at all. Errors are never
 *   swallowed: any failure aborts the transaction and is rethrown.
 *   External side effects (notifications) are collected in `afterCommit` and
 *   only run once the transaction has committed.
 *   Transactions need a replica set or mongos. On a standalone server the
 *   service logs a warning and runs WITHOUT atomicity, unless the environment
 *   variable GLOBAL_TABLE_REQUIRE_TRANSACTIONS=true, in which case it refuses
 *   (503) instead.
 *
 * Empty values
 *   A cleared / empty custom value is stored as null (value document kept).
 *   Absence of a value document reads as empty too. Checkbox is never null:
 *   it normalizes to false.
 *
 * Formula fields
 *   Never stored. Their value is calculated on read from field.config.expression
 *   by utils/formulaEngine.js (no eval). Writes are rejected with 400.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const GlobalTable = require('../models/GlobalTable');
const GlobalTableField = require('../models/GlobalTableField');
const GlobalTableValue = require('../models/GlobalTableValue');
const Lead = require('../models/Lead');
const Product = require('../models/Product');
const ProductLocation = require('../models/ProductLocation');
const User = require('../models/User');
const { canAccessModule, canEditModule } = require('../constants/modules');
const tableRegistry = require('../registry/tableRegistry');
const { parseFormula, evaluateFormula, FormulaError } = require('../utils/formulaEngine');
const { toLeadLocationFields } = require('../utils/productLocationFields');
const { withMongoTransaction } = require('../utils/mongoTransaction');
const crmScope = require('./crmScopeService');
const { deleteLeadsCascade } = require('./leadCascadeService');
const { latestActivityValues } = require('./activityFieldValues');

const SELECT_TYPES = ['single-select', 'multi-select'];
const NUMERIC_TYPES = ['number', 'currency'];
const NOT_REQUIRABLE_TYPES = ['checkbox', 'formula'];
const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // same rule as leadController
const MAX_TEXT_LENGTH = 5000;
const MAX_PERSON_VALUES = 50;

/* ------------------------------ errors ---------------------------------- */

class ServiceError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** Converts any thrown error into { status, body } using the { message } shape. */
const toHttpError = (err) => {
  if (err instanceof ServiceError || (err && err.isAdapterError)) {
    return {
      status: err.statusCode,
      body: { message: err.message, ...(err.details ? { details: err.details } : {}) },
    };
  }
  if (err && err.isTransactionUnavailable) {
    return { status: 503, body: { message: err.message } };
  }
  if (err instanceof FormulaError) {
    return { status: 400, body: { message: `Invalid formula: ${err.message}` } };
  }
  if (err && err.name === 'ValidationError') {
    return {
      status: 400,
      body: {
        message: 'Validation failed',
        errors: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
      },
    };
  }
  if (err && err.name === 'CastError') {
    return { status: 400, body: { message: `Invalid value for ${err.path}` } };
  }
  if (err && err.code === 11000) {
    return { status: 409, body: { message: 'Duplicate entry' } };
  }
  console.error('globalTableService error:', err);
  return { status: 500, body: { message: 'Internal server error' } };
};

const isDuplicateKey = (err) => err && err.code === 11000;

/* ------------------------------ helpers --------------------------------- */

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildPagination = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 };
};

const userId = (user) => (user && user._id) || null;

/* ------------------------------ transactions ----------------------------- */

// Multi-document table operations are refused unless MongoDB supports transactions.
const withTransaction = (work) => withMongoTransaction(work);

/** Throws 403 unless user may view/edit the module guarding this entity. */
const assertEntityAccess = (user, entity, mode = 'view') => {
  const cfg = tableRegistry.getEntityConfig(entity);
  if (!cfg) throw new ServiceError(400, `Entity "${entity}" is not registered`);
  const ok = cfg.moduleKeys.some((key) => (mode === 'edit' ? canEditModule(user, key) : canAccessModule(user, key)));
  if (!ok) {
    throw new ServiceError(
      403,
      mode === 'edit'
        ? 'You do not have edit access to this module.'
        : 'You do not have access to this module.'
    );
  }
  return cfg;
};

/** 501 when the entity's adapter does not implement an optional operation. */
const requireCapability = (cfg, capability) => {
  if (!cfg.capabilities[capability]) {
    throw new ServiceError(501, `${cfg.label} records do not support "${capability}" through Global Table`);
  }
};

const loadTable = async (tableId) => {
  const table = await GlobalTable.findById(tableId);
  if (!table) throw new ServiceError(404, 'Table not found');
  return table;
};

const loadField = async (fieldId) => {
  const field = await GlobalTableField.findById(fieldId);
  if (!field) throw new ServiceError(404, 'Field not found');
  return field;
};

const resolveTableScope = async (table, session = null) => {
  if (!table.product && !table.location) return null;
  if (!table.product || !table.location || table.entity !== 'lead') {
    throw new ServiceError(400, 'Table has an invalid product/location association');
  }

  let productQuery = Product.findById(table.product).select('name');
  if (session) productQuery = productQuery.session(session);
  const product = await productQuery.lean();
  if (!product) throw new ServiceError(404, 'Product not found for this table');

  const findLocation = async (filter) => {
    let query = ProductLocation.findOne(filter);
    if (session) query = query.session(session);
    return query.lean();
  };
  let current = await findLocation({ _id: table.location, product: product._id, kind: 'location' });
  if (!current) throw new ServiceError(404, 'Location does not belong to this product');

  const path = [];
  const visited = new Set();
  while (current) {
    const id = String(current._id);
    if (visited.has(id) || path.length >= 100) throw new ServiceError(400, 'Invalid location hierarchy');
    visited.add(id);
    path.unshift(current);
    if (!current.parent) break;
    current = await findLocation({ _id: current.parent, product: product._id, kind: 'location' });
    if (!current) throw new ServiceError(400, 'Location hierarchy crosses product boundaries');
  }

  return toLeadLocationFields(product._id, table.location, path);
};

const recordMatchesScope = (record, table, scope) => {
  if (!record) return false;
  const membershipId = record.globalTableId ? String(record.globalTableId) : null;
  if (table.product && membershipId !== String(table._id)) return false;
  if (!table.product && membershipId && membershipId !== String(table._id)) return false;
  if (!scope) return true;
  const productId = record.product && record.product._id ? record.product._id : record.product;
  return String(productId || '') === scope.product
    && String(record.productLocation || '') === scope.productLocation;
};

const getTableRecordIds = (table, recordIds, session = null) => {
  const membership = table.product
    ? {
      globalTableId: table._id,
      product: table.product,
      productLocation: table.location,
    }
    : { $or: [{ globalTableId: table._id }, { globalTableId: null }] };
  const filter = { ...membership };
  if (recordIds) filter._id = { $in: recordIds };
  let query = Lead.find(filter).distinct('_id');
  if (session) query = query.session(session);
  return query.then((ids) => ids.map(String));
};

const recordBelongsToTable = (table, record, scope) => recordMatchesScope(record, table, scope);

const tableKeyForLocation = (name, locationId) => {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'table';
  const suffix = crypto.createHash('sha1').update(String(name).toLowerCase()).digest('hex').slice(0, 6);
  return `l-${String(locationId).toLowerCase()}-${slug.slice(0, 26)}-${suffix}`;
};

/**
 * Product/location tables are only reachable inside the user's CRM territory
 * (crmScopeService). Answers 404, not 403, so table ids outside the territory
 * are not confirmed to exist.
 */
const assertTableInScope = (user, table) => {
  if (!crmScope.canUseTable(user, table)) throw new ServiceError(404, 'Table not found');
};

/** Columns of product/location tables are part of the tree: tree managers only. */
const assertCanEditTableSchema = (user, table) => {
  if (table.product && !crmScope.isTreeManager(user)) {
    throw new ServiceError(403, 'Only admin, HR or a manager can change the columns of this table');
  }
};

/** table + entity config + permission, in one place. */
const resolveTableContext = async (tableId, user, mode, { requireActive = false } = {}) => {
  const table = await loadTable(tableId);
  const cfg = assertEntityAccess(user, table.entity, mode);
  assertTableInScope(user, table);
  if (requireActive && !table.isActive) throw new ServiceError(400, 'Table is inactive');
  return { table, cfg };
};

/** Options must exist for select types and be empty for every other type. */
const assertOptionsMatchType = (type, options) => {
  const count = (options || []).length;
  if (SELECT_TYPES.includes(type) && count === 0) {
    throw new ServiceError(400, `${type} fields require at least one option`);
  }
  if (!SELECT_TYPES.includes(type) && count > 0) {
    throw new ServiceError(400, `Options are only allowed on select fields (field type is ${type})`);
  }
};

/* =========================================================================
 * TABLES
 * ======================================================================= */

const createTable = async (data, user) => {
  if (!tableRegistry.isRegisteredEntity(data.entity)) {
    throw new ServiceError(400, `Entity "${data.entity}" is not registered`);
  }
  if (data.product || data.location) {
    if (!data.product || !data.location) throw new ServiceError(400, 'product and location must be provided together');
    if (data.entity !== 'lead') throw new ServiceError(400, 'Product location tables must use the Lead entity');
    assertEntityAccess(user, data.entity, 'edit');
    // Tables live only on Mandals: a location with sub-locations cannot hold one.
    if (await ProductLocation.exists({ product: data.product, parent: data.location, kind: 'location' })) {
      throw new ServiceError(400, 'Tables can only be added to a Mandal (a location without sub-locations)');
    }
    if (!data.key) {
      // The key is derived from location + name. A table renamed or moved away keeps
      // its old key, so take the next free one instead of colliding with it.
      const base = tableKeyForLocation(data.name, data.location);
      let key = base;
      for (let n = 2; await GlobalTable.exists({ key }); n += 1) key = `${base}-${n}`;
      data.key = key;
    }
  }
  const tableDocument = {
    ...data,
    createdBy: userId(user),
    updatedBy: userId(user),
  };
  try {
    return await withTransaction(async (session) => {
      if (data.product || data.location) {
        const product = await Product.findOneAndUpdate(
          { _id: data.product, status: 'active' },
          { $inc: { globalTableWriteVersion: 1 } },
          { new: true, session }
        ).select('_id');
        if (!product) throw new ServiceError(400, 'Product does not exist or is inactive');
        const location = await ProductLocation.findOneAndUpdate(
          { _id: data.location, product: product._id, kind: 'location' },
          { $inc: { globalTableWriteVersion: 1 } },
          { new: true, session }
        ).select('_id');
        if (!location) throw new ServiceError(404, 'Location does not belong to this product');
        await resolveTableScope({ ...data, entity: data.entity }, session);
      }
      return new GlobalTable({
        ...tableDocument,
      }).save({ session });
    }, { fallback: async () => {
      if (data.product || data.location) {
        if (!(await Product.exists({ _id: data.product, status: 'active' }))) {
          throw new ServiceError(400, 'Product does not exist or is inactive');
        }
        await resolveTableScope({ ...data, entity: data.entity });
      }
      // A table definition is a single-document insert; no partial cross-collection state exists.
      return GlobalTable.create(tableDocument);
    } });
  } catch (err) {
    if (isDuplicateKey(err)) {
      if (err.keyPattern && err.keyPattern.name) throw new ServiceError(409, 'A table with this name already exists at this location');
      throw new ServiceError(409, `A table with key "${data.key}" already exists`);
    }
    throw err;
  }
};

const getTables = async (query, user) => {
  // Only entities whose module the user can view
  const accessible = tableRegistry
    .listEntities()
    .filter((e) => e.moduleKeys.some((key) => canAccessModule(user, key)))
    .map((e) => e.entity);

  const filter = { entity: { $in: accessible }, ...crmScope.tableFilter(user) };
  if (query.entity) filter.entity = accessible.includes(query.entity) ? query.entity : { $in: [] };
  if (query.product) filter.product = query.product;
  if (query.location) filter.location = query.location;
  if (query.isActive !== undefined) filter.isActive = query.isActive;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: rx }, { key: rx }];
  }

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    GlobalTable.find(filter).sort({ name: 1 }).skip(skip).limit(query.limit).lean(),
    GlobalTable.countDocuments(filter),
  ]);
  return { items, pagination: buildPagination(query.page, query.limit, total) };
};

const getTableById = async (id, user) => {
  const table = await loadTable(id);
  assertEntityAccess(user, table.entity, 'view');
  assertTableInScope(user, table);
  await resolveTableScope(table);
  return table;
};

const updateTable = async (id, data, user) => {
  const table = await loadTable(id);
  assertEntityAccess(user, table.entity, 'edit');

  // key and entity are identity: fields, values, formulas and imports hang off them
  if (data.key !== undefined && data.key !== table.key) {
    throw new ServiceError(400, 'Table key cannot be changed');
  }
  if (data.entity !== undefined && data.entity !== table.entity) {
    throw new ServiceError(400, 'Table entity cannot be changed');
  }

  if (data.name !== undefined) table.name = data.name;
  if (data.description !== undefined) table.description = data.description;
  if (data.isActive !== undefined) table.isActive = data.isActive;
  table.updatedBy = userId(user);

  try {
    await table.save();
  } catch (err) {
    if (isDuplicateKey(err)) throw new ServiceError(409, 'A table with this name already exists at this location');
    throw err;
  }
  return table;
};

const deleteTable = async (id, { force = false } = {}, user) => {
  const table = await loadTable(id);
  assertEntityAccess(user, table.entity, 'edit');
  return withTransaction(async (session) => {
    const lockedTable = await GlobalTable.findOneAndUpdate(
      { _id: table._id },
      { $inc: { writeVersion: 1 } },
      { new: true, session }
    );
    if (!lockedTable) throw new ServiceError(404, 'Table not found');

    const [fieldCount, valueCount, recordCount] = await Promise.all([
      GlobalTableField.countDocuments({ tableId: table._id }).session(session),
      GlobalTableValue.countDocuments({ tableId: table._id }).session(session),
      Lead.countDocuments({ globalTableId: table._id }).session(session),
    ]);

    if (recordCount > 0) {
      throw new ServiceError(409, 'This table still owns records. Deactivate it to preserve their membership, or delete its records first.', { recordCount });
    }

    if ((fieldCount > 0 || valueCount > 0) && !force) {
      throw new ServiceError(
        409,
        'Table still has fields/values. Deactivate it with PUT { isActive: false }, or retry with ?force=true to delete everything.',
        { fieldCount, valueCount }
      );
    }

    await GlobalTableValue.deleteMany({ tableId: table._id }, { session });
    await GlobalTableField.deleteMany({ tableId: table._id }, { session });
    await GlobalTable.deleteOne({ _id: table._id }, { session });
    return { removedFields: fieldCount, removedValues: valueCount, removedRecords: 0 };
  });
};

/* =========================================================================
 * FIELD CONFIG + FORMULA VALIDATION
 * ======================================================================= */

/**
 * Parses the expression and checks that EVERY reference resolves:
 *   <key>          -> an active number/currency custom field of this table
 *   native.<key>   -> a numeric main field of the entity (from the adapter)
 * Formulas may not reference other formulas, so dependency cycles cannot exist.
 */
const validateFormulaExpression = async (expression, { table, cfg }) => {
  let parsed;
  try {
    parsed = parseFormula(expression);
  } catch (err) {
    if (err instanceof FormulaError) throw new ServiceError(400, `Invalid formula: ${err.message}`);
    throw err;
  }

  const customKeys = parsed.refs.filter((r) => r.source === 'custom').map((r) => r.key);
  const nativeKeys = parsed.refs.filter((r) => r.source === 'native').map((r) => r.key);

  if (customKeys.length) {
    const found = await GlobalTableField.find({ tableId: table._id, key: { $in: customKeys }, ...GlobalTableField.LEAD_FIELD_FILTER }).lean();
    customKeys.forEach((key) => {
      const f = found.find((x) => x.key === key);
      if (!f) throw new ServiceError(400, `Invalid formula: unknown field "${key}"`);
      if (!NUMERIC_TYPES.includes(f.type)) {
        throw new ServiceError(400, `Invalid formula: field "${key}" is ${f.type}; only number and currency fields can be used`);
      }
      if (!f.isActive) throw new ServiceError(400, `Invalid formula: field "${key}" is inactive`);
    });
  }

  if (nativeKeys.length) {
    const main = cfg.adapter.getMainFields();
    nativeKeys.forEach((key) => {
      const m = main.find((x) => x.key === key);
      if (!m) throw new ServiceError(400, `Invalid formula: unknown ${cfg.label} field "native.${key}"`);
      if (!NUMERIC_TYPES.includes(m.type)) {
        throw new ServiceError(400, `Invalid formula: native.${key} is ${m.type}; only numeric fields can be used`);
      }
    });
  }

  return expression.trim();
};

/**
 * Final config for a field of `type`:
 *   formula -> { expression } (validated)      person -> { role } | undefined
 *   others  -> must be empty
 */
const normalizeFieldConfig = async (type, config, ctx) => {
  const cfgObj = config || {};
  const keys = Object.keys(cfgObj);

  if (type === 'formula') {
    if (!cfgObj.expression) throw new ServiceError(400, 'Formula fields require config.expression');
    if (cfgObj.role !== undefined) throw new ServiceError(400, 'config.role is not valid for formula fields');
    return { expression: await validateFormulaExpression(cfgObj.expression, ctx) };
  }
  if (type === 'person') {
    if (cfgObj.expression !== undefined) throw new ServiceError(400, 'config.expression is only valid for formula fields');
    return cfgObj.role ? { role: cfgObj.role } : undefined;
  }
  if (keys.length) throw new ServiceError(400, `config is not supported for ${type} fields`);
  return undefined;
};

/** Formula fields of a table that reference custom field `key`. */
const findFormulasReferencing = async (tableId, key) => {
  const formulas = await GlobalTableField.find({ tableId, type: 'formula' }).lean();
  return formulas.filter((f) => {
    try {
      const { refs } = parseFormula(f.config && f.config.expression);
      return refs.some((r) => r.source === 'custom' && r.key === key);
    } catch {
      return false;
    }
  });
};

const assertNotUsedByFormula = async (field, action) => {
  if (!NUMERIC_TYPES.includes(field.type)) return;
  const used = await findFormulasReferencing(field.tableId, field.key);
  if (used.length) {
    throw new ServiceError(409, `Cannot ${action} "${field.key}": it is used by formula field(s)`, {
      formulas: used.map((f) => f.key),
    });
  }
};

/* =========================================================================
 * FIELDS
 * ======================================================================= */

const createField = async (data, user) => {
  const { table, cfg } = await resolveTableContext(data.tableId, user, 'edit');
  assertCanEditTableSchema(user, table);
  if (!table.isActive) throw new ServiceError(400, 'Cannot add fields to an inactive table');

  assertOptionsMatchType(data.type, data.options);
  const appliesTo = data.appliesTo || 'lead';
  if (appliesTo !== 'lead' && table.entity !== 'lead') {
    throw new ServiceError(400, 'Only lead tables can have activity form fields');
  }
  if (appliesTo !== 'lead' && !GlobalTableField.ACTIVITY_FIELD_TYPES.includes(data.type)) {
    throw new ServiceError(400, `${data.type} fields can only be shown in the lead table`);
  }
  if (NOT_REQUIRABLE_TYPES.includes(data.type) && data.required) {
    throw new ServiceError(400, `${data.type} fields cannot be required`);
  }
  const config = await normalizeFieldConfig(data.type, data.config, { table, cfg });

  let position = data.position;
  if (position === undefined) {
    const last = await GlobalTableField.findOne({ tableId: table._id }).sort({ position: -1 }).select('position').lean();
    position = last ? last.position + 1 : 0;
  }

  const doc = { ...data, appliesTo, tableId: table._id, position, createdBy: userId(user), updatedBy: userId(user) };
  if (config) doc.config = config; else delete doc.config;

  try {
    return await GlobalTableField.create(doc);
  } catch (err) {
    if (isDuplicateKey(err)) throw new ServiceError(409, `A field with key "${data.key}" already exists in this table`);
    throw err;
  }
};

const getFields = async (query, user) => {
  const { table } = await resolveTableContext(query.tableId, user, 'view');

  const filter = { tableId: table._id };
  if (query.isActive !== undefined) filter.isActive = query.isActive;

  return GlobalTableField.find(filter).sort({ position: 1, createdAt: 1 }).limit(500).lean();
};

const getFieldById = async (id, user) => {
  const field = await loadField(id);
  const table = await loadTable(field.tableId);
  assertEntityAccess(user, table.entity, 'view');
  assertTableInScope(user, table);
  return field;
};

const updateField = async (id, data, user) => {
  const field = await loadField(id);
  const { table, cfg } = await resolveTableContext(field.tableId, user, 'edit');
  assertCanEditTableSchema(user, table);
  if (field.systemManaged) throw new ServiceError(400, 'System-managed fields cannot be edited');

  if (data.tableId !== undefined && String(data.tableId) !== String(field.tableId)) {
    throw new ServiceError(400, 'A field cannot be moved to another table');
  }
  if (data.key !== undefined && data.key !== field.key) {
    throw new ServiceError(400, 'Field key cannot be changed');
  }
  // "Show in" can be changed. Lead-table values are kept in GlobalTableValue and
  // activity values on the entries, so a field with lead-table values cannot
  // move to an activity form (they would be hidden); values already saved in
  // activity entries stay on those entries.
  const prevAppliesTo = field.appliesTo || 'lead';
  const nextAppliesTo = data.appliesTo !== undefined ? data.appliesTo : prevAppliesTo;
  delete data.appliesTo;
  if (nextAppliesTo !== prevAppliesTo) {
    if (nextAppliesTo !== 'lead' && table.entity !== 'lead') {
      throw new ServiceError(400, 'Only lead tables can have activity form fields');
    }
    if (prevAppliesTo === 'lead' && nextAppliesTo !== 'lead') {
      await assertNotUsedByFormula(field, 'move');
      const valueCount = await GlobalTableValue.countDocuments({ fieldId: field._id });
      if (valueCount > 0) {
        throw new ServiceError(
          409,
          `This field already has values in ${valueCount} lead(s). Clear them first, or create a new field for the form.`,
          { valueCount }
        );
      }
    }
  }

  const nextType = data.type !== undefined ? data.type : field.type;
  const typeChanged = nextType !== field.type;
  if (nextAppliesTo !== 'lead' && !GlobalTableField.ACTIVITY_FIELD_TYPES.includes(nextType)) {
    throw new ServiceError(400, `${nextType} fields can only be shown in the lead table`);
  }

  if (typeChanged) {
    const valueCount = await GlobalTableValue.countDocuments({ fieldId: field._id });
    if (valueCount > 0) {
      throw new ServiceError(
        409,
        'Field type cannot be changed while values exist. Create a new field instead.',
        { valueCount }
      );
    }
    await assertNotUsedByFormula(field, 'change the type of');
  }

  // A numeric field that formulas read cannot be switched off
  if (data.isActive === false && field.isActive) await assertNotUsedByFormula(field, 'deactivate');

  const nextRequired = data.required !== undefined ? data.required : field.required;
  if (NOT_REQUIRABLE_TYPES.includes(nextType) && nextRequired) {
    throw new ServiceError(400, `${nextType} fields cannot be required`);
  }

  // Options: when the type changes away from select and no options were sent,
  // they are cleared; otherwise the final options must fit the final type.
  const nextOptions = data.options !== undefined
    ? data.options
    : typeChanged && !SELECT_TYPES.includes(nextType) ? [] : field.options;
  assertOptionsMatchType(nextType, nextOptions);

  // Do not orphan stored values by removing an option that is still in use.
  if (data.options !== undefined && SELECT_TYPES.includes(nextType) && !typeChanged) {
    const allowed = new Set(data.options.map((o) => o.value));
    const used = await GlobalTableValue.distinct('value', { fieldId: field._id }); // flattens arrays
    const removedInUse = used.filter((v) => v !== null && !allowed.has(v));
    if (removedInUse.length) {
      throw new ServiceError(409, 'These options are in use by existing values and cannot be removed', {
        options: removedInUse,
      });
    }
  }

  // Config is re-validated only when it (or the type) changes, so renaming a
  // formula field never fails because of an unrelated problem.
  const configProvided = data.config !== undefined;
  let nextConfig;
  if (configProvided || typeChanged) {
    const raw = configProvided ? (data.config === null ? undefined : data.config) : undefined;
    nextConfig = await normalizeFieldConfig(nextType, raw, { table, cfg });
  } else {
    nextConfig = field.config ? field.config.toObject() : undefined;
  }

  if (data.label !== undefined) field.label = data.label;
  if (data.description !== undefined) field.description = data.description;
  if (data.required !== undefined) field.required = data.required;
  if (data.isActive !== undefined) field.isActive = data.isActive;
  if (data.position !== undefined) field.position = data.position;
  field.appliesTo = nextAppliesTo;
  field.type = nextType;
  field.options = nextOptions;
  field.set('config', nextConfig);
  field.updatedBy = userId(user);

  await field.save();
  return field;
};

const deleteField = async (id, { force = false } = {}, user) => {
  const field = await loadField(id);
  const table = await loadTable(field.tableId);
  assertEntityAccess(user, table.entity, 'edit');
  assertTableInScope(user, table);
  assertCanEditTableSchema(user, table);
  if (field.systemManaged) throw new ServiceError(400, 'System-managed fields cannot be deleted');

  await assertNotUsedByFormula(field, 'delete');
  return withTransaction(async (session) => {
    const currentField = await GlobalTableField.findOne({ _id: field._id, tableId: table._id }).session(session);
    if (!currentField) throw new ServiceError(404, 'Field not found');
    const valueCount = await GlobalTableValue.countDocuments({ tableId: table._id, fieldId: field._id }).session(session);
    if (valueCount > 0 && !force) {
      throw new ServiceError(
        409,
        'Field has stored values. Deactivate it with PUT { isActive: false }, or retry with ?force=true to delete the values too.',
        { valueCount }
      );
    }

    await GlobalTableValue.deleteMany({ tableId: table._id, fieldId: field._id }, { session });
    await GlobalTableField.deleteOne({ _id: field._id, tableId: table._id }, { session });
    return { removedValues: valueCount };
  });
};

/* =========================================================================
 * VALUE NORMALIZATION (field-type-specific business validation)
 * ======================================================================= */

const isEmptyValue = (v) =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

const invalid = (field, reason) =>
  new ServiceError(400, `Invalid value for field "${field.key}" (${field.type}): ${reason}`);

const toNumber = (field, v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  throw invalid(field, 'must be a number');
};

const optionValues = (field) => new Set((field.options || []).map((o) => o.value));

/**
 * date: a calendar day, stored as UTC midnight of that day.
 *       'YYYY-MM-DD' is validated strictly (2026-02-31 is rejected).
 */
const normalizeCalendarDate = (field, raw) => {
  if (typeof raw !== 'string' && !(raw instanceof Date)) throw invalid(field, 'must be an ISO date string');

  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    const ymd = raw.trim();
    const d = new Date(`${ymd}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== ymd) throw invalid(field, 'is not a valid date');
    return d;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw invalid(field, 'is not a valid date');
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

/**
 * Returns the value in its canonical stored form, or null for "empty"
 * (checkbox: false). Throws ServiceError(400) when the value does not fit.
 *
 * Representations
 *   text            trimmed string (max 5000)
 *   email           trimmed, lower-cased string (max 254), must look like an email
 *   number          finite number (numeric strings accepted)
 *   currency        number rounded to 2 decimals, in major units (e.g. rupees)
 *   date            Date at UTC midnight (calendar day)
 *   datetime        Date (any ISO date-time / parseable date string)
 *   boolean         true | false | null   (accepts true/false and 'true'/'false')
 *   checkbox        true | false          (empty clears to false)
 *   single-select   option value string
 *   multi-select    array of unique option values
 *   person          array of User ObjectIds (a single id is accepted and wrapped);
 *                   all users must exist; the user's role is NOT checked
 *   reference       ObjectId (shape only; legacy type)
 *   formula         not writable
 */
const normalizeValue = async (field, raw) => {
  if (field.type === 'formula') {
    throw new ServiceError(400, `Field "${field.key}" is a formula field; its value is calculated and cannot be set directly`);
  }

  if (isEmptyValue(raw)) {
    if (field.type === 'checkbox') return false;
    if (field.required) throw new ServiceError(400, `Field "${field.key}" is required`);
    return null;
  }

  switch (field.type) {
    case 'text': {
      if (typeof raw !== 'string') throw invalid(field, 'must be a string');
      const v = raw.trim();
      if (v.length > MAX_TEXT_LENGTH) throw invalid(field, `cannot exceed ${MAX_TEXT_LENGTH} characters`);
      return v;
    }

    case 'email': {
      if (typeof raw !== 'string') throw invalid(field, 'must be a string');
      const v = raw.trim().toLowerCase();
      if (v.length > 254 || !EMAIL_RE.test(v)) throw invalid(field, 'must be a valid email address');
      return v;
    }

    case 'number':
      return toNumber(field, raw);

    case 'currency':
      return Math.round(toNumber(field, raw) * 100) / 100;

    case 'date':
      return normalizeCalendarDate(field, raw);

    case 'datetime': {
      if (typeof raw !== 'string' && !(raw instanceof Date)) throw invalid(field, 'must be an ISO date-time string');
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) throw invalid(field, 'is not a valid date-time');
      return d;
    }

    case 'boolean':
    case 'checkbox': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      throw invalid(field, 'must be true or false');
    }

    case 'single-select': {
      if (typeof raw !== 'string') throw invalid(field, 'must be one of the option values');
      if (!optionValues(field).has(raw)) throw invalid(field, `"${raw}" is not an allowed option`);
      return raw;
    }

    case 'multi-select': {
      if (!Array.isArray(raw)) throw invalid(field, 'must be an array of option values');
      const allowed = optionValues(field);
      const unique = [...new Set(raw)];
      const bad = unique.filter((v) => typeof v !== 'string' || !allowed.has(v));
      if (bad.length) throw invalid(field, `not allowed option(s): ${bad.join(', ')}`);
      return unique;
    }

    case 'person': {
      const list = Array.isArray(raw) ? raw : [raw];
      if (!list.every((v) => typeof v === 'string' && OBJECT_ID_RE.test(v))) {
        throw invalid(field, 'must be a user id or an array of user ids');
      }
      const ids = [...new Set(list)];
      if (ids.length > MAX_PERSON_VALUES) throw invalid(field, `cannot contain more than ${MAX_PERSON_VALUES} users`);
      // One query; the whole write is rejected if any user is missing
      const count = await User.countDocuments({ _id: { $in: ids } });
      if (count !== ids.length) throw invalid(field, 'one or more users do not exist');
      return ids.map((id) => new mongoose.Types.ObjectId(id));
    }

    case 'reference': {
      // Legacy generic reference: shape only (no target configuration exists)
      if (typeof raw !== 'string' || !OBJECT_ID_RE.test(raw)) throw invalid(field, 'must be a valid id');
      return new mongoose.Types.ObjectId(raw);
    }

    default:
      throw invalid(field, 'unsupported field type');
  }
};

/* =========================================================================
 * FORMULA EVALUATION (read-time, never stored)
 * ======================================================================= */

/**
 * Calculates every active formula field of `table` for the given records.
 * `recordIds` MUST already be restricted to records the user may see.
 * Returns Map<recordId, { [formulaFieldId]: number | null }>.
 */
const computeFormulaValues = async ({ table, cfg, fields, recordIds, user }) => {
  const ids = (recordIds || []).map(String);
  const result = new Map(ids.map((id) => [id, {}]));

  const formulaFields = fields.filter((f) => f.type === 'formula' && f.isActive && f.config && f.config.expression);
  if (formulaFields.length === 0 || ids.length === 0) return result;

  const parsed = formulaFields.map((f) => {
    try {
      return { field: f, ...parseFormula(f.config.expression) };
    } catch {
      return { field: f, error: true }; // stored expression no longer parses -> null
    }
  });

  const customKeys = new Set();
  const nativeKeys = new Set();
  parsed.forEach((p) => {
    if (p.error) return;
    p.refs.forEach((r) => (r.source === 'custom' ? customKeys : nativeKeys).add(r.key));
  });

  const depFields = fields.filter((f) => customKeys.has(f.key));
  const keyByFieldId = new Map(depFields.map((f) => [String(f._id), f.key]));
  const customByRecord = new Map();
  if (depFields.length) {
    const stored = await GlobalTableValue.find({
      tableId: table._id,
      fieldId: { $in: depFields.map((f) => f._id) },
      recordId: { $in: ids },
    }).select('fieldId recordId value').lean();
    stored.forEach((v) => {
      const rid = String(v.recordId);
      if (!customByRecord.has(rid)) customByRecord.set(rid, {});
      customByRecord.get(rid)[keyByFieldId.get(String(v.fieldId))] = typeof v.value === 'number' ? v.value : null;
    });
  }

  const nativeById = new Map();
  if (nativeKeys.size && typeof cfg.adapter.getRecordsByIds === 'function') {
    const recs = await cfg.adapter.getRecordsByIds(ids, { user, select: [...nativeKeys].join(' ') });
    recs.forEach((r) => nativeById.set(String(r._id), r));
  }

  ids.forEach((rid) => {
    const out = result.get(rid);
    parsed.forEach((p) => {
      const fid = String(p.field._id);
      if (p.error) { out[fid] = null; return; }
      out[fid] = evaluateFormula(p.ast, (source, key) => {
        if (source === 'custom') {
          const v = customByRecord.get(rid) && customByRecord.get(rid)[key];
          return typeof v === 'number' ? v : null;
        }
        const rec = nativeById.get(rid);
        return rec && typeof rec[key] === 'number' ? rec[key] : null;
      });
    });
  });

  return result;
};

/* =========================================================================
 * VALUES
 * ======================================================================= */

/**
 * Checks for a value WRITE: table exists + active, user can edit the entity,
 * field exists + belongs to table + active + not a formula, record exists
 * and is accessible to this user.
 */
const resolveWriteContext = async ({ tableId, fieldId, recordId }, user) => {
  const { table, cfg } = await resolveTableContext(tableId, user, 'edit', { requireActive: true });

  const field = await loadField(fieldId);
  if (String(field.tableId) !== String(table._id)) {
    throw new ServiceError(400, 'Field does not belong to this table');
  }
  if (!field.isActive) throw new ServiceError(400, `Field "${field.key}" is inactive`);
  if (!GlobalTableField.isLeadField(field)) {
    throw new ServiceError(400, `Field "${field.key}" belongs to an activity form; set it from that form`);
  }
  if (field.type === 'formula') {
    throw new ServiceError(400, `Field "${field.key}" is a formula field; its value is calculated and cannot be set directly`);
  }
  if (field.systemManaged) throw new ServiceError(400, `Field "${field.key}" is system-managed and cannot be set directly`);

  const scope = await resolveTableScope(table);
  const record = await cfg.adapter.getRecord(recordId, { user });
  if (!(await recordBelongsToTable(table, record, scope))) throw new ServiceError(404, 'Record not found');

  return { table, field, adapter: cfg.adapter };
};

const createValue = async (data, user) => {
  const { table, field } = await resolveWriteContext(data, user);
  const value = await normalizeValue(field, data.value);

  const existing = await GlobalTableValue.exists({ tableId: table._id, fieldId: field._id, recordId: data.recordId });
  if (existing) {
    throw new ServiceError(409, 'A value already exists for this field and record. Use PUT /upsert or PUT /:id.');
  }

  try {
    return await GlobalTableValue.create({
      tableId: table._id,
      fieldId: field._id,
      recordId: data.recordId,
      value,
      createdBy: userId(user),
      updatedBy: userId(user),
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw new ServiceError(409, 'A value already exists for this field and record');
    throw err;
  }
};

/** One document per (tableId, fieldId, recordId): create it or overwrite it. */
const upsertValue = async (data, user) => {
  const { table, field } = await resolveWriteContext(data, user);
  const value = await normalizeValue(field, data.value);

  const filter = { tableId: table._id, fieldId: field._id, recordId: data.recordId };
  const existed = !!(await GlobalTableValue.exists(filter));

  const run = () =>
    GlobalTableValue.findOneAndUpdate(
      filter,
      { $set: { value, updatedBy: userId(user) }, $setOnInsert: { createdBy: userId(user) } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

  let doc;
  try {
    doc = await run();
  } catch (err) {
    // Two concurrent upserts can race on the unique index; the retry hits the update path.
    if (!isDuplicateKey(err)) throw err;
    doc = await run();
  }
  return { value: doc, created: !existed };
};

const getValues = async (query, user) => {
  const { table, cfg } = await resolveTableContext(query.tableId, user, 'view');
  const scope = await resolveTableScope(table);
  const full = cfg.adapter.hasFullAccess(user);

  const filter = { tableId: table._id };
  if (query.fieldId) filter.fieldId = query.fieldId;

  // Records whose computed values may be returned (always access-scoped)
  let scopedIds = null;

  // Never expose values of records the user cannot see
  if (query.recordId) {
    const record = await cfg.adapter.getRecord(query.recordId, { user });
    if (!(await recordBelongsToTable(table, record, scope))) {
      throw new ServiceError(404, 'Record not found');
    }
    filter.recordId = query.recordId;
    scopedIds = [query.recordId];
  } else if (query.recordIds) {
    const records = await cfg.adapter.getRecordsByIds(query.recordIds, { user, bypassAccess: full });
    const accessibleIds = records.filter((record) => recordMatchesScope(record, table, scope)).map((record) => String(record._id));
    scopedIds = await getTableRecordIds(table, accessibleIds);
    filter.recordId = { $in: scopedIds };
  } else {
    const membershipIds = await getTableRecordIds(table);
    let accessibleIds;
    if (scope) {
      accessibleIds = await cfg.adapter.getScopedRecordIds(
        { product: scope.product, productLocation: scope.productLocation },
        { user }
      );
    } else if (!full) {
      accessibleIds = await cfg.adapter.getAccessibleRecordIds(user);
    }
    if (accessibleIds) {
      const accessible = new Set(accessibleIds.map(String));
      filter.recordId = { $in: membershipIds.filter((recordId) => accessible.has(recordId)) };
    } else {
      filter.recordId = { $in: membershipIds };
    }
  }

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    GlobalTableValue.find(filter).sort({ createdAt: 1, _id: 1 }).skip(skip).limit(query.limit).lean(),
    GlobalTableValue.countDocuments(filter),
  ]);

  let computed;
  if (query.includeComputed && scopedIds) {
    const fields = await GlobalTableField.find({ tableId: table._id, ...GlobalTableField.LEAD_FIELD_FILTER }).lean();
    const map = await computeFormulaValues({ table, cfg, fields, recordIds: scopedIds, user });
    computed = [];
    map.forEach((byField, recordId) => {
      Object.entries(byField).forEach(([fieldId, value]) => computed.push({ recordId, fieldId, value }));
    });
    // Activity form fields: read-only, the latest entry's value
    const activityFields = await GlobalTableField.find({ tableId: table._id, isActive: true, appliesTo: { $nin: ['lead', null] } }).lean();
    const activity = await latestActivityValues(activityFields, scopedIds);
    activity.forEach((byField, recordId) => {
      Object.entries(byField).forEach(([fieldId, value]) => computed.push({ recordId, fieldId, value }));
    });
  }

  return { items, pagination: buildPagination(query.page, query.limit, total), computed };
};

const loadValueForUser = async (id, user, mode) => {
  const doc = await GlobalTableValue.findById(id);
  if (!doc) throw new ServiceError(404, 'Value not found');

  const table = await loadTable(doc.tableId);
  const cfg = assertEntityAccess(user, table.entity, mode);
  assertTableInScope(user, table);

  const scope = await resolveTableScope(table);
  const record = await cfg.adapter.getRecord(doc.recordId, { user });
  if (!(await recordBelongsToTable(table, record, scope))) {
    throw new ServiceError(404, 'Value not found');
  }
  if (!(await GlobalTableField.exists({ _id: doc.fieldId, tableId: table._id }))) {
    throw new ServiceError(404, 'Value not found');
  }
  return doc;
};

const getValueById = (id, user) => loadValueForUser(id, user, 'view');

const updateValue = async (id, data, user) => {
  const doc = await loadValueForUser(id, user, 'edit');
  const { field } = await resolveWriteContext(
    { tableId: doc.tableId, fieldId: doc.fieldId, recordId: doc.recordId },
    user
  );

  doc.value = await normalizeValue(field, data.value);
  doc.markModified('value'); // value is Schema.Types.Mixed
  doc.updatedBy = userId(user);
  await doc.save();
  return doc;
};

const deleteValue = async (id, user) => {
  const doc = await loadValueForUser(id, user, 'edit');

  // Removing the stored value reads as "empty", so it follows the same
  // required-field rule as writing null.
  const field = await GlobalTableField.findById(doc.fieldId).select('key required systemManaged').lean();
  if (field && field.systemManaged) throw new ServiceError(400, 'System-managed values cannot be cleared');
  if (field && field.required) {
    throw new ServiceError(400, `Field "${field.key}" is required and its value cannot be cleared`);
  }
  await doc.deleteOne();
};

/* =========================================================================
 * RECORDS (native entity rows + their custom values, through the adapter)
 * ======================================================================= */

/**
 * Validates + normalizes every custom value BEFORE anything is written, so a
 * bad value can never leave a half-created record.
 * Returns Map<fieldId, { field, value }>.
 */
const prepareCustomValues = async (table, customValues, { requireAll }) => {
  const fields = await GlobalTableField.find({ tableId: table._id, isActive: true, ...GlobalTableField.LEAD_FIELD_FILTER });
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const prepared = new Map();

  for (const [key, raw] of Object.entries(customValues || {})) {
    const field = byKey.get(key);
    if (!field) throw new ServiceError(400, `Unknown or inactive custom field "${key}"`);
    if (field.systemManaged) throw new ServiceError(400, `Field "${key}" is system-managed`);
    // eslint-disable-next-line no-await-in-loop
    prepared.set(String(field._id), { field, value: await normalizeValue(field, raw) });
  }

  if (requireAll) {
    fields.forEach((f) => {
      if (f.required && f.type !== 'formula' && f.type !== 'checkbox' && !prepared.has(String(f._id))) {
        throw new ServiceError(400, `Custom field "${f.key}" is required`);
      }
    });
  }
  return prepared;
};

/** Upserts several custom values for one record in one round trip. */
const writeCustomValues = async (table, recordId, prepared, user, { skipNull = false, session = null } = {}) => {
  const ops = [];
  prepared.forEach(({ field, value }) => {
    if (skipNull && value === null) return;
    ops.push({
      updateOne: {
        filter: { tableId: table._id, fieldId: field._id, recordId },
        update: { $set: { value, updatedBy: userId(user) }, $setOnInsert: { createdBy: userId(user) } },
        upsert: true,
      },
    });
  });
  if (ops.length) await GlobalTableValue.bulkWrite(ops, { ordered: true, ...(session ? { session } : {}) });
};

/** Attaches customValues (by field key) + computedValues to native records. */
const attachValues = async (table, cfg, records, user) => {
  const ids = records.map((r) => String(r._id));
  const allFields = await GlobalTableField.find({ tableId: table._id, ...GlobalTableField.LEAD_FIELD_FILTER }).sort({ position: 1 }).lean();
  const active = allFields.filter((f) => f.isActive);
  const keyById = new Map(allFields.map((f) => [String(f._id), f.key]));

  const custom = new Map(ids.map((id) => [id, {}]));
  // A checkbox is never "empty": absent means false
  active.filter((f) => f.type === 'checkbox').forEach((f) => ids.forEach((id) => { custom.get(id)[f.key] = false; }));

  if (ids.length && active.length) {
    const stored = await GlobalTableValue.find({
      tableId: table._id,
      recordId: { $in: ids },
      fieldId: { $in: active.map((f) => f._id) },
    }).select('fieldId recordId value').lean();
    stored.forEach((v) => {
      const target = custom.get(String(v.recordId));
      if (target) target[keyById.get(String(v.fieldId))] = v.value;
    });
  }

  const computedMap = await computeFormulaValues({ table, cfg, fields: allFields, recordIds: ids, user });

  // Activity form fields: read-only, the latest entry's value (by field key)
  const activityFields = await GlobalTableField.find({ tableId: table._id, isActive: true, appliesTo: { $nin: ['lead', null] } }).lean();
  const activity = await latestActivityValues(activityFields, ids);
  activityFields.forEach((f) => ids.forEach((id) => {
    const v = activity.get(id)?.[String(f._id)];
    if (v !== undefined) custom.get(id)[f.key] = v;
  }));

  return records.map((record) => {
    const id = String(record._id);
    const computedValues = {};
    Object.entries(computedMap.get(id) || {}).forEach(([fid, value]) => { computedValues[keyById.get(fid)] = value; });
    return { record, customValues: custom.get(id), computedValues };
  });
};

const listRecords = async (tableId, query, user) => {
  const { table, cfg } = await resolveTableContext(tableId, user, 'view');
  const scope = await resolveTableScope(table);

  const sortable = cfg.adapter.sortableFields || ['createdAt'];
  const sortBy = query.sortBy === undefined ? 'createdAt' : query.sortBy;
  if (!sortable.includes(sortBy)) {
    throw new ServiceError(400, `Cannot sort by "${sortBy}". Allowed: ${sortable.join(', ')}`);
  }
  // _id breaks ties (e.g. imported rows sharing one createdAt) so paging never repeats or skips rows.
  const dir = query.sortOrder === 'asc' ? 1 : -1;
  const sort = { [sortBy]: dir, _id: dir };

  const filter = { _id: { $in: await getTableRecordIds(table) } };
  if (scope) {
    filter.product = scope.product;
    filter.productLocation = scope.productLocation;
  }
  // Search: lead name, or the name / employee ID of the assigned user (case-insensitive).
  if (query.search && table.entity === 'lead') {
    const pattern = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({ $or: [{ name: pattern }, { employeeId: pattern }] }).select('_id').limit(200).lean();
    filter.$or = [{ name: pattern }, ...(users.length ? [{ assignedTo: { $in: users.map((u) => u._id) } }] : [])];
  }
  const { items, total, page, limit } = await cfg.adapter.getRecords({ user, filter, sort, page: query.page, limit: query.limit });
  const scopedItems = scope ? items.map((record) => ({ ...record, district: scope.district, mandal: scope.mandal })) : items;
  const records = await attachValues(table, cfg, scopedItems, user);
  return { records, pagination: buildPagination(page, limit, total) };
};

const getRecordById = async (tableId, recordId, user) => {
  const { table, cfg } = await resolveTableContext(tableId, user, 'view');
  const scope = await resolveTableScope(table);
  const record = await cfg.adapter.getRecord(recordId, { user });
  if (!(await recordBelongsToTable(table, record, scope))) throw new ServiceError(404, 'Record not found');
  const scopedRecord = scope ? { ...record, district: scope.district, mandal: scope.mandal } : record;
  const [withValues] = await attachValues(table, cfg, [scopedRecord], user);
  return withValues;
};

/**
 * Without a transaction (standalone MongoDB fallback) a failure after the
 * native write cannot be rolled back, so say so; with a transaction the
 * original error is simply rethrown and everything aborts.
 */
const guardPartial = async (session, message, details, fn) => {
  try {
    await fn();
  } catch (err) {
    if (session) throw err;
    console.error(`globalTableService: ${message}`, err);
    throw new ServiceError(500, message, details);
  }
};

/**
 * Creates a REAL native record through the adapter (so the entity's own
 * validation + rules run) and stores its initial custom values, atomically:
 *   1. permissions + capability, 2. validate/normalize every custom value
 *   (no writes yet), 3. ONE transaction: native create -> custom values with
 *   the same session, 4. commit, 5. read the committed result.
 */
const createRecord = async (tableId, payload, user) => {
  const { table, cfg } = await resolveTableContext(tableId, user, 'edit', { requireActive: true });
  requireCapability(cfg, 'create');

  const scope = await resolveTableScope(table);
  const prepared = await prepareCustomValues(table, payload.customValues, { requireAll: true });

  const createInSession = async (session, afterCommit) => {
    const counter = await GlobalTable.findOneAndUpdate(
      { _id: table._id, isActive: true },
      { $inc: { writeVersion: 1 } },
      { new: true, session }
    );
    if (!counter) throw new ServiceError(404, 'Active table not found');
    const created = await cfg.adapter.createRecord(payload.native, {
      user,
      session,
      afterCommit,
      table,
      systemFields: scope || {},
    });
    try {
      await writeCustomValues(table, created._id, prepared, user, { skipNull: true, session });
    } catch (err) {
      if (session) throw err;
      const compensation = await Promise.allSettled([
        cfg.adapter.deleteRecord(created._id, { user, table }),
        GlobalTableValue.deleteMany({ tableId: table._id, recordId: created._id }),
      ]);
      const failed = compensation.filter((result) => result.status === 'rejected');
      if (failed.length) {
        console.error('Global Table create compensation failed:', failed.map((result) => result.reason));
        throw new ServiceError(500, 'Record creation failed and rollback was incomplete', {
          recordId: String(created._id), compensationFailures: failed.length,
        });
      }
      throw new ServiceError(500, 'Record creation failed; the Lead and table values were rolled back', {
        cause: err.message,
      });
    }
    return created._id;
  };

  const recordId = await withTransaction(createInSession, {
    fallback: () => createInSession(null, []),
  });

  // Committed: read the final state outside the transaction
  return getRecordById(tableId, recordId, user);
};

/**
 * Updates native fields (through the adapter's business rules) and/or custom
 * values atomically:
 *   1. permissions, record access, capability, 2. validate custom values
 *   (no writes yet), 3. ONE transaction: native update (one or more
 *   controller calls, same session) -> custom values (same session),
 *   4. commit, 5. read the committed result.
 */
const updateRecord = async (tableId, recordId, payload, user) => {
  const { table, cfg } = await resolveTableContext(tableId, user, 'edit', { requireActive: true });
  const scope = await resolveTableScope(table);

  const existing = await cfg.adapter.getRecord(recordId, { user });
  if (!(await recordBelongsToTable(table, existing, scope))) throw new ServiceError(404, 'Record not found');

  const hasNative = Object.keys(payload.native).length > 0 || Boolean(scope);
  if (hasNative) requireCapability(cfg, 'update');

  const prepared = await prepareCustomValues(table, payload.customValues, { requireAll: false });

  const updateInSession = async (session, afterCommit) => {
    if (hasNative) await cfg.adapter.updateRecord(recordId, payload.native, {
      user,
      session,
      afterCommit,
      table,
      systemFields: scope || {},
    });
    await guardPartial(
      session,
      'Native fields were updated, but custom values could not be saved',
      { nativeApplied: hasNative },
      () => writeCustomValues(table, recordId, prepared, user, { session })
    );
  };

  await withTransaction(updateInSession, {
    fallback: async () => {
      const [leadSnapshot, valueSnapshots] = await Promise.all([
        Lead.findById(recordId).lean(),
        GlobalTableValue.find({ tableId: table._id, recordId }).lean(),
      ]);
      try {
        await updateInSession(null, []);
      } catch (err) {
        const compensationErrors = [];
        try {
          if (leadSnapshot) await Lead.collection.replaceOne({ _id: recordId }, leadSnapshot, { upsert: true });
        } catch (restoreLeadError) {
          compensationErrors.push(restoreLeadError);
        }
        try {
          await GlobalTableValue.deleteMany({ tableId: table._id, recordId });
          if (valueSnapshots.length) {
            await GlobalTableValue.insertMany(valueSnapshots, { ordered: true });
          }
        } catch (restoreValuesError) {
          compensationErrors.push(restoreValuesError);
        }
        if (compensationErrors.length) {
          console.error('Global Table update compensation failed:', compensationErrors);
          throw new ServiceError(500, 'Record update failed and recovery was incomplete', {
            recordId: String(recordId), compensationFailures: compensationErrors.length,
          });
        }
        throw new ServiceError(500, 'Record update failed; its Lead and table values were restored', { cause: err.message });
      }
    },
  });

  return getRecordById(tableId, recordId, user);
};

/**
 * Deletes the REAL native record through the adapter (authorization +
 * entity rules) and removes its custom values from every table of that entity,
 * in ONE transaction. If either step fails nothing is deleted. Clearing a
 * single cell never goes through here.
 */
const deleteRecord = async (tableId, recordId, user) => {
  const { table, cfg } = await resolveTableContext(tableId, user, 'edit', { requireActive: true });
  requireCapability(cfg, 'delete');

  const scope = await resolveTableScope(table);
  const record = await cfg.adapter.getRecord(recordId, { user });
  if (!(await recordBelongsToTable(table, record, scope))) throw new ServiceError(404, 'Record not found');

  const performDelete = async (session, afterCommit) => {
    await cfg.adapter.deleteRecord(recordId, { user, session, afterCommit, table });
    const tableQuery = GlobalTable.find({ entity: table.entity });
    const tableIds = scope ? [table._id] : await (session ? tableQuery.session(session) : tableQuery).distinct('_id');
    const result = await GlobalTableValue.deleteMany(
      { tableId: { $in: tableIds }, recordId },
      session ? { session } : {}
    );
    return result.deletedCount || 0;
  };

  const removedValues = await withTransaction(performDelete, {
    fallback: async () => {
      const tableIds = scope ? [table._id] : await GlobalTable.find({ entity: table.entity }).distinct('_id');
      const valueFilter = { tableId: { $in: tableIds }, recordId };
      const [leadSnapshot, valueSnapshots] = await Promise.all([
        Lead.findById(recordId).lean(),
        GlobalTableValue.find(valueFilter).lean(),
      ]);
      try {
        return await performDelete(null, []);
      } catch (err) {
        const compensationErrors = [];
        try {
          if (leadSnapshot && !(await Lead.exists({ _id: recordId }))) {
            await Lead.collection.insertOne(leadSnapshot);
          }
        } catch (restoreLeadError) {
          compensationErrors.push(restoreLeadError);
        }
        try {
          if (valueSnapshots.length) {
            await GlobalTableValue.bulkWrite(valueSnapshots.map((value) => ({
              updateOne: {
                filter: { tableId: value.tableId, fieldId: value.fieldId, recordId: value.recordId },
                update: { $setOnInsert: value },
                upsert: true,
              },
            })), { ordered: true });
          }
        } catch (restoreValuesError) {
          compensationErrors.push(restoreValuesError);
        }
        if (compensationErrors.length) {
          console.error('Global Table delete compensation failed:', compensationErrors);
          throw new ServiceError(500, 'Record deletion failed and recovery was incomplete', {
            recordId: String(recordId), compensationFailures: compensationErrors.length,
          });
        }
        throw new ServiceError(500, 'Record deletion failed; its Lead and table values were restored', { cause: err.message });
      }
    },
  });

  return { deleted: true, customValuesCleanup: 'ok', removedValues };
};

/* =========================================================================
 * BULK ROW DELETE + TABLE LIFECYCLE (restore, permanent delete, move)
 * ======================================================================= */

const MAX_BULK_DELETE = 500;

/**
 * Deletes several leads of one table at once. Every id must be a lead of THIS
 * table that the user can see, or nothing is deleted. Each lead goes with
 * everything that depends on it (see leadCascadeService).
 */
const deleteRecords = async (tableId, recordIds, user) => {
  const { table, cfg } = await resolveTableContext(tableId, user, 'edit', { requireActive: true });
  requireCapability(cfg, 'delete');
  if (!Array.isArray(recordIds) || !recordIds.length) throw new ServiceError(400, 'Select at least one row to delete');
  const ids = [...new Set(recordIds.map(String))];
  if (ids.length > MAX_BULK_DELETE) throw new ServiceError(400, `At most ${MAX_BULK_DELETE} rows can be deleted at once`);
  if (ids.some((id) => !OBJECT_ID_RE.test(id))) throw new ServiceError(400, 'Invalid row id');

  const scope = await resolveTableScope(table);
  const records = await cfg.adapter.getRecordsByIds(ids, { user });
  const found = records.filter((record) => recordMatchesScope(record, table, scope)).map((record) => String(record._id));
  if (found.length !== ids.length) {
    throw new ServiceError(404, `${ids.length - found.length} of the selected rows were not found in this table. Nothing was deleted.`);
  }

  return withTransaction(async (session) => {
    await GlobalTable.updateOne({ _id: table._id }, { $inc: { writeVersion: 1 } }, { session });
    const counts = await deleteLeadsCascade(ids, session);
    return { deleted: counts.leads, related: counts };
  });
};

/** A product/location table loaded for a tree action (admin / hr / manager routes). */
const loadLocationTable = async (tableId, user) => {
  const table = await loadTable(tableId);
  assertEntityAccess(user, table.entity, 'edit');
  if (!table.product || !table.location) throw new ServiceError(400, "This action is for a Mandal's tables only");
  return table;
};

const hasSubLocations = (productId, locationId, session = null) => {
  const query = ProductLocation.exists({ product: productId, parent: locationId, kind: 'location' });
  return session ? query.session(session) : query;
};

/** Restores an archived table, as long as its location is still a Mandal. */
const reactivateTable = async (tableId, user) => {
  const table = await loadLocationTable(tableId, user);
  if (table.isActive) return table;
  if (await hasSubLocations(table.product, table.location)) {
    throw new ServiceError(400, 'This location now has sub-locations, so it is no longer a Mandal. Move the table to a Mandal first.');
  }
  return updateTable(tableId, { isActive: true }, user);
};

/** Deletes a table with no rows left (its columns and values go with it). */
const deleteTablePermanently = async (tableId, user) => {
  const table = await loadLocationTable(tableId, user);
  const rows = await Lead.countDocuments({ globalTableId: table._id });
  if (rows > 0) {
    const plural = rows === 1 ? '' : 's';
    throw new ServiceError(409, table.isActive
      ? `"${table.name}" still has ${rows} row${plural}. Delete the rows first, then delete the table.`
      : `"${table.name}" still has ${rows} row${plural}. Restore it, delete the rows, then delete the table.`,
    { recordCount: rows });
  }
  return deleteTable(tableId, { force: true }, user);
};

/**
 * Who would lose a lead by moving the table to `targetId`, and who can take it.
 * Shared by the move preview and the move itself.
 */
const planTableMove = async (table, targetId) => {
  if (!OBJECT_ID_RE.test(String(targetId || ''))) throw new ServiceError(400, 'Choose a Mandal to move the table to');
  if (String(targetId) === String(table.location)) throw new ServiceError(400, 'The table is already in this Mandal');
  const target = await ProductLocation.findOne({ _id: targetId, product: table.product, kind: 'location' }).select('_id name').lean();
  if (!target) throw new ServiceError(404, 'Mandal not found in this product');
  if (await hasSubLocations(table.product, target._id)) {
    throw new ServiceError(400, `"${target.name}" has sub-locations; tables can only be moved to a Mandal`);
  }
  if (await GlobalTable.exists({ _id: { $ne: table._id }, product: table.product, location: target._id, name: table.name })) {
    throw new ServiceError(409, `"${target.name}" already has a table named "${table.name}". Rename one of them first.`);
  }

  // Unassigned leads (assignedTo null) just move with the table; nobody loses them.
  const assigneeIds = (await Lead.find({ globalTableId: table._id }).distinct('assignedTo')).filter(Boolean);
  const assignees = await User.find({ _id: { $in: assigneeIds } }).select('_id name employeeId role isActive productLocationAssignments').lean();
  const byId = new Map(assignees.map((u) => [String(u._id), u]));
  const losing = [];
  for (const id of assigneeIds) {
    const assignee = byId.get(String(id));
    // eslint-disable-next-line no-await-in-loop
    if (!assignee || !(await crmScope.canBeAssignedAt(assignee, table.product, target._id))) losing.push(id);
  }
  const affectedCount = losing.length ? await Lead.countDocuments({ globalTableId: table._id, assignedTo: { $in: losing } }) : 0;

  const candidates = await User.find({
    isActive: { $ne: false },
    $or: [
      { role: { $in: crmScope.FULL_SCOPE_ROLES } },
      { productLocationAssignments: { $elemMatch: { product: table.product, mandals: target._id } } },
    ],
  }).select('_id name employeeId role').sort({ name: 1 }).lean();

  return {
    target,
    losing,
    affectedCount,
    affectedAssignees: losing.map((id) => byId.get(String(id))).filter(Boolean).map((u) => ({ _id: u._id, name: u.name, employeeId: u.employeeId })),
    candidates,
  };
};

const previewTableMove = async (tableId, targetId, user) => {
  const table = await loadLocationTable(tableId, user);
  const plan = await planTableMove(table, targetId);
  return {
    target: plan.target,
    leadCount: await Lead.countDocuments({ globalTableId: table._id }),
    affectedCount: plan.affectedCount,
    affectedAssignees: plan.affectedAssignees,
    candidates: plan.candidates,
  };
};

/**
 * Moves a table (columns, values and every lead in it) to another Mandal of
 * the same product. Leads whose assignee has no access to the new Mandal are
 * handed to `reassignTo`, who must be able to hold leads there.
 */
const moveTable = async (tableId, { targetLocationId, reassignTo } = {}, user) => {
  const table = await loadLocationTable(tableId, user);
  const plan = await planTableMove(table, targetLocationId);
  if (plan.affectedCount > 0) {
    if (!reassignTo) {
      throw new ServiceError(409, `${plan.affectedCount} lead(s) are assigned to people without access to "${plan.target.name}". Choose who takes them over.`, {
        code: 'REASSIGN_REQUIRED', affectedCount: plan.affectedCount,
      });
    }
    if (!plan.candidates.some((u) => String(u._id) === String(reassignTo))) {
      throw new ServiceError(400, `The new assignee must have access to "${plan.target.name}"`);
    }
  }

  return withTransaction(async (session) => {
    // Re-check inside the transaction: the target must still be a Mandal.
    if (await hasSubLocations(table.product, plan.target._id, session)) {
      throw new ServiceError(409, `"${plan.target.name}" got sub-locations meanwhile; choose another Mandal`);
    }
    await ProductLocation.updateOne({ _id: plan.target._id }, { $inc: { globalTableWriteVersion: 1 } }, { session });
    const moved = await GlobalTable.findOneAndUpdate(
      { _id: table._id, location: table.location },
      { $set: { location: plan.target._id, updatedBy: userId(user) }, $inc: { writeVersion: 1 } },
      { new: true, session }
    );
    if (!moved) throw new ServiceError(409, 'The table was changed by someone else. Refresh and try again.');

    const fields = await resolveTableScope(moved, session);
    let reassigned = 0;
    if (plan.affectedCount > 0) {
      const res = await Lead.updateMany(
        { globalTableId: table._id, assignedTo: { $in: plan.losing } },
        { $set: { assignedTo: reassignTo } },
        { session }
      );
      reassigned = res.modifiedCount || 0;
    }
    const res = await Lead.updateMany(
      { globalTableId: table._id },
      { $set: { product: fields.product, productLocation: fields.productLocation, district: fields.district, mandal: fields.mandal } },
      { session }
    );
    return { table: moved, movedLeads: res.matchedCount || 0, reassigned };
  });
};

module.exports = {
  ServiceError,
  toHttpError,
  // tables
  createTable,
  getTables,
  getTableById,
  updateTable,
  deleteTable,
  // fields
  createField,
  getFields,
  getFieldById,
  updateField,
  deleteField,
  // values
  createValue,
  getValues,
  getValueById,
  updateValue,
  upsertValue,
  deleteValue,
  // records
  listRecords,
  deleteRecords,
  // table lifecycle (Mandal tables)
  reactivateTable,
  deleteTablePermanently,
  previewTableMove,
  moveTable,
  getRecordById,
  createRecord,
  updateRecord,
  deleteRecord,
  // exposed for tests / future phases (imports, filters)
  resolveTableContext,
  resolveTableScope,
  attachValues,
  withTransaction,
  normalizeValue,
  computeFormulaValues,
  getTableRecordIds,
};