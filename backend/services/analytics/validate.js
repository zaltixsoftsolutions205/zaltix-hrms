/**
 * Checks a widget configuration (and dashboard filters) against the registry and
 * returns a clean copy. Anything unknown is refused with a 400 naming the part
 * that is wrong; values are cast to their field's type (ids, numbers, days).
 */

const mongoose = require('mongoose');
const {
  BUCKETS, CALCS, CHARTS, STAGE_OPTIONS, getField, getSource,
} = require('./registry');
const { PRESETS, parseDay, daysBetween } = require('./periods');

class AnalyticsError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const fail = (message, path) => { throw new AnalyticsError(400, message, path ? { path } : undefined); };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
const isId = (v) => typeof v === 'string' && mongoose.Types.ObjectId.isValid(v) && /^[a-f0-9]{24}$/i.test(v);
const cleanText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const OPS_BY_TYPE = {
  id: ['eq', 'ne', 'in', 'nin'],
  ref: ['eq', 'ne', 'in', 'nin', 'empty', 'notEmpty'],
  enum: ['eq', 'ne', 'in', 'nin'],
  string: ['eq', 'ne', 'in', 'nin', 'contains', 'empty', 'notEmpty'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'empty', 'notEmpty'],
  date: ['eq', 'gt', 'gte', 'lt', 'lte', 'empty', 'notEmpty'],
  bool: ['eq'],
};
const LIST_OPS = ['in', 'nin'];
const NO_VALUE_OPS = ['empty', 'notEmpty'];

/** One value cast to the field's type. */
function castValue(field, raw, path) {
  switch (field.type) {
    case 'id':
    case 'ref':
      if (!isId(raw)) fail('Choose a valid record', path);
      return raw;
    case 'enum':
      if (!field.options.some((o) => o.value === raw)) fail(`Unknown value for ${field.label}`, path);
      return raw;
    case 'string':
      if (typeof raw !== 'string' || !raw.trim() || raw.length > 200) fail(`Enter a value for ${field.label}`, path);
      return raw.trim();
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) fail(`${field.label} needs a number`, path);
      return n;
    }
    case 'date':
      if (!parseDay(raw)) fail(`${field.label} needs a date (YYYY-MM-DD)`, path);
      return raw;
    case 'bool':
      if (typeof raw !== 'boolean') fail(`${field.label} is yes or no`, path);
      return raw;
    default:
      return fail('Unsupported field', path);
  }
}

/** [{ field, op, value }] -> clean list (max 10). */
function validateConditions(source, list, path) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) fail('Filters must be a list', path);
  if (list.length > 10) fail('At most 10 filters', path);
  return list.map((c, i) => {
    const at = `${path}[${i}]`;
    if (!isObj(c)) fail('Invalid filter', at);
    const field = getField(source, c.field);
    if (!field) fail('Unknown filter field', `${at}.field`);
    const ops = OPS_BY_TYPE[field.type] || [];
    if (!ops.includes(c.op)) fail(`"${c.op}" cannot be used with ${field.label}`, `${at}.op`);
    if (NO_VALUE_OPS.includes(c.op)) return { field: c.field, op: c.op };
    if (LIST_OPS.includes(c.op)) {
      if (!Array.isArray(c.value) || !c.value.length || c.value.length > 50) fail('Choose 1 to 50 values', `${at}.value`);
      return { field: c.field, op: c.op, value: [...new Set(c.value.map((v) => castValue(field, v, `${at}.value`)))] };
    }
    return { field: c.field, op: c.op, value: castValue(field, c.value, `${at}.value`) };
  });
}

/** { preset } or { from, to } (inclusive days) or null. */
function validateDateRange(spec, path) {
  if (spec === undefined || spec === null) return null;
  if (!isObj(spec)) fail('Invalid date range', path);
  if (spec.preset !== undefined) {
    if (!has(PRESETS, spec.preset)) fail('Unknown date range', path);
    return spec.preset === 'all' ? null : { preset: spec.preset };
  }
  const from = parseDay(spec.from);
  const to = parseDay(spec.to);
  if (!from || !to) fail('Date range needs a start and an end date', path);
  const days = daysBetween(from, to);
  if (days < 0) fail('The start date is after the end date', path);
  if (days > 3660) fail('Date range can cover at most 10 years', path);
  return { from: spec.from, to: spec.to };
}

function validateMeasure(source, m, path) {
  if (!isObj(m)) fail('Invalid value setting', path);
  const calc = CALCS[m.calc] && has(CALCS, m.calc) ? CALCS[m.calc] : null;
  if (!calc) fail('Choose a calculation', `${path}.calc`);
  let field = null;
  if (calc.fieldTypes) {
    const f = getField(source, m.field);
    if (!f) fail(`${calc.label} needs a value field`, `${path}.field`);
    if (!calc.fieldTypes.includes(f.type)) fail(`${calc.label} cannot be used with ${f.label}`, `${path}.field`);
    field = m.field;
  }
  const where = validateConditions(source, m.where, `${path}.where`);
  if (calc.needsWhere && !where.length) fail('Conversion % needs the condition a record must meet to count as converted', `${path}.where`);
  return { calc: m.calc, field, where, label: cleanText(m.label, 80) };
}

function validateGroup(source, spec, path, { allowDate = true } = {}) {
  if (!isObj(spec)) fail('Choose a field to group by', path);
  const field = getField(source, spec.field);
  if (!field) fail('Unknown group field', `${path}.field`);
  if (field.type === 'date') {
    if (!allowDate) fail(`${field.label} cannot be used here`, `${path}.field`);
    if (!has(BUCKETS, spec.bucket)) fail(`Group ${field.label} by day, week, month, quarter, year or weekday`, `${path}.bucket`);
    return { field: spec.field, bucket: spec.bucket };
  }
  if (!field.group) fail(`${field.label} cannot be used to group`, `${path}.field`);
  return { field: spec.field, bucket: null };
}

const intIn = (v, min, max, fallback) => {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(`Choose a number from ${min} to ${max}`);
  return n;
};

const LIMITS = {
  ranking: [1, 50, 10], bar: [1, 50, 20], donut: [2, 12, 8], butterfly: [1, 50, 15], table: [1, 200, 50],
};

/**
 * A widget configuration -> clean configuration.
 * Access to the source is checked by the caller (it depends on the user).
 */
function validateConfig(input) {
  if (!isObj(input)) fail('Missing configuration');
  const source = getSource(input.source);
  if (!source) fail('Choose a model', 'source');
  const chart = has(CHARTS, input.chartType) ? CHARTS[input.chartType] : null;
  if (!chart) fail('Choose a chart type', 'chartType');
  const type = input.chartType;

  const out = { source: source.key, chartType: type };

  // Values
  const measures = Array.isArray(input.measures) ? input.measures : [];
  const [minM, maxM] = chart.measures;
  if (type === 'table' && input.table?.mode !== 'grouped') out.measures = [];
  else {
    const min = type === 'table' ? 1 : minM;
    if (measures.length < min || measures.length > maxM) {
      fail(min === maxM ? `${chart.label} needs exactly ${min} value${min > 1 ? 's' : ''}` : `${chart.label} needs ${min} to ${maxM} values`, 'measures');
    }
    out.measures = measures.map((m, i) => validateMeasure(source, m, `measures[${i}]`));
  }

  // Category / series
  const grouped = type === 'table' && input.table?.mode === 'grouped';
  if (chart.category === 'required' || grouped) {
    out.category = validateGroup(source, input.category, 'category', { allowDate: type !== 'ranking' && type !== 'butterfly' });
  } else out.category = null;
  if (chart.series && input.series) {
    out.series = validateGroup(source, input.series, 'series', { allowDate: false });
    if (out.category && out.series.field === out.category.field) fail('Split by a different field than the category', 'series');
  } else out.series = null;

  // Date field / range / interval
  const dateField = input.dateField ? getField(source, input.dateField) : null;
  if (input.dateField && (!dateField || dateField.type !== 'date')) fail('Choose a date field', 'dateField');
  out.dateRange = validateDateRange(input.dateRange, 'dateRange');
  out.dateField = input.dateField || null;
  if ((chart.needsDate || input.compare) && !out.dateField) fail(`${chart.label} needs a date field`, 'dateField');
  if (!out.dateField && out.dateRange) out.dateField = source.defaultDate;
  if (type === 'line' || type === 'area' || type === 'growth') {
    const allowed = ['day', 'week', 'month', 'quarter', 'year'];
    if (!allowed.includes(input.interval)) fail('Choose a period: day, week, month, quarter or year', 'interval');
    out.interval = input.interval;
  } else out.interval = null;

  out.filters = validateConditions(source, input.filters, 'filters');

  // Chart options
  if (has(LIMITS, type)) {
    const [min, max, def] = LIMITS[type];
    out.limit = intIn(input.limit, min, max, def);
  }
  out.sort = ['auto', 'asc', 'desc', 'label'].includes(input.sort) ? input.sort : 'auto';
  out.percent = ['bar', 'donut', 'ranking', 'table'].includes(type) && input.percent === true;
  if (out.percent && !['count', 'sum'].includes(out.measures[0]?.calc)) fail('Percentage of total works with Count or Sum', 'percent');

  if (type === 'score') {
    out.compare = input.compare === true;
    if (input.target !== undefined && input.target !== null && input.target !== '') {
      const t = Number(input.target);
      if (!Number.isFinite(t) || t <= 0) fail('The target must be a number above 0', 'target');
      out.target = t;
    } else out.target = null;
  }

  if (type === 'funnel') {
    const f = isObj(input.funnel) ? input.funnel : {};
    if (f.kind === 'stage' || f.kind === 'activity') {
      if (!(source.funnels || []).includes(f.kind)) fail('This funnel is only available for Leads', 'funnel.kind');
      out.funnel = { kind: f.kind };
    } else if (f.kind === 'enum') {
      const field = getField(source, f.field);
      if (!field || field.type !== 'enum') fail('Choose a stage field', 'funnel.field');
      out.funnel = { kind: 'enum', field: f.field };
    } else fail('Choose a funnel type', 'funnel.kind');
  }

  if (type === 'table') {
    const t = isObj(input.table) ? input.table : {};
    if (t.mode === 'grouped') {
      out.table = { mode: 'grouped' };
    } else {
      const columns = Array.isArray(t.columns) ? [...new Set(t.columns)] : [];
      if (!columns.length || columns.length > 12) fail('Choose 1 to 12 columns', 'table.columns');
      columns.forEach((c, i) => {
        const f = getField(source, c);
        if (!f || !f.column) fail('Unknown column', `table.columns[${i}]`);
      });
      const sortField = t.sortField || columns.find((c) => getField(source, c).type === 'date') || columns[0];
      const sf = getField(source, sortField);
      if (!sf || !sf.column) fail('Unknown sort column', 'table.sortField');
      out.table = {
        mode: 'records', columns, sortField, sortDir: t.sortDir === 'asc' ? 'asc' : 'desc', pageSize: intIn(t.pageSize, 5, 100, 25),
      };
    }
  }

  return out;
}

/* ------------------------------ dashboard filters ------------------------------ */

const STAGES = STAGE_OPTIONS.map((o) => o.value);
const idList = (v, path) => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 50 || !v.every(isId)) fail('Choose up to 50 valid values', path);
  return [...new Set(v)];
};

/**
 * Dashboard-level filters. Precedence when a widget runs on a dashboard:
 *   dateRange  replaces the widget's own date range
 *   the others are added to the widget's filters (all must match)
 */
function validateDashboardFilters(input) {
  if (input === undefined || input === null) return {};
  if (!isObj(input)) fail('Invalid dashboard filters', 'filters');
  const out = {};
  const range = validateDateRange(input.dateRange, 'filters.dateRange');
  if (range) out.dateRange = range;
  ['employee', 'department', 'product'].forEach((k) => {
    const list = idList(input[k], `filters.${k}`);
    if (list.length) out[k] = list;
  });
  if (input.status !== undefined && input.status !== null) {
    if (!Array.isArray(input.status) || input.status.length > 20 || !input.status.every((s) => STAGES.includes(s))) fail('Unknown status', 'filters.status');
    if (input.status.length) out.status = [...new Set(input.status)];
  }
  return out;
}

module.exports = {
  AnalyticsError, validateConfig, validateDashboardFilters, validateConditions, OPS_BY_TYPE, isId,
};
