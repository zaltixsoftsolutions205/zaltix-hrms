const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Visit = require('../models/Visit');
const User = require('../models/User');
const Product = require('../models/Product');
const ProductLocation = require('../models/ProductLocation');
const GlobalTable = require('../models/GlobalTable');
const { toLeadLocationFields } = require('../utils/productLocationFields');
const crmScope = require('../services/crmScopeService');
const leadAssignees = require('../services/leadAssigneeService');
const { deleteLeadsCascade } = require('../services/leadCascadeService');
const { withMongoTransaction } = require('../utils/mongoTransaction');

const allowedPipelineStages = Lead.PIPELINE_STAGES; // one list, shared with the schema

// Moving a lead INTO one of these stages needs a next follow-up date: the stage pages
// (Visits, Demos, ...) place leads on their calendar by it.
const FOLLOW_UP_STAGES = ['visit', 'demo', 'data-update', 'registration', 'feedback'];
const missingFollowUp = (lead, stageChange) => (stageChange?.changed && FOLLOW_UP_STAGES.includes(Lead.normalizeStage(lead.pipelineStage)) && !lead.followUpDate ? { message: `Set the next follow-up date to move this lead to ${Lead.normalizeStage(lead.pipelineStage)}`, code: 'FOLLOW_UP_REQUIRED' } : null);

// Stored values that mean "finished" (lead-won / lead-lost plus their pre-migration names):
// a follow-up on such a lead is never "overdue".
const TERMINAL_STAGES = Lead.CLOSED_STAGE_VALUES;

// Leads whose follow-up date still matters: open leads, and clients (won) that are
// on an activity page. Used for "overdue" and "next follow-up".
const ACTIVE_FOLLOW_UP = {
  $or: [
    { pipelineStage: { $nin: TERMINAL_STAGES } },
    { pipelineStage: { $in: Lead.WON_STAGE_VALUES }, wonActivityStage: { $ne: null } },
  ],
};
const hasActiveFollowUp = (lead) => Boolean(Lead.activityStageOf(lead)) || !TERMINAL_STAGES.includes(lead.pipelineStage);

const MAX_PAGE_SIZE = 100;
const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

// What this user may see: admin/hr/manager everything, sales roles their
// product/Mandal territory, everyone else their own leads (crmScopeService).
const ownerFilter = (user) => crmScope.leadFilter(user);

/* ============================================================================
   TRANSACTION SUPPORT (used when the Global Table service calls these handlers)
   ----------------------------------------------------------------------------
   Normal HTTP requests never set these, so their behavior is unchanged.

   req.mongoSession  -> the ONE session/transaction owned by the Global Table
                        service. Every read and write that is part of the
                        operation is attached to it. Controllers never start,
                        commit or abort a session themselves.
   ========================================================================== */

// Options object for writes: { session } inside a transaction, {} otherwise
const sessionOpts = (req) => (req.mongoSession ? { session: req.mongoSession } : {});

// Attaches the session to a query only when there is one
const useSession = (query, req) => (req.mongoSession ? query.session(req.mongoSession) : query);

// Inside a transaction an unexpected error MUST reach the transaction boundary
// (so it aborts, and Mongo's retry labels survive) instead of becoming a
// generic 500 response. Direct requests keep their normal error response.
const rethrowInTransaction = (req, err) => {
  if (req.mongoSession) throw err;
};

/* ------------------------------- helpers --------------------------------- */

const isValidId = (id) => OBJECT_ID_RE.test(String(id));

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const exactCaseInsensitive = (value) => new RegExp(`^${escapeRegex(String(value).trim())}$`, 'i');

// Optional text field (district / mandal). null / undefined -> ''.
const cleanOptionalText = (value) => {
  if (value === null || value === undefined) return { ok: true, value: '' };
  if (typeof value !== 'string') return { ok: false };
  return { ok: true, value: value.trim() };
};

// followUpDate: null / '' clears it; otherwise it must be a parseable date.
const parseFollowUpDate = (value) => {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') return { ok: false };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { ok: false };
  return { ok: true, value: date };
};

// Validates an assignee: well-formed id AND an existing User.
// Returns an error message, or null when valid.
const checkAssignee = async (assignedTo, req) => {
  if (!isValidId(assignedTo)) return 'Invalid assigned user';
  const exists = await useSession(User.exists({ _id: assignedTo }), req);
  return exists ? null : 'Assigned user does not exist';
};

const mongooseErrorResponse = (err, res) => {
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return res.status(400).json({ message: 'Validation failed', errors });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid value for ${err.path}` });
  }
  // Raised by save() when the stage condition set in applyStageChange no longer matches
  if (err.name === 'DocumentNotFoundError') {
    return res.status(409).json({ message: 'This lead was changed or removed by someone else. Refresh and try again.' });
  }
  return null;
};

const PRODUCT_SELECT = 'name status productType';

// Validates a product value from a request.
//   null / ''                     -> clears the product (it is optional)
//   an id, or an object with _id  -> must be a real Product that is active
//   the lead's CURRENT product    -> accepted as-is, so editing other fields of a lead
//                                    whose product was later deactivated still works
// Returns { value } (ObjectId string or null) or { error } (message).
const checkProduct = async (product, req, currentProductId = null) => {
  if (product === null || product === '') return { value: null };
  const id = product && typeof product === 'object' && product._id ? product._id : product; // takes an object with _id or a string id
  if (!isValidId(id)) return { error: 'Invalid product' };
  if (currentProductId && String(currentProductId) === String(id)) return { value: String(id) };
  const found = await useSession(Product.findById(id).select('status'), req).lean();
  if (!found) return { error: 'Product does not exist' };
  if (found.status !== 'active') return { error: 'Product is inactive' };
  return { value: String(id) };
};

const deriveProductLocationFields = async (productId, locationId, req) => {
  const location = await useSession(
    ProductLocation.findOne({ _id: locationId, product: productId, kind: 'location' }),
    req
  ).lean();
  if (!location) return { error: 'Location does not belong to this product' };

  const path = [];
  const seen = new Set();
  let current = location;
  while (current) {
    const id = String(current._id);
    if (seen.has(id) || path.length >= 100) return { error: 'Invalid location hierarchy' };
    seen.add(id);
    path.unshift(current);
    if (!current.parent) break;
    current = await useSession(
      ProductLocation.findOne({ _id: current.parent, product: productId, kind: 'location' }),
      req
    ).lean();
    if (!current) return { error: 'Location hierarchy crosses product boundaries' };
  }

  return toLeadLocationFields(productId, location._id, path);
};

// A Mandal is a location node of the product with no sub-locations.
const isMandalOf = async (productId, locationId, req) => {
  if (!isValidId(locationId)) return false;
  const [node, hasChildren] = await Promise.all([
    useSession(ProductLocation.exists({ _id: locationId, product: productId, kind: 'location' }), req),
    useSession(ProductLocation.exists({ parent: locationId, kind: 'location' }), req),
  ]);
  return !!node && !hasChildren;
};

// For a lead placed on a product location, who may hold it: anyone for
// admin/hr/manager callers; otherwise the caller themselves or a colleague
// whose territory covers that location. Returns an error message or null.
const checkAssigneeForLocation = async (assignedTo, productId, locationId, req) => {
  if (crmScope.hasFullScope(req.user) || String(assignedTo) === String(req.user._id)) return null;
  const assignee = await useSession(User.findById(assignedTo).select('role isActive productLocationAssignments'), req).lean();
  if (!assignee) return 'Assigned user does not exist';
  return (await crmScope.canBeAssignedAt(assignee, productId, locationId))
    ? null
    : 'You can only assign this lead to yourself or a colleague assigned to this Mandal';
};

// Populates the references a lead response carries: assignedTo (given fields) and product.
const populateAssignee = (query, select) => query.populate('assignedTo', select).populate('product', PRODUCT_SELECT);

// Loads one lead the user is allowed to see/modify (same rule as the list).
// Returns null for "not found" and for "not yours" so existence is not leaked.

const findAccessibleLead = (id, req, { lean = false } = {}) => {
  if (!isValidId(id)) return null;
  let q = Lead.findOne({ _id: id, ...ownerFilter(req.user) }).select(Lead.SELECT_FIELDS);
  q = useSession(q, req);
  return lean ? q.lean() : q;
};

/**
 * The ONE place a stage change is validated and applied (used by updateLead and
 * updatePipelineStage, and therefore by every GlobalTable write too).
 *
 * - validates the value and the transition (Lead.checkStageTransition)
 * - optional `expectedStage` (what the client was showing): if it is not the
 *   lead's real stage the change is refused, so a stale screen cannot demote
 *   or promote a lead that someone else already moved
 * - sets lead.$where so save() only writes if the stored stage is still the one
 *   that was checked (compare-and-set). Two concurrent changes cannot both win;
 *   the loser gets DocumentNotFoundError -> 409 (see mongooseErrorResponse).
 *
 * - sets the fields that go with the stage (Lead.stageSideEffects) and returns a
 *   stageHistory entry; the caller saves it with pushHistory after lead.save()
 *   (stageHistory is not loaded, so it must not be written through the document)
 * - converting a won lead to lost needs a reason
 *
 * Returns { error: { status, body } } or { changed, from, direction, history }.
 */
const applyStageChange = (lead, target, expectedStage, { user = null, reason = '' } = {}) => {
  const stored = lead.pipelineStage;
  const current = Lead.normalizeStage(stored);

  if (typeof target !== 'string' || !allowedPipelineStages.includes(target)) {
    return { error: { status: 400, body: { message: `Invalid pipeline stage: ${target}` } } };
  }

  if (expectedStage !== undefined && expectedStage !== null && expectedStage !== '') {
    if (typeof expectedStage !== 'string' || Lead.normalizeStage(expectedStage) !== current) {
      return {
        error: {
          status: 409,
          body: { message: `This lead's stage has changed to "${current}". Refresh and try again.`, currentStage: current },
        },
      };
    }
  }

  const check = Lead.checkStageTransition(stored, target);
  if (!check.ok) {
    return { error: { status: check.code === 'invalid' ? 400 : 409, body: { message: check.message, currentStage: current } } };
  }
  if (check.direction === 'none') return { changed: false, from: current, direction: 'none' };

  const cleanReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
  if (check.direction === 'convert' && !cleanReason) {
    return { error: { status: 400, body: { message: 'Give a reason for converting this client to Lead Lost', code: 'REASON_REQUIRED' } } };
  }

  lead.pipelineStage = target;
  Object.assign(lead, Lead.stageSideEffects(target, { by: user?._id || null, reason: cleanReason }));
  const action = ['convert', 'rework'].includes(check.direction) ? check.direction : 'move';
  // A document stored without the field is read back as 'lead' (schema default)
  lead.$where = {
    $or: [
      { pipelineStage: stored },
      ...(stored === 'lead' ? [{ pipelineStage: { $exists: false } }] : []),
    ],
  };
  return {
    changed: true,
    from: current,
    direction: check.direction,
    history: { from: current, to: target, action, reason: cleanReason, by: user?._id || null, at: new Date() },
  };
};

// Appends one stageHistory entry with $push (never overwrites the list).
const pushHistory = (leadId, entry, req) => (entry
  ? Lead.updateOne({ _id: leadId }, { $push: { stageHistory: entry } }, sessionOpts(req))
  : null);

// A new holder for a lead: same checks as updateLead's assignedTo. null when OK.
const checkNewAssignee = async (lead, assignedTo, req) => {
  const assigneeError = await checkAssignee(assignedTo, req);
  if (assigneeError) return { status: 400, message: assigneeError };
  const currentHolder = String(lead.assignedTo?._id || lead.assignedTo || '');
  if (String(assignedTo) !== currentHolder) {
    const roleError = await leadAssignees.checkLeadAssigneeRole(assignedTo, req.mongoSession);
    if (roleError) return { status: 400, message: roleError };
  }
  if (lead.productLocation && String(assignedTo) !== currentHolder) {
    const locationError = await checkAssigneeForLocation(assignedTo, lead.product, lead.productLocation, req);
    if (locationError) return { status: 403, message: locationError };
  }
  return null;
};

const withMeta = (lead, now = Date.now()) => {
  const ageDays = lead.createdAt ? Math.floor((now - new Date(lead.createdAt).getTime()) / 86400000) : 0;
  const stage = Lead.normalizeStage(lead.pipelineStage); // legacy names read as the current stage
  const isOverdue = !!lead.followUpDate
    && new Date(lead.followUpDate).getTime() < now
    && hasActiveFollowUp(lead);
  return { ...lead, pipelineStage: stage, district: lead.district || '', mandal: lead.mandal || '', ageDays, isOverdue };
};

/* ========================================================================== */
/* CREATE                                                                     */
/* ========================================================================== */
exports.createLead = async (req, res) => {
  const { name, district, mandal, product, productLocation, followUpDate, pipelineStage, assignedTo } = req.body || {};
  let createdLeadId = null;
  try {
    // if (['globalTableId', 'productLocation'].some((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field))) {
    //   return res.status(400).json({ message: 'Table membership and location provenance are system-managed' });
    // }
    // name
    if (name === undefined || name === null || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Lead name is required' });
    }
    const cleanName = name.trim();
    if (cleanName.length < 2) return res.status(400).json({ message: 'Lead name must be at least 2 characters' });
    if (cleanName.length > 100) return res.status(400).json({ message: 'Lead name cannot exceed 100 characters' });

    // location
    const cleanDistrict = cleanOptionalText(district);
    if (!cleanDistrict.ok) return res.status(400).json({ message: 'District must be text' });
    const cleanMandal = cleanOptionalText(mandal);
    if (!cleanMandal.ok) return res.status(400).json({ message: 'Mandal must be text' });

    // pipeline stage
    if (pipelineStage !== undefined && !allowedPipelineStages.includes(pipelineStage)) {
      return res.status(400).json({ message: `Invalid pipeline stage: ${pipelineStage}` });
    }

    // product (optional)
    const productCheck = await checkProduct(product === undefined ? null : product , req);
    if (productCheck.error) return res.status(400).json({ message: productCheck.error });
    let membership = null;
    let tableScope = null;
    if (req.globalTableMembership){
      const tableId = req.globalTableMembership.tableId;
      if (!isValidId(tableId)) return res.status(400).json({ message: 'Invalid Global Table membership' });
      membership = await useSession(
        GlobalTable.findOne({ _id: tableId, entity: 'lead', isActive: true }).select('_id product location'),
        req
      ).lean();
      if (!membership) return res.status(404).json({ message: 'Global Table not found' });
      if (membership.product || membership.location) {
        if (!membership.product || !membership.location || String(req.globalTableScope?.product || '') !== String(membership.product) || String(req.globalTableScope?.location || '') !== String(membership.location)) {
          return res.status(400).json({ message: 'Global Table product/location context is invalid' });
        }
        tableScope = await deriveProductLocationFields(membership.product, membership.location, req);
      } else if (req.globalTableScope) {
        return res.status(400).json({ message: 'Global Table context is invalid' });
      }
    } else if (req.globalTableScope) {
      return res.status(400).json({ message: 'Global Table scope requires validated table membership' });
    }
    if (tableScope) {
      if (tableScope.error) return res.status(400).json({ message: tableScope.error });
      if (String(productCheck.value || '') !== String(tableScope.product)) {
        return res.status(400).json({ message: 'Table product does not match the Lead product' });
      }
      // The table passes its own location as a system field; anything else is refused.
      if (productLocation !== undefined && productLocation !== null && productLocation !== '' && String(productLocation) !== String(tableScope.productLocation)) {
        return res.status(400).json({ message: 'Product, Address, and Mandal are managed by this table' });
      }
    } else if (productLocation !== undefined && productLocation !== null && productLocation !== '') {
      // A lead created outside a location table may be placed on a Mandal.
      if (!productCheck.value) return res.status(400).json({ message: 'Choose a product for this Mandal' });
      if (!(await isMandalOf(productCheck.value, productLocation, req))) {
        return res.status(400).json({ message: 'Mandal does not belong to this product' });
      }
      if (!crmScope.canCreateAt(req.user, productCheck.value, productLocation)) {
        return res.status(403).json({ message: 'You are not assigned to this Mandal' });
      }
      tableScope = await deriveProductLocationFields(productCheck.value, productLocation, req);
      if (tableScope.error) return res.status(400).json({ message: tableScope.error });
    }

    // Sales roles create leads only inside one of their Mandal's tables, so every
    // lead they add sits under Product -> location -> Mandal -> table.
    if (!crmScope.hasFullScope(req.user) && crmScope.peekKind(req.user) === 'territory' && !membership?.product) {
      return res.status(400).json({ message: "Create leads inside one of your Mandal's tables" });
    }
    // Territory users may only create leads inside their territory.
    if (!crmScope.hasFullScope(req.user) && (tableScope || crmScope.peekKind(req.user) === 'territory')) {
      if (!tableScope) return res.status(400).json({ message: 'Choose a product and Mandal for this lead' });
      if (!crmScope.leadInScope(req.user, { product: tableScope.product, productLocation: tableScope.productLocation, assignedTo: req.user._id })) {
        return res.status(403).json({ message: 'You are not assigned to this Mandal' });
      }
    }

    // follow-up date
    const follow = parseFollowUpDate(followUpDate);
    if (!follow.ok) return res.status(400).json({ message: 'Invalid follow-up date' });

    // Assigned user: optional, and never filled with the creator (that is createdBy).
    // When one is chosen it must be a sales employee who covers the lead's Mandal.
    const finalAssignedTo = assignedTo === undefined || assignedTo === null || assignedTo === '' ? null : assignedTo;
    if (finalAssignedTo) {
      const assigneeError = await checkAssignee(finalAssignedTo, req);
      if (assigneeError) return res.status(400).json({ message: assigneeError });
      const roleError = await leadAssignees.checkLeadAssigneeRole(finalAssignedTo, req.mongoSession);
      if (roleError) return res.status(400).json({ message: roleError });
      if (tableScope) {
        const locationError = await checkAssigneeForLocation(finalAssignedTo, tableScope.product, tableScope.productLocation, req);
        if (locationError) return res.status(403).json({ message: locationError });
      }
    }

    const lead = new Lead({
      name: cleanName,
      assignedTo: finalAssignedTo,
      createdBy: req.user?._id || null,
      district: tableScope ? tableScope.district : cleanDistrict.value,
      mandal: tableScope ? tableScope.mandal : cleanMandal.value,
      product: tableScope ? tableScope.product : productCheck.value,
      productLocation: tableScope ? tableScope.productLocation : null,
      globalTableId: membership?._id || null,
      pipelineStage: pipelineStage || 'lead',
      followUpDate: follow.value,
    });
    await lead.save(sessionOpts(req));
    createdLeadId = lead._id;

    const populated = await useSession(
      populateAssignee(Lead.findById(lead._id).select(Lead.SELECT_FIELDS), 'name'),
      req
    ).lean();
    return res.status(201).json(populated);
  } catch (err) {
    const handled = mongooseErrorResponse(err, res);
    if (handled) return handled;
    console.error('createLead error:', err);
    rethrowInTransaction(req, err);
    if (req.globalTableManagedWrite && createdLeadId) {
      try {
        await Lead.deleteOne({ _id: createdLeadId });
      } catch (compensationError) {
        console.error('createLead compensation failed:', compensationError);
        return res.status(500).json({ message: 'Lead creation failed and cleanup was incomplete' });
      }
    }
    return res.status(500).json({ message: 'Failed to create lead' });
  }
};

/* ========================================================================== */
/* LIST                                                                       */
/* ========================================================================== */
exports.getLeads = async (req, res) => {
  try {
    const { search, filter, assignedTo, district, mandal, product, pipelineStage, dateField = 'createdAt', dateFrom, dateTo, day, month, year, datePreset, sortBy = 'createdAt', sortOrder = 'desc', page = 1, limit = 20 } = req.query;
    const base = ownerFilter(req.user);
    const query = { ...base };

    // Search: name, district, mandal
    if (typeof search === 'string' && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [{ name: rx }, { district: rx }, { mandal: rx }];
    }

    // Assigned to
    if (assignedTo) {
      if (!isValidId(assignedTo)) return res.status(400).json({ message: 'Invalid assigned user' });
      // Cannot widen the access filter: a restricted user's own filter wins
      if (base.assignedTo && String(base.assignedTo) !== String(assignedTo)) {
        query.assignedTo = base.assignedTo;
        query._id = { $in: [] };
      } else {
        query.assignedTo = assignedTo;
      }
    }

    // Location (case-insensitive exact match)
    if (typeof district === 'string' && district.trim()) query.district = exactCaseInsensitive(district);
    if (typeof mandal === 'string' && mandal.trim()) query.mandal = exactCaseInsensitive(mandal);

    // Product
    if (product) {
      if (!isValidId(product)) return res.status(400).json({ message: 'Invalid product' });
      query.product = product;
    }

    // createdBy=me: only leads the logged-in user created ("All my leads").
    // Still inside the user's normal access filter above.
    if (req.query.createdBy === 'me') query.createdBy = req.user._id;

    // Pipeline stage
    if (pipelineStage && allowedPipelineStages.includes(pipelineStage)) {
      query.pipelineStage = { $in: Lead.stageValues(pipelineStage) };
    }

    // Date filtering: only real Lead date fields
    const allowedDateFields = ['createdAt', 'updatedAt', 'followUpDate'];
    const selectedDateField = allowedDateFields.includes(dateField) ? dateField : 'createdAt';
    const applyDateRange = (start, end) => {
      query[selectedDateField] = { $gte: start, $lt: end };
    };

    if (dateFrom || dateTo) {
      const dateQuery = {};
      if (dateFrom) {
        const start = new Date(`${dateFrom}T00:00:00`);
        if (!Number.isNaN(start.getTime())) dateQuery.$gte = start;
      }
      if (dateTo) {
        const end = new Date(`${dateTo}T23:59:59.999`);
        if (!Number.isNaN(end.getTime())) dateQuery.$lte = end;
      }
      if (Object.keys(dateQuery).length > 0) query[selectedDateField] = dateQuery;
    }

    if (day && month && year) {
      const d = Number(day);
      const m = Number(month);
      const y = Number(year);
      if (Number.isInteger(d) && Number.isInteger(m) && Number.isInteger(y)) {
        applyDateRange(new Date(y, m - 1, d, 0, 0, 0, 0), new Date(y, m - 1, d + 1, 0, 0, 0, 0));
      }
    } else if (month && year) {
      const m = Number(month);
      const y = Number(year);
      if (m >= 1 && m <= 12 && Number.isInteger(y)) {
        applyDateRange(new Date(y, m - 1, 1), new Date(y, m, 1));
      }
    } else if (year) {
      const y = Number(year);
      if (Number.isInteger(y)) applyDateRange(new Date(y, 0, 1), new Date(y + 1, 0, 1));
    }

    if (datePreset && !dateFrom && !dateTo && !day && !month && !year) {
      const now = new Date();
      let start = null;
      let end = null;
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday = first day
      switch (datePreset) {
        case 'today':
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
          break;
        case 'yesterday':
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
          end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          break;
        case 'this-week':
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0, 0);
          end = new Date(start);
          end.setDate(start.getDate() + 7);
          break;
        case 'last-week':
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday - 7, 0, 0, 0, 0);
          end = new Date(start);
          end.setDate(start.getDate() + 7);
          break;
        case 'this-month':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          break;
        case 'last-month':
          start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          end = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'this-year':
          start = new Date(now.getFullYear(), 0, 1);
          end = new Date(now.getFullYear() + 1, 0, 1);
          break;
        default:
          break;
      }
      if (start && end) applyDateRange(start, end);
    }

    // Overdue follow-ups (set after the date filters so it wins on followUpDate)
    if (filter === 'overdue') {
      query.followUpDate = { $lt: new Date() };
      query.$and = [...(query.$and || []), ACTIVE_FOLLOW_UP];
    }

    // excludeClosed=1: only open leads (Leads page lists; won / lost live in CRM › Clients)
    if (req.query.excludeClosed === '1' && !query.pipelineStage) {
      query.pipelineStage = { $nin: TERMINAL_STAGES };
    }

    // Pagination
    let pageNumber = Number(page);
    let limitNumber = Number(limit);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) pageNumber = 1;
    if (!Number.isInteger(limitNumber) || limitNumber < 1) limitNumber = 20;
    if (limitNumber > MAX_PAGE_SIZE) limitNumber = MAX_PAGE_SIZE;
    const skip = (pageNumber - 1) * limitNumber;

    // Sorting (whitelisted)
    const allowedSortFields = ['name', 'district', 'mandal', 'createdAt', 'updatedAt', 'followUpDate', 'pipelineStage'];
    const selectedSortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const selectedSortOrder = String(sortOrder).toLowerCase() === 'asc' ? 1 : -1;
    // _id breaks ties (e.g. imported rows sharing one createdAt) so paging never repeats or skips leads.
    const sort = { [selectedSortField]: selectedSortOrder, _id: selectedSortOrder };

    const total = await Lead.countDocuments(query);
    const leads = await Lead.find(query).select(Lead.SELECT_FIELDS).populate('assignedTo', 'name email role').populate('product', PRODUCT_SELECT).populate('lostBy', 'name').sort(sort).skip(skip).limit(limitNumber).lean();

    // Visit counts: one aggregation for the returned page (not stored on Lead)
    const leadIds = leads.map((l) => l._id);
    let visitCounts = [];
    if (leadIds.length > 0) {
      visitCounts = await Visit.aggregate([
        { $match: { lead: { $in: leadIds } } },
        { $group: { _id: '$lead', count: { $sum: 1 } } },
      ]);
    }
    const visitCountMap = new Map(visitCounts.map((item) => [item._id.toString(), item.count]));

    const now = Date.now();
    const leadsWithMeta = leads.map((lead) => ({
      ...withMeta(lead, now),
      visitCount: visitCountMap.get(lead._id.toString()) || 0,
    }));

    // Stats (scoped to what this user may see)
    const statsBase = ownerFilter(req.user);
    const [totalAll, converted, overdue, byStageAgg, nextFollowUp] = await Promise.all([
      Lead.countDocuments(statsBase),
      Lead.countDocuments({ ...statsBase, pipelineStage: { $in: Lead.WON_STAGE_VALUES } }),
      Lead.countDocuments({ $and: [statsBase, ACTIVE_FOLLOW_UP, { followUpDate: { $lt: new Date() } }] }),
      Lead.aggregate([{ $match: statsBase }, { $group: { _id: '$pipelineStage', count: { $sum: 1 } } }]),
      Lead.findOne({ $and: [statsBase, ACTIVE_FOLLOW_UP, { followUpDate: { $gte: new Date() } }] })
        .sort({ followUpDate: 1 })
        .select('followUpDate name')
        .lean(),
    ]);

    const byStage = {};
    allowedPipelineStages.forEach((s) => { byStage[s] = 0; });
    byStageAgg.forEach((row) => {
      const stage = Lead.normalizeStage(row._id);
      if (Object.prototype.hasOwnProperty.call(byStage, stage)) byStage[stage] += row.count;
    });

    const stats = {
      total: totalAll,
      converted,
      conversionRate: totalAll > 0 ? Math.round((converted / totalAll) * 100) : 0,
      overdue,
      byStage,
      nextFollowUp: nextFollowUp ? { date: nextFollowUp.followUpDate, leadName: nextFollowUp.name } : null,
    };

    const totalPages = Math.ceil(total / limitNumber);
    return res.json({
      leads: leadsWithMeta,
      stats,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages,
        hasNextPage: pageNumber < totalPages,
        hasPreviousPage: pageNumber > 1,
      },
    });
  } catch (err) {
    console.error('getLeads error:', err);
    return res.status(500).json({ message: err.message || 'Failed to fetch leads' });
  }
};

/* ========================================================================== */
/* GET ONE (+ visits)                                                         */
/* ========================================================================== */
exports.getLead = async (req, res) => {
  try {
    const lead = await findAccessibleLead(req.params.id, req);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const populated = await populateAssignee(Lead.findById(lead._id).select(`${Lead.SELECT_FIELDS} stageHistory`), 'name email role')
      .populate('lostBy', 'name')
      .populate('stageHistory.by', 'name')
      .lean();

    const visits = await Visit.find({ lead: lead._id })
      .select(Visit.SELECT_FIELDS)
      .populate('visitedBy', 'name email role')
      .populate('createdBy', 'name email role')
      .sort({ visitDate: -1, createdAt: -1 })
      .lean();

    return res.json({
      ...withMeta(populated),
      visitCount: visits.length,
      visits,
    });
  } catch (err) {
    console.error('getLead error:', err);
    return res.status(500).json({ message: err.message || 'Failed to fetch lead' });
  }
};

/* ========================================================================== */
/* UPDATE                                                                     */
/* ========================================================================== */
exports.updateLead = async (req, res) => {
  const { name, district, mandal, product, productLocation, followUpDate, pipelineStage, expectedStage, assignedTo, stageReason } = req.body || {};
  let stageHistoryEntry = null;
  try {
    // if (['globalTableId', 'productLocation'].some((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field))) {
    //   return res.status(400).json({ message: 'Table membership and location provenance are system-managed' });
    // }

    const lead = await findAccessibleLead(req.params.id, req);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const scopeFieldsRequested = district !== undefined || mandal !== undefined || product !== undefined;
    if (lead.productLocation && scopeFieldsRequested && !req.globalTableScope) {
      return res.status(400).json({ message: 'Product, Address, and Mandal are managed by the product location' });
    }
    let tableScope = null;
    if (req.globalTableMembership) {
      const tableId = req.globalTableMembership.tableId;
      if (!isValidId(tableId)) return res.status(400).json({ message: 'Invalid Global Table membership' });
      const table = await useSession(
        GlobalTable.findOne({ _id: tableId, entity: 'lead', isActive: true }).select('_id product location'),
        req
      ).lean();
      if (!table) return res.status(404).json({ message: 'Global Table not found' });
      if (table.product || table.location) {
        if (!table.product || !table.location || String(lead.globalTableId || '') !== String(table._id)) {
          return res.status(404).json({ message: 'Lead not found in this Global Table' });
        }
        if (lead.productLocation && String(lead.productLocation) !== String(table.location)) {
          return res.status(400).json({ message: 'Lead belongs to a different product location' });
        }
        tableScope = await deriveProductLocationFields(table.product, table.location, req);
      } else if (lead.globalTableId && String(lead.globalTableId) !== String(table._id)) {
        return res.status(404).json({ message: 'Lead not found in this Global Table' });
      }
    } else if (req.globalTableScope) {
      return res.status(400).json({ message: 'Global Table scope requires validated table membership' });
    } else if (productLocation !== undefined && productLocation !== null && productLocation !== '') {
      // Moving a lead of the single Leads table onto a Mandal: Product and
      // Address follow the Mandal. Leads inside a Mandal table keep that table's Mandal.
      if (lead.globalTableId) {
        const ownTable = await useSession(GlobalTable.findById(lead.globalTableId).select('product'), req).lean();
        if (ownTable?.product) {
          return res.status(400).json({ message: "This lead belongs to a Mandal's table; its Mandal is set by that table" });
        }
      }
      if (!isValidId(productLocation)) return res.status(400).json({ message: 'Invalid Mandal' });
      const node = await useSession(ProductLocation.findOne({ _id: productLocation, kind: 'location' }).select('product'), req).lean();
      if (!node || !(await isMandalOf(node.product, productLocation, req))) {
        return res.status(400).json({ message: 'Choose a Mandal (a location without sub-locations)' });
      }
      const productCheck = await checkProduct(String(node.product), req, lead.product);
      if (productCheck.error) return res.status(400).json({ message: productCheck.error });
      if (!crmScope.canCreateAt(req.user, node.product, productLocation)) {
        return res.status(403).json({ message: 'You are not assigned to this Mandal' });
      }
      tableScope = await deriveProductLocationFields(node.product, productLocation, req);
      if (tableScope.error) return res.status(400).json({ message: tableScope.error });
      // The current holder (if any) must also cover the new Mandal.
      if (lead.assignedTo) {
        const holderError = await checkAssigneeForLocation(lead.assignedTo, node.product, productLocation, req);
        if (holderError && assignedTo === undefined) return res.status(403).json({ message: 'Reassign the lead to someone on this Mandal first' });
      }
    } else if (lead.productLocation) {
      tableScope = await deriveProductLocationFields(lead.product, lead.productLocation, req);
    }
    if (tableScope?.error) return res.status(400).json({ message: tableScope.error });

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Name is required' });
      const cleanName = name.trim();
      if (cleanName.length < 2) return res.status(400).json({ message: 'Lead name must be at least 2 characters' });
      if (cleanName.length > 100) return res.status(400).json({ message: 'Lead name cannot exceed 100 characters' });
      lead.name = cleanName;
    }

    if (district !== undefined) {
      const clean = cleanOptionalText(district);
      if (!clean.ok) return res.status(400).json({ message: 'District must be text' });
      lead.district = clean.value;
    }

    if (mandal !== undefined) {
      const clean = cleanOptionalText(mandal);
      if (!clean.ok) return res.status(400).json({ message: 'Mandal must be text' });
      lead.mandal = clean.value;
    }

    if (product !== undefined) {
      const productCheck = await checkProduct(product, req, lead.product);
      if (productCheck.error) return res.status(400).json({ message: productCheck.error });
      lead.product = productCheck.value;
    }

    if (followUpDate !== undefined) {
      const follow = parseFollowUpDate(followUpDate);
      if (!follow.ok) return res.status(400).json({ message: 'Invalid follow-up date' });
      lead.followUpDate = follow.value;
    }

    if (pipelineStage !== undefined) {
      const stage = applyStageChange(lead, pipelineStage, expectedStage, { user: req.user, reason: stageReason });
      if (stage.error) return res.status(stage.error.status).json(stage.error.body);
      const followUpError = missingFollowUp(lead, stage);
      if (followUpError) return res.status(400).json(followUpError);
      stageHistoryEntry = stage.history || null;
    }

    // assignedTo is optional: null / '' clears it (the lead then shows as "not assigned").
    if (assignedTo === null || assignedTo === '') {
      lead.assignedTo = null;
    } else if (assignedTo !== undefined) {
      const assigneeError = await checkAssignee(assignedTo, req);
      if (assigneeError) return res.status(400).json({ message: assigneeError });
      // A new assignee must be a sales employee; an unchanged one is kept as it is.
      if (String(assignedTo) !== String(lead.assignedTo?._id || lead.assignedTo)) {
        const roleError = await leadAssignees.checkLeadAssigneeRole(assignedTo, req.mongoSession);
        if (roleError) return res.status(400).json({ message: roleError });
      }
      if (lead.productLocation && String(assignedTo) !== String(lead.assignedTo)) {
        const locationError = await checkAssigneeForLocation(assignedTo, lead.product, lead.productLocation, req);
        if (locationError) return res.status(403).json({ message: locationError });
      }
      lead.assignedTo = assignedTo;
    }

    if (tableScope) {
      lead.product = tableScope.product;
      lead.productLocation = tableScope.productLocation;
      lead.district = tableScope.district;
      lead.mandal = tableScope.mandal;
    }

    await lead.save(sessionOpts(req));
    await pushHistory(lead._id, stageHistoryEntry, req);

    const populated = await useSession(
      populateAssignee(Lead.findById(lead._id).select(Lead.SELECT_FIELDS), 'name'),
      req
    ).lean();
    return res.json(populated);
  } catch (err) {
    const handled = mongooseErrorResponse(err, res);
    if (handled) return handled;
    console.error('UPDATE LEAD ERROR:', err);
    rethrowInTransaction(req, err);
    return res.status(500).json({ message: err.message || 'Failed to update lead' });
  }
};

/* ========================================================================== */
/* DELETE                                                                     */
/* GlobalTable custom values are cleaned up by globalTableService.deleteRecord */
/* ========================================================================== */
exports.deleteLead = async (req, res) => {
  try {
    const deleteLeadInSession = async (transactionReq) => {
      const lead = await findAccessibleLead(req.params.id, transactionReq);
      if (!lead) throw Object.assign(new Error('Lead not found'), { statusCode: 404 });
      
      if (transactionReq.globalTableMembership) {
        const tableId = transactionReq.globalTableMembership.tableId;
        const table = isValidId(tableId)
          ? await GlobalTable.findOne({ _id: tableId, entity: 'lead', isActive: true }).session(transactionReq.mongoSession).lean()
          : null;
        const belongs = table && (table.product
          ? String(lead.globalTableId || '') === String(table._id)
            && String(lead.product || '') === String(table.product)
            && String(lead.productLocation || '') === String(table.location)
          : !lead.globalTableId || String(lead.globalTableId) === String(table._id));
        if (!belongs) throw Object.assign(new Error('Lead not found in this Global Table'), { statusCode: 404 });
      }

      // The lead plus everything that depends on it (visits, deals, values, …).
      await deleteLeadsCascade([lead._id], transactionReq.mongoSession || null);
      return { message: 'Lead deleted' };
    };

    const result = (req.mongoSession || req.globalTableManagedWrite)
      ? await deleteLeadInSession(req)
      : await withMongoTransaction((session) => deleteLeadInSession({ ...req, mongoSession: session }));
    return res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    if (err.isTransactionUnavailable) return res.status(503).json({ message: err.message });
    rethrowInTransaction(req, err);
    return res.status(500).json({ message: err.message });
  }
};

/* ========================================================================== */
/* PIPELINE (Kanban)                                                          */
/* ========================================================================== */
exports.getPipeline = async (req, res) => {
  try {
    const leads = await Lead.find(ownerFilter(req.user)).select(Lead.SELECT_FIELDS).populate('assignedTo', 'name').populate('product', PRODUCT_SELECT).sort({ createdAt: -1 }).lean();
    const now = Date.now();
    const pipeline = {};
    allowedPipelineStages.forEach((stage) => { pipeline[stage] = []; });

    leads.forEach((lead) => {
      const item = withMeta(lead, now);
      if (pipeline[item.pipelineStage]) {
        pipeline[item.pipelineStage].push({
          _id: item._id,
          name: item.name,
          district: item.district,
          mandal: item.mandal,
          product: item.product,
          ageDays: item.ageDays,
          followUpDate: item.followUpDate,
          isOverdue: item.isOverdue,
          assignedTo: item.assignedTo,
          pipelineStage: item.pipelineStage,
        });
      }
    });

    return res.json(pipeline);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/* ========================================================================== */
/* CLIENTS (CRM › Clients tab)                                                */
/* A won lead is a client. Its pipelineStage stays 'lead-won'; it can be sent  */
/* to an activity page (wonActivityStage) and given to a sales employee, or    */
/* converted to Lead Lost. A lost lead can be reworked into the pipeline.      */
/* ========================================================================== */

const sendError = (res, status, message, extra = {}) => res.status(status).json({ message, ...extra });

const loadClientResponse = (id) => populateAssignee(Lead.findById(id).select(Lead.SELECT_FIELDS), 'name email role')
  .populate('lostBy', 'name')
  .lean()
  .then((lead) => withMeta(lead));

/* PUT /leads/:id/won-activity-stage  { stage, assignedTo?, followUpDate?, note? }
   stage: visit | demo | data-update | registration | feedback, or null / '' to take
   the client off its activity page ("Back to Clients"). */
exports.setWonActivityStage = async (req, res) => {
  const { stage, assignedTo, followUpDate, note } = req.body || {};
  try {
    const lead = await findAccessibleLead(req.params.id, req);
    if (!lead) return sendError(res, 404, 'Lead not found');
    if (Lead.normalizeStage(lead.pipelineStage) !== 'lead-won') {
      return sendError(res, 409, 'Only a won lead (a client) can be sent to an activity', { currentStage: Lead.normalizeStage(lead.pipelineStage) });
    }

    const target = stage === null || stage === undefined || stage === '' ? null : stage;
    if (target !== null && !Lead.ACTIVITY_STAGES.includes(target)) {
      return sendError(res, 400, `Choose one of: ${Lead.ACTIVITY_STAGES.join(', ')}`);
    }
    const previous = lead.wonActivityStage || null;

    if (target !== null) {
      const follow = parseFollowUpDate(followUpDate);
      if (!follow.ok) return sendError(res, 400, 'Invalid follow-up date');
      if (!follow.value) return sendError(res, 400, 'Set the next follow-up date so the client shows on that page\'s calendar', { code: 'FOLLOW_UP_REQUIRED' });
      lead.followUpDate = follow.value;

      if (assignedTo !== undefined && assignedTo !== null && assignedTo !== '') {
        const assigneeError = await checkNewAssignee(lead, assignedTo, req);
        if (assigneeError) return sendError(res, assigneeError.status, assigneeError.message);
        lead.assignedTo = assignedTo;
      }
    } else {
      lead.followUpDate = null;
    }

    lead.wonActivityStage = target;
    // Compare-and-set: only if nobody changed the stage meanwhile.
    lead.$where = { pipelineStage: lead.pipelineStage, wonActivityStage: previous };
    await lead.save(sessionOpts(req));
    if (previous !== target) {
      await pushHistory(lead._id, {
        from: previous || 'clients',
        to: target || 'clients',
        action: 'activity',
        reason: typeof note === 'string' ? note.trim().slice(0, 500) : '',
        by: req.user._id,
        at: new Date(),
      }, req);
    }
    return res.json(await loadClientResponse(lead._id));
  } catch (err) {
    const handled = mongooseErrorResponse(err, res);
    if (handled) return handled;
    console.error('setWonActivityStage error:', err);
    return sendError(res, 500, err.message || 'Failed to update the client');
  }
};

/* PUT /leads/:id/convert-lost  { reason }  won -> lost */
exports.convertToLost = async (req, res) => {
  const { reason } = req.body || {};
  try {
    const lead = await findAccessibleLead(req.params.id, req);
    if (!lead) return sendError(res, 404, 'Lead not found');
    if (Lead.normalizeStage(lead.pipelineStage) !== 'lead-won') {
      return sendError(res, 409, 'Only a won lead (a client) can be converted to Lead Lost', { currentStage: Lead.normalizeStage(lead.pipelineStage) });
    }
    const stage = applyStageChange(lead, 'lead-lost', undefined, { user: req.user, reason });
    if (stage.error) return res.status(stage.error.status).json(stage.error.body);
    lead.followUpDate = null;
    await lead.save(sessionOpts(req));
    await pushHistory(lead._id, stage.history, req);
    return res.json(await loadClientResponse(lead._id));
  } catch (err) {
    const handled = mongooseErrorResponse(err, res);
    if (handled) return handled;
    console.error('convertToLost error:', err);
    return sendError(res, 500, err.message || 'Failed to convert the client');
  }
};

/* PUT /leads/:id/rework  { toStage, assignedTo?, followUpDate?, reason? }
   lost -> an open stage (back into the pipeline) or lead-won (a client again) */
exports.reworkLead = async (req, res) => {
  const { toStage = 'lead', assignedTo, followUpDate, reason } = req.body || {};
  try {
    if (!Lead.REWORK_STAGES.includes(toStage)) {
      return sendError(res, 400, `Choose one of: ${Lead.REWORK_STAGES.join(', ')}`);
    }
    const lead = await findAccessibleLead(req.params.id, req);
    if (!lead) return sendError(res, 404, 'Lead not found');
    if (Lead.normalizeStage(lead.pipelineStage) !== 'lead-lost') {
      return sendError(res, 409, 'Only a lost lead can be reworked', { currentStage: Lead.normalizeStage(lead.pipelineStage) });
    }

    if (followUpDate !== undefined) {
      const follow = parseFollowUpDate(followUpDate);
      if (!follow.ok) return sendError(res, 400, 'Invalid follow-up date');
      lead.followUpDate = follow.value;
    }
    if (assignedTo !== undefined && assignedTo !== null && assignedTo !== '') {
      const assigneeError = await checkNewAssignee(lead, assignedTo, req);
      if (assigneeError) return sendError(res, assigneeError.status, assigneeError.message);
      lead.assignedTo = assignedTo;
    }

    const stage = applyStageChange(lead, toStage, undefined, { user: req.user, reason });
    if (stage.error) return res.status(stage.error.status).json(stage.error.body);
    const followUpError = missingFollowUp(lead, stage);
    if (followUpError) return res.status(400).json(followUpError);

    await lead.save(sessionOpts(req));
    await pushHistory(lead._id, stage.history, req);
    return res.json(await loadClientResponse(lead._id));
  } catch (err) {
    const handled = mongooseErrorResponse(err, res);
    if (handled) return handled;
    console.error('reworkLead error:', err);
    return sendError(res, 500, err.message || 'Failed to rework the lead');
  }
};

exports.updatePipelineStage = async (req, res) => {
  const { pipelineStage, expectedStage, reason } = req.body || {};
  try {
    if (typeof pipelineStage !== 'string' || !allowedPipelineStages.includes(pipelineStage)) {
      return res.status(400).json({ message: `Invalid pipeline stage: ${pipelineStage}` });
    }

    const lead = await findAccessibleLead(req.params.id, req);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const stage = applyStageChange(lead, pipelineStage, expectedStage, { user: req.user, reason });
    if (stage.error) return res.status(stage.error.status).json(stage.error.body);
    const followUpError = missingFollowUp(lead, stage);
    if (followUpError) return res.status(400).json(followUpError);

    if (stage.changed) {
      await lead.save(sessionOpts(req));
      await pushHistory(lead._id, stage.history, req);
    }

    return res.json({
      _id: lead._id,
      pipelineStage: Lead.normalizeStage(lead.pipelineStage),
      previousStage: stage.from,
      direction: stage.direction, // 'promotion' | 'demotion' | 'change' | 'none'
    });
  } catch (err) {
    const handled = mongooseErrorResponse(err, res);
    if (handled) return handled;
    rethrowInTransaction(req, err);
    return res.status(500).json({ message: err.message });
  }
};

/* ========================================================================== */
/* OVERDUE FOLLOW-UPS                                                         */
/* ========================================================================== */
exports.getOverdueAlerts = async (req, res) => {
  try {
    const overdueFollowUps = await Lead.find({
      $and: [ownerFilter(req.user), ACTIVE_FOLLOW_UP, { followUpDate: { $lt: new Date() } }],
    })
      .select('name followUpDate assignedTo')
      .populate('assignedTo', 'name')
      .sort({ followUpDate: 1 })
      .lean();

    // Aging was based on embedded activities, which no longer exist.
    return res.json({ overdueFollowUps, agingLeads: [] });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/* ========================================================================== */
/* REMOVED FEATURES (kept as exports so existing route files still load)      */
/* Status, conversion and embedded activities are no longer part of Lead.     */
/* Remove these routes whenever convenient; then delete these three exports.  */
/* ========================================================================== */
const removedFeature = (what) => (req, res) =>
  res.status(410).json({ message: `${what} is no longer part of the Lead workflow` });

exports.updateLeadStatus = removedFeature('Lead status');
exports.addActivity = removedFeature('Lead activities');
exports.getActivities = removedFeature('Lead activities');
/* ========================================================================== */
/* GET /leads/:id/assignees -> employees this user may assign the lead to      */
/* (the stage-change popup's "Assign To" list; same rule as every assignment)   */
/* ========================================================================== */
exports.getAssignees = async (req, res) => {
  try {
    const lead = await findAccessibleLead(req.params.id, req);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    // Lazy require: activityController loads visitController, which loads the models.
    const { assignableUsers } = require('./activityController');
    // Only sales employees hold leads (leadAssigneeService).
    return res.json({ assignees: await leadAssignees.onlyLeadAssignees(await assignableUsers(lead, req.user)) });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to load employees' });
  }
};

/* ========================================================================== */
/* GET /leads/assignee-options -> sales employees for "Assign To" dropdowns     */
/* [{ _id, name, employeeId, role, mandals: [name] }]                          */
/* ========================================================================== */
exports.getAssigneeOptions = async (req, res) => {
  try {
    return res.json({ assignees: await leadAssignees.listLeadAssignees(req.user) });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to load employees' });
  }
};
