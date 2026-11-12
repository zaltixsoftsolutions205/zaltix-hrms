/**
 * globalTableFieldValidator.js
 * ---------------------------------------------------------------------------
 * Request-level validation for GlobalTableField endpoints.
 *
 * The list of types comes from the Mongoose model (single source of truth), so
 * the validator can never drift from the schema enum.
 *
 * Cross-document rules live in globalTableService:
 *   - table exists / permissions
 *   - formula expression syntax + that every reference resolves
 *   - option removal vs. stored values, type change vs. stored values
 * ---------------------------------------------------------------------------
 */

const GlobalTableField = require('../models/GlobalTableField');
const {
  helpers: {
    isPlainObject,
    isObjectId,
    has,
    parseBoolean,
    readString,
    readBoolean,
    bodyMustBeObject,
    sendValidationError,
  },
} = require('./globalTableValidator');

const FIELD_TYPES = GlobalTableField.FIELD_TYPES;
const SELECT_TYPES = ['single-select', 'multi-select'];
// Types for which `required: true` has no sensible meaning
const NOT_REQUIRABLE_TYPES = ['checkbox', 'formula'];

const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,49}$/;
const MAX_OPTIONS = 200;
const CONFIG_KEYS = ['expression', 'role'];

/** Validates options shape. Returns normalized options or undefined. */
const readOptions = (body, errors) => {
  if (!has(body, 'options') || body.options === undefined) return undefined;

  if (!Array.isArray(body.options)) {
    errors.push({ field: 'options', message: 'options must be an array' });
    return undefined;
  }
  if (body.options.length > MAX_OPTIONS) {
    errors.push({ field: 'options', message: `options cannot exceed ${MAX_OPTIONS} items` });
    return undefined;
  }

  const seen = new Set();
  const out = [];

  body.options.forEach((opt, i) => {
    const f = `options[${i}]`;
    if (!isPlainObject(opt)) {
      errors.push({ field: f, message: 'each option must be an object { label, value }' });
      return;
    }
    const value = typeof opt.value === 'string' ? opt.value.trim() : '';
    const label = typeof opt.label === 'string' ? opt.label.trim() : value;

    if (!value || value.length > 100) {
      errors.push({ field: `${f}.value`, message: 'option value is required (max 100 characters)' });
      return;
    }
    if (!label || label.length > 100) {
      errors.push({ field: `${f}.label`, message: 'option label must be 1-100 characters' });
      return;
    }
    if (seen.has(value)) {
      errors.push({ field: `${f}.value`, message: `duplicate option value: ${value}` });
      return;
    }
    seen.add(value);
    out.push({ label, value });
  });

  return out;
};

/**
 * Validates `config`.
 *   formula -> { expression }   (required)
 *   person  -> { role }         (optional frontend hint)
 *   others  -> not allowed
 * `type` may be unknown on partial updates; the service then enforces the
 * final type/config combination.
 * Returns the normalized config, `null` (explicit clear) or undefined (absent).
 */
const readConfig = (body, type, errors, { partial }) => {
  const absent = !has(body, 'config') || body.config === undefined;

  if (absent) {
    if (!partial && type === 'formula') {
      errors.push({ field: 'config.expression', message: 'formula fields require config.expression' });
    }
    return undefined;
  }

  if (body.config === null) {
    if (!partial && type === 'formula') {
      errors.push({ field: 'config.expression', message: 'formula fields require config.expression' });
    }
    return null;
  }

  if (!isPlainObject(body.config)) {
    errors.push({ field: 'config', message: 'config must be an object' });
    return undefined;
  }

  const unknown = Object.keys(body.config).filter((k) => !CONFIG_KEYS.includes(k));
  if (unknown.length) {
    errors.push({ field: 'config', message: `unknown config key(s): ${unknown.join(', ')}` });
    return undefined;
  }

  const out = {};
  const cfg = body.config;

  if (cfg.expression !== undefined) {
    if (typeof cfg.expression !== 'string' || !cfg.expression.trim() || cfg.expression.length > 500) {
      errors.push({ field: 'config.expression', message: 'expression must be a non-empty string (max 500 characters)' });
    } else {
      out.expression = cfg.expression.trim();
    }
  }
  if (cfg.role !== undefined) {
    if (typeof cfg.role !== 'string' || cfg.role.trim().length > 50) {
      errors.push({ field: 'config.role', message: 'role must be a string (max 50 characters)' });
    } else if (cfg.role.trim()) {
      out.role = cfg.role.trim();
    }
  }

  if (type) {
    if (type === 'formula' && out.role !== undefined) {
      errors.push({ field: 'config.role', message: 'role is not valid for formula fields' });
    }
    if (type === 'formula' && out.expression === undefined && !partial) {
      errors.push({ field: 'config.expression', message: 'formula fields require config.expression' });
    }
    if (type === 'person' && out.expression !== undefined) {
      errors.push({ field: 'config.expression', message: 'expression is only valid for formula fields' });
    }
    if (type !== 'formula' && type !== 'person' && Object.keys(out).length) {
      errors.push({ field: 'config', message: `config is not supported for ${type} fields` });
    }
  }

  return out;
};

const buildFieldBody = (body, { partial }) => {
  const errors = [];
  const data = {};

  // tableId — required on create; on update accepted only so the service can
  // reject an attempted move to another table.
  if (has(body, 'tableId') && body.tableId !== undefined) {
    if (!isObjectId(body.tableId)) errors.push({ field: 'tableId', message: 'tableId must be a valid id' });
    else data.tableId = body.tableId;
  } else if (!partial) {
    errors.push({ field: 'tableId', message: 'tableId is required' });
  }

  // key — immutable after creation (formulas/filters/imports reference it)
  const key = readString(body, 'key', errors, { required: !partial, max: 50 });
  if (key !== undefined) {
    if (!FIELD_KEY_RE.test(key)) {
      errors.push({
        field: 'key',
        message: 'key must be lowercase snake_case (letters, numbers, "_"), start with a letter, max 50 chars',
      });
    } else {
      data.key = key;
    }
  }

  const label = readString(body, 'label', errors, { required: !partial, min: 1, max: 100 });
  if (label !== undefined) data.label = label;

  if (has(body, 'type') && body.type !== undefined) {
    if (typeof body.type !== 'string' || !FIELD_TYPES.includes(body.type)) {
      errors.push({ field: 'type', message: `type must be one of: ${FIELD_TYPES.join(', ')}` });
    } else {
      data.type = body.type;
    }
  } else if (!partial) {
    errors.push({ field: 'type', message: 'type is required' });
  }

  // appliesTo — where the field is shown (lead column or an activity form).
  // Accepted on update only so the service can reject a change.
  if (has(body, 'appliesTo') && body.appliesTo !== undefined) {
    if (typeof body.appliesTo !== 'string' || !GlobalTableField.APPLIES_TO.includes(body.appliesTo)) {
      errors.push({ field: 'appliesTo', message: `appliesTo must be one of: ${GlobalTableField.APPLIES_TO.join(', ')}` });
    } else {
      data.appliesTo = body.appliesTo;
    }
  }

  const description = readString(body, 'description', errors, { max: 500 });
  if (description !== undefined) data.description = description;

  const options = readOptions(body, errors);
  if (options !== undefined) data.options = options;

  const config = readConfig(body, data.type, errors, { partial });
  if (config !== undefined) data.config = config;

  const required = readBoolean(body, 'required', errors);
  if (required !== undefined) data.required = required;

  const isActive = readBoolean(body, 'isActive', errors);
  if (isActive !== undefined) data.isActive = isActive;

  if (has(body, 'position') && body.position !== undefined) {
    if (!Number.isInteger(body.position) || body.position < 0 || body.position > 10000) {
      errors.push({ field: 'position', message: 'position must be an integer between 0 and 10000' });
    } else {
      data.position = body.position;
    }
  }

  if (data.type) {
    // Select fields must declare options (create only; the service enforces the
    // final type/options combination on update too).
    if (!partial && SELECT_TYPES.includes(data.type) && !(data.options && data.options.length)) {
      errors.push({ field: 'options', message: `${data.type} fields require at least one option` });
    }
    if (data.options && data.options.length && !SELECT_TYPES.includes(data.type)) {
      errors.push({ field: 'options', message: `options are only allowed on select fields (type is ${data.type})` });
    }
    if (data.required === true && NOT_REQUIRABLE_TYPES.includes(data.type)) {
      errors.push({ field: 'required', message: `${data.type} fields cannot be required` });
    }
    if (data.appliesTo && data.appliesTo !== 'lead' && !GlobalTableField.ACTIVITY_FIELD_TYPES.includes(data.type)) {
      errors.push({ field: 'type', message: `${data.type} fields can only be shown in the lead table` });
    }
  }

  return { data, errors };
};

const validateCreateField = (req, res, next) => {
  if (!bodyMustBeObject(req, res)) return;
  const { data, errors } = buildFieldBody(req.body, { partial: false });
  if (errors.length) return sendValidationError(res, errors);
  req.validated = data;
  next();
};

const validateUpdateField = (req, res, next) => {
  if (!bodyMustBeObject(req, res)) return;
  const { data, errors } = buildFieldBody(req.body, { partial: true });
  if (errors.length) return sendValidationError(res, errors);
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: 'No updatable fields provided' });
  }
  req.validated = data;
  next();
};

const validateListFields = (req, res, next) => {
  const errors = [];
  const q = {};

  if (!isObjectId(req.query.tableId)) {
    errors.push({ field: 'tableId', message: 'tableId query parameter is required and must be a valid id' });
  } else {
    q.tableId = req.query.tableId;
  }

  if (req.query.isActive !== undefined) {
    const v = parseBoolean(req.query.isActive);
    if (v === undefined) errors.push({ field: 'isActive', message: 'isActive must be true or false' });
    else q.isActive = v;
  }

  if (errors.length) return sendValidationError(res, errors);
  req.validatedQuery = q;
  next();
};

module.exports = {
  validateCreateField,
  validateUpdateField,
  validateListFields,
  FIELD_TYPES,
  SELECT_TYPES,
};