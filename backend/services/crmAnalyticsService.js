/**
 * crmAnalyticsService.js
 * ---------------------------------------------------------------------------
 * Numbers for the admin CRM Analytics page (GET /api/admin/reports/crm-analytics).
 *
 * Everything is computed in MongoDB over ALL leads (no paging), for one period
 * in the company time zone (services/analytics/periods.js):
 *   today | weekly | monthly | yearly
 * The previous period ("so far", same length) feeds the trend badges.
 *
 * A lead is
 *   won   when its pipelineStage is lead-won  (legacy: converted, closed-won);
 *         won date = latest stageHistory move to won, else updatedAt
 *   lost  when its pipelineStage is lead-lost (legacy: closed-lost);
 *         lost date = lostAt, else updatedAt
 * Activities (visits, demos, data updates, registrations, feedback) are counted
 * on their own calendar date field and credited to the employee who did them.
 * ---------------------------------------------------------------------------
 */

const User = require('../models/User');
const Lead = require('../models/Lead');
const Visit = require('../models/Visit');
const Demo = require('../models/Demo');
const DataUpdate = require('../models/DataUpdate');
const Registration = require('../models/Registration');
const Feedback = require('../models/Feedback');
const { LEAD_ASSIGNEE_ROLES } = require('./leadAssigneeService');
const P = require('./analytics/periods');

const PERIOD_UNITS = { today: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

const ROLE_LABELS = { sales: 'Sales', 'inside-sales': 'Inside Sales', 'product-executive': 'Product Executive' };

const STAGE_LABELS = {
  lead: 'Lead', visit: 'Visit', demo: 'Demo', 'data-update': 'Data Update', registration: 'Registration',
  feedback: 'Feedback', 'lead-won': 'Won', 'lead-lost': 'Lost',
};

const WON = Lead.stageValues('lead-won');
const LOST = Lead.stageValues('lead-lost');
const CLOSED = [...WON, ...LOST];

// [model, employee field, calendar date field, key in the response]
const ACTIVITY_SOURCES = [
  [Visit, 'visitedBy', 'visitDate', 'visits'],
  [Demo, 'assignedTo', 'demoDate', 'demos'],
  [DataUpdate, 'assignedTo', 'updateDate', 'dataUpdates'],
  [Registration, 'assignedTo', 'registrationDate', 'registrations'],
  [Feedback, 'assignedTo', 'feedbackDate', 'feedback'],
];
const ACTIVITY_KEYS = ACTIVITY_SOURCES.map((s) => s[3]);

const isValidPeriod = (p) => Object.prototype.hasOwnProperty.call(PERIOD_UNITS, p);

/** Instants for a calendar range: timestamps (local midnight) and date-only fields (UTC midnight). */
const bounds = (range) => ({
  ts: { from: P.instant(range.from), to: P.instant(range.to) },
  day: { from: P.instant(range.from, { utcDay: true }), to: P.instant(range.to, { utcDay: true }) },
});

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/** 1 when `path` is in [from, to), else 0 (for $sum). */
const inRange = (path, from, to) => ({ $cond: [{ $and: [{ $gte: [path, from] }, { $lt: [path, to] }] }, 1, 0] });

/** Activity counts per employee for the current and previous period. */
async function activityCounts(cur, prev) {
  const results = await Promise.all(ACTIVITY_SOURCES.map(([Model, empField, dateField]) => Model.aggregate([
    { $match: { [dateField]: { $gte: prev.day.from, $lt: cur.day.to } } },
    {
      $group: {
        _id: `$${empField}`,
        cur: { $sum: inRange(`$${dateField}`, cur.day.from, cur.day.to) },
        prev: { $sum: inRange(`$${dateField}`, prev.day.from, prev.day.to) },
      },
    },
  ])));
  const byEmp = new Map(); // empId -> { visits, demos, ... }
  const totals = {};
  const prevTotals = {};
  results.forEach((rows, i) => {
    const key = ACTIVITY_KEYS[i];
    totals[key] = 0;
    prevTotals[key] = 0;
    rows.forEach((r) => {
      totals[key] += r.cur;
      prevTotals[key] += r.prev;
      if (!r._id) return;
      const id = String(r._id);
      if (!byEmp.has(id)) byEmp.set(id, {});
      byEmp.get(id)[key] = r.cur;
    });
  });
  return { byEmp, totals, prevTotals };
}

async function getCrmAnalytics(period, now = new Date()) {
  const unit = PERIOD_UNITS[period];
  const { current, previous } = P.growthPeriods(unit, null, now);
  const cur = bounds(current);
  const prev = bounds(previous);

  // Last 6 calendar months (including this one) for the trend chart.
  const thisMonth = P.startOf('month', P.dayOf(now));
  const trendStartDay = P.shift('month', thisMonth, -5);
  const trendStart = P.instant(trendStartDay);
  const earliest = new Date(Math.min(trendStart.getTime(), prev.ts.from.getTime()));

  const closedAtExpr = {
    $cond: [
      { $in: ['$pipelineStage', WON] },
      {
        $ifNull: [
          {
            $max: {
              $map: {
                input: { $filter: { input: { $ifNull: ['$stageHistory', []] }, as: 'h', cond: { $in: ['$$h.to', WON] } } },
                as: 'h',
                in: '$$h.at',
              },
            },
          },
          '$updatedAt',
        ],
      },
      { $ifNull: ['$lostAt', '$updatedAt'] },
    ],
  };
  const monthKey = (path) => ({ $dateToString: { format: '%Y-%m', date: path, timezone: P.TZ } });

  const [employees, stageRows, holdingRows, createdFacet, closedFacet, activities] = await Promise.all([
    User.find({ isActive: { $ne: false }, role: { $in: LEAD_ASSIGNEE_ROLES } })
      .select('_id name employeeId role').sort({ name: 1 }).lean(),

    // Pipeline: every lead by its current stage (all time)
    Lead.aggregate([{ $group: { _id: '$pipelineStage', count: { $sum: 1 } } }]),

    // Leads each employee currently holds
    Lead.aggregate([
      { $match: { assignedTo: { $ne: null } } },
      {
        $group: {
          _id: '$assignedTo',
          assigned: { $sum: 1 },
          open: { $sum: { $cond: [{ $in: [{ $ifNull: ['$pipelineStage', 'lead'] }, CLOSED] }, 0, 1] } },
        },
      },
    ]),

    // Leads created: per creator (current period), totals, monthly trend
    Lead.aggregate([
      { $match: { createdAt: { $gte: earliest, $lt: cur.ts.to } } },
      {
        $facet: {
          byCreator: [
            { $match: { createdAt: { $gte: cur.ts.from, $lt: cur.ts.to }, createdBy: { $ne: null } } },
            { $group: { _id: '$createdBy', count: { $sum: 1 } } },
          ],
          totals: [{
            $group: {
              _id: null,
              cur: { $sum: inRange('$createdAt', cur.ts.from, cur.ts.to) },
              prev: { $sum: inRange('$createdAt', prev.ts.from, prev.ts.to) },
            },
          }],
          trend: [
            { $match: { createdAt: { $gte: trendStart } } },
            { $group: { _id: monthKey('$createdAt'), count: { $sum: 1 } } },
          ],
        },
      },
    ]),

    // Won / lost leads with the date they closed
    Lead.aggregate([
      { $match: { pipelineStage: { $in: CLOSED } } },
      { $addFields: { closedAt: closedAtExpr, outcome: { $cond: [{ $in: ['$pipelineStage', WON] }, 'won', 'lost'] } } },
      { $match: { closedAt: { $gte: earliest, $lt: cur.ts.to } } },
      {
        $facet: {
          byEmployee: [
            { $match: { closedAt: { $gte: cur.ts.from }, assignedTo: { $ne: null } } },
            { $group: { _id: { emp: '$assignedTo', outcome: '$outcome' }, count: { $sum: 1 } } },
          ],
          totals: [{
            $group: {
              _id: '$outcome',
              cur: { $sum: inRange('$closedAt', cur.ts.from, cur.ts.to) },
              prev: { $sum: inRange('$closedAt', prev.ts.from, prev.ts.to) },
            },
          }],
          trend: [
            { $match: { closedAt: { $gte: trendStart } } },
            { $group: { _id: { month: monthKey('$closedAt'), outcome: '$outcome' }, count: { $sum: 1 } } },
          ],
          wonLeads: [
            { $match: { outcome: 'won', closedAt: { $gte: cur.ts.from } } },
            { $sort: { closedAt: -1 } },
            { $limit: 15 },
            { $project: { name: 1, assignedTo: 1, product: 1, closedAt: 1 } },
          ],
          lostLeads: [
            { $match: { outcome: 'lost', closedAt: { $gte: cur.ts.from } } },
            { $sort: { closedAt: -1 } },
            { $limit: 15 },
            { $project: { name: 1, assignedTo: 1, product: 1, closedAt: 1, lostReason: 1 } },
          ],
          lostReasons: [
            { $match: { outcome: 'lost', closedAt: { $gte: cur.ts.from } } },
            { $group: { _id: { $ifNull: ['$lostReason', ''] }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 6 },
          ],
        },
      },
    ]),

    activityCounts(cur, prev),
  ]);

  /* ---------------------------- pipeline ---------------------------- */
  const stageCounts = new Map(Lead.PIPELINE_STAGES.map((s) => [s, 0]));
  stageRows.forEach((r) => {
    const s = Lead.normalizeStage(r._id);
    if (stageCounts.has(s)) stageCounts.set(s, stageCounts.get(s) + r.count);
  });
  const pipeline = Lead.PIPELINE_STAGES.map((stage) => ({ stage, label: STAGE_LABELS[stage] || stage, count: stageCounts.get(stage) }));
  const openPipeline = pipeline.filter((p) => !['lead-won', 'lead-lost'].includes(p.stage)).reduce((s, p) => s + p.count, 0);

  /* ----------------------------- totals ----------------------------- */
  const created = createdFacet[0] || {};
  const closed = closedFacet[0] || {};
  const createdTotals = (created.totals && created.totals[0]) || { cur: 0, prev: 0 };
  const outcomeTotals = { won: { cur: 0, prev: 0 }, lost: { cur: 0, prev: 0 } };
  (closed.totals || []).forEach((r) => { outcomeTotals[r._id] = { cur: r.cur, prev: r.prev }; });

  const won = outcomeTotals.won.cur;
  const lost = outcomeTotals.lost.cur;
  const kpis = {
    leadsCreated: createdTotals.cur,
    ...Object.fromEntries(ACTIVITY_KEYS.map((k) => [k, activities.totals[k] || 0])),
    won,
    lost,
    openPipeline,
    conversionRate: pct(won, won + lost),
    prev: {
      leadsCreated: createdTotals.prev,
      won: outcomeTotals.won.prev,
      lost: outcomeTotals.lost.prev,
      visits: activities.prevTotals.visits || 0,
      demos: activities.prevTotals.demos || 0,
    },
  };

  /* ------------------------------ trend ----------------------------- */
  const trendMap = new Map();
  for (let i = 0; i < 6; i += 1) {
    const d = P.shift('month', trendStartDay, i);
    const key = `${d.y}-${String(d.m + 1).padStart(2, '0')}`;
    const label = new Date(Date.UTC(d.y, d.m, 1)).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
    trendMap.set(key, { month: label, created: 0, won: 0, lost: 0 });
  }
  (created.trend || []).forEach((r) => { if (trendMap.has(r._id)) trendMap.get(r._id).created = r.count; });
  (closed.trend || []).forEach((r) => { if (trendMap.has(r._id.month)) trendMap.get(r._id.month)[r._id.outcome] = r.count; });

  /* ------------------------------ lists ----------------------------- */
  const populate = [{ path: 'assignedTo', select: 'name' }, { path: 'product', select: 'name' }];
  const [wonLeads, lostLeads] = await Promise.all([
    Lead.populate(closed.wonLeads || [], populate),
    Lead.populate(closed.lostLeads || [], populate),
  ]);
  const listItem = (l) => ({
    _id: l._id,
    name: l.name,
    assignedTo: l.assignedTo ? { _id: l.assignedTo._id, name: l.assignedTo.name } : null,
    product: l.product ? { _id: l.product._id, name: l.product.name } : null,
    date: l.closedAt,
  });

  /* ------------------------------ team ------------------------------ */
  const holding = new Map(holdingRows.map((r) => [String(r._id), r]));
  const createdBy = new Map((created.byCreator || []).map((r) => [String(r._id), r.count]));
  const outcomes = new Map();
  (closed.byEmployee || []).forEach((r) => {
    const id = String(r._id.emp);
    if (!outcomes.has(id)) outcomes.set(id, { won: 0, lost: 0 });
    outcomes.get(id)[r._id.outcome] = r.count;
  });

  const team = employees.map((u) => {
    const id = String(u._id);
    const acts = activities.byEmp.get(id) || {};
    const a = Object.fromEntries(ACTIVITY_KEYS.map((k) => [k, acts[k] || 0]));
    a.total = ACTIVITY_KEYS.reduce((s, k) => s + a[k], 0);
    const o = outcomes.get(id) || { won: 0, lost: 0 };
    const h = holding.get(id) || { assigned: 0, open: 0 };
    const c = createdBy.get(id) || 0;
    return {
      employee: { _id: u._id, name: u.name, employeeId: u.employeeId, role: u.role, roleLabel: ROLE_LABELS[u.role] || u.role },
      created: c,
      assigned: h.assigned,
      open: h.open,
      won: o.won,
      lost: o.lost,
      activities: a,
      conversionRate: pct(o.won, o.won + o.lost),
      // Ranking for "top performers": outcomes weigh most, then late-stage work.
      score: o.won * 5 + a.registrations * 3 + a.demos * 2 + a.visits + a.dataUpdates + a.feedback + c,
    };
  }).sort((x, y) => y.score - x.score || y.won - x.won || y.activities.total - x.activities.total || x.employee.name.localeCompare(y.employee.name));

  const roleSummary = LEAD_ASSIGNEE_ROLES.map((role) => {
    const members = team.filter((t) => t.employee.role === role);
    return {
      role,
      label: ROLE_LABELS[role] || role,
      employees: members.length,
      created: members.reduce((s, t) => s + t.created, 0),
      won: members.reduce((s, t) => s + t.won, 0),
      lost: members.reduce((s, t) => s + t.lost, 0),
      activities: members.reduce((s, t) => s + t.activities.total, 0),
    };
  });

  return {
    period,
    range: { from: cur.ts.from, to: cur.ts.to },
    kpis,
    pipeline,
    trend: [...trendMap.values()],
    wonLeads: wonLeads.map(listItem),
    lostLeads: lostLeads.map((l) => ({ ...listItem(l), lostReason: l.lostReason || '' })),
    lostReasons: (closed.lostReasons || []).map((r) => ({ reason: r._id || 'No reason given', count: r.count })),
    team,
    roleSummary,
  };
}

module.exports = { getCrmAnalytics, isValidPeriod, WON, LOST };
