/**
 * departmentAccessService.js
 * ---------------------------------------------------------------------------
 * Rules for a department's role tree (Department.roleTree):
 *   - admin -> manager are fixed roots, never stored in the tree.
 *   - Each node is a login role (User.role) with an optional parent role.
 *   - Only employees whose role is in the tree can belong to the department
 *     (empty tree = not configured yet = nobody can join).
 *   - Each node carries the role's default Project-module permissions.
 * ---------------------------------------------------------------------------
 */

const Department = require('../models/Department');
const { canAccessModule } = require('../constants/modules');

const ROOT_ROLES = ['admin', 'manager'];
const ACCESS_KEYS = Department.PROJECT_ACCESS_KEYS;
const ACCESS_LEVELS = Department.PROJECT_ACCESS_LEVELS;

/**
 * Roles are compared case-insensitively. User.role can be a preset
 * ("team-lead") or a custom role typed in the employee form
 * ("technical_associate"), so nothing else is rewritten.
 */
const normalizeRole = (role) => String(role || '').trim().toLowerCase().replace(/\s+/g, ' ');

const sameId = (a, b) => Boolean(a && b) && String(a._id || a) === String(b._id || b);

/** Admin, or the head (manager) of this department. */
const canManageDepartment = (user, dept) => {
  if (!user || !dept) return false;
  if (user.role === 'admin') return true;
  return sameId(dept.headOf, user._id);
};

/**
 * May `user` open a department's details (employees, role tree, projects,
 * lead positions)? Admin, HR, anyone with the hr_employees or department
 * module, or the department's own head.
 */
const canViewDepartmentDetails = (user, dept) => {
  if (!user || !dept) return false;
  if (['admin', 'hr'].includes(user.role)) return true;
  if (canAccessModule(user, 'hr_employees') || canAccessModule(user, 'department')) return true;
  return sameId(dept.headOf, user._id);
};

/** May a user with `role` belong to this department? */
const isRoleAllowed = (dept, role) => {
  const r = normalizeRole(role);
  if (ROOT_ROLES.includes(r)) return true;
  const tree = (dept && dept.roleTree) || [];
  // No roles set up yet = nobody can join until Roles & Permissions is configured.
  if (!tree.length) return false;
  return tree.some((n) => n.role === r);
};

const fullAccess = (level) => Object.fromEntries(ACCESS_KEYS.map((k) => [k, level]));

/** Default Project-module permissions of `user` inside `dept`. */
const getProjectAccess = (user, dept) => {
  if (!user || !dept) return fullAccess('none');
  if (canManageDepartment(user, dept)) return fullAccess('edit');
  const node = ((dept.roleTree) || []).find((n) => n.role === normalizeRole(user.role));
  if (!node) return fullAccess('none');
  const access = node.projectAccess || {};
  return Object.fromEntries(ACCESS_KEYS.map((k) => [k, ACCESS_LEVELS.includes(access[k]) ? access[k] : 'none']));
};

/**
 * Validate + normalize a role tree sent by the client.
 * Returns { tree } or { error }.
 */
const sanitizeRoleTree = (input) => {
  if (!Array.isArray(input)) return { error: 'roleTree must be an array.' };

  const tree = [];
  const seen = new Set();
  for (let i = 0; i < input.length; i += 1) {
    const raw = input[i] || {};
    const role = normalizeRole(raw.role);
    if (!role) return { error: `Role #${i + 1} has no name.` };
    if (ROOT_ROLES.includes(role)) return { error: `"${role}" is a fixed top role and cannot be added to the tree.` };
    if (seen.has(role)) return { error: `Role "${role}" is listed twice.` };
    seen.add(role);

    let parentRole = raw.parentRole ? normalizeRole(raw.parentRole) : null;
    if (parentRole === 'manager') parentRole = null;
    if (parentRole === role) return { error: `Role "${role}" cannot be its own parent.` };

    const access = raw.projectAccess || {};
    const projectAccess = Object.fromEntries(ACCESS_KEYS.map((k) => {
      const v = access[k];
      return [k, ACCESS_LEVELS.includes(v) ? v : 'view'];
    }));

    tree.push({ role, parentRole, order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : i, projectAccess });
  }

  const byRole = new Map(tree.map((n) => [n.role, n]));
  for (const node of tree) {
    if (node.parentRole && !byRole.has(node.parentRole)) {
      return { error: `Parent role "${node.parentRole}" of "${node.role}" is not in the tree.` };
    }
    // Walk up the parents; revisiting a role means a cycle.
    const path = new Set([node.role]);
    let p = node.parentRole;
    while (p) {
      if (path.has(p)) return { error: `Role "${node.role}" is inside a parent loop (${[...path].join(' → ')}).` };
      path.add(p);
      p = byRole.get(p).parentRole;
    }
  }

  return { tree };
};

module.exports = {
  ROOT_ROLES,
  ACCESS_KEYS,
  ACCESS_LEVELS,
  normalizeRole,
  canManageDepartment,
  canViewDepartmentDetails,
  isRoleAllowed,
  getProjectAccess,
  sanitizeRoleTree,
};
