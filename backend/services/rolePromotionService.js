/**
 * rolePromotionService.js
 * ---------------------------------------------------------------------------
 * Becoming a department head makes a user "manager"; leading a project makes
 * them "team-lead". This service makes those changes reversible:
 *
 *   promote(userId, { role, moduleAccess, reason })
 *     - never lowers a role (admin > hr > manager > team-lead > anything else)
 *     - remembers the user's previous role + access in User.promotedFrom
 *       the first time (a second promotion keeps the original)
 *     - module access is only written when given
 *
 *   releaseIfUnused(userId, { ignoreDepartment, ignoreProject })
 *     - still heads a department  -> stays "manager"
 *     - only leads a project      -> "team-lead"
 *     - neither                   -> previous role + access are restored
 *     - users promoted before this existed (no promotedFrom) are left alone,
 *       instead of being reset to "employee" with no access
 * ---------------------------------------------------------------------------
 */
const User = require('../models/User');
const Department = require('../models/Department');
const Project = require('../models/Project');

const RANK = { admin: 5, hr: 4, manager: 3, 'team-lead': 2 };
const rankOf = (role) => RANK[String(role || '').toLowerCase()] || 1;

async function promote(userId, { role, moduleAccess, reason }) {
  if (!userId) return null;
  const user = await User.findById(userId).select('role moduleAccess promotedFrom');
  if (!user) return null;

  const set = {};
  if (rankOf(role) > rankOf(user.role)) {
    if (!user.promotedFrom) {
      set.promotedFrom = { role: user.role, moduleAccess: user.moduleAccess || [], reason, at: new Date() };
    }
    set.role = role;
  }
  if (Array.isArray(moduleAccess)) set.moduleAccess = moduleAccess;
  if (!Object.keys(set).length) return user;
  return User.findByIdAndUpdate(userId, { $set: set }, { new: true, runValidators: true });
}

async function releaseIfUnused(userId, { ignoreDepartment = null, ignoreProject = null } = {}) {
  if (!userId) return null;
  const user = await User.findById(userId).select('role moduleAccess promotedFrom');
  if (!user || !user.promotedFrom) return user; // legacy promotion: leave as is

  const [heads, leads] = await Promise.all([
    Department.exists({ headOf: userId, ...(ignoreDepartment ? { _id: { $ne: ignoreDepartment } } : {}) }),
    Project.exists({ manager: userId, ...(ignoreProject ? { _id: { $ne: ignoreProject } } : {}) }),
  ]);
  if (heads) return user;
  if (leads) {
    if (user.role === 'manager' && rankOf(user.promotedFrom.role) <= rankOf('team-lead')) {
      return User.findByIdAndUpdate(userId, { $set: { role: 'team-lead' } }, { new: true });
    }
    return user;
  }
  return User.findByIdAndUpdate(
    userId,
    { $set: { role: user.promotedFrom.role || 'employee', moduleAccess: user.promotedFrom.moduleAccess || [], promotedFrom: null } },
    { new: true }
  );
}

module.exports = { promote, releaseIfUnused, rankOf };
