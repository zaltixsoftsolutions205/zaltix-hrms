/**
 * crmScopeService.js
 * ---------------------------------------------------------------------------
 * Which Lead records (and product/location Global Tables) a user may reach.
 *
 *   admin / hr / manager                      -> everything             ('all')
 *   sales / inside-sales / product-executive  -> their territory        ('territory')
 *       a lead or table is in the territory when its product is assigned
 *       to the user AND its location is one of the user's Mandals under
 *       that product, or an ancestor of one (a district-level record is
 *       visible to anyone holding a Mandal beneath it). Every lead in the
 *       territory is visible and editable, whoever it is assigned to.
 *   everyone else                             -> leads assigned to them ('own')
 *
 * The territory needs DB lookups (parent locations), so it is computed once
 * per request by `attachCrmScope` and cached per user object. Synchronous
 * callers (leadController.ownerFilter, leadAdapter.accessFilter) read the
 * cache; a territory user without a computed scope matches nothing, so a
 * route that forgets the middleware fails closed instead of leaking.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const ProductLocation = require('../models/ProductLocation');
const { isAssignableRole } = require('./employeeAssignmentService');

const FULL_SCOPE_ROLES = ['admin', 'hr', 'manager'];

// Only these roles may build or change the product → location → table tree.
const TREE_MANAGER_ROLES = FULL_SCOPE_ROLES;

const MATCH_NOTHING = Object.freeze({ _id: { $in: [] } });

const cache = new WeakMap();

// ObjectIds (not strings) so the filter also works in aggregate $match,
// which does not cast like find() does.
const oid = (id) => new mongoose.Types.ObjectId(String(id));

const hasFullScope = (user) => !!user && FULL_SCOPE_ROLES.includes(user.role);

const isTreeManager = (user) => !!user && TREE_MANAGER_ROLES.includes(user.role);

/**
 * Builds the scope for a user from their stored assignments.
 * territory scope: products: Map(productId -> {
 *   mandals: Set(leaf ids assigned), visible: Set(mandals + all their ancestors)
 * })
 */
async function computeScope(user) {
  if (!user) return { kind: 'own' };
  if (hasFullScope(user)) return { kind: 'all' };
  if (!isAssignableRole(user.role)) return { kind: 'own' };

  const products = new Map();
  const assignments = Array.isArray(user.productLocationAssignments) ? user.productLocationAssignments : [];
  const productOf = new Map(); // mandalId -> productId

  assignments.forEach((a) => {
    const productId = String(a.product?._id || a.product);
    (a.mandals || []).forEach((m) => productOf.set(String(m?._id || m), productId));
  });

  // Walk parent pointers level by level (one query per tree level), keeping
  // only nodes that really belong to the assigned product.
  let frontier = [...productOf.keys()];
  const nodeProduct = new Map(); // nodeId -> productId it was reached from
  frontier.forEach((id) => nodeProduct.set(id, productOf.get(id)));
  let depth = 0;

  while (frontier.length && depth < 100) {
    const docs = await ProductLocation.find({ _id: { $in: frontier }, kind: 'location' })
      .select('_id parent product')
      .lean();
    const next = [];
    docs.forEach((doc) => {
      const id = String(doc._id);
      const productId = nodeProduct.get(id);
      if (String(doc.product) !== productId) return; // moved to another product: ignore

      if (!products.has(productId)) products.set(productId, { mandals: new Set(), visible: new Set() });
      const entry = products.get(productId);
      entry.visible.add(id);
      if (depth === 0) {
        entry.mandals.add(id);
      }

      if (doc.parent) {
        const parentId = String(doc.parent);
        if (!entry.visible.has(parentId) && !nodeProduct.has(parentId)) {
          nodeProduct.set(parentId, productId);
          next.push(parentId);
        }
      }
    });
    frontier = next;
    depth += 1;
  }

  return { kind: 'territory', products };
}

/** Computes (once) and caches the scope for this user object. */
async function getScope(user) {
  if (!user) return { kind: 'own' };
  if (cache.has(user)) return cache.get(user);
  const scope = await computeScope(user);
  cache.set(user, scope);
  return scope;
}

/** Synchronous read of the cached scope (see fail-closed note above). */
function peekScope(user) {
  if (!user) return null;
  if (cache.has(user)) return cache.get(user);
  if (hasFullScope(user)) return { kind: 'all' };
  if (!isAssignableRole(user.role)) return { kind: 'own' };
  return null;
}

/** 'all' | 'territory' | 'own', or null when a territory scope is not loaded. */
function peekKind(user) {
  const scope = peekScope(user);
  return scope ? scope.kind : (isAssignableRole(user?.role) ? 'territory' : null);
}

/**
 * Mongo filter on Lead for what this user may see. Territory clauses are
 * wrapped in $and so callers can still set their own top-level $or (search).
 */
function leadFilter(user) {
  const scope = peekScope(user);
  if (!scope) {
    console.error('crmScopeService: territory scope was not loaded for this request; denying lead access');
    return MATCH_NOTHING;
  }
  if (scope.kind === 'all') return {};
  // Own: leads assigned to the user, and leads they created (assignedTo may be empty).
  if (scope.kind === 'own') return { $and: [{ $or: [{ assignedTo: user._id }, { createdBy: user._id }] }] };

  const clauses = [];
  scope.products.forEach((entry, productId) => {
    if (entry.visible.size) {
      clauses.push({ product: oid(productId), productLocation: { $in: [...entry.visible].map(oid) } });
    }
  });
  if (!clauses.length) return MATCH_NOTHING;
  return { $and: [{ $or: clauses }] };
}

/** True when the lead's product + location lies inside this user's scope. */
function leadInScope(user, lead) {
  const scope = peekScope(user);
  if (!scope || !lead) return false;
  if (scope.kind === 'all') return true;
  if (scope.kind === 'own') {
    const me = String(user._id);
    return String(lead.assignedTo?._id || lead.assignedTo || '') === me
      || String(lead.createdBy?._id || lead.createdBy || '') === me;
  }
  const entry = scope.products.get(String(lead.product?._id || lead.product || ''));
  return !!entry && entry.visible.has(String(lead.productLocation || ''));
}

/** May the user create a lead on this exact Mandal? (territory: own Mandals only) */
function canCreateAt(user, productId, locationId) {
  const scope = peekScope(user);
  if (!scope) return false;
  if (scope.kind !== 'territory') return true;
  const entry = scope.products.get(String(productId || ''));
  return !!entry && entry.mandals.has(String(locationId || ''));
}

/**
 * May the user open this Global Table? Tables without a product (the
 * single Leads table) are always reachable: their records are filtered by
 * leadFilter. Product/location tables need the location in the territory.
 */
function canUseTable(user, table) {
  if (!table || !table.product) return true;
  const scope = peekScope(user);
  if (!scope) return false;
  if (scope.kind !== 'territory') return true;
  const entry = scope.products.get(String(table.product));
  return !!entry && entry.visible.has(String(table.location || ''));
}

/** Mongo filter on GlobalTable restricting product tables to the territory. */
function tableFilter(user) {
  const scope = peekScope(user);
  if (!scope) return MATCH_NOTHING;
  if (scope.kind !== 'territory') return {};
  const clauses = [{ product: null }];
  scope.products.forEach((entry, productId) => {
    clauses.push({ product: productId, location: { $in: [...entry.visible] } });
  });
  return { $and: [{ $or: clauses }] };
}

/**
 * Who may be assigned a lead at product/location: full-scope users, or
 * territory users whose own territory covers that location.
 */
async function canBeAssignedAt(assignee, productId, locationId) {
  if (!assignee || assignee.isActive === false) return false;
  const scope = await computeScope(assignee);
  if (scope.kind === 'all') return true;
  if (scope.kind !== 'territory') return false;
  const entry = scope.products.get(String(productId || ''));
  return !!entry && entry.visible.has(String(locationId || ''));
}

/** Express middleware: loads the requester's scope before the handlers run. */
const attachCrmScope = async (req, res, next) => {
  try {
    await getScope(req.user);
    next();
  } catch (err) {
    console.error('attachCrmScope error:', err);
    res.status(500).json({ message: 'Failed to resolve CRM access' });
  }
};

module.exports = {
  FULL_SCOPE_ROLES,
  TREE_MANAGER_ROLES,
  hasFullScope,
  isTreeManager,
  computeScope,
  getScope,
  peekKind,
  leadFilter,
  leadInScope,
  canCreateAt,
  canUseTable,
  tableFilter,
  canBeAssignedAt,
  attachCrmScope,
};
