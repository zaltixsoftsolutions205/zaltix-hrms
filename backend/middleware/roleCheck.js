const Task = require("../models/Task");

const {
  canAccessModule,
  canEditModule,
} = require("../constants/modules");


/*
|--------------------------------------------------------------------------
| ROLE HIERARCHY
|--------------------------------------------------------------------------
|
| Higher number = higher authority.
|
*/

const ROLE_LEVEL = {
  employee: 1,
  "team-lead": 2,
  manager: 3,
  admin: 4,
};


/*
|--------------------------------------------------------------------------
| ROLE CHECK
|--------------------------------------------------------------------------
*/

const roleCheck = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Required roles: ${roles.join(", ")}`,
      });
    }

    next();
  };
};


/*
|--------------------------------------------------------------------------
| ROLE OR EMPLOYEE
|--------------------------------------------------------------------------
*/

const roleOrEmployee = (roles, employeeIds) => {
  const allowedIds = new Set(employeeIds);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    if (
      roles.includes(req.user.role) ||
      allowedIds.has(req.user.employeeId)
    ) {
      return next();
    }

    return res.status(403).json({
      message: `Access denied. Required roles: ${roles.join(", ")}`,
    });
  };
};


/*
|--------------------------------------------------------------------------
| MODULE ACCESS
|--------------------------------------------------------------------------
*/

const moduleAccess = (moduleKey, mode = "view") => {
  return (req, res, next) => {

    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    const ok = mode === "edit"? canEditModule(req.user, moduleKey) : canAccessModule(req.user, moduleKey);

    if (!ok) {
      return res.status(403).json({
        message:
          mode === "edit"
            ? "You do not have edit access to this module."
            : "You do not have access to this module.",
      });
    }

    next();
  };
};


/*
|--------------------------------------------------------------------------
| CAN MODIFY TASK
|--------------------------------------------------------------------------
|
| This is NOT module authorization.
|
| moduleAccess() answers:
|
|   "Can this user edit the Task module?"
|
| canModifyTask() answers:
|
|   "Can this user edit/delete THIS PARTICULAR task?"
|
|--------------------------------------------------------------------------
*/

const canModifyTask = async (req, res, next) => {
  try {

    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    const taskId = req.params.id;

    if (!taskId) {
      return res.status(400).json({
        message: "Task ID is required.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | ADMIN
    |--------------------------------------------------------------------------
    |
    | Admin has complete task authority.
    |
    */

    if (req.user.role === "admin") {
      return next();
    }


    /*
    |--------------------------------------------------------------------------
    | FIND TASK
    |--------------------------------------------------------------------------
    */

    const task = await Task.findById(taskId)
      .populate("assignedBy", "employeeId name role")
      .lean();

    if (!task) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }


    /*
    |--------------------------------------------------------------------------
    | FIND WHO CREATED/ASSIGNED THE TASK
    |--------------------------------------------------------------------------
    |
    | This assumes your Task model contains:
    |
    | assignedBy: ObjectId -> User
    |
    */

    if (!task.assignedBy) {
      return res.status(403).json({
        message: "This task does not have a valid task owner.",
      });
    }


    const currentUserLevel =
      ROLE_LEVEL[String(req.user.role).toLowerCase()];

    const assignedByLevel =
      ROLE_LEVEL[
        String(task.assignedBy.role).toLowerCase()
      ];


    /*
    |--------------------------------------------------------------------------
    | UNKNOWN ROLE
    |--------------------------------------------------------------------------
    */

    if (!currentUserLevel || !assignedByLevel) {
      return res.status(403).json({
        message: "Task hierarchy permission could not be determined.",
      });
    }


    /*
    |--------------------------------------------------------------------------
    | HIERARCHY RULE
    |--------------------------------------------------------------------------
    |
    | User can modify a task only when their authority level
    | is equal to or greater than the person who assigned it.
    |
    */

    if (currentUserLevel < assignedByLevel) {
      return res.status(403).json({
        message:
          "You cannot modify or delete a task assigned by a higher-level user.",
      });
    }


    /*
    |--------------------------------------------------------------------------
    | ALLOWED
    |--------------------------------------------------------------------------
    */

    req.task = task;

    next();

  } catch (error) {

    console.error("canModifyTask error:", error);

    return res.status(500).json({
      message: "Failed to verify task permissions.",
    });
  }
};


module.exports = {
  roleCheck,
  roleOrEmployee,
  moduleAccess,
  canModifyTask,
};