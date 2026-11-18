/**
 * fieldTypes.js - the ONE place that maps a field type to its UI behaviour.
 *
 * FIELD_TYPES mirrors GlobalTableField.FIELD_TYPES on the backend (models/GlobalTableField.js).
 * If the backend list changes, change it here too: every editor, display, validator and the
 * Add Field modal read this registry, nothing else hard-codes a type list.
 *
 * Backend types that do NOT exist (so are deliberately absent): long text, phone, url, percentage.
 * `phone` is a native Lead column only (text with a tel input).
 */

import { followUpInput, followUpToApi } from '../../utils/followUp';

export const FIELD_TYPES = [
  'text', 'number', 'currency', 'date', 'datetime', 'checkbox', 'boolean',
  'single-select', 'multi-select', 'person', 'email', 'reference', 'formula',
];

/*
 * editor:  input | select | tri | toggle | multi | person | assignee | null (no editor)
 * readOnly: never edited in a cell / never an input in the Add Row
 * calculated: value comes from the backend formula evaluation, never from a stored value
 */
const META = {
  text: { label: 'Text', editor: 'input', inputType: 'text' },
  email: { label: 'Email', editor: 'input', inputType: 'email' },
  number: { label: 'Number', editor: 'input', inputType: 'number', step: 'any' },
  currency: { label: 'Currency', editor: 'input', inputType: 'number', step: '0.01' },
  date: { label: 'Date', editor: 'input', inputType: 'date' },
  datetime: { label: 'Date & time', editor: 'input', inputType: 'datetime-local' },
  checkbox: { label: 'Checkbox', editor: 'toggle', clearsToFalse: true },
  boolean: { label: 'Yes / No', editor: 'tri' },
  'single-select': { label: 'Single select', editor: 'select', hasOptions: true },
  'multi-select': { label: 'Multi select', editor: 'multi', hasOptions: true },
  person: { label: 'Person', editor: 'person' },
  reference: { label: 'Reference', editor: null, readOnly: true, reason: 'Reference fields need a target picker, which the backend does not support yet' },
  formula: { label: 'Formula', editor: null, readOnly: true, calculated: true, reason: 'Calculated field' },
  // native Lead columns (not Global Table field types)
  assignee: { label: 'Assignee', editor: 'assignee' },
  name: { label: 'Name', editor: null, readOnly: true },
  stage: { label: 'Pipeline stage', editor: null, readOnly: true },
  count: { label: 'Count', editor: null, readOnly: true },
  mandal: { label: 'Mandal', editor: 'select' },
  followup: { label: 'Follow-up', editor: 'input' }, // a date with an optional time (utils/followUp.js)
};

export const getTypeMeta = (type) => META[type] || { label: String(type), editor: null, readOnly: true, unknown: true };
export const isKnownType = (type) => Object.prototype.hasOwnProperty.call(META, type);

/** Types offered when creating a field (reference is excluded: no target picker exists). */
export const CREATABLE_FIELD_TYPES = FIELD_TYPES
  .filter((t) => t !== 'reference')
  .map((t) => ({ value: t, label: META[t].label }));

/*
 * Where a field is shown (GlobalTableField.appliesTo on the backend):
 * 'lead' = a column of the lead table; the others = a field of that activity's
 * form (Visits, Demos, ...) for the leads of the table, not a lead column.
 */
export const APPLIES_TO_OPTIONS = [
  { value: 'lead', label: 'Lead (table column)' },
  { value: 'visit', label: 'Visits' },
  { value: 'demo', label: 'Demos' },
  { value: 'data-update', label: 'Data Update' },
  { value: 'registration', label: 'Registration' },
  { value: 'feedback', label: 'Feedback' },
];
export const appliesToLabel = (v) => (APPLIES_TO_OPTIONS.find((o) => o.value === (v || 'lead')) || APPLIES_TO_OPTIONS[0]).label;
export const isLeadField = (field) => !field?.appliesTo || field.appliesTo === 'lead';
// Types an activity form field may have (same list as the backend).
const ACTIVITY_TYPES = ['text', 'number', 'currency', 'date', 'datetime', 'checkbox', 'boolean', 'single-select', 'multi-select', 'email'];
export const ACTIVITY_FIELD_TYPES = CREATABLE_FIELD_TYPES.filter((t) => ACTIVITY_TYPES.includes(t.value));

export const SELECT_FIELD_TYPES = ['single-select', 'multi-select'];
export const NUMERIC_FIELD_TYPES = ['number', 'currency'];
export const NOT_REQUIRABLE_FIELD_TYPES = ['checkbox', 'formula'];

/** Can a user change this column's value directly in the grid? (checkbox toggles count) */
export const isEditableColumn = (col) => {
  if (col.systemManaged) return false;
  const m = getTypeMeta(col.type);
  return Boolean(m.editor) && !m.readOnly && !m.unknown;
};

/* ----------------------------- values ------------------------------------- */

// 0 and false are REAL values; only null / undefined / '' / [] are empty
export const isEmptyValue = (v) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

const pad = (n) => String(n).padStart(2, '0');
export const isoToLocalInput = (v) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Stored/API value -> value the editor control works with. */
export const toEditorValue = (col, raw) => {
  const meta = getTypeMeta(col.type);
  switch (meta.editor) {
    case 'toggle': return raw === true;
    case 'tri': return raw === true ? 'true' : raw === false ? 'false' : '';
    case 'multi':
    case 'person': return Array.isArray(raw) ? raw.map(String) : (isEmptyValue(raw) ? [] : [String(raw)]);
    case 'assignee': return raw && typeof raw === 'object' ? (raw._id || '') : (raw || '');
    case 'input':
      if (col.type === 'date') return raw ? String(raw).slice(0, 10) : '';
      if (col.type === 'datetime') return raw ? isoToLocalInput(raw) : '';
      if (col.type === 'followup') return followUpInput(raw);
      return raw ?? '';
    default: return raw ?? '';
  }
};

/**
 * Editor value -> value sent to the API. Throws Error(message) when the input is invalid.
 * Native Lead columns send trimmed strings ('' clears an optional field, exactly like the CRM screen).
 */
export const toApiValue = (col, raw) => {
  if (col.source === 'lead') {
    if (col.type === 'assignee') return raw || null;
    if (col.type === 'followup') return followUpToApi(raw);
    return typeof raw === 'string' ? raw.trim() : raw;
  }
  switch (col.type) {
    case 'number':
    case 'currency': {
      if (isEmptyValue(raw)) return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error('Enter a valid number');
      return n;
    }
    case 'checkbox': return raw === true;
    case 'boolean': return raw === true || raw === 'true' ? true : raw === false || raw === 'false' ? false : null;
    case 'multi-select':
    case 'person': return Array.isArray(raw) && raw.length ? raw : null;
    case 'datetime': {
      if (isEmptyValue(raw)) return null;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) throw new Error('Enter a valid date and time');
      return d.toISOString();
    }
    case 'email': {
      const v = typeof raw === 'string' ? raw.trim() : '';
      if (!v) return null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('Enter a valid email address');
      return v;
    }
    default: {
      const v = typeof raw === 'string' ? raw.trim() : raw;
      return isEmptyValue(v) ? null : v;
    }
  }
};

/** Comparison form used to skip no-op saves. */
export const canon = (col, v) => {
  if (isEmptyValue(v)) return col.type === 'checkbox' ? false : null;
  if (col.type === 'date') return String(v).slice(0, 10);
  if (col.type === 'datetime' || col.type === 'followup') { const t = new Date(v).getTime(); return Number.isNaN(t) ? String(v) : t; }
  if (Array.isArray(v)) return JSON.stringify(v.map(String).sort());
  return v;
};

/**
 * What does the cell-level trash do, and is it available?
 *   - formula / reference / unknown / required / non-clearable native: no trash
 *   - checkbox: only when checked (clearing sets it to false, a checkbox is never "empty")
 *   - everything else: only when there is a value to clear
 */
export const hasClearableValue = (col, raw) => {
  if (!col.clearable) return false;
  const meta = getTypeMeta(col.type);
  if (meta.readOnly || meta.unknown || meta.calculated) return false;
  if (meta.clearsToFalse) return raw === true;
  return !isEmptyValue(raw);
};

/** Users for person pickers. `role` is only a frontend hint (the backend never checks it). */
export const personOptions = (userLookup, role) => {
  const all = Object.entries(userLookup || {}).map(([id, u]) => ({ value: String(id), label: (u && u.name) || String(id), role: u && u.role }));
  const filtered = role ? all.filter((o) => o.role === role) : all;
  return (filtered.length ? filtered : all).sort((a, b) => a.label.localeCompare(b.label));
};

/* ----------------- record forms: inline Add Row + GlobalDrawer ----------------- */
/*
 * Both forms build the request body of POST / PUT /global-tables/:id/records:
 *   { native: { <lead property>: value }, customValues: { <custom field KEY>: value } }
 * so the rules live here once. The backend stays authoritative; these checks only give early feedback.
 */

const PHONE_RE = /^(?:\+91[\s-]?)?[6-9]\d{9}$/; // same rule as leadController.createLead
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The control column used when CREATING a record, or null when the column is not fillable. */
export const formColumn = (col) => {
  if (col.systemManaged || col.activityOnly) return null; // activity fields are filled in their forms
  if (col.source === 'lead') return col.createType ? { ...col, type: col.createType } : null;
  const meta = getTypeMeta(col.type);
  return meta.editor && !meta.readOnly ? col : null;
};

/** Empty draft value for a column in a create form (undefined when the column is not fillable). */
export const initialDraftValue = (col) => {
  const fc = formColumn(col);
  if (!fc) return undefined;
  const meta = getTypeMeta(fc.type);
  if (meta.editor === 'toggle') return false;
  if (meta.editor === 'multi' || meta.editor === 'person') return [];
  return '';
};

/** A checkbox is never "empty", so it can never be required. */
export const isRequiredColumn = (col) => (col.source === 'lead'
  ? Boolean(col.requiredOnCreate)
  : Boolean(col.field && col.field.required) && getTypeMeta(col.type).editor !== 'toggle');

const checkNative = (key, v) => {
  if (typeof v !== 'string' || v === '') return;
  if (key === 'name' && (v.length < 2 || v.length > 100)) throw new Error('Name must be 2-100 characters');
  if (key === 'phone' && !PHONE_RE.test(v.replace(/[\s-]/g, ''))) throw new Error('Enter a valid Indian phone number');
  if (key === 'email' && !EMAIL_RE.test(v)) throw new Error('Enter a valid email address');
};

/** Draft (editor values by column key) -> { errs, native, customValues } for a NEW record. */
export const buildCreateRequest = (columns, draft) => {
  const errs = {};
  const native = {};
  const customValues = {};

  columns.forEach((col) => {
    const fc = formColumn(col);
    if (!fc) return;
    const raw = draft[col.key];
    const empty = fc.type === 'checkbox' ? false : isEmptyValue(typeof raw === 'string' ? raw.trim() : raw);

    if (empty) {
      if (isRequiredColumn(col)) errs[col.key] = `${col.label} is required`;
      return;
    }
    try {
      if (col.source === 'lead') {
        const v = toApiValue(fc, raw);
        checkNative(col.key, v);
        native[col.key] = v;
      } else {
        const v = toApiValue(col, raw);
        // an untouched checkbox is simply "unchecked": nothing to store
        if (v !== null && !(col.type === 'checkbox' && v === false)) customValues[col.field.key] = v;
      }
    } catch (e) {
      errs[col.key] = e.message;
    }
  });
  return { errs, native, customValues };
};

/**
 * Draft + initial draft -> { errs, native, customValues } holding ONLY what changed, so untouched
 * fields are never re-sent (no spurious business rules / notifications for the native record).
 * Read-only columns (formula, reference, name, stage...) are never included.
 */
export const buildUpdateRequest = (columns, draft, initial) => {
  const errs = {};
  const native = {};
  const customValues = {};

  columns.forEach((col) => {
    if (!col.editable) return;

    let next;
    try {
      next = toApiValue(col, draft[col.key]);
      if (col.source === 'lead') checkNative(col.key, next);
    } catch (e) {
      errs[col.key] = e.message;
      return;
    }

    let prev = null;
    try { prev = toApiValue(col, initial[col.key]); } catch { prev = null; }
    if (canon(col, prev) === canon(col, next)) return;

    if (col.source === 'lead') {
      native[col.key] = next ?? ''; // assignedTo may be empty ('' clears it)
    } else {
      const required = Boolean(col.field && col.field.required) && getTypeMeta(col.type).editor !== 'toggle';
      if (required && isEmptyValue(next)) { errs[col.key] = `${col.label} is required`; return; }
      customValues[col.field.key] = next;
    }
  });
  return { errs, native, customValues };
};