/**
 * Module access registry (backend mirror of frontend/src/constants/modules.js).
 * Keep the two in sync. This file is the authority the API uses to enforce
 * per-employee module access. Access model:
 *   - admin role bypasses everything.
 *   - non-admin with non-empty moduleAccess → governed strictly by it.
 *   - non-admin with empty moduleAccess → ROLE_DEFAULT_MODULES fallback.
 */

const PERMISSIONS = { VIEW: 'view', EDIT: 'edit' };

// Every grantable module key. Keep in sync with the frontend registry.
const MODULE_KEYS = [
  'dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks',
  'timesheets', 'knowledge_center', 'team', 'crm', 'field_sales',
  'hr_employees', 'hr_attendance', 'hr_leaves', 'hr_tasks', 'hr_payslips',
  'recruitment', 'finance', 'reports', 'announcements', 'holidays',
];

// Self-service baseline every non-admin always keeps, regardless of explicit
// grants — so granting a management module never cuts someone off from their
// own data. Editable baseline modules also get implicit edit.
const BASELINE_MODULES = ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center'];
const BASELINE_EDITABLE = ['profile', 'attendance', 'leaves', 'tasks', 'timesheets'];

const ROLE_DEFAULT_MODULES = {
  employee:    ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center', 'team'],
  sales:       ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center', 'team', 'crm'],
  field_sales: ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center', 'crm', 'field_sales'],
  hr:          ['dashboard', 'hr_employees', 'hr_attendance', 'hr_leaves', 'hr_tasks', 'hr_payslips', 'knowledge_center', 'finance', 'announcements', 'holidays', 'profile', 'leaves', 'attendance', 'timesheets'],
};

/** Set of module keys this user effectively has (view-or-edit), admin-aware. */
function resolveModuleKeys(user) {
  if (!user) return new Set();
  if (user.role === 'admin') return new Set(MODULE_KEYS);
  const access = Array.isArray(user.moduleAccess) ? user.moduleAccess : [];
  // Explicit grants → grants + always-on baseline. No grants → role defaults.
  if (access.length) return new Set([...BASELINE_MODULES, ...access.map(a => a.module)]);
  return new Set(ROLE_DEFAULT_MODULES[user.role] || ROLE_DEFAULT_MODULES.employee);
}

function canAccessModule(user, moduleKey) {
  return resolveModuleKeys(user).has(moduleKey);
}

function canEditModule(user, moduleKey) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const access = Array.isArray(user.moduleAccess) ? user.moduleAccess : [];
  if (access.length) {
    // Baseline self-service stays editable even when explicit grants exist.
    if (BASELINE_EDITABLE.includes(moduleKey)) return true;
    const entry = access.find(a => a.module === moduleKey);
    return !!entry && entry.permission === PERMISSIONS.EDIT;
  }
  return (ROLE_DEFAULT_MODULES[user.role] || ROLE_DEFAULT_MODULES.employee).includes(moduleKey);
}

/**
 * Validate + normalize a moduleAccess payload from the client. Drops unknown
 * module keys and coerces invalid permissions to 'view'. Returns an array of
 * { module, permission } or null if input wasn't an array.
 */
function sanitizeModuleAccess(input) {
  if (!Array.isArray(input)) return null;
  const seen = new Set();
  const out = [];
  for (const item of input) {
    const key = item && item.module;
    if (!MODULE_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    const permission = item.permission === PERMISSIONS.EDIT ? PERMISSIONS.EDIT : PERMISSIONS.VIEW;
    out.push({ module: key, permission });
  }
  return out;
}

module.exports = {
  PERMISSIONS,
  MODULE_KEYS,
  ROLE_DEFAULT_MODULES,
  resolveModuleKeys,
  canAccessModule,
  canEditModule,
  sanitizeModuleAccess,
};
