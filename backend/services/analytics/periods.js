/**
 * Calendar periods for analytics, in the company time zone (ANALYTICS_TZ,
 * default Asia/Kolkata).
 *
 * A range is a pair of calendar days { from, to } (from inclusive, to EXCLUSIVE),
 * each { y, m, d } with m 0-based. It is turned into instants per field:
 *   - date-only fields (stored as UTC midnight: followUpDate, visitDate, ...) -> UTC midnight
 *   - timestamps (createdAt, timeIn, ...)                                      -> local midnight
 * so "October" means the same days for both kinds of field.
 */

const TZ = process.env.ANALYTICS_TZ || 'Asia/Kolkata';

const fmtCache = new Map();
const formatter = (tz) => {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return fmtCache.get(tz);
};

/** Milliseconds to add to a UTC instant to get the wall-clock time in `tz`. */
function tzOffsetMs(date, tz = TZ) {
  if (tz === 'UTC') return 0;
  const p = Object.fromEntries(formatter(tz).formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The calendar day of an instant in `tz`. */
function dayOf(date, tz = TZ) {
  const local = new Date(date.getTime() + tzOffsetMs(date, tz));
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate() };
}

/** Normalises overflow (d = 0, m = 13, ...) through Date.UTC. */
const norm = ({ y, m, d }) => {
  const t = new Date(Date.UTC(y, m, d));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
};
const addDays = (day, n) => norm({ ...day, d: day.d + n });
const addMonths = (day, n) => norm({ y: day.y, m: day.m + n, d: day.d });
const weekday = (day) => new Date(Date.UTC(day.y, day.m, day.d)).getUTCDay(); // 0 = Sunday

/** Start of the period (Monday-based weeks) containing `day`. */
function startOf(unit, day) {
  switch (unit) {
    case 'day': return { ...day };
    case 'week': return addDays(day, -((weekday(day) + 6) % 7));
    case 'month': return { y: day.y, m: day.m, d: 1 };
    case 'quarter': return { y: day.y, m: day.m - (day.m % 3), d: 1 };
    case 'year': return { y: day.y, m: 0, d: 1 };
    default: throw new Error(`Unknown period ${unit}`);
  }
}

function shift(unit, day, n) {
  switch (unit) {
    case 'day': return addDays(day, n);
    case 'week': return addDays(day, 7 * n);
    case 'month': return addMonths(day, n);
    case 'quarter': return addMonths(day, 3 * n);
    case 'year': return addMonths(day, 12 * n);
    default: throw new Error(`Unknown period ${unit}`);
  }
}

const daysBetween = (a, b) => Math.round((Date.UTC(b.y, b.m, b.d) - Date.UTC(a.y, a.m, a.d)) / 86400000);
const sameDay = (a, b) => a.y === b.y && a.m === b.m && a.d === b.d;

/** Instant where calendar day `day` starts, for a field (utcDay: stored as UTC midnight). */
function instant(day, { utcDay = false } = {}) {
  const guess = Date.UTC(day.y, day.m, day.d);
  if (utcDay) return new Date(guess);
  const first = guess - tzOffsetMs(new Date(guess));
  return new Date(guess - tzOffsetMs(new Date(first))); // second pass: offset at the real instant (DST)
}

const iso = (day) => `${day.y}-${String(day.m + 1).padStart(2, '0')}-${String(day.d).padStart(2, '0')}`;
const parseDay = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const day = norm({ y, m: m - 1, d });
  return iso(day) === s ? day : null;
};

const PRESETS = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7_days: 'Last 7 days',
  last_30_days: 'Last 30 days',
  last_90_days: 'Last 90 days',
  this_week: 'This week',
  last_week: 'Last week',
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  last_quarter: 'Last quarter',
  this_year: 'This year',
  last_year: 'Last year',
  all: 'All time',
};

/** { from, to } calendar range for a preset, or null for 'all'. */
function presetRange(preset, now = new Date()) {
  const today = dayOf(now);
  const tomorrow = addDays(today, 1);
  const period = (unit, back) => {
    const start = shift(unit, startOf(unit, today), -back);
    return { from: start, to: shift(unit, start, 1) };
  };
  switch (preset) {
    case 'today': return { from: today, to: tomorrow };
    case 'yesterday': return { from: addDays(today, -1), to: today };
    case 'last_7_days': return { from: addDays(today, -6), to: tomorrow };
    case 'last_30_days': return { from: addDays(today, -29), to: tomorrow };
    case 'last_90_days': return { from: addDays(today, -89), to: tomorrow };
    case 'this_week': return period('week', 0);
    case 'last_week': return period('week', 1);
    case 'this_month': return period('month', 0);
    case 'last_month': return period('month', 1);
    case 'this_quarter': return period('quarter', 0);
    case 'last_quarter': return period('quarter', 1);
    case 'this_year': return period('year', 0);
    case 'last_year': return period('year', 1);
    case 'all': return null;
    default: throw new Error(`Unknown date preset ${preset}`);
  }
}

/** A stored range spec ({ preset } or { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } inclusive) -> calendar range. */
function resolveRange(spec, now = new Date()) {
  if (!spec) return null;
  if (spec.preset) return presetRange(spec.preset, now);
  return { from: parseDay(spec.from), to: addDays(parseDay(spec.to), 1) };
}

/**
 * Growth Index periods.
 *   explicit range -> previous = the same number of days just before it
 *   no range       -> this period so far (including today) vs the same number of
 *                     days at the start of the previous period
 */
function growthPeriods(unit, range, now = new Date()) {
  if (range) {
    const len = daysBetween(range.from, range.to);
    return { current: range, previous: { from: addDays(range.from, -len), to: range.from } };
  }
  const today = dayOf(now);
  const start = startOf(unit, today);
  const elapsed = daysBetween(start, today) + 1;
  const prevStart = shift(unit, start, -1);
  let prevEnd = addDays(prevStart, elapsed);
  if (daysBetween(prevEnd, start) < 0) prevEnd = start;
  return { current: { from: start, to: addDays(today, 1) }, previous: { from: prevStart, to: prevEnd } };
}

/** Bucket starts from `range.from` up to (excluding) `range.to`, at most `max`. */
function bucketDays(unit, range, max = 400) {
  const out = [];
  for (let d = startOf(unit, range.from); daysBetween(d, range.to) > 0 && out.length < max; d = shift(unit, d, 1)) out.push(d);
  return out;
}

module.exports = {
  TZ, PRESETS, tzOffsetMs, dayOf, addDays, startOf, shift, sameDay, daysBetween, instant, iso, parseDay,
  presetRange, resolveRange, growthPeriods, bucketDays,
};
