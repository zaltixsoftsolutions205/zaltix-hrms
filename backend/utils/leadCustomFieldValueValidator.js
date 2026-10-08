const mongoose = require('mongoose');
const User = require('../models/User');
const { isSupportedEntity, userMatchesEntity } = require('../constants/leadCustomFieldEntities');

class FieldValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FieldValidationError';
    this.statusCode = 400;
  }
}

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/\S+$/i;

/**
 * Validates + normalizes a raw incoming value against a LeadCustomField
 * definition. Returns { valid: true, value: normalizedValue } on success,
 * throws FieldValidationError on failure.
 */
async function validateCustomFieldValue(field, rawValue) {
  switch (field.type) {
    case 'text':
      return validateText(rawValue);
    case 'number':
      return validateNumber(rawValue);
    case 'email':
      return validateEmail(rawValue);
    case 'phone':
      return validatePhone(rawValue);
    case 'date':
    case 'datetime':
      return validateDate(rawValue);
    case 'single-select':
      return validateSingleSelect(field, rawValue);
    case 'multi-select':
      return validateMultiSelect(field, rawValue);
    case 'person':
      return validatePerson(field, rawValue);
    case 'reference':
      return validateReference(field, rawValue);
    case 'checkbox':
      return validateCheckbox(rawValue);
    case 'url':
      return validateUrl(rawValue);
    case 'currency':
      return validateCurrency(rawValue);
    default:
      throw new FieldValidationError(`Unsupported field type: ${field.type}`);
  }
}

function validateText(value) {
  if (value === null || value === undefined) return { valid: true, value: null };
  if (typeof value !== 'string') throw new FieldValidationError('Value must be a string.');
  return { valid: true, value: value.trim() };
}

function validateNumber(value) {
  if (value === null || value === undefined) return { valid: true, value: null };
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new FieldValidationError('Value must be a number.');
  }
  return { valid: true, value };
}

function validateEmail(value) {
  if (value === null || value === undefined) return { valid: true, value: null };
  if (typeof value !== 'string' || !EMAIL_RE.test(value.trim())) {
    throw new FieldValidationError('Value must be a valid email address.');
  }
  return { valid: true, value: value.trim().toLowerCase() };
}

function validatePhone(value) {
  if (value === null || value === undefined) return { valid: true, value: null };
  // Always a string — never coerce to Number (drops leading zeros / '+').
  if (typeof value !== 'string' || !value.trim()) {
    throw new FieldValidationError('Phone value must be a non-empty string.');
  }
  return { valid: true, value: value.trim() };
}

function validateDate(value) {
  if (value === null || value === undefined) return { valid: true, value: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new FieldValidationError('Value must be a valid date.');
  }
  return { valid: true, value: date };
}

function validateSingleSelect(field, value) {
  if (value === null || value === undefined) return { valid: true, value: null };
  const allowed = (field.options || []).map((o) => o.value);
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new FieldValidationError(`Value must be one of: ${allowed.join(', ')}`);
  }
  return { valid: true, value };
}

function validateMultiSelect(field, value) {
  if (value === null || value === undefined) return { valid: true, value: [] };
  if (!Array.isArray(value)) {
    throw new FieldValidationError('Value must be an array for multi-select.');
  }
  const allowed = (field.options || []).map((o) => o.value);
  const unique = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.includes(item)) {
      throw new FieldValidationError(`Invalid option "${item}". Allowed: ${allowed.join(', ')}`);
    }
    unique.add(item);
  }
  if (unique.size !== value.length) {
    throw new FieldValidationError('Duplicate values are not allowed in multi-select.');
  }
  return { valid: true, value: Array.from(unique) };
}

async function validatePerson(field, value) {
  if (value === null || value === undefined) return { valid: true, value: null };
  if (!isValidObjectId(value)) {
    throw new FieldValidationError('Value must be a valid user ID.');
  }
  const user = await User.findById(value);
  if (!user) throw new FieldValidationError('Referenced user does not exist.');
  if (user.isActive === false) throw new FieldValidationError('Referenced user is not active.');

  if (field.entity) {
    if (!isSupportedEntity(field.entity)) {
      throw new FieldValidationError(`Unsupported entity "${field.entity}" configured on this field.`);
    }
    if (!userMatchesEntity(user, field.entity)) {
      throw new FieldValidationError(`Selected user does not belong to entity "${field.entity}".`);
    }
  }

  // Store only the ObjectId — never the display name.
  return { valid: true, value: String(user._id) };
}

async function validateReference(field, value) {
  if (value === null || value === undefined) return { valid: true, value: null };
  if (!isValidObjectId(value)) {
    throw new FieldValidationError('Value must be a valid reference ID.');
  }
  // LeadCustomField does not yet carry enough info (e.g. a `referenceModel`
  // name) to know which collection to check against. Isolated here so a
  // real lookup can be plugged in later without touching the rest of the
  // engine or its callers.
  return { valid: true, value: String(value) };
}

function validateCheckbox(value) {
  if (value === null || value === undefined) return { valid: true, value: false };
  if (typeof value !== 'boolean') {
    throw new FieldValidationError('Value must be true or false.');
  }
  return { valid: true, value };
}

function validateUrl(value) {
  if (value === null || value === undefined) return { valid: true, value: null };
  if (typeof value !== 'string' || !URL_RE.test(value.trim())) {
    throw new FieldValidationError('Value must be a valid http(s) URL.');
  }
  return { valid: true, value: value.trim() };
}

function validateCurrency(value) {
  if (value === null || value === undefined) return { valid: true, value: null };
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new FieldValidationError('Currency value must be a plain number (e.g. 50000), not a formatted string.');
  }
  return { valid: true, value };
}

function enforceRequired(field, normalizedValue) {
  if (!field.required) return;
  const empty =
    normalizedValue === null ||
    normalizedValue === undefined ||
    normalizedValue === '' ||
    (Array.isArray(normalizedValue) && normalizedValue.length === 0);
  if (empty) {
    throw new FieldValidationError(`"${field.name}" is required.`);
  }
}

module.exports = {
  FieldValidationError,
  validateCustomFieldValue,
  enforceRequired,
  isValidObjectId,
};