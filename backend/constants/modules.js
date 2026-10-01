const PERMISSIONS = { VIEW: 'view', EDIT: 'edit' };

const MODULE_KEYS = [
  'dashboard',
  'profile',
  'attendance',
  'leaves',
  'payslips',
  'tasks',
  'timesheets',
  'knowledge_center',
  'team',

  // Sales
  'crm',
  // Sales workflow modules
  'lead',
  'visits',
  'registration',
  'demos',
  'data_updation',
  'feedback',
  // HR
  'hr_employees',
  'hr_attendance',
  'hr_leaves',
  'hr_tasks',
  'hr_payslips',

  // Admin
  'recruitment',
  'finance',
  'reports',
  'announcements',
  'holidays',

  // Workspace
  'overview',
  'department',
  'project',
  'task',
];

const BASELINE_MODULES = [
  'dashboard',
  'profile',
  'attendance',
  'leaves',
  'payslips',
  'tasks',
  'timesheets',
  'knowledge_center',
];

const BASELINE_EDITABLE = [
  'profile',
  'attendance',
  'leaves',
  'tasks',
  'timesheets',
];

const ROLE_DEFAULT_MODULES = {
  employee: ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center', 'team',],
  manager: ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center', 'team', 'overview', 'department', 'project', 'task', 'lead', 'visits', 'registration', 'demos', 'data_updation', 'feedback',],
  'team-lead': ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center', 'team', 'overview', 'department', 'project', 'task',],
  sales: ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center', 'team', 'crm', 'visits', 'lead', 'registration',],
  hr: ['dashboard', 'hr_employees', 'hr_attendance', 'hr_leaves', 'hr_tasks', 'hr_payslips', 'knowledge_center', 'finance', 'announcements', 'holidays', 'profile', 'leaves', 'attendance', 'timesheets',],
  'inside-sales': ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center',
    'team',
    // Inside Sales
    'lead',
    'visits',
    'feedback',
  ],
  'product-executive': [
    'dashboard',
    'profile',
    'attendance',
    'leaves',
    'payslips',
    'tasks',
    'timesheets',
    'knowledge_center',
    'team',
    // Product Executive
    'demos',
    'data_updation',
    'feedback',
    'registration',
  ],
};
/**
 * Role-level default permissions.
 *
 * IMPORTANT:
 * These are used only when moduleAccess is empty.
 */
const ROLE_DEFAULT_ACCESS = {
  employee: [],

  manager: [
    { module: 'overview', permission: 'edit' },
    { module: 'department', permission: 'edit' },
    { module: 'project', permission: 'edit' },
    { module: 'task', permission: 'edit' },
  ],

  'team-lead': [
    { module: 'overview', permission: 'view' },
    { module: 'department', permission: 'view' },
    { module: 'project', permission: 'view' },
    { module: 'task', permission: 'edit' },
  ],

  sales: [
    { module: 'crm', permission: 'edit' },
  ],

  field_sales: [
    { module: 'crm', permission: 'edit' },
    { module: 'field_sales', permission: 'edit' },
  ],

  hr: [
    { module: 'hr_employees', permission: 'edit' },
    { module: 'hr_attendance', permission: 'edit' },
    { module: 'hr_leaves', permission: 'edit' },
    { module: 'hr_tasks', permission: 'edit' },
    { module: 'hr_payslips', permission: 'edit' },
  ],
};


function resolveModuleKeys(user) {
  if (!user) return new Set();
  if (user.role === 'admin') { return new Set(MODULE_KEYS); }
  const access = Array.isArray(user.moduleAccess) ? user.moduleAccess : [];
  if (access.length) {
    return new Set([...BASELINE_MODULES, ...access.map(a => a.module),]);
  }
  return new Set(ROLE_DEFAULT_MODULES[user.role] || ROLE_DEFAULT_MODULES.employee);
}

function canAccessModule(user, moduleKey) {
  return resolveModuleKeys(user).has(moduleKey);
}

function canEditModule(user, moduleKey) {
  if (!user) return false;

  if (user.role === 'admin') {
    return true;
  }
  const access = Array.isArray(user.moduleAccess) ? user.moduleAccess : [];
  // Explicit per-user permissions
  if (access.length) {
    if (BASELINE_EDITABLE.includes(moduleKey)) {
      return true;
    }
    const entry = access.find(a => a.module === moduleKey);
    return (!!entry && entry.permission === PERMISSIONS.EDIT);
  }

  // Role-level default permissions
  const roleAccess = ROLE_DEFAULT_ACCESS[user.role] || [];
  const entry = roleAccess.find(a => a.module === moduleKey);
  return entry?.permission === PERMISSIONS.EDIT;
}

function sanitizeModuleAccess(input) {
  if (!Array.isArray(input)) {
    return null;
  }

  const seen = new Set();
  const out = [];

  for (const item of input) {
    const key = item && item.module;

    if (
      !MODULE_KEYS.includes(key) ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    const permission =
      item.permission === PERMISSIONS.EDIT
        ? PERMISSIONS.EDIT
        : PERMISSIONS.VIEW;

    out.push({
      module: key,
      permission,
    });
  }

  return out;
}

module.exports = {
  PERMISSIONS,
  MODULE_KEYS,
  ROLE_DEFAULT_MODULES,
  ROLE_DEFAULT_ACCESS,
  resolveModuleKeys,
  canAccessModule,
  canEditModule,
  sanitizeModuleAccess,
};