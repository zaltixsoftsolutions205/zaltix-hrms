/**
 * leadAdapter.js
 * ---------------------------------------------------------------------------
 * Lets the generic GlobalTable system talk to the Lead model.
 *
 * Native Lead fields: name, assignedTo, district, mandal, product, pipelineStage,
 * followUpDate (+ _id, createdAt, updatedAt). Everything else a table shows is
 * a GlobalTable custom value, stored by globalTableService, never on the Lead.
 *
 * READS go straight to the Lead model (read-only queries, same access rule as
 * leadController.ownerFilter). A projection keeps legacy fields that may still
 * exist on old MongoDB documents out of the results.
 *
 * WRITES (create / update / delete) NEVER touch the Lead model directly. They
 * call the leadController handlers, so the CRM rules run exactly as they do for
 * the CRM screens:
 *   - createLead   : name / assignedTo / stage / follow-up validation
 *   - updateLead   : same validation, ownership check, assignedTo optional (can be cleared)
 *   - deleteLead   : ownership check, delete
 * leadController is coupled to Express (req, res), so the adapter calls its
 * handlers with a minimal req and a capturing res (see `invoke`). Any 4xx/5xx
 * the controller produces is re-thrown as an adapter error carrying the
 * controller's own message.
 *
 * TRANSACTIONS
 * Every operation receives an optional context { user, session, afterCommit }
 * from the Global Table service. The SAME session is handed to every controller
 * call through req.mongoSession (and afterCommit through req.afterCommit), so
 * the controller's writes join the service's transaction. The adapter never
 * creates, commits or aborts a session, and never swallows an error.
 *
 * Access rule (mirrors leadController.ownerFilter, both via crmScopeService):
 *   admin / hr / manager -> every lead
 *   sales / inside-sales / product-executive -> every lead in their territory
 *   everyone else -> only leads assignedTo them.
 * ---------------------------------------------------------------------------
 */

const Lead = require('../models/Lead');
const leadController = require('../controllers/leadController');
const crmScope = require('../services/crmScopeService');

const ENTITY = 'lead';
const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

/* --------------------------- native field rules -------------------------- */

// The business fields. productLocation (a Mandal) can be chosen when a lead is
// created in a table without its own product/location; it is fixed afterwards.
const CREATABLE_FIELDS = ['name', 'assignedTo', 'district', 'mandal', 'product', 'productLocation', 'pipelineStage', 'followUpDate'];

const MUTABLE_FIELDS = CREATABLE_FIELDS.filter((key) => key !== 'productLocation');

// Fields a product/location table sets itself
const TABLE_MANAGED_FIELDS = ['product', 'productLocation', 'district', 'mandal'];

// Set by mongoose, never written directly
const READ_ONLY_FIELDS = ['createdAt', 'updatedAt', '_id', 'createdBy'];

// Same whitelist as leadController.getLeads
const SORTABLE_FIELDS = ['name', 'district', 'mandal', 'pipelineStage', 'followUpDate', 'createdAt', 'updatedAt'];

const DEFAULT_POPULATE = [
  { path: 'assignedTo', select: 'name email role' },
  { path: 'product', select: 'name status productType' },
];

/* ------------------------------- errors ---------------------------------- */

const adapterError = (statusCode, message, details) => {
  const err = new Error(message);
  err.name = 'AdapterError';
  err.isAdapterError = true;
  err.statusCode = statusCode;
  if (details !== undefined) err.details = details;
  return err;
};

/* -------------------------------- access --------------------------------- */

const hasFullAccess = (user) => crmScope.hasFullScope(user);

const accessFilter = (user, bypassAccess) => {
  if (bypassAccess) return {};
  if (!user) throw new Error('leadAdapter: user is required (or pass bypassAccess: true)');
  return crmScope.leadFilter(user);
};

const isValidRecordId = (id) => OBJECT_ID_RE.test(String(id));

/* ------------------------------- records --------------------------------- */

const recordExists = async (recordId, { user, bypassAccess = false, session = null } = {}) => {
  if (!isValidRecordId(recordId)) return false;
  const found = await Lead.exists({ _id: recordId, ...accessFilter(user, bypassAccess) }).session(session);
  return !!found;
};

const getRecord = async (recordId, { user, bypassAccess = false, select, populate, session = null } = {}) => {
  if (!isValidRecordId(recordId)) return null;
  let q = Lead.findOne({ _id: recordId, ...accessFilter(user, bypassAccess) })
    .select(select || Lead.SELECT_FIELDS)
    .session(session);
  const effectivePopulate = populate === undefined ? DEFAULT_POPULATE : populate;
  if (effectivePopulate) q = q.populate(effectivePopulate);
  return q.lean();
};

/**
 * `filter` is a plain Mongo filter on Lead main fields. The access filter is
 * AND-ed in so it can never be overridden.
 * populate: undefined -> assignedTo (name email role); null -> none.
 */
const getRecords = async ({
  user,
  bypassAccess = false,
  filter = {},
  select,
  populate,
  sort = { createdAt: -1 },
  page = 1,
  limit = 20,
} = {}) => {
  const access = accessFilter(user, bypassAccess);
  const finalFilter = Object.keys(access).length ? { $and: [filter, access] } : filter;

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const effectivePopulate = populate === undefined ? DEFAULT_POPULATE : populate;

  // _id breaks ties so skip/limit paging is stable (no repeated or missing leads).
  const stableSort = { ...sort, _id: sort._id ?? -1 };

  let q = Lead.find(finalFilter)
    .select(select || Lead.SELECT_FIELDS)
    .sort(stableSort)
    .skip((safePage - 1) * safeLimit)
    .limit(safeLimit);
  if (effectivePopulate) q = q.populate(effectivePopulate);

  const [items, total] = await Promise.all([q.lean(), Lead.countDocuments(finalFilter)]);
  return { items, total, page: safePage, limit: safeLimit };
};

/** Specific leads by id, restricted to what this user may see. */
const getRecordsByIds = async (ids, { user, bypassAccess = false, select } = {}) => {
  const valid = (ids || []).filter(isValidRecordId);
  if (valid.length === 0) return [];
  return Lead.find({ _id: { $in: valid }, ...accessFilter(user, bypassAccess) })
    .select(select || Lead.SELECT_FIELDS)
    .lean();
};

const getScopedRecordIds = (filter, { user, bypassAccess = false } = {}) => {
  const access = accessFilter(user, bypassAccess);
  const finalFilter = Object.keys(access).length ? { $and: [filter, access] } : filter;
  return Lead.find(finalFilter).distinct('_id');
};

/** Ids of every lead this user may see. Used to scope value listings. */
const getAccessibleRecordIds = (user) => Lead.find(accessFilter(user, false)).distinct('_id');

/** Subset of `ids` this user may see (used by the bulk recordIds filter). */
const filterAccessibleRecordIds = (ids, user) =>
  Lead.find({ _id: { $in: ids }, ...accessFilter(user, false) }).distinct('_id');

/* --------------------- calling the existing controller ------------------- */

/**
 * Runs an Express handler without HTTP.
 *
 * CONTRACT: resolves with { status, body } the first time the handler calls
 * res.json()/res.send(); `status` is the HTTP-style code (200 unless the
 * handler called res.status()). It REJECTS if the handler throws / rejects or
 * finishes without responding.
 *
 * `session`     -> req.mongoSession (the service's transaction session)
 * `afterCommit` -> req.afterCommit (callbacks the service runs after commit)
 */
const invoke = (handler, { user, params = {}, body = {}, query = {}, session = null, afterCommit, globalTableScope, globalTableMembership } = {}) =>
  new Promise((resolve, reject) => {
    let statusCode = 200;
    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve({ status: statusCode, body: payload });
    };

    const res = {
      status(code) { statusCode = code; return res; },
      json(payload) { finish(payload); return res; },
      send(payload) { finish(payload); return res; },
    };
    const req = { user, params, body, query, headers: {} };
    if (globalTableScope) req.globalTableScope = globalTableScope;
    if (globalTableMembership) req.globalTableMembership = globalTableMembership;
    if (session) req.mongoSession = session;
    if (afterCommit) req.afterCommit = afterCommit;

    Promise.resolve(handler(req, res))
      .then(() => {
        if (!settled) reject(new Error('Lead handler finished without a response'));
      })
      .catch(reject);
  });

/**
 * Consumes EXACTLY what invoke() returns ({ status, body }).
 *   status >= 400  -> adapter error carrying the controller's own message
 *   rejection      -> propagates unchanged (keeps Mongo's retry labels)
 *   otherwise      -> returns the response body
 */
const callController = async (handler, ctx) => {
  const { status, body } = await invoke(handler, ctx);
  if (status >= 400) {
    throw adapterError(status, (body && body.message) || 'Lead operation failed', body && body.errors);
  }
  return body;
};

const pick = (obj, keys) =>
  keys.reduce((acc, k) => (Object.prototype.hasOwnProperty.call(obj, k) ? { ...acc, [k]: obj[k] } : acc), {});

/* ------------------------------ write ops -------------------------------- */

/** Validates the keys of an update payload and returns the editable subset. */
const validateUpdateFields = (fields) => {
  const keys = Object.keys(fields || {});
  if (keys.length === 0) throw adapterError(400, 'No native fields provided');

  const readOnly = keys.filter((k) => READ_ONLY_FIELDS.includes(k));
  if (readOnly.length) throw adapterError(400, `Read-only field(s) cannot be edited: ${readOnly.join(', ')}`);

  const unknown = keys.filter((k) => !MUTABLE_FIELDS.includes(k));
  if (unknown.length) throw adapterError(400, `Unknown lead field(s): ${unknown.join(', ')}`);

  return pick(fields, MUTABLE_FIELDS);
};

/**
 * Creates a REAL lead through leadController.createLead, inside the caller's
 * transaction when `session` is given. Returns the populated lead.
 */
const createRecord = async (fields, { user, session = null, afterCommit, table, systemFields = {} } = {}) => {
  const keys = Object.keys(fields || {});
  const rejected = keys.filter((k) => !CREATABLE_FIELDS.includes(k));
  if (rejected.length) {
    throw adapterError(400, `Cannot set field(s) when creating a lead: ${rejected.join(', ')}`);
  }
  if (table?.product && keys.some((key) => TABLE_MANAGED_FIELDS.includes(key))) {
    throw adapterError(400, 'Product, Address, and Mandal are managed by this table');
  }
  // Who may be assigned is checked by leadController (territory rules).
  return callController(leadController.createLead, {
    user,
    body: { ...pick(fields, CREATABLE_FIELDS), ...systemFields },
    session,
    afterCommit,
    globalTableManagedWrite: true,
    globalTableScope: table?.product ? { product: String(table.product), location: String(table.location) } : undefined,
    globalTableMembership: table ? { tableId: String(table._id) } : undefined,
  });
};

/**
 * Updates native lead fields through leadController.updateLead (one call, so a
 * single save). With a session the call shares it: a failure is thrown to the
 * service and the whole transaction is aborted.
 */
const updateRecord = async (recordId, fields, { user, session = null, afterCommit, table, systemFields = {} } = {}) => {
  const suppliedFields = fields || {};
  if (table?.product && Object.keys(fields || {}).some((key) => TABLE_MANAGED_FIELDS.includes(key))) {
    throw adapterError(400, 'Product, Address, and Mandal are managed by this table');
  }
  const body = Object.keys(suppliedFields).length ? validateUpdateFields(suppliedFields) : {};
  Object.assign(body, systemFields);

  // Uniform ownership check
  if (!(await recordExists(recordId, { user, session }))) throw adapterError(404, 'Record not found');

  await callController(leadController.updateLead, {
    user,
    params: { id: String(recordId) },
    body,
    session,
    afterCommit,
    globalTableScope: table?.product ? { product: String(table.product), location: String(table.location) } : undefined,
    globalTableMembership: table ? { tableId: String(table._id) } : undefined,
  });

  return getRecord(recordId, { user, populate: DEFAULT_POPULATE, session });
};

/** Deletes the REAL lead through leadController.deleteLead (same session). */
const deleteRecord = async (recordId, { user, session = null, afterCommit, table } = {}) => {
  if (!(await recordExists(recordId, { user, session }))) throw adapterError(404, 'Record not found');
  await callController(leadController.deleteLead, {
    user,
    params: { id: String(recordId) },
    session,
    afterCommit,
    globalTableManagedWrite: true,
    globalTableMembership: table ? { tableId: String(table._id) } : undefined,
  });
};

/* ----------------------------- main fields ------------------------------- */

/**
 * Descriptors for the fields that live on the Lead model. Only real schema
 * paths are listed. The pipeline stage options are read from the model's
 * single source of truth, never copied.
 *
 * `type` uses GlobalTableField type names so filters / imports / views /
 * formulas can treat main fields and custom fields uniformly.
 * `readOnly` marks fields written only by mongoose.
 */
const getMainFields = () => [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'assignedTo', label: 'Assigned To', type: 'person', required: false }, // optional: a sales user, set later is fine
  { key: 'district', label: 'District', type: 'text' },
  { key: 'mandal', label: 'Mandal', type: 'text' },
  // Reference to a Product record (validated by leadController: must exist and be active)
  { key: 'product', label: 'Product', type: 'reference' },
  {
    key: 'pipelineStage',
    label: 'Pipeline Stage',
    type: 'single-select',
    options: Lead.PIPELINE_STAGES.map((v) => ({ label: v, value: v })),
  },
  { key: 'followUpDate', label: 'Follow-up Date', type: 'date' },
  { key: 'createdAt', label: 'Created At', type: 'datetime', readOnly: true },
  { key: 'updatedAt', label: 'Updated At', type: 'datetime', readOnly: true },
].map((f) => ({ ...f, isMain: true }));

module.exports = {
  entity: ENTITY,
  capabilities: { create: true, update: true, delete: true },
  sortableFields: SORTABLE_FIELDS,
  mutableFields: MUTABLE_FIELDS,
  isValidRecordId,
  hasFullAccess,
  recordExists,
  getRecord,
  getRecords,
  getRecordsByIds,
  getScopedRecordIds,
  getAccessibleRecordIds,
  filterAccessibleRecordIds,
  createRecord,
  updateRecord,
  deleteRecord,
  getMainFields,
};