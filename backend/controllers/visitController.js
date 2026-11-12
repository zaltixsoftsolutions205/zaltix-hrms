/**
 * visitController.js
 * ---------------------------------------------------------------------------
 * The Visits page (CRM › Visits).
 *
 * Who sees what
 *   admin / hr / manager  -> every lead in the visit stage (optional employee filter)
 *   everyone else         -> the leads assigned to them (inside their CRM scope)
 *   A lead's visits are visible to whoever can see the lead.
 *
 * Who changes what
 *   add a visit            -> anyone who can see the lead, while its stage is 'visit'
 *   edit / delete a visit  -> the employee who made it, or admin / hr / manager
 *
 * A visit's fields are fixed (Visit model + VISIT_DETAIL_FIELDS), plus the
 * lead table's Visit form fields (services/activityCustomFields.js). The calendar places a lead by its followUpDate, set from the
 * lead panel (PUT .../leads/:id/follow-up). The stage is changed separately
 * (PUT /leads/:id/pipeline-stage).
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Visit = require('../models/Visit');
const crmScope = require('../services/crmScopeService');
const { VISIT_DETAIL_FIELDS } = require('../services/activityTypes');
const { ServiceError, toHttpError } = require('../services/globalTableService');
const { canEditModule } = require('../constants/modules');
const { fieldsFor, readWithCustomValues } = require('../services/activityCustomFields');

const VISIT_STAGE = 'visit';
const MAX_CALENDAR_LEADS = 1000;
const LEAD_INFO_FIELDS = 'name assignedTo district mandal product productLocation globalTableId pipelineStage wonActivityStage wasClient followUpDate createdAt updatedAt';

const send = (res, err) => {
  const { status, body } = toHttpError(err);
  return res.status(status).json(body);
};

const isId = (id) => mongoose.Types.ObjectId.isValid(String(id || '')) && /^[a-f0-9]{24}$/i.test(String(id));
const sameId = (a, b) => String(a?._id || a || '') === String(b?._id || b || '');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const fullAccess = (user) => crmScope.hasFullScope(user);

/** Leads this user may open on the Visits page. */
const visitLeadFilter = (user) => (fullAccess(user)
  ? {}
  : { $and: [crmScope.leadFilter(user), { assignedTo: user._id }] });

const populateLead = (query) => query
  .populate('assignedTo', 'name employeeId role')
  .populate('product', 'name');

async function loadLead(leadId, user) {
  if (!isId(leadId)) throw new ServiceError(404, 'Lead not found');
  const lead = await populateLead(Lead.findOne({ _id: leadId, ...visitLeadFilter(user) }).select(LEAD_INFO_FIELDS)).lean();
  if (!lead) throw new ServiceError(404, 'Lead not found');
  return lead;
}

// Open leads in the Visit stage, and clients (won leads) sent to Visits from CRM › Clients.
const inVisitStage = (lead) => Lead.activityStageOf(lead) === VISIT_STAGE;

// A lost lead is read-only until it is reworked (CRM › Clients › Lost).
const isLost = (lead) => Lead.normalizeStage(lead.pipelineStage) === 'lead-lost';
const assertNotLost = (lead) => {
  if (isLost(lead)) throw new ServiceError(409, 'This lead is lost. Rework it from CRM › Clients › Lost Clients to change its records.');
};
const canChangeVisit = (user, visit) => fullAccess(user) || sameId(visit.visitedBy, user._id);

/* ------------------------------ main fields ------------------------------ */

const toDay = (raw) => {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
};

const toTime = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/**
 * One text field (services/activityTypes.js) -> { value, error }.
 * Trimmed, at most `max` characters (default 100). `format`:
 *   phone  10 digits; spaces, dashes and a leading +91 / 0 are removed
 *   url    an http(s) link
 */
function readText(f, raw) {
  let v = raw === null || raw === undefined ? '' : String(raw).trim();
  const max = f.max || 100;
  if (!v) return { value: '', error: f.required ? `${f.label} is required` : null };
  if (v.length > max) return { value: v, error: `${f.label} cannot exceed ${max} characters` };
  if (f.format === 'phone') {
    v = v.replace(/[\s-]/g, '').replace(/^(\+91|0)(?=\d{10}$)/, '');
    if (!/^\d{10}$/.test(v)) return { value: v, error: `${f.label} must be a 10-digit number` };
  }
  if (f.format === 'url') {
    let ok = false;
    try { ok = ['http:', 'https:'].includes(new URL(v).protocol); } catch { ok = false; }
    if (!ok) return { value: v, error: `${f.label} must be a link starting with http:// or https://` };
  }
  return { value: v, error: null };
}

/**
 * Text and select fields (`defs` from services/activityTypes.js) read from the
 * body into `out`; problems are pushed to `errors`. Text: see readText; a select
 * value must be one of its options.
 */
function readTextAndSelect(defs, body, out, errors) {
  for (const f of defs) {
    const raw = body[f.key];
    if (f.type === 'text') {
      const { value, error } = readText(f, raw);
      if (error) errors.push({ field: f.key, message: error });
      out[f.key] = value;
      continue;
    }
    const v = raw === null || raw === undefined ? '' : String(raw).trim();
    if (!v && f.required) errors.push({ field: f.key, message: `${f.label} is required` });
    else if (f.type === 'select' && v && !(f.options || []).some((o) => o.value === v)) errors.push({ field: f.key, message: `Choose a ${f.label.toLowerCase()} from the list` });
    out[f.key] = v;
  }
}

/** The visit's fields from the body; throws 400 with every problem. */
function readMainFields(body) {
  const errors = [];
  const visitDate = toDay(body.visitDate);
  if (!visitDate) errors.push({ field: 'visitDate', message: 'Visit date is required (YYYY-MM-DD)' });
  const timeIn = toTime(body.timeIn);
  const timeOut = toTime(body.timeOut);
  if (timeIn === undefined) errors.push({ field: 'timeIn', message: 'Time in is not a valid time' });
  if (timeOut === undefined) errors.push({ field: 'timeOut', message: 'Time out is not a valid time' });
  if (timeIn && timeOut && timeOut < timeIn) errors.push({ field: 'timeOut', message: 'Time out cannot be before time in' });
  const out = { visitDate, timeIn, timeOut };
  readTextAndSelect(VISIT_DETAIL_FIELDS, body, out, errors);
  if (errors.length) throw new ServiceError(400, 'Fix the highlighted fields', { errors });
  return out;
}

const visitView = (visit, user) => ({ ...visit, canEdit: canChangeVisit(user, visit) });

/* ========================================================================== */
/* GET <page>/calendar?from=&to=&assignedTo=&search=                          */
/* Leads in `stage` whose follow-up date is in [from, to), with the count and  */
/* last date of their `model` records. Shared by Visits and the other stages.  */
/* ========================================================================== */
const calendarHandler = ({ stage, model, dateKey }) => async (req, res) => {
  try {
    // all=1: every lead in the stage, whatever its follow-up date (table pages).
    const all = req.query.all === '1';
    const from = new Date(req.query.from);
    const to = new Date(req.query.to);
    if (!all) {
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
        return res.status(400).json({ message: 'from and to must be valid dates (from < to)' });
      }
      if (to - from > 62 * 24 * 3600 * 1000) return res.status(400).json({ message: 'The range can be at most 62 days' });
    }

    const clauses = [
      visitLeadFilter(req.user),
      Lead.activityStageFilter(stage),
      ...(all ? [] : [{ followUpDate: { $gte: from, $lt: to } }]),
    ];
    if (req.query.assignedTo && fullAccess(req.user)) {
      if (!isId(req.query.assignedTo)) return res.status(400).json({ message: 'Invalid employee' });
      clauses.push({ assignedTo: new mongoose.Types.ObjectId(req.query.assignedTo) });
    }
    const search = String(req.query.search || '').trim().slice(0, 100);
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      clauses.push({ $or: [{ name: rx }, { mandal: rx }, { district: rx }] });
    }

    const leads = await populateLead(Lead.find({ $and: clauses }).select(LEAD_INFO_FIELDS))
      .sort({ followUpDate: 1, name: 1 })
      .limit(MAX_CALENDAR_LEADS)
      .lean();

    const ids = leads.map((l) => l._id);
    const stats = ids.length
      ? await model.aggregate([
        { $match: { lead: { $in: ids } } },
        { $group: { _id: '$lead', count: { $sum: 1 }, last: { $max: `$${dateKey}` } } },
      ])
      : [];
    const byLead = new Map(stats.map((s) => [String(s._id), s]));

    return res.json({
      leads: leads.map((l) => {
        const count = byLead.get(String(l._id))?.count || 0;
        const last = byLead.get(String(l._id))?.last || null;
        // activityCount / lastActivityDate for every page; visitCount / lastVisitDate kept for Visits
        return { ...l, activityCount: count, lastActivityDate: last, ...(stage === VISIT_STAGE ? { visitCount: count, lastVisitDate: last } : {}) };
      }),
      truncated: leads.length === MAX_CALENDAR_LEADS,
      canFilterByEmployee: fullAccess(req.user),
    });
  } catch (err) {
    return send(res, err);
  }
};

exports.getCalendar = calendarHandler({ stage: VISIT_STAGE, model: Visit, dateKey: 'visitDate' });

/* ========================================================================== */
/* GET /visits/leads/:leadId  -> lead info + its visits                         */
/* ========================================================================== */
exports.getLeadVisits = async (req, res) => {
  try {
    const lead = await loadLead(req.params.leadId, req.user);
    const visits = await Visit.find({ lead: lead._id })
      .select(Visit.SELECT_FIELDS)
      .populate('visitedBy', 'name employeeId role')
      .sort({ visitDate: 1, timeIn: 1, createdAt: 1 })
      .lean();

    // Without edit permission on the Visits module everything is read-only.
    const pageEdit = canEditModule(req.user, 'visits');
    return res.json({
      lead,
      detailFields: VISIT_DETAIL_FIELDS,
      customFields: await fieldsFor(lead, 'visit'),
      visits: visits.map((v) => {
        const view = visitView(v, req.user);
        return pageEdit ? view : { ...view, canEdit: false };
      }),
      canAddVisit: pageEdit && inVisitStage(lead),
      canEditPage: pageEdit,
    });
  } catch (err) {
    return send(res, err);
  }
};

const loadVisit = (id) => Visit.findById(id).select(Visit.SELECT_FIELDS).populate('visitedBy', 'name employeeId role').lean();

/* ========================================================================== */
/* POST /visits/leads/:leadId/visits  { visitDate, timeIn, timeOut, visitType, ... } */
/* ========================================================================== */
exports.createVisit = async (req, res) => {
  try {
    const lead = await loadLead(req.params.leadId, req.user);
    if (!inVisitStage(lead)) {
      return res.status(400).json({ message: 'Visits can only be added while the lead is in the Visit stage' });
    }
    const { main, customValues } = await readWithCustomValues({
      lead, activityKey: 'visit', body: req.body, readMain: () => readMainFields(req.body || {}),
    });
    const visit = await Visit.create({
      lead: lead._id,
      ...main,
      customValues,
      visitedBy: req.user._id,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
    return res.status(201).json(visitView(await loadVisit(visit._id), req.user));
  } catch (err) {
    return send(res, err);
  }
};

/** The visit and its lead (access-checked); 403 unless the user may change it. */
async function loadVisitForChange(visitId, user) {
  if (!isId(visitId)) throw new ServiceError(404, 'Visit not found');
  const visit = await Visit.findById(visitId).select(Visit.SELECT_FIELDS).lean();
  if (!visit) throw new ServiceError(404, 'Visit not found');
  const lead = await loadLead(visit.lead, user).catch(() => { throw new ServiceError(404, 'Visit not found'); });
  if (!canChangeVisit(user, visit)) {
    throw new ServiceError(403, 'Only the employee who made this visit, or admin / HR / a manager, can change it');
  }
  assertNotLost(lead);
  return { visit, lead };
}

/* ========================================================================== */
/* PUT /visits/:id  { visitDate, timeIn, timeOut, visitType, ... }              */
/* ========================================================================== */
exports.updateVisit = async (req, res) => {
  try {
    const { visit, lead } = await loadVisitForChange(req.params.id, req.user);
    const { main, customValues } = await readWithCustomValues({
      lead, activityKey: 'visit', body: req.body, previous: visit.customValues, isUpdate: true,
      readMain: () => readMainFields(req.body || {}),
    });
    const set = { ...main, updatedBy: req.user._id };
    if (customValues !== undefined) set.customValues = customValues;
    await Visit.updateOne({ _id: visit._id }, { $set: set }, { runValidators: true });
    return res.json(visitView(await loadVisit(visit._id), req.user));
  } catch (err) {
    return send(res, err);
  }
};

/* ========================================================================== */
/* DELETE /visits/:id                                                         */
/* ========================================================================== */
exports.deleteVisit = async (req, res) => {
  try {
    const { visit } = await loadVisitForChange(req.params.id, req.user);
    await Visit.deleteOne({ _id: visit._id });
    return res.json({ message: 'Visit deleted', _id: visit._id });
  } catch (err) {
    return send(res, err);
  }
};

/* ========================================================================== */
/* PUT <page>/leads/:leadId/follow-up   body: { followUpDate }                 */
/* Sets the lead's own follow-up date from a stage page's lead panel. The      */
/* route checks edit access to that page's module; the calendars place the     */
/* lead by this date. null / '' clears it.                                     */
/* ========================================================================== */
exports.setFollowUpDate = async (req, res) => {
  try {
    const lead = await loadLead(req.params.leadId, req.user);
    assertNotLost(lead);
    const raw = (req.body || {}).followUpDate;
    let next = null;
    if (raw !== null && raw !== undefined && raw !== '') {
      next = new Date(raw);
      if (typeof raw !== 'string' || Number.isNaN(next.getTime())) {
        return res.status(400).json({ message: 'Follow-up date is not a valid date' });
      }
    }
    await Lead.updateOne({ _id: lead._id }, { $set: { followUpDate: next } });
    const updated = await loadLead(lead._id, req.user);
    return res.json(updated);
  } catch (err) {
    return send(res, err);
  }
};

// Shared with the other lead activities (controllers/activityController.js).
exports.shared = {
  send,
  isId,
  sameId,
  readText,
  fullAccess,
  visitLeadFilter,
  populateLead,
  loadLead,
  assertNotLost,
  toDay,
  toTime,
  calendarHandler,
};
