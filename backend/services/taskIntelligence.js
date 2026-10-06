const Timesheet = require('../models/Timesheet');

// Task time intelligence: actual hours are derived from start/end time, the
// "estimated" hours are decided by the system from how long the same kind of work
// has taken historically, and the employee gets a short coaching message comparing
// the two. No external AI call — plain statistics over existing timesheet data.

// Used only when there isn't enough history for a category yet.
const DEFAULT_HOURS = {
  Development: 3, Testing: 2, Meeting: 1, 'Client Work': 2, Support: 1.5,
  Documentation: 2, Research: 2.5, Training: 2, Administrative: 1, Other: 1.5,
};

const MIN_TASK_SAMPLES = 3;      // same task title, across the whole company
const MIN_CATEGORY_SAMPLES = 5;  // same work category
const HISTORY_LIMIT = 1000;      // most recent completed entries considered per category
const TOLERANCE = 0.2;           // ±20% of the estimate counts as "on target"

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const normalise = (s = '') => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

// Hours between startTime and endTime ("HH:mm"). Returns { hours } or { error }.
const hoursFromTimes = (startTime, endTime) => {
  const s = toMinutes(startTime), e = toMinutes(endTime);
  if (s == null || e == null) return { error: 'Start time and end time are required.' };
  if (e <= s) return { error: 'End time must be after start time.' };
  return { hours: round2((e - s) / 60) };
};

// System-decided estimate for a task: same task title first, then the work
// category, then a sensible default. Median of completed entries, so one
// outlier day doesn't skew it. `excludeEntryId` keeps an entry from being
// benchmarked against itself when it is edited.
const estimateHours = async ({ task, workCategory, excludeEntryId }) => {
  const category = workCategory || 'Other';
  const rows = await Timesheet.aggregate([
    { $sort: { date: -1 } },
    { $unwind: '$entries' },
    { $match: { 'entries.workCategory': category, 'entries.status': 'Completed', 'entries.hours': { $gt: 0 } } },
    { $limit: HISTORY_LIMIT },
    { $project: { _id: 0, entryId: '$entries._id', task: '$entries.task', hours: '$entries.hours' } },
  ]);
  const pool = rows.filter((r) => !excludeEntryId || String(r.entryId) !== String(excludeEntryId));

  const key = normalise(task);
  const sameTask = key ? pool.filter((r) => normalise(r.task) === key).map((r) => r.hours) : [];
  if (sameTask.length >= MIN_TASK_SAMPLES) {
    return { hours: round1(median(sameTask)), basis: 'task', sampleSize: sameTask.length };
  }
  if (pool.length >= MIN_CATEGORY_SAMPLES) {
    return { hours: round1(median(pool.map((r) => r.hours))), basis: 'category', sampleSize: pool.length };
  }
  return { hours: DEFAULT_HOURS[category] ?? DEFAULT_HOURS.Other, basis: 'default', sampleSize: 0 };
};

// Compare actual vs estimated and word the feedback for the employee.
const buildInsight = ({ actual, estimated, status }) => {
  const a = round1(actual), e = round1(estimated);
  const finished = status === 'Completed';

  if (actual > estimated * (1 + TOLERANCE)) {
    return {
      verdict: 'over',
      message: `The estimated time for this task is ${e}h but you took ${a}h (${round1(actual - estimated)}h more). `
        + 'Please try to work within the estimated hours — if something slowed you down, note it in the remarks.',
    };
  }
  if (!finished) {
    return {
      verdict: 'in-progress',
      message: `Estimated time is ${e}h and you've used ${a}h so far. Keep going — you're within the estimate.`,
    };
  }
  if (actual < estimated * (1 - TOLERANCE)) {
    return {
      verdict: 'under',
      message: `Great speed! The estimated time was ${e}h and you finished in ${a}h (${round1(estimated - actual)}h early). `
        + 'The system will use this to fine-tune future estimates for this kind of work.',
    };
  }
  return {
    verdict: 'on-target',
    message: `Well done! The estimated time was ${e}h and you took ${a}h — you used your time very well.`,
  };
};

// Fills in hours (from start/end time), the system estimate and the insight on
// an entry-shaped object. Returns { entry } or { error }.
const analyseEntry = async (entry, { excludeEntryId } = {}) => {
  const t = hoursFromTimes(entry.startTime, entry.endTime);
  if (t.error) return { error: t.error };

  const est = await estimateHours({ task: entry.task, workCategory: entry.workCategory, excludeEntryId });
  const insight = buildInsight({ actual: t.hours, estimated: est.hours, status: entry.status });

  return {
    entry: {
      ...entry,
      hours: t.hours,
      estimatedHours: est.hours,
      insight: { ...insight, basis: est.basis, sampleSize: est.sampleSize },
    },
  };
};

module.exports = { hoursFromTimes, estimateHours, buildInsight, analyseEntry };
