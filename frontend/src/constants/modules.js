/**
 * Module access registry — single source of truth for the per-employee
 * "module access" feature. Each grantable module has a stable `key`, the
 * route it maps to, the sidebar label/icon, and whether it supports an
 * "edit" permission (some modules are inherently read-only views).
 *
 * Keep this list in sync with backend/constants/modules.js.
 *
 * Access model:
 *   - admin role bypasses everything (sees all modules).
 *   - A non-admin employee with a non-empty `moduleAccess` array is governed
 *     strictly by it: each entry is { module: <key>, permission: 'view'|'edit' }.
 *   - A non-admin employee with an empty/absent `moduleAccess` falls back to
 *     their ROLE_DEFAULT_MODULES below (no disruption to existing users).
 */

export const PERMISSIONS = { VIEW: 'view', EDIT: 'edit' };

// icon strings are Heroicons-style single-path `d` values used by the Sidebar.
const ICON = {
  dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  profile: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  leaf: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  approvals: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l2 2 4-4",
  payslip: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  tasks: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  crm: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
  people: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  recruit: "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z",
  finance: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  book: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  report: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  field: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z",
};

/**
 * MODULES — every grantable module.
 *  key:        stable identifier stored in DB (never change once shipped)
 *  label:      sidebar + picker label
 *  path:       route the sidebar links to
 *  icon:       sidebar icon path
 *  editable:   whether an 'edit' permission is meaningful (else view-only)
 *  group:      picker grouping
 */
export const MODULES = [
  // Self-service (the role-default baseline for a normal employee)
  { key: 'dashboard',        label: 'Dashboard',          path: '/dashboard',            icon: ICON.dashboard, editable: false, group: 'General' },
  { key: 'profile',          label: 'My Profile',         path: '/profile',              icon: ICON.profile,   editable: true,  group: 'General' },
  { key: 'attendance',       label: 'My Attendance',      path: '/attendance',           icon: ICON.calendar,  editable: true,  group: 'Self-service' },
  { key: 'leaves',           label: 'My Leaves',          path: '/leaves',               icon: ICON.leaf,      editable: true,  group: 'Self-service' },
  { key: 'payslips',         label: 'My Payslips',        path: '/payslips',             icon: ICON.payslip,   editable: false, group: 'Self-service' },
  { key: 'tasks',            label: 'My Tasks',           path: '/tasks',                icon: ICON.tasks,     editable: true,  group: 'Self-service' },
  { key: 'timesheets',       label: 'Timesheets',         path: '/timesheets',           icon: ICON.clock,     editable: true,  group: 'Self-service' },
  { key: 'knowledge_center', label: 'Knowledge Center',   path: '/knowledge-center',     icon: ICON.book,      editable: false, group: 'Self-service' },
  { key: 'team',             label: 'My Team',            path: '/team',                 icon: ICON.people,    editable: false, group: 'Self-service' },

  // Sales / CRM
  { key: 'crm',              label: 'CRM',                path: '/crm',                  icon: ICON.crm,       editable: true,  group: 'Sales' },
  { key: 'field_sales',      label: 'Field Sales',        path: '/field-sales/leads',    icon: ICON.field,     editable: true,  group: 'Sales' },

  // HR-management modules
  { key: 'hr_employees',     label: 'Employees (HR)',     path: '/hr/employees',         icon: ICON.people,    editable: true,  group: 'HR Management' },
  { key: 'hr_attendance',    label: 'Attendance (HR)',    path: '/hr/attendance',        icon: ICON.calendar,  editable: true,  group: 'HR Management' },
  { key: 'hr_leaves',        label: 'Leave Approvals',    path: '/hr/leaves',            icon: ICON.approvals, editable: true,  group: 'HR Management' },
  { key: 'hr_tasks',         label: 'Work & KPI (HR)',    path: '/hr/tasks',             icon: ICON.tasks,     editable: true,  group: 'HR Management' },
  { key: 'hr_payslips',      label: 'Payslips (HR)',      path: '/hr/payslips',          icon: ICON.payslip,   editable: true,  group: 'HR Management' },

  // Admin / org-wide
  { key: 'recruitment',      label: 'Recruitment',        path: '/admin/recruitment',    icon: ICON.recruit,   editable: true,  group: 'Admin' },
  { key: 'finance',          label: 'Finance',            path: '/admin/finance',        icon: ICON.finance,   editable: true,  group: 'Admin' },
  { key: 'reports',          label: 'Reports',            path: '/admin/reports',        icon: ICON.report,    editable: false, group: 'Admin' },
  { key: 'announcements',    label: 'Announcements',      path: '/admin/announcements',  icon: ICON.book,      editable: true,  group: 'Admin' },
  { key: 'holidays',         label: 'Holidays',           path: '/admin/holidays',       icon: ICON.calendar,  editable: true,  group: 'Admin' },
];

export const MODULE_BY_KEY = MODULES.reduce((acc, m) => { acc[m.key] = m; return acc; }, {});

// Path -> module key, for route guarding.
export const MODULE_KEY_BY_PATH = MODULES.reduce((acc, m) => { acc[m.path] = m.key; return acc; }, {});

/**
 * Role defaults — used ONLY when an employee has no explicit moduleAccess,
 * so existing users keep exactly what they have today. Mirrors the current
 * ROLE_NAV in Sidebar.jsx.
 */
/**
 * Self-service baseline every non-admin always keeps, regardless of explicit
 * grants — so granting a management module never cuts someone off from their
 * own attendance/leaves/payslips/etc. The picker shows these as always-on.
 */
export const BASELINE_MODULES = ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center'];
export const BASELINE_EDITABLE = ['profile', 'attendance', 'leaves', 'tasks', 'timesheets'];

export const ROLE_DEFAULT_MODULES = {
  employee:    ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center', 'team'],
  sales:       ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center', 'team', 'crm'],
  field_sales: ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center', 'crm', 'field_sales'],
  hr:          ['dashboard', 'hr_employees', 'hr_attendance', 'hr_leaves', 'hr_tasks', 'hr_payslips', 'knowledge_center', 'finance', 'announcements', 'holidays', 'profile', 'leaves', 'attendance', 'timesheets'],
};

const GROUP_ORDER = ['General', 'Self-service', 'Sales', 'HR Management', 'Admin'];

/** Modules grouped for the picker UI, preserving GROUP_ORDER. */
export const MODULE_GROUPS = GROUP_ORDER.map(group => ({
  group,
  modules: MODULES.filter(m => m.group === group),
})).filter(g => g.modules.length);

/**
 * Resolve the effective list of granted module keys for a user object,
 * applying admin bypass and the role-default fallback. Returns Set of keys.
 */
export function resolveModuleKeys(user) {
  if (!user) return new Set();
  if (user.role === 'admin') return new Set(MODULES.map(m => m.key));
  const access = Array.isArray(user.moduleAccess) ? user.moduleAccess : [];
  // Explicit grants → grants + always-on baseline. No grants → role defaults.
  if (access.length) return new Set([...BASELINE_MODULES, ...access.map(a => a.module)]);
  return new Set(ROLE_DEFAULT_MODULES[user.role] || ROLE_DEFAULT_MODULES.employee);
}

/** Whether the user can access a module key at all (view or edit). */
export function canAccessModule(user, moduleKey) {
  return resolveModuleKeys(user).has(moduleKey);
}

/** Whether the user has edit permission on a module key. Admin → always true. */
export function canEditModule(user, moduleKey) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const access = Array.isArray(user.moduleAccess) ? user.moduleAccess : [];
  if (access.length) {
    // Baseline self-service stays editable even when explicit grants exist.
    if (BASELINE_EDITABLE.includes(moduleKey)) return true;
    const entry = access.find(a => a.module === moduleKey);
    return !!entry && entry.permission === PERMISSIONS.EDIT;
  }
  // Role-default fallback: defaults grant edit on their own self-service area.
  return (ROLE_DEFAULT_MODULES[user.role] || ROLE_DEFAULT_MODULES.employee).includes(moduleKey);
}
