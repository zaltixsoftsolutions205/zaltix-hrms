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

module.exports = { roleCheck, roleOrEmployee };
