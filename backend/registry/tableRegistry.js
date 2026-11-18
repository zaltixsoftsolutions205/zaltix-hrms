/**
 * tableRegistry.js
 * ---------------------------------------------------------------------------
 * Central map:  GlobalTable.entity  ->  { adapter, moduleKey, label, capabilities }
 *
 *   GlobalTable { entity: 'lead' } -> tableRegistry -> leadAdapter -> Lead model
 *
 * moduleKey is the project's module-permission key (constants/modules) that
 * guards the entity: view = canAccessModule, edit = canEditModule.
 *
 * ADAPTER CONTRACT
 *   Required (checked at startup; a bad adapter throws immediately):
 *     recordExists(recordId, { user })
 *     getRecord(recordId, { user, ... })
 *     getRecords({ user, filter, sort, page, limit, ... })
 *     getAccessibleRecordIds(user)
 *     filterAccessibleRecordIds(ids, user)
 *     hasFullAccess(user)
 *     getMainFields()
 *   Optional capabilities (declared via adapter.capabilities = { create, update, delete }
 *   AND implemented as a function). An entity that lacks one gets a clear 501
 *   from the service, never a silent success:
 *     createRecord(nativeFields, { user })
 *     updateRecord(recordId, nativeFields, { user })
 *     deleteRecord(recordId, { user })
 *   Optional helpers used by formulas / listings:
 *     getRecordsByIds(ids, { user, select })
 *     sortableFields: string[]
 *
 * Only entities with a real model, a real adapter and a real permission module
 * are registered. Employee / Department / Leave are NOT registered: none of
 * their models or business logic exist in this codebase yet. To add one, write
 * its adapter and add a single register() call below.
 * ---------------------------------------------------------------------------
 */

const leadAdapter = require('../adapters/leadAdapter');

const REQUIRED_METHODS = [
  'recordExists',
  'getRecord',
  'getRecords',
  'getAccessibleRecordIds',
  'filterAccessibleRecordIds',
  'hasFullAccess',
  'getMainFields',
];

const CAPABILITY_METHODS = {
  create: 'createRecord',
  update: 'updateRecord',
  delete: 'deleteRecord',
};

const ENTITIES = {};

const normalize = (entity) => String(entity || '').trim().toLowerCase();

const computeCapabilities = (adapter) => {
  const declared = adapter.capabilities || {};
  const out = {};
  Object.entries(CAPABILITY_METHODS).forEach(([cap, method]) => {
    out[cap] = declared[cap] === true && typeof adapter[method] === 'function';
  });
  return Object.freeze(out);
};

// moduleKeys: every module that grants access (default: [moduleKey]).
const register = ({ entity, label, moduleKey, moduleKeys, adapter }) => {
  const key = normalize(entity);
  if (!key || !label || !moduleKey || !adapter) {
    throw new Error('tableRegistry.register: entity, label, moduleKey and adapter are required');
  }
  if (ENTITIES[key]) throw new Error(`tableRegistry: entity "${key}" is already registered`);

  const missing = REQUIRED_METHODS.filter((m) => typeof adapter[m] !== 'function');
  if (missing.length) {
    throw new Error(`tableRegistry: adapter for "${key}" is missing required method(s): ${missing.join(', ')}`);
  }

  ENTITIES[key] = Object.freeze({
    entity: key,
    label,
    moduleKey,
    moduleKeys: Object.freeze(moduleKeys || [moduleKey]),
    adapter,
    capabilities: computeCapabilities(adapter),
  });
};

/* ------------------------------ registrations ---------------------------- */

// Leads: the CRM page ('crm') and the Leads page ('lead') both work on them.
register({ entity: 'lead', label: 'Lead', moduleKey: 'crm', moduleKeys: ['crm', 'lead'], adapter: leadAdapter });

/* --------------------------------- API ----------------------------------- */

const isRegisteredEntity = (entity) =>
  Object.prototype.hasOwnProperty.call(ENTITIES, normalize(entity));

/** Full config for an entity, or null when it is not registered. */
const getEntityConfig = (entity) =>
  isRegisteredEntity(entity) ? ENTITIES[normalize(entity)] : null;

const getAdapter = (entity) => {
  const cfg = getEntityConfig(entity);
  return cfg ? cfg.adapter : null;
};

const listEntities = () =>
  Object.values(ENTITIES).map(({ entity, label, moduleKey, moduleKeys, capabilities }) => ({
    entity,
    label,
    moduleKey,
    moduleKeys,
    capabilities,
  }));

module.exports = { isRegisteredEntity, getEntityConfig, getAdapter, listEntities };