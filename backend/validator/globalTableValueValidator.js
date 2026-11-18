/**
 * globalTableValueValidator.js
 * ---------------------------------------------------------------------------
 * Request-level validation for GlobalTableValue endpoints AND for the
 * record endpoints (/global-tables/:id/records...), which carry values.
 *
 * Only checks the request SHAPE. Whether a value is valid for the field's type
 * (number vs email vs select option vs existing user...) is business
 * validation done in globalTableService, where the field definition exists.
 *
 * CLEARING A CELL
 *   A value is "cleared" by sending  value: null  (an empty string and an
 *   empty array are treated as null by the service). This keeps the value
 *   document with value = null; it never touches the native record or the
 *   field definition. Required fields reject clearing (400). A checkbox
 *   clears to false.
 *   DELETE /global-table-values/:id removes the stored value document and
 *   also reads as empty; it is refused for required fields.
 *
 * Formula fields are never written: the service rejects them (400) because
 * their value is calculated from the expression, not stored.
 * ---------------------------------------------------------------------------
 */

const {
  helpers: {
    isObjectId,
    isPlainObject,
    has,
    parseBoolean,
    readPagination,
    bodyMustBeObject,
    sendValidationError,
  },
} = require('./globalTableValidator');

const MAX_STRING = 10000;
const MAX_ARRAY = 200;
const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,49}$/;
const MAX_NATIVE_KEYS = 30;
const MAX_CUSTOM_KEYS = 100;

/** Returns an error message, or null when the shape is acceptable. */
const checkValueShape = (value) => {
  if (value === undefined) return 'value is required (use null to clear)';
  if (value === null) return null;

  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `value cannot exceed ${MAX_STRING} characters` : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? null : 'value must be a finite number';
  }
  if (typeof value === 'boolean') return null;

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY) return `value cannot contain more than ${MAX_ARRAY} items`;
    return value.every((v) => typeof v === 'string' && v.length <= 200)
      ? null
      : 'array values must contain only strings (max 200 characters each)';
  }
  return 'value must be a string, number, boolean, array of strings, or null';
};

/* ----------------------------- value routes ------------------------------ */

/** create + upsert share the same body: tableId, fieldId, recordId, value */
const validateValueBody = (req, res, next) => {
  if (!bodyMustBeObject(req, res)) return;
  const errors = [];
  const { tableId, fieldId, recordId } = req.body;

  if (!isObjectId(tableId)) errors.push({ field: 'tableId', message: 'tableId must be a valid id' });
  if (!isObjectId(fieldId)) errors.push({ field: 'fieldId', message: 'fieldId must be a valid id' });
  if (!isObjectId(recordId)) errors.push({ field: 'recordId', message: 'recordId must be a valid id' });

  const valueError = checkValueShape(has(req.body, 'value') ? req.body.value : undefined);
  if (valueError) errors.push({ field: 'value', message: valueError });

  if (errors.length) return sendValidationError(res, errors);
  req.validated = { tableId, fieldId, recordId, value: req.body.value };
  next();
};

/** update: only `value` can change; tableId/fieldId/recordId are identity. */
const validateUpdateValue = (req, res, next) => {
  if (!bodyMustBeObject(req, res)) return;
  const valueError = checkValueShape(has(req.body, 'value') ? req.body.value : undefined);
  if (valueError) return sendValidationError(res, [{ field: 'value', message: valueError }]);
  req.validated = { value: req.body.value };
  next();
};

const validateListValues = (req, res, next) => {
  const errors = [];
  const q = {};

  if (!isObjectId(req.query.tableId)) {
    errors.push({ field: 'tableId', message: 'tableId query parameter is required and must be a valid id' });
  } else {
    q.tableId = req.query.tableId;
  }
  ['fieldId', 'recordId'].forEach((name) => {
    if (req.query[name] === undefined) return;
    if (!isObjectId(req.query[name])) errors.push({ field: name, message: `${name} must be a valid id` });
    else q[name] = req.query[name];
  });

  // recordIds=<id>,<id>,... (bulk fetch for one page of rows; max 200)
  if (req.query.recordIds !== undefined) {
    const ids = String(req.query.recordIds).split(',').map((s) => s.trim()).filter(Boolean);
    if (q.recordId) {
      errors.push({ field: 'recordIds', message: 'Use either recordId or recordIds, not both' });
    } else if (ids.length === 0 || ids.length > 200) {
      errors.push({ field: 'recordIds', message: 'recordIds must contain 1-200 ids' });
    } else if (!ids.every(isObjectId)) {
      errors.push({ field: 'recordIds', message: 'recordIds must all be valid ids' });
    } else {
      q.recordIds = [...new Set(ids)];
    }
  }

  // includeComputed=true adds calculated formula values for the requested records
  if (req.query.includeComputed !== undefined) {
    const v = parseBoolean(req.query.includeComputed);
    if (v === undefined) {
      errors.push({ field: 'includeComputed', message: 'includeComputed must be true or false' });
    } else if (v && !q.recordId && !q.recordIds) {
      errors.push({ field: 'includeComputed', message: 'includeComputed requires recordId or recordIds' });
    } else {
      q.includeComputed = v;
    }
  }

  const { page, limit } = readPagination(req.query, errors, { defaultLimit: 100, maxLimit: 500 });
  q.page = page;
  q.limit = limit;

  if (errors.length) return sendValidationError(res, errors);
  req.validatedQuery = q;
  next();
};

/* ---------------------------- record routes ------------------------------ */

const validateRecordParams = (req, res, next) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: `Invalid table id: ${req.params.id}` });
  if (!isObjectId(req.params.recordId)) return res.status(400).json({ message: `Invalid record id: ${req.params.recordId}` });
  next();
};

/** `native`: fields of the entity itself. Scalars only (ids are strings). */
const readNative = (body, errors) => {
  if (!has(body, 'native') || body.native === undefined) return undefined;
  if (!isPlainObject(body.native)) {
    errors.push({ field: 'native', message: 'native must be an object of entity fields' });
    return undefined;
  }
  const keys = Object.keys(body.native);
  if (keys.length > MAX_NATIVE_KEYS) {
    errors.push({ field: 'native', message: `native cannot contain more than ${MAX_NATIVE_KEYS} fields` });
    return undefined;
  }
  const out = {};
  keys.forEach((k) => {
    const v = body.native[k];
    const ok = v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))
      || (typeof v === 'string' && v.length <= MAX_STRING);
    if (!ok) errors.push({ field: `native.${k}`, message: 'must be a string, number, boolean or null' });
    else out[k] = v;
  });
  return out;
};

/** `customValues`: { <field key>: value } */
const readCustomValues = (body, errors) => {
  if (!has(body, 'customValues') || body.customValues === undefined) return undefined;
  if (!isPlainObject(body.customValues)) {
    errors.push({ field: 'customValues', message: 'customValues must be an object keyed by field key' });
    return undefined;
  }
  const keys = Object.keys(body.customValues);
  if (keys.length > MAX_CUSTOM_KEYS) {
    errors.push({ field: 'customValues', message: `customValues cannot contain more than ${MAX_CUSTOM_KEYS} fields` });
    return undefined;
  }
  const out = {};
  keys.forEach((k) => {
    if (!FIELD_KEY_RE.test(k)) {
      errors.push({ field: `customValues.${k}`, message: 'invalid field key' });
      return;
    }
    const msg = checkValueShape(body.customValues[k]);
    if (msg) errors.push({ field: `customValues.${k}`, message: msg });
    else out[k] = body.customValues[k];
  });
  return out;
};

const validateListRecords = (req, res, next) => {
  const errors = [];
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: `Invalid table id: ${req.params.id}` });

  const q = {};
  const { page, limit } = readPagination(req.query, errors, { defaultLimit: 20, maxLimit: 100 });
  q.page = page;
  q.limit = limit;

  if (req.query.sortBy !== undefined) {
    const s = String(req.query.sortBy).trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(s)) errors.push({ field: 'sortBy', message: 'Invalid sortBy' });
    else q.sortBy = s; // whitelisted per entity in the service
  }
  if (req.query.sortOrder !== undefined) {
    const o = String(req.query.sortOrder).toLowerCase();
    if (o !== 'asc' && o !== 'desc') errors.push({ field: 'sortOrder', message: 'sortOrder must be asc or desc' });
    else q.sortOrder = o;
  }
  if (req.query.search !== undefined) {
    const text = String(req.query.search).trim();
    if (text.length > 100) errors.push({ field: 'search', message: 'search must be at most 100 characters' });
    else if (text) q.search = text; // lead name or assignee name, matched in the service
  }

  if (errors.length) return sendValidationError(res, errors);
  req.validatedQuery = q;
  next();
};

const validateCreateRecord = (req, res, next) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: `Invalid table id: ${req.params.id}` });
  if (!bodyMustBeObject(req, res)) return;
  const errors = [];

  const native = readNative(req.body, errors);
  const customValues = readCustomValues(req.body, errors);

  if (errors.length) return sendValidationError(res, errors);
  req.validated = { native: native || {}, customValues: customValues || {} };
  next();
};

const validateUpdateRecord = (req, res, next) => {
  if (!bodyMustBeObject(req, res)) return;
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: `Invalid table id: ${req.params.id}` });
  if (!isObjectId(req.params.recordId)) return res.status(400).json({ message: `Invalid record id: ${req.params.recordId}` });
  const errors = [];

  const native = readNative(req.body, errors) || {};
  const customValues = readCustomValues(req.body, errors) || {};

  if (errors.length) return sendValidationError(res, errors);
  if (Object.keys(native).length === 0 && Object.keys(customValues).length === 0) {
    return res.status(400).json({ message: 'Provide at least one native field or custom value to update' });
  }
  req.validated = { native, customValues };
  next();
};

module.exports = {
  validateCreateValue: validateValueBody,
  validateUpsertValue: validateValueBody,
  validateUpdateValue,
  validateListValues,
  validateRecordParams,
  validateListRecords,
  validateCreateRecord,
  validateUpdateRecord,
};