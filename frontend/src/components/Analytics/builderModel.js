/**
 * Builder state <-> widget configuration (the shape backend/services/analytics/validate.js
 * accepts). The builder keeps a "draft" with every setting; buildConfig() sends only
 * what the chosen chart uses.
 */

export const OP_LABELS = {
  eq: 'is', ne: 'is not', in: 'is any of', nin: 'is none of', contains: 'contains', empty: 'is empty', notEmpty: 'is not empty',
  gt: 'greater than', gte: 'at least', lt: 'less than', lte: 'at most',
};
export const DATE_OP_LABELS = { eq: 'on', gt: 'after', gte: 'on or after', lt: 'before', lte: 'on or before' };
export const opLabel = (op, type) => (type === 'date' && DATE_OP_LABELS[op]) || OP_LABELS[op] || op;
export const NO_VALUE_OPS = ['empty', 'notEmpty'];
export const LIST_OPS = ['in', 'nin'];

export const LIMITS = {
  ranking: [1, 50, 10], bar: [1, 50, 20], donut: [2, 12, 8], butterfly: [1, 50, 15], table: [1, 200, 50],
};
export const TIME_CHARTS = ['line', 'area', 'growth'];
export const INTERVALS = ['day', 'week', 'month', 'quarter', 'year'];

export const fieldOf = (source, key) => source?.fields.find((f) => f.key === key) || null;
export const filterFields = (source) => (source?.fields || []).filter((f) => f.type !== 'id' && f.ops.length);
export const groupFields = (source, { allowDate = true } = {}) => (source?.fields || []).filter((f) => f.group && (allowDate || f.type !== 'date'));
export const dateFields = (source) => (source?.fields || []).filter((f) => f.type === 'date');
export const columnFields = (source) => (source?.fields || []).filter((f) => f.column);
export const measureFields = (source, calc) => (calc?.fieldTypes ? (source?.fields || []).filter((f) => calc.fieldTypes.includes(f.type) && f.type !== 'id') : []);

/** A condition row is complete when it has a field, an operator and (if needed) a value. */
export function conditionComplete(c) {
  if (!c?.field || !c.op) return false;
  if (NO_VALUE_OPS.includes(c.op)) return true;
  if (LIST_OPS.includes(c.op)) return Array.isArray(c.value) && c.value.length > 0;
  return c.value !== undefined && c.value !== null && c.value !== '';
}
const cleanConditions = (list) => (list || []).filter(conditionComplete).map((c) => (NO_VALUE_OPS.includes(c.op) ? { field: c.field, op: c.op } : { field: c.field, op: c.op, value: c.value }));

const preferredGroup = (source, allowDate) => {
  const list = groupFields(source, { allowDate });
  return list.find((f) => f.ref === 'user' && !f.related) || list.find((f) => f.type === 'enum') || list[0] || null;
};

/** A fresh draft for a model + chart, keeping the title and common settings of `prev`. */
export function defaultDraft(catalog, sourceKey, chartType, prev = {}) {
  const source = catalog.modules.flatMap((m) => m.sources).find((s) => s.key === sourceKey);
  const sameSource = prev.source === sourceKey;
  const cat = preferredGroup(source, chartType !== 'ranking' && chartType !== 'butterfly');
  const enumField = (source?.fields || []).find((f) => f.type === 'enum');
  const firstColumns = columnFields(source).slice(0, 5).map((f) => f.key);
  const count = { calc: 'count', field: null, where: [], label: '' };

  let measures = [count];
  if (chartType === 'butterfly') measures = [{ ...count }, { ...count }];
  if (chartType === 'funnel') measures = [];
  if (sameSource && prev.measures?.length && chartType !== 'funnel') {
    measures = chartType === 'butterfly'
      ? [prev.measures[0], prev.measures[1] || { ...count }]
      : [prev.measures[0]];
  }
  const keepCategory = sameSource && prev.category?.field && (cat ? groupFields(source, { allowDate: chartType !== 'ranking' && chartType !== 'butterfly' }).some((f) => f.key === prev.category.field) : false);

  return {
    title: prev.title || '',
    description: prev.description || '',
    module: source?.module || prev.module,
    source: sourceKey,
    chartType,
    measures,
    category: keepCategory ? prev.category : { field: cat?.key || '', bucket: cat?.type === 'date' ? 'month' : null },
    series: sameSource && prev.series?.field ? prev.series : { field: '', bucket: null },
    dateField: sameSource && prev.dateField ? prev.dateField : source?.defaultDate || '',
    dateRange: sameSource && prev.dateRange ? prev.dateRange : { preset: chartType === 'growth' ? 'all' : TIME_CHARTS.includes(chartType) ? 'this_year' : 'this_month' },
    interval: prev.interval || 'month',
    filters: sameSource ? prev.filters || [] : [],
    limit: LIMITS[chartType]?.[2] ?? null,
    sort: 'auto',
    percent: false,
    compare: false,
    target: '',
    funnel: (source?.funnels || []).length ? { kind: 'stage', field: '' } : { kind: 'enum', field: enumField?.key || '' },
    table: { mode: 'records', columns: firstColumns, sortField: '', sortDir: 'desc', pageSize: 25 },
  };
}

/** Draft from a saved widget. */
export function draftFromWidget(catalog, widget) {
  const c = widget.config || {};
  const base = defaultDraft(catalog, c.source, c.chartType, {});
  return {
    ...base,
    title: widget.title,
    description: widget.description || '',
    measures: c.measures?.length ? c.measures.map((m) => ({ ...m, field: m.field || null, where: m.where || [], label: m.label || '' })) : base.measures,
    category: c.category || base.category,
    series: c.series || base.series,
    dateField: c.dateField || base.dateField,
    dateRange: c.dateRange || { preset: 'all' },
    interval: c.interval || base.interval,
    filters: c.filters || [],
    limit: c.limit ?? base.limit,
    sort: c.sort || 'auto',
    percent: Boolean(c.percent),
    compare: Boolean(c.compare),
    target: c.target ?? '',
    funnel: c.funnel ? { field: '', ...c.funnel } : base.funnel,
    table: c.table ? { ...base.table, ...c.table, columns: c.table.columns || base.table.columns } : base.table,
  };
}

/** Draft -> configuration for /preview and saving. */
export function buildConfig(draft, catalog) {
  const chart = catalog.charts.find((c) => c.key === draft.chartType);
  const type = draft.chartType;
  const cfg = { source: draft.source, chartType: type };
  const grouped = type === 'table' && draft.table.mode === 'grouped';

  if (type !== 'funnel' && (type !== 'table' || grouped)) {
    cfg.measures = draft.measures.map((m) => {
      const calc = catalog.calcs.find((c) => c.key === m.calc);
      return {
        calc: m.calc, ...(calc?.fieldTypes ? { field: m.field } : {}), where: cleanConditions(m.where), ...(m.label?.trim() ? { label: m.label.trim() } : {}),
      };
    });
  }
  if (chart?.category === 'required' || grouped) cfg.category = { field: draft.category.field, ...(draft.category.bucket ? { bucket: draft.category.bucket } : {}) };
  if (chart?.series && draft.series?.field) cfg.series = { field: draft.series.field };

  if (draft.dateField) cfg.dateField = draft.dateField;
  if (draft.dateRange?.preset) cfg.dateRange = { preset: draft.dateRange.preset };
  else if (draft.dateRange?.from && draft.dateRange?.to) cfg.dateRange = { from: draft.dateRange.from, to: draft.dateRange.to };
  if (TIME_CHARTS.includes(type)) cfg.interval = draft.interval;

  cfg.filters = cleanConditions(draft.filters);
  if (LIMITS[type] && draft.limit !== null && draft.limit !== '') cfg.limit = Number(draft.limit);
  if (['ranking', 'bar', 'donut', 'butterfly', 'table'].includes(type)) cfg.sort = draft.sort;
  if (['bar', 'donut', 'ranking', 'table'].includes(type) && draft.percent) cfg.percent = true;
  if (type === 'score') {
    cfg.compare = Boolean(draft.compare);
    if (draft.target !== '' && draft.target !== null) cfg.target = Number(draft.target);
  }
  if (type === 'funnel') cfg.funnel = draft.funnel.kind === 'enum' ? { kind: 'enum', field: draft.funnel.field } : { kind: draft.funnel.kind };
  if (type === 'table') {
    cfg.table = grouped
      ? { mode: 'grouped' }
      : {
        mode: 'records', columns: draft.table.columns, ...(draft.table.sortField ? { sortField: draft.table.sortField } : {}), sortDir: draft.table.sortDir, pageSize: Number(draft.table.pageSize) || 25,
      };
  }
  return cfg;
}

/** Which builder section a server error path belongs to. */
export function sectionOfPath(path) {
  if (!path) return null;
  if (path === 'title') return 'title';
  if (path.startsWith('measures')) return 'value';
  if (path.startsWith('category') || path.startsWith('series')) return 'group';
  if (path.startsWith('date') || path === 'interval') return 'date';
  if (path.startsWith('filters')) return 'filters';
  return 'options';
}
