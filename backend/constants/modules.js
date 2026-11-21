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
  // view = see own claims; edit = submit / withdraw claims
  'expense_claims',

  // Sales
  'crm',
  'query_management',
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
  // Global Analytics Dashboard (admin / hr / manager only, see services/analytics/scope.js)
  'analytics',
  'announcements',
  'holidays',

  // Workspace
  'department',
  'project',
  // Project sub-modules (per-user override of the department role tree)
  'project_module_tree',
  'project_tasks',
  'project_bugs',
  'project_timeline',
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
  manager: ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center', 'team', 'crm', 'lead', 'visits', 'registration', 'demos', 'data_updation', 'feedback', 'analytics',],
  'team-lead': ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center', 'team',],
  sales: ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center', 'team', 'crm', 'query_management', 'visits', 'lead', 'registration',],
  hr: ['dashboard', 'hr_employees', 'hr_attendance', 'hr_leaves', 'hr_tasks', 'hr_payslips', 'knowledge_center', 'finance', 'announcements', 'holidays', 'profile', 'leaves', 'attendance', 'timesheets', 'crm', 'visits', 'demos', 'data_updation', 'feedback', 'registration', 'analytics'],
  'inside-sales': ['dashboard', 'profile', 'attendance', 'leaves', 'payslips', 'tasks', 'timesheets', 'knowledge_center',
    'team',
    // Inside Sales — 'crm' is what lead tables are guarded by
    'crm',
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
    // Product Executive — 'crm' is what lead tables are guarded by
    'crm',
    'demos',
    'data_updation',
    'feedback',
    'registration',
  ],
};

/*
 * Sales pages (Leads, Visits, Demos, Data Updation, Registration, Feedback):
 * view = open the page; edit = add / change / delete its entries.
 */
const SALES_PAGE_MODULES = ['lead', 'visits', 'demos', 'data_updation', 'registration', 'feedback'];
const editOf = (...keys) => keys.map((module) => ({ module, permission: 'edit' }));

/** Role-level edit permissions used when moduleAccess is empty. */
const ROLE_DEFAULT_ACCESS = {
  employee: [],
  manager: [
    // Managers see every lead and manage the product tree (crmScopeService)
    { module: 'crm', permission: 'edit' },
    ...editOf(...SALES_PAGE_MODULES),
  ],
  'team-lead': [
  ],
  sales: [
    { module: 'crm', permission: 'edit' },
    { module: 'query_management', permission: 'edit' },
    ...editOf('lead', 'visits', 'registration'),
  ],
  // Full create/edit/delete inside their own territory (crmScopeService
  // limits which leads); product tree management stays admin/hr/manager.
  'inside-sales': [
    { module: 'crm', permission: 'edit' },
    ...editOf('lead', 'visits', 'feedback'),
  ],
  'product-executive': [
    { module: 'crm', permission: 'edit' },
    ...editOf('demos', 'data_updation', 'feedback', 'registration'),
  ],
  hr: [
    { module: 'hr_employees', permission: 'edit' },
    { module: 'hr_attendance', permission: 'edit' },
    { module: 'hr_leaves', permission: 'edit' },
    { module: 'hr_tasks', permission: 'edit' },
    { module: 'hr_payslips', permission: 'edit' },
    // HR sees every lead and manages the product tree (crmScopeService)
    { module: 'crm', permission: 'edit' },
    ...editOf('visits', 'demos', 'data_updation', 'feedback', 'registration'),
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
  SALES_PAGE_MODULES,
  resolveModuleKeys,
  canAccessModule,
  canEditModule,
  sanitizeModuleAccess,
};