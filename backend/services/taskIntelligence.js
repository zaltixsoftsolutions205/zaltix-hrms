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

// ── Estimating from what was typed ───────────────────────────────────────────
// 1) the same task title done 3+ times, 2) completed tasks whose WORDING is similar
// (title + description), 3) a breakdown of the text itself — kind of work, how many
// separate things it covers, how big the scope sounds. Nothing leaves the server.

const STOPWORDS = new Set(('the and for with from this that was were are has have had into onto over under about after before then '
  + 'than also just some more most very been being our your their his her its can will would should could may might not but all any '
  + 'per via etc new old today work worked working task tasks done doing did make made got get').split(' '));

// Light stemmer: "updated/updates/update" -> "updat", "timesheets" -> "timesheet".
const stem = (w) => {
  let s = w;
  if (s.length > 5 && /ing$/.test(s)) s = s.slice(0, -3);
  else if (s.length > 4 && /ed$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 4 && /es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && /s$/.test(s) && !/ss$/.test(s)) s = s.slice(0, -1);
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
};
const tokenize = (text) => normalise(text).replace(/[^a-z0-9\s]/g, ' ').split(' ')
  .filter((w) => w.length > 2 && !STOPWORDS.has(w)).map(stem);

// Term-count vector; title words count double since they name the task.
const vectorOf = (task, description) => {
  const v = new Map();
  for (const t of tokenize(task)) v.set(t, (v.get(t) || 0) + 2);
  for (const t of tokenize(description)) v.set(t, (v.get(t) || 0) + 1);
  return v;
};

const cosine = (a, b, idf) => {
  let dot = 0, na = 0, nb = 0;
  for (const [t, c] of a) { const w = c * (idf.get(t) || 1); na += w * w; if (b.has(t)) dot += w * b.get(t) * (idf.get(t) || 1); }
  for (const [t, c] of b) { const w = c * (idf.get(t) || 1); nb += w * w; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

const weightedMedian = (pairs) => { // [{ value, weight }]
  const s = [...pairs].sort((x, y) => x.value - y.value);
  const total = s.reduce((n, p) => n + p.weight, 0);
  let run = 0;
  for (const p of s) { run += p.weight; if (run >= total / 2) return p.value; }
  return s[s.length - 1].value;
};

// Kind of work -> typical hours for one such task (first match wins; title is checked before description).
const ACTIONS = [
  [/\b(meeting|call|stand-?up|sync|demo|interview|discussion|discuss)\b/i, 'a meeting / discussion', 1],
  [/\b(review|feedback|follow-?up|approval|approve)\b/i, 'a review', 1],
  [/\b(bug|fix|issue|hot-?fix|debug|error|crash|resolve)\b/i, 'a bug fix', 2],
  [/\b(test|testing|qa|regression|verify|validate|validation)\b/i, 'testing', 2],
  [/\b(document|documentation|docs?|readme|report|write-?up)\b/i, 'documentation', 2],
  [/\b(plan|planning|brainstorm|estimate|research|analy[sz]\w*|investigat\w*|poc|study|explore)\b/i, 'planning / research', 2.5],
  [/\b(design|ui|ux|mock-?up|wireframe|prototype|layout|styling)\b/i, 'design work', 3],
  [/\b(implement\w*|develop\w*|build|creat\w*|integrat\w*|api|module|feature|migrat\w*|set-?up|deploy\w*|configur\w*|refactor\w*)\b/i, 'development', 3.5],
  [/\b(update|change|modify|improv\w*|enhanc\w*|add|adjust)\b/i, 'an update', 2],
];
const SMALL_RE = /\b(typo|minor|small|tiny|quick|tweak|simple|rename|spelling|text change)\b/i;
const BIG_WORDS = /\b(complete|entire|whole|full|end-to-end|e2e|multiple|major|complex|large|migration|architecture|platform|system|module|dashboard|workflow|integration|all)\b/gi;

const roundQuarter = (n) => Math.round(n * 4) / 4;

// Estimate by reading the wording alone.
const estimateFromWording = ({ task, description, category }) => {
  const text = `${task || ''} ${description || ''}`;
  let base = null, label = null;
  for (const src of [task, description]) {
    if (!src) continue;
    const hit = ACTIONS.find(([re]) => re.test(src));
    if (hit) { label = hit[1]; base = hit[2]; break; }
  }
  if (base == null) { label = `${String(category || 'Other').toLowerCase()} work`; base = DEFAULT_HOURS[category] ?? DEFAULT_HOURS.Other; }

  let hours = base;
  const notes = [`looks like ${label} (about ${base}h)`];
  // Nothing in the wording said what kind of work this is — be upfront that it's a guess.
  if (label.endsWith(' work') && !ACTIONS.some(([re]) => re.test(text))) notes.push('add a short description for a sharper estimate');

  // How many separate things does the description cover?
  const items = (description || '').split(/[,;\n•+]|\band\b|\bthen\b|\balso\b|\bwhen\b|\bif\b/i)
    .map((s) => s.trim()).filter((s) => s.split(/\s+/).filter(Boolean).length >= 2).length;
  if (items >= 2) {
    const f = 1 + 0.2 * (Math.min(items, 6) - 1);
    hours *= f; notes.push(`covers ${items} separate things (×${round1(f)})`);
  }

  const bigHits = new Set((text.match(BIG_WORDS) || []).map((w) => w.toLowerCase()));
  if (bigHits.size) {
    const f = bigHits.size >= 2 ? 1.6 : 1.3;
    hours *= f; notes.push(`large scope: ${[...bigHits].slice(0, 3).join(', ')} (×${f})`);
  }
  if (SMALL_RE.test(text)) { hours *= 0.5; notes.push('sounds like a small change (×0.5)'); }

  const words = (description || '').trim().split(/\s+/).filter(Boolean).length;
  if (words > 60) { hours *= 1.25; notes.push('very detailed description (×1.25)'); }

  hours = Math.min(8, Math.max(0.25, roundQuarter(hours)));
  return { hours, notes };
};

const SIMILAR_MIN = 0.3;      // a past task must be at least this similar to count
const SIMILAR_STRONG = 0.55;  // …one that similar is enough on its own

// System-decided estimate from what was typed. `excludeEntryId` keeps an entry from
// being compared with itself when it is edited.
const estimateHours = async ({ task, description, workCategory, excludeEntryId }) => {
  const category = workCategory || 'Other';
  const rows = await Timesheet.aggregate([
    { $sort: { date: -1 } },
    { $unwind: '$entries' },
    { $match: { 'entries.status': 'Completed', 'entries.hours': { $gt: 0 } } },
    { $limit: HISTORY_LIMIT },
    { $project: { _id: 0, entryId: '$entries._id', task: '$entries.task', description: '$entries.description', category: '$entries.workCategory', hours: '$entries.hours' } },
  ]);
  const pool = rows.filter((r) => !excludeEntryId || String(r.entryId) !== String(excludeEntryId));

  // 1) The very same title, done several times.
  const key = normalise(task);
  const sameTask = key ? pool.filter((r) => normalise(r.task) === key).map((r) => r.hours) : [];
  if (sameTask.length >= MIN_TASK_SAMPLES) {
    return {
      hours: roundQuarter(median(sameTask)), basis: 'task', sampleSize: sameTask.length, similar: [],
      explanation: `"${task}" has been completed ${sameTask.length} times before; the typical time is ${round1(median(sameTask))}h.`,
    };
  }

  // 2) Completed tasks whose wording is similar.
  const q = vectorOf(task, description);
  if (q.size) {
    const docs = pool.map((r) => ({ ...r, vec: vectorOf(r.task, r.description) }));
    const df = new Map();
    for (const d of [{ vec: q }, ...docs]) for (const t of d.vec.keys()) df.set(t, (df.get(t) || 0) + 1);
    const idf = new Map([...df].map(([t, n]) => [t, Math.log(1 + (docs.length + 1) / (1 + n))]));
    const near = docs
      .map((d) => ({ task: d.task, hours: d.hours, sim: cosine(q, d.vec, idf) * (d.category === category ? 1 : 0.85) }))
      .filter((d) => d.sim >= SIMILAR_MIN)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 5);
    if (near.length && (near[0].sim >= SIMILAR_STRONG || near.length >= 2)) {
      const hours = roundQuarter(weightedMedian(near.map((n) => ({ value: n.hours, weight: n.sim }))));
      const shown = near.slice(0, 3).map((n) => `"${n.task}" (${round1(n.hours)}h)`).join(', ');
      return {
        hours, basis: 'similar', sampleSize: near.length, similar: near.slice(0, 3).map((n) => ({ task: n.task, hours: round1(n.hours) })),
        explanation: `Based on ${near.length} similar completed task${near.length === 1 ? '' : 's'}: ${shown}.`,
      };
    }
  }

  // 3) No similar history yet — read the wording itself.
  const w = estimateFromWording({ task, description, category });
  return { hours: w.hours, basis: 'text', sampleSize: 0, similar: [], explanation: `No similar past tasks yet — ${w.notes.join(', ')}.` };
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

const verdictFor = (actual, estimated) => {
  if (actual > estimated * (1 + TOLERANCE)) return 'over';
  if (actual < estimated * (1 - TOLERANCE)) return 'under';
  return 'on-target';
};

// First existing entry whose time range overlaps `candidate`'s (touching ends,
// e.g. 9–10 then 10–11, do not overlap). `excludeId` skips the entry being edited.
const findOverlap = (entries, candidate, excludeId) => {
  const s = toMinutes(candidate.startTime), e = toMinutes(candidate.endTime);
  if (s == null || e == null) return null;
  return (entries || []).find((other) => {
    if (excludeId && String(other._id) === String(excludeId)) return false;
    const os = toMinutes(other.startTime), oe = toMinutes(other.endTime);
    if (os == null || oe == null) return false;
    return s < oe && os < e;
  }) || null;
};

// Roll a set of entries up into time-intelligence numbers. Only completed tasks
// that have a system estimate are compared (in-progress work isn't finished, so
// it can't be judged fast or slow); totalHours counts everything logged.
const summariseEntries = (entries = []) => {
  let totalHours = 0, actual = 0, estimated = 0, analysed = 0, over = 0, under = 0, onTarget = 0;
  for (const en of entries) {
    totalHours += en.hours || 0;
    if (en.status !== 'Completed' || !(en.estimatedHours > 0) || !(en.hours > 0)) continue;
    analysed += 1;
    actual += en.hours;
    estimated += en.estimatedHours;
    const v = verdictFor(en.hours, en.estimatedHours);
    if (v === 'over') over += 1; else if (v === 'under') under += 1; else onTarget += 1;
  }
  const ratioPct = estimated > 0 ? Math.round((actual / estimated) * 100) : null;
  const plural = analysed === 1 ? '' : 's';

  let message = 'No completed tasks to analyse yet.';
  if (analysed > 0) {
    if (ratioPct > (1 + TOLERANCE) * 100) {
      message = `Took ${round1(actual)}h on ${analysed} completed task${plural} against ${round1(estimated)}h estimated`
        + ` (${over} ran over). Try to stay within the estimated hours.`;
    } else if (ratioPct < (1 - TOLERANCE) * 100) {
      message = `Finished ${analysed} task${plural} in ${round1(actual)}h against ${round1(estimated)}h estimated — faster than expected.`;
    } else {
      message = `Well done! Completed ${analysed} task${plural} in ${round1(actual)}h against ${round1(estimated)}h estimated.`;
    }
  }
  return {
    totalHours: round1(totalHours), analysedTasks: analysed,
    actualHours: round1(actual), estimatedHours: round1(estimated),
    ratioPct, over, under, onTarget, message,
  };
};

// ── One-topic check ──────────────────────────────────────────────────────────
// Working a single topic all day is fine now and then; doing it day after day
// usually means low variety or slow progress, so after STREAK_TRIGGER working days
// in a row we ask the employee why and nudge them to take on more.
const STREAK_TRIGGER = 2;
const STREAK_STRONG = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const ymdDow = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
const ymdPrev = (ymd) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() - DAY_MS).toISOString().slice(0, 10);

// Same-topic comparison key: case/spacing-insensitive, and "Timesheet" == "Timesheets".
const topicKey = (s) => normalise(s).replace(/\b(\w{3,})s\b/g, '$1');

// topicsByDay: Map<'YYYY-MM-DD', string[]> of task titles logged that day.
// Counts consecutive working days (Sundays skipped), ending at endYmd, on which the
// employee worked on that SAME single topic and nothing else. A day with nothing logged,
// a second topic, or a different topic ends the streak — one-task days on different
// tasks are normal and never count.
const singleTopicStreak = (topicsByDay, endYmd) => {
  const endTitles = topicsByDay.get(endYmd) || [];
  const endKeys = new Set(endTitles.map(topicKey));
  if (endKeys.size !== 1) return { streak: 0, topic: '' };
  const [key] = endKeys;

  let cur = endYmd, streak = 0;
  for (let i = 0; i < 14; i++) {
    if (ymdDow(cur) === 0 && cur !== endYmd) { cur = ymdPrev(cur); continue; }
    const keys = new Set((topicsByDay.get(cur) || []).map(topicKey));
    if (keys.size !== 1 || !keys.has(key)) break;
    streak += 1;
    cur = ymdPrev(cur);
  }
  return { streak, topic: endTitles[0] };
};

// Longest same-single-topic streak on any logged day (for the monthly admin insight).
const longestSingleTopicStreak = (topicsByDay) => {
  let best = { streak: 0, topic: '' };
  for (const day of topicsByDay.keys()) {
    const r = singleTopicStreak(topicsByDay, day);
    if (r.streak > best.streak) best = r;
  }
  return best;
};

const focusMessage = (streak, topic) => {
  const lead = `You have worked on only one topic ("${topic}") for ${streak} days in a row. Why only one task?`;
  return streak >= STREAK_STRONG
    ? `${lead} Please improve how you use your time and take up multiple tasks each day.`
    : `${lead} Try to improve your time and work on more than one task a day.`;
};

// Fills in hours (from start/end time), the system estimate and the insight on
// an entry-shaped object. Returns { entry } or { error }.
const analyseEntry = async (entry, { excludeEntryId, employeeId } = {}) => {
  const t = hoursFromTimes(entry.startTime, entry.endTime);
  if (t.error) return { error: t.error };

  const est = await estimateHours({
    task: entry.task, description: entry.description, workCategory: entry.workCategory, employeeId, excludeEntryId,
  });
  const insight = buildInsight({ actual: t.hours, estimated: est.hours, status: entry.status });

  return {
    entry: {
      ...entry,
      hours: t.hours,
      estimatedHours: est.hours,
      insight: { ...insight, basis: est.basis, sampleSize: est.sampleSize, explanation: est.explanation },
    },
  };
};

module.exports = {
  hoursFromTimes, estimateHours, buildInsight, analyseEntry, verdictFor, findOverlap, summariseEntries,
  singleTopicStreak, longestSingleTopicStreak, focusMessage, STREAK_TRIGGER, STREAK_STRONG,
};
