/**
 * globalTableValidator.js
 * ---------------------------------------------------------------------------
 * Request-level validation for GlobalTable endpoints.
 *
 * Contract:
 *   - Validated + whitelisted body  -> req.validated
 *   - Validated query               -> req.validatedQuery
 *   (req.query is never mutated; it is read-only in Express 5.)
 *
 * Error shape matches leadController.createLead:
 *   { message: 'Validation failed', errors: [{ field, message }] }
 *
 * This file also exports small helpers reused by the field/value validators.
 * ---------------------------------------------------------------------------
 */

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;
const TABLE_KEY_RE = /^[a-z][a-z0-9_-]{1,59}$/;
const ENTITY_RE = /^[a-z][a-z0-9_-]{1,39}$/;

/* ----------------------------- helpers ---------------------------------- */

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const isObjectId = (v) => typeof v === 'string' && OBJECT_ID_RE.test(v);

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const sendValidationError = (res, errors) =>
  res.status(400).json({ message: 'Validation failed', errors });

/** 'true' | 'false' | true | false -> boolean, anything else -> undefined */
const parseBoolean = (v) => {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
};

/**
 * Validates ?page & ?limit. Pushes into `errors`, returns normalized numbers.
 */
const readPagination = (query, errors, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  let page = 1;
  let limit = defaultLimit;

  if (query.page !== undefined) {
    page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) {
      errors.push({ field: 'page', message: 'page must be a positive integer' });
      page = 1;
    }
  }
  if (query.limit !== undefined) {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
      errors.push({ field: 'limit', message: `limit must be an integer between 1 and ${maxLimit}` });
      limit = defaultLimit;
    }
  }
  return { page, limit };
};

/** Validates an optional string with length bounds; returns trimmed value. */
const readString = (body, field, errors, { required = false, min = 0, max = 500 } = {}) => {
  if (!has(body, field) || body[field] === undefined) {
    if (required) errors.push({ field, message: `${field} is required` });
    return undefined;
  }
  if (typeof body[field] !== 'string') {
    errors.push({ field, message: `${field} must be a string` });
    return undefined;
  }
  const v = body[field].trim();
  if (required && !v) {
    errors.push({ field, message: `${field} is required` });
    return undefined;
  }
  if (v.length < min) {
    errors.push({ field, message: `${field} must be at least ${min} characters` });
    return undefined;
  }
  if (v.length > max) {
    errors.push({ field, message: `${field} cannot exceed ${max} characters` });
    return undefined;
  }
  return v;
};

const readBoolean = (body, field, errors) => {
  if (!has(body, field) || body[field] === undefined) return undefined;
  if (typeof body[field] !== 'boolean') {
    errors.push({ field, message: `${field} must be a boolean (true/false)` });
    return undefined;
  }
  return body[field];
};

const bodyMustBeObject = (req, res) => {
  if (!isPlainObject(req.body)) {
    res.status(400).json({ message: 'Request body must be a JSON object' });
    return false;
  }
  return true;
};

/* --------------------------- shared middleware -------------------------- */

/** Validates :id route param as an ObjectId. */
const validateIdParam = (req, res, next) => {
  if (!isObjectId(req.params.id)) {
    return res.status(400).json({ message: `Invalid id: ${req.params.id}` });
  }
  next();
};

const validateScopedTableParams = (req, res, next) => {
  for (const name of ['productId', 'locationId', 'tableId']) {
    if (req.params[name] !== undefined && !isObjectId(req.params[name])) {
      return res.status(400).json({ message: `Invalid ${name}: ${req.params[name]}` });
    }
  }
  next();
};

/** Validates ?force=true|false on DELETE routes. */
const validateDeleteQuery = (req, res, next) => {
  const force = req.query.force === undefined ? false : parseBoolean(req.query.force);
  if (force === undefined) {
    return sendValidationError(res, [{ field: 'force', message: 'force must be true or false' }]);
  }
  req.validatedQuery = { force };
  next();
};

/* --------------------------- table middleware --------------------------- */

const buildTableBody = (body, { partial }) => {
  const errors = [];
  const data = {};
  const scoped = !partial && (has(body, 'product') || has(body, 'location'));

  if (scoped) {
    if (!isObjectId(body.product)) errors.push({ field: 'product', message: 'product must be a valid id' });
    else data.product = body.product;
    if (!isObjectId(body.location)) errors.push({ field: 'location', message: 'location must be a valid id' });
    else data.location = body.location;
  }

  const name = readString(body, 'name', errors, { required: !partial, min: 2, max: 100 });
  if (name !== undefined) data.name = name;

  const description = readString(body, 'description', errors, { max: 500 });
  if (description !== undefined) data.description = description;

  const isActive = readBoolean(body, 'isActive', errors);
  if (isActive !== undefined) data.isActive = isActive;

  // key & entity: required on create. On update they are accepted ONLY so the
  // service can reject an attempted change with a clear message (immutable).
  const rawKey = readString(body, 'key', errors, { required: !partial && !scoped, max: 60 });
  if (rawKey !== undefined) {
    const key = rawKey.toLowerCase();
    if (!TABLE_KEY_RE.test(key)) {
      errors.push({
        field: 'key',
        message: 'key must be 2-60 chars: lowercase letters, numbers, "_" or "-", starting with a letter',
      });
    } else {
      data.key = key;
    }
  }

  const rawEntity = readString(body, 'entity', errors, { required: !partial && !scoped, max: 40 });
  if (rawEntity !== undefined) {
    const entity = rawEntity.toLowerCase();
    if (!ENTITY_RE.test(entity)) {
      errors.push({
        field: 'entity',
        message: 'entity must be 2-40 chars: lowercase letters, numbers, "_" or "-", starting with a letter',
      });
    } else {
      data.entity = entity;
    }
  }
  if (scoped && rawEntity === undefined) data.entity = 'lead';

  return { data, errors };
};

const validateCreateTable = (req, res, next) => {
  if (!bodyMustBeObject(req, res)) return;
  const body = { ...req.body };
  if (req.params.productId !== undefined || req.params.locationId !== undefined) {
    body.product = req.params.productId;
    body.location = req.params.locationId;
  }
  const { data, errors } = buildTableBody(body, { partial: false });
  if (errors.length) return sendValidationError(res, errors);
  req.validated = data;
  next();
};

const validateUpdateTable = (req, res, next) => {
  if (!bodyMustBeObject(req, res)) return;
  const { data, errors } = buildTableBody(req.body, { partial: true });
  if (errors.length) return sendValidationError(res, errors);
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: 'No updatable fields provided' });
  }
  req.validated = data;
  next();
};

const validateListTables = (req, res, next) => {
  const errors = [];
  const q = {};

  const { page, limit } = readPagination(req.query, errors);
  q.page = page;
  q.limit = limit;

  if (req.query.entity !== undefined) {
    const entity = String(req.query.entity).trim().toLowerCase();
    if (!ENTITY_RE.test(entity)) errors.push({ field: 'entity', message: 'Invalid entity' });
    else q.entity = entity;
  }
  if (req.query.product !== undefined || req.query.location !== undefined) {
    if (!isObjectId(req.query.product)) errors.push({ field: 'product', message: 'product must be a valid id' });
    else q.product = req.query.product;
    if (!isObjectId(req.query.location)) errors.push({ field: 'location', message: 'location must be a valid id' });
    else q.location = req.query.location;
  }
  if (req.query.isActive !== undefined) {
    const v = parseBoolean(req.query.isActive);
    if (v === undefined) errors.push({ field: 'isActive', message: 'isActive must be true or false' });
    else q.isActive = v;
  }
  if (req.query.search !== undefined) {
    const s = String(req.query.search).trim();
    if (s.length > 100) errors.push({ field: 'search', message: 'search cannot exceed 100 characters' });
    else if (s) q.search = s;
  }

  if (errors.length) return sendValidationError(res, errors);
  req.validatedQuery = q;
  next();
};

module.exports = {
  validateCreateTable,
  validateUpdateTable,
  validateListTables,
  validateIdParam,
  validateScopedTableParams,
  validateDeleteQuery,
  // shared helpers
  helpers: {
    OBJECT_ID_RE,
    isPlainObject,
    isObjectId,
    has,
    parseBoolean,
    readPagination,
    readString,
    readBoolean,
    bodyMustBeObject,
    sendValidationError,
  },
};