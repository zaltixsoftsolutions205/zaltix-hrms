const roleCheck = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Access denied. Required roles: ${roles.join(', ')}` });
    }
    next();
  };
};

// Like roleCheck, but also lets through specific employee IDs that have been
// granted a module individually (mirrors the frontend's allowEmployeeIds on
// ProtectedRoute). Use when a non-HR/admin employee needs an HR-gated endpoint.
const roleOrEmployee = (roles, employeeIds) => {
  const allowedIds = new Set(employeeIds);
  return (req, res, next) => {
    if (roles.includes(req.user.role) || allowedIds.has(req.user.employeeId)) {
      return next();
    }
    return res.status(403).json({ message: `Access denied. Required roles: ${roles.join(', ')}` });
  };
};

const { canAccessModule, canEditModule } = require('../constants/modules');

// Gate a route by per-employee module access. `mode` is 'view' (default) or
// 'edit'. Admin always passes; non-admins fall back to role defaults when they
// have no explicit moduleAccess (see constants/modules.js).
const moduleAccess = (moduleKey, mode = 'view') => {
  return (req, res, next) => {
    const ok = mode === 'edit'
      ? canEditModule(req.user, moduleKey)
      : canAccessModule(req.user, moduleKey);
    if (!ok) {
      return res.status(403).json({
        message: mode === 'edit'
          ? `You do not have edit access to this module.`
          : `You do not have access to this module.`,
      });
    }
    next();
  };
};

module.exports = { roleCheck, roleOrEmployee, moduleAccess };
