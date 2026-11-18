/**
 * activityController.js
 * ---------------------------------------------------------------------------
 * One engine for the lead activities of services/activityTypes.js (Demo, Data
 * Update, Registration, Feedback). Same rules as Visits:
 *
 *   see       the lead's assignee, or admin / HR / managers
 *   add       while the lead is in the type's stage; `single` types once per lead
 *   edit/del  the employee who recorded it, the employee it is assigned to,
 *             or admin / HR / managers
 *   assignee  any employee who may hold the lead: yourself, anyone when you are
 *             admin / HR / a manager, else colleagues whose territory covers the
 *             lead's Mandal (same rule as "Assign To")
 *   fields    fixed per type (services/activityTypes.js mainFields), plus the
 *             lead table's form fields for the type (services/activityCustomFields.js)
 * ---------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const Lead = require('../models/Lead');
const User = require('../models/User');
const crmScope = require('../services/crmScopeService');
const { ServiceError } = require('../services/globalTableService');
const { shared } = require('./visitController');
const { uploadDir } = require('../middleware/uploadActivityFile');
const { canEditModule } = require('../constants/modules');
const { fieldsFor, readWithCustomValues } = require('../services/activityCustomFields');

const { send, isId, sameId, fullAccess, loadLead, assertNotLost, toDay, toTime, calendarHandler, readText,} = shared;

const PEOPLE = 'name employeeId role';

/** Employees who may be assigned an activity of `lead` by `user` (active, with an Employee ID). */
async function assignableUsers(lead, user) {
  const users = await User.find({ isActive: { $ne: false }, employeeId: { $nin: [null, ''] } })
    .select('_id name employeeId role isActive productLocationAssignments')
    .sort({ name: 1 })
    .lean();
  const out = [];
  for (const u of users) {
    // eslint-disable-next-line no-await-in-loop
    const ok = sameId(u._id, user._id) || fullAccess(user) || (lead.product && lead.productLocation
      // eslint-disable-next-line no-await-in-loop
      && await crmScope.canBeAssignedAt(u, lead.product._id || lead.product, lead.productLocation));
    if (ok) out.push({ _id: u._id, name: u.name, employeeId: u.employeeId, role: u.role });
  }
  return out;
}

async function checkAssignee(lead, user, raw) {
  const id = raw && typeof raw === 'object' ? raw._id : raw;
  if (!id) return user._id; // default: the person filling the form
  if (!isId(id)) throw new ServiceError(400, 'Fix the highlighted fields', { errors: [{ field: 'assignedTo', message: 'Choose an employee' }] });
  const target = await User.findById(id).select('_id isActive productLocationAssignments role').lean();
  const ok = target && target.isActive !== false && (sameId(target._id, user._id) || fullAccess(user)
    || (lead.product && lead.productLocation && await crmScope.canBeAssignedAt(target, lead.product._id || lead.product, lead.productLocation)));
  if (!ok) {
    throw new ServiceError(400, 'Fix the highlighted fields', {
      errors: [{ field: 'assignedTo', message: 'This employee cannot be assigned here (not active, or not working in this Mandal)' }],
    });
  }
  return target._id;
}

/** The type's main fields from the body; throws 400 listing every problem. */
async function readMainFields(type, body, lead, user) {
  const errors = [];
  const out = {};
  for (const f of type.mainFields) {
    const raw = body[f.key];
    switch (f.type) {
      case 'date': {
        const d = toDay(raw);
        if (!d && f.required) errors.push({ field: f.key, message: `${f.label} is required (YYYY-MM-DD)` });
        else if (!d && raw) errors.push({ field: f.key, message: `${f.label} is not a valid date` });
        out[f.key] = d;
        break;
      }
      case 'time': {
        const t = toTime(raw);
        if (t === undefined) errors.push({ field: f.key, message: `${f.label} is not a valid time` });
        out[f.key] = t ?? null;
        break;
      }
      case 'text': {
        // Left empty -> the lead's own value (e.g. Customer name -> lead name).
        const fallback = f.fromLead && lead[f.fromLead] ? String(lead[f.fromLead]) : '';
        const blank = raw === null || raw === undefined || String(raw).trim() === '';
        const { value, error } = readText(f, blank && fallback ? fallback : raw);
        if (error) errors.push({ field: f.key, message: error });
        out[f.key] = value;
        break;
      }
      case 'select': {
        const v = raw === null || raw === undefined ? '' : String(raw);
        if (!v && f.required) errors.push({ field: f.key, message: `${f.label} is required` });
        else if (v && !(f.options || []).some((o) => o.value === v)) errors.push({ field: f.key, message: `Choose a ${f.label.toLowerCase()} from the list` });
        out[f.key] = v;
        break;
      }
      case 'number': {
        if (raw === null || raw === undefined || raw === '') {
          if (f.required) errors.push({ field: f.key, message: `${f.label} is required` });
          out[f.key] = null;
          break;
        }
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) errors.push({ field: f.key, message: `${f.label} must be a number of 0 or more` });
        else out[f.key] = f.currency ? Math.round(n * 100) / 100 : n;
        break;
      }
      case 'rating': {
        // The form sends 0 for "no stars".
        if (raw === null || raw === undefined || raw === '' || Number(raw) === 0) {
          if (f.required) errors.push({ field: f.key, message: `Pick a ${f.label.toLowerCase()}` });
          out[f.key] = null;
          break;
        }
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > 5) errors.push({ field: f.key, message: `${f.label} must be 1 to 5` });
        out[f.key] = n;
        break;
      }
      case 'user':
        try {
          // eslint-disable-next-line no-await-in-loop
          out[f.key] = await checkAssignee(lead, user, raw);
        } catch (err) {
          errors.push(...(err.details?.errors || [{ field: f.key, message: err.message }]));
        }
        break;
      default:
        break;
    }
  }
  if (out.startTime && out.endTime && out.endTime < out.startTime) {
    errors.push({ field: 'endTime', message: 'End time cannot be before start time' });
  }
  if (errors.length) throw new ServiceError(400, 'Fix the highlighted fields', { errors });
  return out;
}

const SELECT = (type) => ['lead', 'startTime', 'endTime', 'customValues', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt',
  ...type.mainFields.map((f) => f.key)].join(' ');

// Only what the page needs about an attached file (never the disk name).
const publicFile = (file) => (file ? { originalName: file.originalName, mimeType: file.mimeType, size: file.size, uploadedAt: file.uploadedAt } : file);
const fileKeys = (type) => type.mainFields.filter((f) => f.type === 'file').map((f) => f.key);
const removeFile = (file) => {
  if (!file?.fileName) return;
  fs.unlink(path.join(uploadDir, path.basename(file.fileName)), () => {});
};

module.exports = function makeActivityController(type) {
  const { model: Model, dateKey, stage } = type;
  // Open leads in this stage, and clients (won leads) sent to this page from CRM › Clients.
  const inStage = (lead) => Lead.activityStageOf(lead) === stage;
  const canChange = (user, entry) => fullAccess(user) || sameId(entry.createdBy, user._id) || sameId(entry.assignedTo, user._id);

  const entryView = (entry, user) => {
    const view = { ...entry, canEdit: canChange(user, entry) };
    fileKeys(type).forEach((k) => { view[k] = publicFile(entry[k]); });
    return view;
  };
  const loadEntry = (id) => Model.findById(id).select(SELECT(type)).populate('assignedTo', PEOPLE).populate('createdBy', PEOPLE).lean();

  async function loadEntryForChange(id, user) {
    if (!isId(id)) throw new ServiceError(404, `${type.label} not found`);
    const entry = await Model.findById(id).select(SELECT(type)).lean();
    if (!entry) throw new ServiceError(404, `${type.label} not found`);
    const lead = await loadLead(entry.lead, user).catch(() => { throw new ServiceError(404, `${type.label} not found`); });
    if (!canChange(user, entry)) {
      throw new ServiceError(403, `Only the employee who recorded or was assigned this ${type.label.toLowerCase()}, or admin / HR / a manager, can change it`);
    }
    assertNotLost(lead);
    return { entry, lead };
  }

  const typeInfo = {
    key: type.key, label: type.label, plural: type.plural, stage, single: type.single, followUp: type.followUp, dateKey, wins: Boolean(type.wins),
  };

  return {
    getCalendar: calendarHandler({ stage, model: Model, dateKey }),

    /* GET /leads/:leadId -> lead, field spec, entries */
    async getLeadDetail(req, res) {
      try {
        const lead = await loadLead(req.params.leadId, req.user);
        const entries = await Model.find({ lead: lead._id })
          .select(SELECT(type))
          .populate('assignedTo', PEOPLE)
          .populate('createdBy', PEOPLE)
          .sort({ [dateKey]: 1, startTime: 1, createdAt: 1 })
          .lean();
        // Without edit permission on the page's module everything is read-only.
        const pageEdit = canEditModule(req.user, type.module);
        const canAdd = pageEdit && inStage(lead) && !(type.single && entries.length > 0);
        const entryViews = entries.map((e) => {
          const view = entryView(e, req.user);
          return pageEdit ? view : { ...view, canEdit: false };
        });
        const anyEditable = entryViews.some((e) => e.canEdit);
        return res.json({
          type: typeInfo,
          lead,
          mainFields: type.mainFields,
          customFields: await fieldsFor(lead, type.key),
          entries: entryViews,
          canAdd,
          canEditPage: pageEdit,
          assignees: canAdd || anyEditable ? await assignableUsers(lead, req.user) : [],
        });
      } catch (err) {
        return send(res, err);
      }
    },

    /* POST /leads/:leadId/entries { <fields> } */
    async createEntry(req, res) {
      try {
        const lead = await loadLead(req.params.leadId, req.user);
        if (!inStage(lead)) {
          return res.status(400).json({ message: `${type.plural} can only be added while the lead is in the ${type.label} stage` });
        }
        if (type.single && await Model.exists({ lead: lead._id })) {
          return res.status(409).json({ message: `This lead already has its ${type.label.toLowerCase()}; open it to make changes` });
        }
        const { main, customValues } = await readWithCustomValues({
          lead, activityKey: type.key, body: req.body, readMain: () => readMainFields(type, req.body || {}, lead, req.user),
        });
        const doc = await Model.create({ lead: lead._id, ...main, customValues, createdBy: req.user._id, updatedBy: req.user._id });
        return res.status(201).json(entryView(await loadEntry(doc._id), req.user));
      } catch (err) {
        if (err && err.code === 11000) return res.status(409).json({ message: `This lead already has its ${type.label.toLowerCase()}; open it to make changes` });
        return send(res, err);
      }
    },

    /* PUT /entries/:id { <fields> } */
    async updateEntry(req, res) {
      try {
        const { entry, lead } = await loadEntryForChange(req.params.id, req.user);
        const { main, customValues } = await readWithCustomValues({
          lead, activityKey: type.key, body: req.body, previous: entry.customValues, isUpdate: true,
          readMain: () => readMainFields(type, { assignedTo: entry.assignedTo, ...(req.body || {}) }, lead, req.user),
        });
        const set = { ...main, updatedBy: req.user._id };
        if (customValues !== undefined) set.customValues = customValues;
        await Model.updateOne({ _id: entry._id }, { $set: set }, { runValidators: true });
        return res.json(entryView(await loadEntry(entry._id), req.user));
      } catch (err) {
        return send(res, err);
      }
    },

    /* DELETE /entries/:id */
    async deleteEntry(req, res) {
      try {
        const { entry } = await loadEntryForChange(req.params.id, req.user);
        await Model.deleteOne({ _id: entry._id });
        fileKeys(type).forEach((k) => removeFile(entry[k]));
        return res.json({ message: `${type.label} deleted`, _id: entry._id });
      } catch (err) {
        return send(res, err);
      }
    },

    /* POST /entries/:id/file (multipart "file") -> attach / replace the entry's file */
    async uploadFile(req, res) {
      const key = fileKeys(type)[0];
      try {
        if (!key) throw new ServiceError(404, 'Not found');
        if (!req.file) throw new ServiceError(400, 'Choose a file to upload');
        const { entry } = await loadEntryForChange(req.params.id, req.user);
        const file = {
          fileName: req.file.filename,
          originalName: req.file.originalname.slice(0, 200),
          mimeType: req.file.mimetype,
          size: req.file.size,
          uploadedAt: new Date(),
        };
        await Model.updateOne({ _id: entry._id }, { $set: { [key]: file, updatedBy: req.user._id } });
        removeFile(entry[key]); // the replaced file
        return res.json({ [key]: publicFile(file) });
      } catch (err) {
        if (req.file) removeFile({ fileName: req.file.filename }); // not kept on failure
        return send(res, err);
      }
    },

    /* GET /entries/:id/file -> download (anyone who may see the lead) */
    async downloadFile(req, res) {
      const key = fileKeys(type)[0];
      try {
        if (!key || !isId(req.params.id)) throw new ServiceError(404, 'File not found');
        const entry = await Model.findById(req.params.id).select(`lead ${key}`).lean();
        if (!entry?.[key]?.fileName) throw new ServiceError(404, 'File not found');
        await loadLead(entry.lead, req.user).catch(() => { throw new ServiceError(404, 'File not found'); });
        const file = entry[key];
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName || 'file')}"`);
        return res.sendFile(path.join(uploadDir, path.basename(file.fileName)), (err) => {
          if (err && !res.headersSent) res.status(404).json({ message: 'File not found' });
        });
      } catch (err) {
        return send(res, err);
      }
    },
  };
};

module.exports.assignableUsers = assignableUsers;
