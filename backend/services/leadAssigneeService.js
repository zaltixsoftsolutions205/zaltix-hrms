/**
 * leadAssigneeService.js
 * ---------------------------------------------------------------------------
 * Who a lead can be assigned to ("Assign To"): active sales employees only,
 * with the roles below. Each comes with the Mandals of their territory, so the
 * dropdown can show "Name (Role · Mandal, Mandal)".
 *
 *   admin / HR / manager  -> every sales employee
 *   everyone else         -> themselves (when a sales role) and colleagues who
 *                            share at least one of their Mandals
 * The lead's own Mandal is checked again on save (leadController).
 * ---------------------------------------------------------------------------
 */

const User = require('../models/User');
const ProductLocation = require('../models/ProductLocation');
const crmScope = require('./crmScopeService');

const LEAD_ASSIGNEE_ROLES = ['sales', 'inside-sales', 'product-executive'];
const isLeadAssigneeRole = (role) => LEAD_ASSIGNEE_ROLES.includes(role);

const mandalIdsOf = (u) => (u.productLocationAssignments || []).flatMap((a) => (a.mandals || []).map(String));

/** [{ _id, name, employeeId, role, mandals: [name] }] for these users (Mandal names, sorted). */
async function describe(users) {
  const ids = [...new Set(users.flatMap(mandalIdsOf))];
  const nodes = ids.length ? await ProductLocation.find({ _id: { $in: ids } }).select('name').lean() : [];
  const names = new Map(nodes.map((n) => [String(n._id), n.name]));
  return users.map((u) => ({
    _id: u._id,
    name: u.name,
    employeeId: u.employeeId,
    role: u.role,
    mandals: [...new Set(mandalIdsOf(u).map((id) => names.get(id)).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  }));
}

/** Sales employees `user` may pick in an "Assign To" dropdown. */
async function listLeadAssignees(user) {
  const users = await User.find({ isActive: { $ne: false }, role: { $in: LEAD_ASSIGNEE_ROLES } })
    .select('_id name employeeId role productLocationAssignments')
    .sort({ name: 1 })
    .lean();
  let allowed = users;
  if (!crmScope.hasFullScope(user)) {
    const mine = new Set(mandalIdsOf(user));
    allowed = users.filter((u) => String(u._id) === String(user._id) || mandalIdsOf(u).some((id) => mine.has(id)));
  }
  return describe(allowed);
}

/** Keeps the sales employees of an assignee list ([{ _id, ... }]) and adds their role and Mandals. */
async function onlyLeadAssignees(list) {
  const ids = list.map((u) => u._id);
  const users = ids.length
    ? await User.find({ _id: { $in: ids }, role: { $in: LEAD_ASSIGNEE_ROLES } })
      .select('_id name employeeId role productLocationAssignments')
      .sort({ name: 1 })
      .lean()
    : [];
  return describe(users);
}

/** Error message when `userId` may not hold leads (not a sales role / inactive), else null. */
async function checkLeadAssigneeRole(userId, session) {
  const q = User.findById(userId).select('role isActive');
  if (session) q.session(session);
  const u = await q.lean();
  if (!u) return 'Assigned user does not exist';
  if (u.isActive === false) return 'This employee is not active';
  if (!isLeadAssigneeRole(u.role)) return 'Leads can only be assigned to sales employees (Sales, Inside Sales or Product Executive)';
  return null;
}

module.exports = {
  LEAD_ASSIGNEE_ROLES,
  isLeadAssigneeRole,
  listLeadAssignees,
  onlyLeadAssignees,
  checkLeadAssigneeRole,
};
