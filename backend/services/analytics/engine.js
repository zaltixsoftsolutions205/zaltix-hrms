/**
 * Analytics engine: a validated widget configuration (validate.js) -> one MongoDB
 * aggregation -> chart-ready data. All counting / summing / grouping happens in
 * MongoDB; only the (small) grouped result is shaped here.
 *
 * Pipeline:
 *   1. $match   access scope + date range + filters on stored fields (uses indexes)
 *   2. $lookup  the record's lead, only when a lead field is used
 *   3. $match   filters on lead / computed fields ($expr)
 *   4. chart    $group / $sort / $limit (or $facet for a record table)
 *
 * run(config, { owners, dashboardFilters, page, now })
 *   owners   null = every record; [ObjectId] = only records whose owner field
 *            (Lead.assignedTo, Visit.visitedBy, ...) is one of them (scope.js)
 */

const mongoose = require('mongoose');
const {
  ACTIVITY_FUNNEL, CALCS, CHARTS, REFS, STAGE_OPTIONS, getField, getSource, modelOf,
} = require('./registry');
const P = require('./periods');
const { AnalyticsError } = require('./validate');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round = (v, digits = 2) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 10 ** digits) / 10 ** digits);
const pct = (part, whole) => (whole ? round((part / whole) * 100) : null);

/* ------------------------------ field expressions ------------------------------ */

const relAlias = (via) => `__rel_${via}`;
const isNative = (f) => !f.expr && !f.via;
const storedPath = (key, f) => f.path || key;
const tzOf = (f) => (f.utcDay ? 'UTC' : P.TZ);

/** 'YYYY-MM-DD' text -> that day at UTC midnight (null when empty or not a day). */
const dayFromString = (path) => ({
  $dateFromString: {
    dateString: path, format: '%Y-%m-%d', timezone: 'UTC', onError: null, onNull: null,
  },
});

/** Aggregation expression for a field's (normalised) value. */
function fieldExpr(source, key, ctx) {
  const f = getField(source, key);
  if (f.expr) return f.expr(ctx);
  const raw = f.via ? `$${relAlias(f.via)}.${f.path}` : `$${storedPath(key, f)}`;
  if (f.dayString) return dayFromString(raw);
  return f.normalize ? f.normalize(raw) : raw;
}

/**
 * Bounds of a native date field in a $match: instants, or 'YYYY-MM-DD' text for a
 * dayString field (ISO days sort as text, so the index still works).
 */
const dayBound = (f, day) => (f.dayString ? P.iso(day) : P.instant(day, { utcDay: f.utcDay }));

/** Stored values meaning an enum value (legacy names), else the value itself. */
const storedValues = (f, v) => (f.aliases ? f.aliases(v) : [v]);
const typed = (f, v) => ((f.type === 'ref' || f.type === 'id') ? oid(v) : v);
const dayStart = (f, s) => P.instant(P.parseDay(s), { utcDay: f.utcDay });
const nextDayStart = (f, s) => P.instant(P.addDays(P.parseDay(s), 1), { utcDay: f.utcDay });
const queryDayStart = (f, s) => dayBound(f, P.parseDay(s));
const queryNextDayStart = (f, s) => dayBound(f, P.addDays(P.parseDay(s), 1));

/** A condition on a stored field as a $match query part (can use indexes). */
function conditionQuery(source, c) {
  const f = getField(source, c.field);
  const path = storedPath(c.field, f);
  const list = (values) => values.flatMap((v) => storedValues(f, v)).map((v) => (v === null || v === '' ? v : typed(f, v)));
  const isDate = f.type === 'date';
  switch (c.op) {
    case 'eq':
      if (isDate) return { [path]: { $gte: queryDayStart(f, c.value), $lt: queryNextDayStart(f, c.value) } };
      // A yes/no that was never set counts as "No".
      if (f.type === 'bool') return { [path]: c.value ? true : { $ne: true } };
      return { [path]: { $in: list([c.value]) } };
    case 'ne': return { [path]: { $nin: list([c.value]) } };
    case 'in': return { [path]: { $in: list(c.value) } };
    case 'nin': return { [path]: { $nin: list(c.value) } };
    case 'gt': return { [path]: isDate ? { $gte: queryNextDayStart(f, c.value) } : { $gt: c.value } };
    case 'gte': return { [path]: isDate ? { $gte: queryDayStart(f, c.value) } : { $gte: c.value } };
    case 'lt': return { [path]: isDate ? { $lt: queryDayStart(f, c.value) } : { $lt: c.value } };
    case 'lte': return { [path]: isDate ? { $lt: queryNextDayStart(f, c.value) } : { $lte: c.value } };
    case 'contains': return { [path]: { $regex: escapeRegex(c.value), $options: 'i' } };
    case 'empty': return { [path]: { $in: [null, ''] } };
    case 'notEmpty': return { [path]: { $nin: [null, ''] } };
    default: throw new AnalyticsError(400, 'Unknown filter');
  }
}

/** Any condition as an aggregation expression (computed / lead fields, measure conditions). */
function conditionExpr(source, c, ctx) {
  const f = getField(source, c.field);
  const e = fieldExpr(source, c.field, ctx);
  const v = c.value;
  switch (c.op) {
    case 'eq':
      if (f.type === 'date') return { $and: [{ $gte: [e, dayStart(f, v)] }, { $lt: [e, nextDayStart(f, v)] }] };
      if (f.type === 'bool') return { $eq: [{ $toBool: { $ifNull: [e, false] } }, v] };
      return { $eq: [e, typed(f, v)] };
    case 'ne': return { $ne: [e, typed(f, v)] };
    case 'in': return { $in: [e, v.map((x) => typed(f, x))] };
    case 'nin': return { $not: [{ $in: [e, v.map((x) => typed(f, x))] }] };
    case 'gt': return f.type === 'date' ? { $gte: [e, nextDayStart(f, v)] } : { $gt: [e, v] };
    case 'gte': return f.type === 'date' ? { $gte: [e, dayStart(f, v)] } : { $gte: [e, v] };
    case 'lt': return f.type === 'date' ? { $lt: [e, dayStart(f, v)] } : { $and: [{ $ne: [e, null] }, { $lt: [e, v] }] };
    case 'lte': return f.type === 'date' ? { $lt: [e, nextDayStart(f, v)] } : { $and: [{ $ne: [e, null] }, { $lte: [e, v] }] };
    case 'contains': return { $regexMatch: { input: { $toString: { $ifNull: [e, ''] } }, regex: escapeRegex(v), options: 'i' } };
    case 'empty': return { $in: [{ $ifNull: [e, null] }, [null, '']] };
    case 'notEmpty': return { $not: [{ $in: [{ $ifNull: [e, null] }, [null, '']] }] };
    default: throw new AnalyticsError(400, 'Unknown filter');
  }
}

const andExpr = (list) => (list.length === 1 ? list[0] : { $and: list });

/* ---------------------------------- labels ---------------------------------- */

const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function bucketLabel(bucket, day) {
  switch (bucket) {
    case 'day': return `${day.d} ${MONTHS[day.m]} ${day.y}`;
    case 'week': return `Week of ${day.d} ${MONTHS[day.m]} ${day.y}`;
    case 'month': return `${MONTHS[day.m]} ${day.y}`;
    case 'quarter': return `Q${Math.floor(day.m / 3) + 1} ${day.y}`;
    case 'year': return String(day.y);
    default: return P.iso(day);
  }
}

/**
 * Keys of a group field -> [{ key, label, order }].
 * `order` sorts enum values in business order and dates in time order.
 */
async function describeKeys(source, group, keys) {
  const f = getField(source, group.field);
  if (f.type === 'date') {
    return keys.map((k) => {
      if (k === null || k === undefined) return { key: null, label: 'No date', order: Infinity };
      if (group.bucket === 'weekday') return { key: k, label: WEEKDAYS[k] || String(k), order: k };
      const day = P.dayOf(new Date(k), tzOf(f));
      return { key: P.iso(day), label: bucketLabel(group.bucket, day), order: new Date(k).getTime() };
    });
  }
  if (f.type === 'ref' || f.type === 'id') {
    const ids = keys.filter((k) => k && mongoose.Types.ObjectId.isValid(String(k)));
    const ref = REFS[f.ref];
    const docs = ref && ids.length ? await modelOf(ref.model).find({ _id: { $in: ids } }).select(ref.select).lean() : [];
    const byId = new Map(docs.map((d) => [String(d._id), ref.label(d)]));
    return keys.map((k) => ({
      key: k ? String(k) : null,
      label: k ? (byId.get(String(k)) || '(deleted)') : 'Not set',
      order: 0,
    }));
  }
  if (f.type === 'enum') {
    return keys.map((k) => {
      const i = f.options.findIndex((o) => o.value === k);
      return { key: k ?? null, label: i >= 0 ? f.options[i].label : (k || 'Not set'), order: i >= 0 ? i : 999 };
    });
  }
  if (f.type === 'bool') return keys.map((k) => ({ key: Boolean(k), label: k ? 'Yes' : 'No', order: k ? 0 : 1 }));
  if (f.type === 'number') return keys.map((k) => ({ key: k ?? null, label: k === null || k === undefined ? 'Not set' : String(k), order: k ?? Infinity }));
  return keys.map((k) => ({ key: k ?? null, label: k === null || k === undefined || k === '' ? '(empty)' : String(k), order: 0 }));
}

/* --------------------------------- measures --------------------------------- */

/** $group accumulators for measure i (a_i, and b_i for conversion). */
function accumulators(source, m, i, ctx) {
  const where = m.where.length ? andExpr(m.where.map((c) => conditionExpr(source, c, ctx))) : null;
  const value = m.field ? fieldExpr(source, m.field, ctx) : null;
  const when = (expr, otherwise) => (where ? { $cond: [where, expr, otherwise] } : expr);
  switch (m.calc) {
    case 'count': return { [`a${i}`]: { $sum: when(1, 0) } };
    case 'conversion': return { [`a${i}`]: { $sum: { $cond: [where, 1, 0] } }, [`b${i}`]: { $sum: 1 } };
    case 'sum': return { [`a${i}`]: { $sum: when(value, 0) } };
    case 'avg': return { [`a${i}`]: { $avg: when(value, null) } };
    case 'min': return { [`a${i}`]: { $min: when(value, null) } };
    case 'max': return { [`a${i}`]: { $max: when(value, null) } };
    case 'distinct': return { [`a${i}`]: { $addToSet: when(value, null) } };
    default: throw new AnalyticsError(400, 'Unknown calculation');
  }
}

/** Expression of measure i's final value after the $group. */
function finalValue(m, i) {
  if (m.calc === 'distinct') return { $size: { $setDifference: [`$a${i}`, [null]] } };
  if (m.calc === 'conversion') return { $cond: [{ $eq: [`$b${i}`, 0] }, null, { $multiply: [{ $divide: [`$a${i}`, `$b${i}`] }, 100] }] };
  return `$a${i}`;
}

const groupStages = (source, measures, ctx, id) => [
  { $group: Object.assign({ _id: id }, ...measures.map((m, i) => accumulators(source, m, i, ctx))) },
  { $project: Object.assign({ _id: 1 }, ...measures.map((m, i) => ({ [`v${i}`]: finalValue(m, i) }))) },
];

function measureFormat(source, m) {
  if (m.calc === 'conversion') return 'percent';
  if (m.calc === 'count' || m.calc === 'distinct') return 'number';
  return getField(source, m.field)?.format || 'number';
}

function measureLabel(source, m) {
  if (m.label) return m.label;
  const calc = CALCS[m.calc].label;
  if (m.calc === 'count') return `Number of ${source.label.toLowerCase()}`;
  if (m.calc === 'conversion') return 'Conversion %';
  return `${calc} of ${getField(source, m.field).label.toLowerCase()}`;
}

/** Count-like values default to 0 when there is nothing to count. */
const valueOr = (m, v) => (v === null || v === undefined ? (['count', 'sum', 'distinct'].includes(m.calc) ? 0 : null) : round(v));

/* ------------------------------- base pipeline ------------------------------- */

/** Every field key the configuration uses. */
function usedFields(config) {
  const keys = new Set();
  const add = (k) => { if (k) keys.add(k); };
  config.filters.forEach((c) => add(c.field));
  (config.extraConditions || []).forEach((c) => add(c.field));
  config.measures.forEach((m) => { add(m.field); m.where.forEach((c) => add(c.field)); });
  if (config.category) add(config.category.field);
  if (config.series) add(config.series.field);
  add(config.dateField);
  if (config.funnel?.field) add(config.funnel.field);
  if (config.table?.columns) config.table.columns.forEach(add);
  if (config.table?.sortField) add(config.table.sortField);
  return keys;
}

/**
 * $match (scope, dates, stored-field filters) -> $lookup (lead) -> $match (the rest).
 * `range` is a calendar range on config.dateField (or null).
 */
function basePipeline(source, config, { owners, range, ctx, extraMatch = [] }) {
  const early = [];
  const late = [];
  if (owners) early.push({ [source.ownerField]: { $in: owners } });

  const conditions = [...config.filters, ...(config.extraConditions || [])];
  conditions.forEach((c) => {
    const f = getField(source, c.field);
    if (isNative(f)) early.push(conditionQuery(source, c));
    else late.push(conditionExpr(source, c, ctx));
  });

  if (range && config.dateField) {
    const f = getField(source, config.dateField);
    if (isNative(f)) {
      early.push({ [storedPath(config.dateField, f)]: { $gte: dayBound(f, range.from), $lt: dayBound(f, range.to) } });
    } else {
      const from = P.instant(range.from, { utcDay: f.utcDay });
      const to = P.instant(range.to, { utcDay: f.utcDay });
      late.push({ $and: [{ $gte: [fieldExpr(source, config.dateField, ctx), from] }, { $lt: [fieldExpr(source, config.dateField, ctx), to] }] });
    }
  }
  early.push(...extraMatch);

  const pipeline = [];
  if (early.length) pipeline.push({ $match: early.length === 1 ? early[0] : { $and: early } });

  // The record's lead, with only the fields that are used.
  const viaPaths = {};
  usedFields(config).forEach((k) => {
    const f = getField(source, k);
    if (f?.via) (viaPaths[f.via] = viaPaths[f.via] || new Set()).add(f.path);
  });
  Object.entries(viaPaths).forEach(([via, paths]) => {
    const rel = source.relations[via];
    pipeline.push(
      {
        $lookup: {
          from: modelOf(rel.model).collection.collectionName,
          localField: rel.localField,
          foreignField: '_id',
          as: relAlias(via),
          pipeline: [{ $project: Object.fromEntries([...paths].map((p) => [p, 1])) }],
        },
      },
      { $unwind: { path: `$${relAlias(via)}`, preserveNullAndEmptyArrays: true } }
    );
  });

  if (late.length) pipeline.push({ $match: { $expr: andExpr(late) } });
  return pipeline;
}

const aggregate = (source, pipeline) => modelOf(source.model).aggregate(pipeline).option({ maxTimeMS: 20000, allowDiskUse: true });

function groupKey(source, group, ctx) {
  const f = getField(source, group.field);
  const e = fieldExpr(source, group.field, ctx);
  if (f.type !== 'date') return e;
  if (group.bucket === 'weekday') return { $isoDayOfWeek: { date: e, timezone: tzOf(f) } };
  return { $dateTrunc: { date: e, unit: group.bucket, timezone: tzOf(f), startOfWeek: 'monday' } };
}

const rangeOut = (range) => (range ? { from: P.iso(range.from), to: P.iso(P.addDays(range.to, -1)) } : null);

/* ---------------------------------- charts ---------------------------------- */

async function measureOnce(source, config, ctx, owners, range) {
  const pipeline = [...basePipeline(source, config, { owners, range, ctx }), ...groupStages(source, config.measures, ctx, null)];
  const [row] = await aggregate(source, pipeline);
  return valueOr(config.measures[0], row?.v0);
}

async function runScore(source, config, ctx, owners, range) {
  const m = config.measures[0];
  const out = { format: measureFormat(source, m), label: measureLabel(source, m) };
  if (config.compare) {
    const periods = P.growthPeriods('month', range, ctx.now);
    const [current, previous] = await Promise.all([
      measureOnce(source, config, ctx, owners, periods.current),
      measureOnce(source, config, ctx, owners, periods.previous),
    ]);
    Object.assign(out, {
      value: current, previous, changePct: growthPct(current, previous),
      currentRange: rangeOut(periods.current), previousRange: rangeOut(periods.previous),
    });
  } else {
    out.value = await measureOnce(source, config, ctx, owners, range);
  }
  if (config.target) {
    out.target = config.target;
    out.progressPct = out.value === null ? null : round((out.value / config.target) * 100);
  }
  return out;
}

function growthPct(current, previous) {
  if (current === null || previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null; // growth from nothing has no percentage
  return round(((current - previous) / Math.abs(previous)) * 100);
}

async function runGrowth(source, config, ctx, owners, range) {
  const periods = P.growthPeriods(config.interval, range, ctx.now);
  const m = config.measures[0];
  const [current, previous] = await Promise.all([
    measureOnce(source, config, ctx, owners, periods.current),
    measureOnce(source, config, ctx, owners, periods.previous),
  ]);
  return {
    label: measureLabel(source, m),
    format: measureFormat(source, m),
    current,
    previous,
    changePct: growthPct(current, previous),
    trend: current === null || previous === null || current === previous ? 'flat' : current > previous ? 'up' : 'down',
    currentRange: rangeOut(periods.current),
    previousRange: rangeOut(periods.previous),
  };
}

/**
 * Sort order of categories: 'asc' / 'desc' by value, 'label' A–Z, 'auto' = choices
 * (pipeline stages, ...) in business order, everything else by value (largest first).
 * Dates are always in time order.
 */
const sortsByValue = (sort, f) => f.type !== 'date' && (sort === 'asc' || sort === 'desc' || (sort === 'auto' && f.type !== 'enum'));

/** Category charts without a series: ranking, bar, donut, butterfly, grouped table. */
async function runCategories(source, config, ctx, owners, range) {
  const type = config.chartType;
  const f = getField(source, config.category.field);
  const byTime = f.type === 'date';
  const sortByValue = sortsByValue(config.sort, f);
  const limit = config.limit || 50;
  const base = basePipeline(source, config, { owners, range, ctx });
  const pipeline = [...base, ...groupStages(source, config.measures, ctx, groupKey(source, config.category, ctx))];
  if (sortByValue) pipeline.push({ $sort: { v0: config.sort === 'asc' ? 1 : -1, _id: 1 } });
  // Donut: keep everything (the rest becomes "Other"); others: only what is shown.
  pipeline.push({ $limit: type === 'donut' || !sortByValue ? 1000 : limit });
  const rows = await aggregate(source, pipeline);

  const described = await describeKeys(source, config.category, rows.map((r) => r._id));
  let items = rows.map((r, i) => ({
    ...described[i],
    values: config.measures.map((m, j) => valueOr(m, r[`v${j}`])),
  }));
  if (!sortByValue) {
    items.sort((a, b) => (config.sort === 'label' && !byTime ? a.label.localeCompare(b.label) : a.order - b.order));
    if (!byTime && type !== 'donut') items = items.slice(0, limit);
    if (byTime) items = items.slice(0, 400);
  }

  const m0 = config.measures[0];
  const additive = ['count', 'sum'].includes(m0.calc);
  if (type === 'donut' && items.length > limit) {
    const kept = [...items].sort((a, b) => (b.values[0] || 0) - (a.values[0] || 0)).slice(0, limit - 1);
    const rest = items.filter((it) => !kept.includes(it));
    items = kept;
    if (additive) items.push({ key: '__other', label: `Other (${rest.length})`, values: [round(rest.reduce((s, it) => s + (it.values[0] || 0), 0))] });
  }

  let total = null;
  if (config.percent) {
    const [row] = await aggregate(source, [...base, ...groupStages(source, [m0], ctx, null)]);
    total = valueOr(m0, row?.v0);
  }

  const labels = config.measures.map((m) => measureLabel(source, m));
  const formats = config.measures.map((m) => measureFormat(source, m));

  if (type === 'butterfly') {
    return {
      labels: { a: labels[0], b: labels[1] },
      formats: { a: formats[0], b: formats[1] },
      rows: items.map((it) => ({ key: it.key, label: it.label, a: it.values[0], b: it.values[1] })),
    };
  }
  if (type === 'table') {
    return {
      mode: 'grouped',
      columns: [{ key: 'category', label: f.label, type: 'text' }, ...labels.map((label, i) => ({ key: `v${i}`, label, type: 'number', format: formats[i] }))],
      rows: items.map((it) => ({ key: it.key, cells: [it.label, ...it.values], ...(total !== null ? { pct: pct(it.values[0], total) } : {}) })),
      total,
    };
  }
  return {
    label: labels[0],
    format: formats[0],
    categoryLabel: f.label,
    total,
    rows: items.map((it) => ({
      key: it.key, label: it.label, value: it.values[0], ...(total !== null ? { pct: pct(it.values[0], total) } : {}),
    })),
  };
}

/** Bar with a series (stacked / grouped bars). */
async function runCategorySeries(source, config, ctx, owners, range) {
  const pipeline = [
    ...basePipeline(source, config, { owners, range, ctx }),
    ...groupStages(source, config.measures, ctx, { c: groupKey(source, config.category, ctx), s: groupKey(source, config.series, ctx) }),
    { $limit: 5000 },
  ];
  const rows = await aggregate(source, pipeline);
  return pivot(source, config, rows, { categoryLimit: config.limit, byTimeCategory: getField(source, config.category.field).type === 'date' });
}

/** rows [{ _id: { c, s }, v0 }] -> { series, rows: [{ key, label, values: { [seriesKey]: v }, total }] } */
async function pivot(source, config, rows, { categoryLimit, byTimeCategory, fixedCategories = null }) {
  const m = config.measures[0];
  const additive = ['count', 'sum'].includes(m.calc);
  const seriesField = getField(source, config.series.field);
  const MAX_SERIES = 8;

  // Series: business order for choices, otherwise largest first; the rest is "Other".
  const rawSeries = [...new Map(rows.map((r) => [String(r._id.s), r._id.s])).values()];
  const seriesDesc = await describeKeys(source, config.series, rawSeries);
  const totals = new Map();
  rows.forEach((r) => totals.set(String(r._id.s), (totals.get(String(r._id.s)) || 0) + (r.v0 || 0)));
  const allSeries = rawSeries
    .map((raw, i) => ({ raw: String(raw), key: String(seriesDesc[i].key), label: seriesDesc[i].label, order: seriesDesc[i].order, total: totals.get(String(raw)) || 0 }))
    .sort((a, b) => (seriesField.type === 'enum' ? a.order - b.order : b.total - a.total));
  const shown = allSeries.slice(0, MAX_SERIES);
  const keyOfRaw = new Map(shown.map((s) => [s.raw, s.key]));
  const series = shown.map(({ key, label }) => ({ key, label }));
  if (allSeries.length > MAX_SERIES && additive) series.push({ key: '__other', label: 'Other' });
  const seriesKey = (raw) => keyOfRaw.get(String(raw)) ?? (additive ? '__other' : null);

  // Categories
  let categories = fixedCategories;
  if (!categories) {
    const rawCats = [...new Map(rows.map((r) => [String(r._id.c), r._id.c])).values()];
    const desc = await describeKeys(source, config.category, rawCats);
    categories = desc.map((d, i) => ({ ...d, raw: rawCats[i] }));
  }
  const byCat = new Map(categories.map((c) => [String(c.raw), { key: c.key, label: c.label, order: c.order, values: {}, total: 0 }]));
  rows.forEach((r) => {
    const cat = byCat.get(String(r._id.c));
    const sk = seriesKey(r._id.s);
    if (!cat || sk === null) return;
    const v = r.v0 ?? 0;
    cat.values[sk] = round((cat.values[sk] || 0) + v);
    cat.total = round(cat.total + v);
  });

  let out = [...byCat.values()];
  const catField = fixedCategories ? null : getField(source, config.category.field); // time points: no category field
  if (fixedCategories || byTimeCategory || !sortsByValue(config.sort, catField)) {
    out.sort((a, b) => (config.sort === 'label' && !fixedCategories && !byTimeCategory ? a.label.localeCompare(b.label) : a.order - b.order));
  } else {
    out.sort((a, b) => (config.sort === 'asc' ? a.total - b.total : b.total - a.total));
  }
  if (categoryLimit && !byTimeCategory && !fixedCategories) out = out.slice(0, categoryLimit);
  return {
    label: measureLabel(source, m),
    format: measureFormat(source, m),
    series,
    rows: out.map(({ key, label, values, total }) => ({ key, label, values, total })),
  };
}

/** Line / area: one point per period, empty periods filled with 0 (count / sum). */
async function runTimeline(source, config, ctx, owners, range) {
  const f = getField(source, config.dateField);
  const m = config.measures[0];
  const bucket = { field: config.dateField, bucket: config.interval };
  const key = groupKey(source, bucket, ctx);
  const notNull = { $expr: { $ne: [{ $ifNull: [fieldExpr(source, config.dateField, ctx), null] }, null] } };
  const base = [...basePipeline(source, config, { owners, range, ctx }), { $match: notNull }];
  const id = config.series ? { c: key, s: groupKey(source, config.series, ctx) } : key;
  const rows = await aggregate(source, [...base, ...groupStages(source, config.measures, ctx, id), { $limit: 20000 }]);

  // Every period of the range (or from the first to the last one with data).
  const tz = tzOf(f);
  const dayOfKey = (k) => P.dayOf(new Date(k), tz);
  let span = range;
  if (!span) {
    const days = rows.map((r) => (config.series ? r._id.c : r._id)).filter(Boolean).map((k) => dayOfKey(k));
    if (days.length) {
      days.sort((a, b) => P.daysBetween(b, a));
      span = { from: days[0], to: P.addDays(days[days.length - 1], 1) };
    }
  }
  const buckets = span ? P.bucketDays(config.interval, span, 401) : [];
  if (buckets.length > 400) throw new AnalyticsError(400, `Too many points: choose a longer period than "${config.interval}" or a shorter date range`);
  const isoOfKey = (k) => P.iso(P.startOf(config.interval, dayOfKey(k)));
  const points = buckets.map((d) => ({ key: P.iso(d), label: bucketLabel(config.interval, d), order: Date.UTC(d.y, d.m, d.d) }));
  const additive = ['count', 'sum', 'distinct'].includes(m.calc);

  if (config.series) {
    const fixed = points.map((p) => ({ ...p, raw: p.key }));
    const remapped = rows.map((r) => ({ ...r, _id: { c: isoOfKey(r._id.c), s: r._id.s } }));
    const out = await pivot(source, config, remapped, { fixedCategories: fixed });
    if (additive) out.rows.forEach((row) => out.series.forEach((s) => { if (row.values[s.key] === undefined) row.values[s.key] = 0; }));
    return { ...out, interval: config.interval };
  }
  const byKey = new Map(rows.map((r) => [isoOfKey(r._id), r.v0]));
  return {
    label: measureLabel(source, m),
    format: measureFormat(source, m),
    interval: config.interval,
    rows: points.map((p) => ({ key: p.key, label: p.label, value: byKey.has(p.key) ? valueOr(m, byKey.get(p.key)) : (additive ? 0 : null) })),
  };
}

/* --------------------------------- funnels --------------------------------- */

const FUNNEL_FLOW = STAGE_OPTIONS.map((o) => o.value).filter((s) => s !== 'lead-lost');

function funnelSteps(steps) {
  const first = steps[0]?.value || 0;
  return steps.map((s, i) => ({
    ...s,
    pctOfFirst: pct(s.value, first),
    pctOfPrevious: i === 0 ? null : pct(s.value, steps[i - 1].value),
  }));
}

async function runFunnel(source, config, ctx, owners, range) {
  const base = basePipeline(source, config, { owners, range, ctx });

  if (config.funnel.kind === 'enum' || config.funnel.kind === 'stage') {
    const fieldKey = config.funnel.kind === 'stage' ? 'pipelineStage' : config.funnel.field;
    const f = getField(source, fieldKey);
    const rows = await aggregate(source, [...base, { $group: { _id: fieldExpr(source, fieldKey, ctx), n: { $sum: 1 } } }]);
    const counts = new Map(rows.map((r) => [r._id, r.n]));
    if (config.funnel.kind === 'enum') {
      return { kind: 'enum', steps: funnelSteps(f.options.map((o) => ({ key: o.value, label: o.label, value: counts.get(o.value) || 0 }))) };
    }
    // Stage funnel: a lead counts in every stage it has reached. Lead Lost leads only
    // count as "all leads" (where they dropped out is not recorded).
    const total = rows.reduce((s, r) => s + r.n, 0);
    const steps = FUNNEL_FLOW.map((stage, i) => ({
      key: stage,
      label: i === 0 ? 'All leads' : f.options.find((o) => o.value === stage).label,
      value: i === 0 ? total : FUNNEL_FLOW.slice(i).reduce((s, st) => s + (counts.get(st) || 0), 0),
    }));
    return { kind: 'stage', lost: counts.get('lead-lost') || 0, steps: funnelSteps(steps) };
  }

  // Activity funnel: leads that have at least one Visit / Demo / ... record.
  const lookups = ACTIVITY_FUNNEL.flatMap((step) => [{
    $lookup: {
      from: modelOf(step.model).collection.collectionName,
      let: { id: '$_id' },
      pipeline: [{ $match: { $expr: { $eq: ['$lead', '$$id'] } } }, { $limit: 1 }, { $project: { _id: 1 } }],
      as: `__f_${step.key}`,
    },
  }]);
  const stage = fieldExpr(source, 'pipelineStage', ctx);
  const group = {
    _id: null,
    all: { $sum: 1 },
    won: { $sum: { $cond: [{ $eq: [stage, 'lead-won'] }, 1, 0] } },
    ...Object.fromEntries(ACTIVITY_FUNNEL.map((s) => [s.key, { $sum: { $cond: [{ $gt: [{ $size: `$__f_${s.key}` }, 0] }, 1, 0] } }])),
  };
  const [row] = await aggregate(source, [...base, { $project: { _id: 1, pipelineStage: 1 } }, ...lookups, { $group: group }]);
  const steps = [
    { key: 'all', label: 'All leads', value: row?.all || 0 },
    ...ACTIVITY_FUNNEL.map((s) => ({ key: s.key, label: s.label, value: row?.[s.key] || 0 })),
    { key: 'won', label: 'Lead Won', value: row?.won || 0 },
  ];
  return { kind: 'activity', steps: funnelSteps(steps) };
}

/* ------------------------------- record table ------------------------------- */

async function runRecords(source, config, ctx, owners, range, page) {
  const { columns, sortField, sortDir, pageSize } = config.table;
  const project = { _id: 1, __s: fieldExpr(source, sortField, ctx) };
  columns.forEach((c, i) => { project[`c${i}`] = fieldExpr(source, c, ctx); });
  const dir = sortDir === 'asc' ? 1 : -1;
  const [result] = await aggregate(source, [
    ...basePipeline(source, config, { owners, range, ctx }),
    { $project: project },
    { $sort: { __s: dir, _id: dir } },
    { $facet: { rows: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }], total: [{ $count: 'n' }] } },
  ]);
  const rows = result?.rows || [];

  // Readable cells: names for references, labels for choices, ISO for dates.
  const cells = await Promise.all(columns.map(async (c, i) => {
    const f = getField(source, c);
    const raw = rows.map((r) => r[`c${i}`]);
    if (f.type === 'ref' || f.type === 'enum' || f.type === 'bool') {
      const unique = [...new Map(raw.map((v) => [String(v), v])).values()];
      const desc = await describeKeys(source, { field: c }, unique);
      const byKey = new Map(unique.map((v, j) => [String(v), desc[j].label]));
      return raw.map((v) => (v === null || v === undefined ? null : byKey.get(String(v))));
    }
    if (f.type === 'date') return raw.map((v) => (v ? new Date(v).toISOString() : null));
    if (f.type === 'number') return raw.map((v) => round(v));
    if (f.type === 'id') return raw.map((v) => (v ? String(v) : null));
    return raw.map((v) => (v === undefined ? null : v));
  }));

  return {
    mode: 'records',
    columns: columns.map((c) => {
      const f = getField(source, c);
      return { key: c, label: f.label, type: f.type, utcDay: Boolean(f.utcDay), format: f.format || null };
    }),
    rows: rows.map((r, j) => ({ id: String(r._id), cells: columns.map((_, i) => cells[i][j]) })),
    page,
    pageSize,
    total: result?.total?.[0]?.n || 0,
  };
}

/* ----------------------------------- run ----------------------------------- */

/**
 * Dashboard filters -> extra conditions for this source.
 * Returns { conditions, ignored } (filters this source cannot apply).
 */
async function dashboardConditions(source, filters) {
  const conditions = [];
  const ignored = [];
  const dims = source.dimensions || {};
  if (filters.employee) conditions.push({ field: dims.employee, op: 'in', value: filters.employee });
  if (filters.product) {
    if (dims.product) conditions.push({ field: dims.product, op: 'in', value: filters.product });
    else ignored.push('product');
  }
  if (filters.status) {
    if (dims.status) conditions.push({ field: dims.status, op: 'in', value: filters.status });
    else ignored.push('status');
  }
  if (filters.department) {
    const users = await modelOf('User').find({ department: { $in: filters.department.map(oid) } }).select('_id').lean();
    conditions.push({ field: source.ownerField, op: 'in', value: users.map((u) => String(u._id)) });
  }
  // An empty list (a department without employees) matches nothing, as it should.
  return { conditions, ignored };
}

async function run(rawConfig, {
  owners = null, dashboardFilters = {}, page = 1, now = new Date(),
} = {}) {
  const source = getSource(rawConfig.source);
  const today = P.dayOf(now);
  const ctx = { now, today, todayUtc: P.instant(today, { utcDay: true }) };

  // Dashboard filters: the date range replaces the widget's; the rest are added.
  const { conditions, ignored } = await dashboardConditions(source, dashboardFilters);
  const config = { ...rawConfig, extraConditions: conditions };
  const rangeSpec = dashboardFilters.dateRange || config.dateRange;
  if (rangeSpec && !config.dateField) config.dateField = source.defaultDate;
  const range = P.resolveRange(rangeSpec, now);

  const scopeOwners = owners ? owners.map(oid) : null;
  const type = config.chartType;
  let data;
  if (type === 'score') data = await runScore(source, config, ctx, scopeOwners, range);
  else if (type === 'growth') data = await runGrowth(source, config, ctx, scopeOwners, range);
  else if (type === 'line' || type === 'area') data = await runTimeline(source, config, ctx, scopeOwners, range);
  else if (type === 'funnel') data = await runFunnel(source, config, ctx, scopeOwners, range);
  else if (type === 'table' && config.table.mode === 'records') data = await runRecords(source, config, ctx, scopeOwners, range, page);
  else if (type === 'bar' && config.series) data = await runCategorySeries(source, config, ctx, scopeOwners, range);
  else data = await runCategories(source, config, ctx, scopeOwners, range);

  return {
    chartType: type,
    chartLabel: CHARTS[type].label,
    source: { key: source.key, label: source.label },
    range: rangeOut(range),
    dateField: config.dateField ? { key: config.dateField, label: getField(source, config.dateField).label } : null,
    ignoredFilters: ignored,
    data,
  };
}

module.exports = { run, usedFields };
