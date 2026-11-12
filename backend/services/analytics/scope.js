/**
 * Who may use analytics, and on which records.
 *
 *   roles     admin, HR and managers build dashboards (and need the 'analytics' module)
 *   sources   a model is offered only if the user can open one of its pages
 *             (registry `access`, e.g. Visits needs 'visits' or 'crm')
 *             (HR models: the HR page — 'hr_attendance', 'hr_leaves', 'hr_employees' —
 *             or the manager role, registry `roles`)
 *   fields    salary fields: admin, HR and managers only (registry field `roles`)
 *   records   admin / HR: everything
 *             manager:    records owned by employees of their department
 *                         (Lead.assignedTo, Visit.visitedBy, Attendance.employee,
 *                         the employee themself, ...). No department -> nothing.
 *
 * Note: the CRM pages still show managers every lead; analytics already applies the
 * department rule.
 */

const User = require('../../models/User');
const { canAccessModule } = require('../../constants/modules');
const { SOURCES } = require('./registry');

const ANALYTICS_ROLES = ['admin', 'hr', 'manager'];
const ALL_DATA_ROLES = ['admin', 'hr'];

const canUseAnalytics = (user) => Boolean(user) && ANALYTICS_ROLES.includes(user.role) && canAccessModule(user, 'analytics');

const canUseSource = (user, source) => (source.roles || []).includes(user.role) || source.access.some((m) => canAccessModule(user, m));

/** Fields with `roles` (salary) are only for those roles. */
const canUseField = (user, field) => !field.roles || field.roles.includes(user.role);

const allowedSources = (user) => Object.values(SOURCES).filter((s) => canUseSource(user, s));

/** null = no owner restriction; [id strings] = records of these owners only. */
async function ownerScope(user) {
  if (ALL_DATA_ROLES.includes(user.role)) return null;
  if (user.role !== 'manager' || !user.department) return [];
  const users = await User.find({ department: user.department._id || user.department }).select('_id').lean();
  return users.map((u) => String(u._id));
}

module.exports = {
  ANALYTICS_ROLES, canUseAnalytics, canUseSource, canUseField, allowedSources, ownerScope,
};
