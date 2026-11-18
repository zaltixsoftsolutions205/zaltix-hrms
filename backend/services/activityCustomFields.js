/**
 * activityCustomFields.js
 * ---------------------------------------------------------------------------
 * Custom fields of the activity forms (Visit, Demo, Data Update, Registration,
 * Feedback). They are GlobalTableFields of the lead's table whose `appliesTo`
 * is the activity's key; they are created with the lead table's "Add field"
 * ("Show in" = that activity).
 *
 * Values live on the activity entry itself: entry.customValues =
 * { <field id>: value }, normalized by the lead table's own rules
 * (globalTableService.normalizeValue). Values of fields that were later
 * deactivated are kept untouched.
 * ---------------------------------------------------------------------------
 */

const GlobalTableField = require('../models/GlobalTableField');
const { normalizeValue, ServiceError } = require('./globalTableService');

const FIELD_INFO = '_id key label type options required description position';

/** Active form fields of `activityKey` for the lead's table, in table order. */
async function fieldsFor(lead, activityKey) {
  const tableId = lead && (lead.globalTableId?._id || lead.globalTableId);
  if (!tableId) return [];
  return GlobalTableField.find({ tableId, appliesTo: activityKey, isActive: true })
    .select(FIELD_INFO)
    .sort({ position: 1, createdAt: 1 })
    .lean();
}

// "Invalid value for field "x" (number): must be a number" -> "must be a number"
const reasonOf = (message) => {
  const i = String(message || '').indexOf('): ');
  return i >= 0 ? message.slice(i + 3) : message;
};

/**
 * body.customValues ({ <field id>: raw }) -> { values, errors }.
 * `previous`: the entry's stored values (on update); values of fields not in
 * `fields` (deactivated / deleted) are carried over.
 */
async function readCustomValues(fields, raw, previous = {}) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const shown = new Set(fields.map((f) => String(f._id)));
  const values = {};
  Object.entries(previous || {}).forEach(([id, v]) => { if (!shown.has(id)) values[id] = v; });

  const errors = [];
  for (const f of fields) {
    const id = String(f._id);
    try {
      // eslint-disable-next-line no-await-in-loop
      const v = await normalizeValue(f, input[id]);
      if (v !== null) values[id] = v;
    } catch (err) {
      const message = /is required$/.test(err.message) ? `${f.label} is required` : `${f.label} ${reasonOf(err.message)}`;
      errors.push({ field: `custom.${id}`, message });
    }
  }
  return { values, errors };
}

/**
 * Runs `readMain()` (the activity's own fields; throws 400 with details.errors)
 * and reads the custom values, reporting the problems of both together.
 * Returns { main, customValues } — customValues is undefined when the body has
 * none on an update (stored values stay as they are).
 */
async function readWithCustomValues({ lead, activityKey, body, previous, isUpdate = false, readMain }) {
  const skipCustom = isUpdate && (body || {}).customValues === undefined;
  const custom = skipCustom
    ? { values: undefined, errors: [] }
    : await readCustomValues(await fieldsFor(lead, activityKey), (body || {}).customValues, previous);

  let main;
  try {
    main = await readMain();
  } catch (err) {
    if (custom.errors.length && Array.isArray(err?.details?.errors)) err.details.errors.push(...custom.errors);
    throw err;
  }
  if (custom.errors.length) throw new ServiceError(400, 'Fix the highlighted fields', { errors: custom.errors });
  return { main, customValues: custom.values };
}

module.exports = { fieldsFor, readCustomValues, readWithCustomValues };
