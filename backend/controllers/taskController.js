const mongoose = require('mongoose');
const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const Department = require('../models/Department');
const notificationService = require('../services/notificationService');

/* ============================================================
 * CONSTANTS
 * ============================================================ */

const TASK_STATUSES = ['not-started', 'in-progress', 'review', 'completed', 'cancelled'];

const STATUS_TRANSITIONS = {
  'not-started': ['in-progress', 'cancelled'],
  'in-progress': ['review'],
  review: ['completed', 'in-progress'],
  completed: [],
  cancelled: [],
};
const SORTABLE_FIELDS = ['deadline', 'priority', 'progress', 'createdAt', 'updatedAt'];
const SEARCHABLE_FIELDS = ['title', 'taskCode', 'category', 'description', 'remarks'];
// Roles allowed to create/reassign a Project Task. Employees are restricted to Self Tasks only.
// BUSINESS RULE — not module/hierarchy authorization. Left untouched.
const PROJECT_TASK_ROLES = ['admin', 'manager', 'team-lead'];
const MAX_ATTACHMENTS = 4;

// Used both by visibility restriction (deny-all fallback) and by
// buildTaskFilters (deny-all fallback for an invalid/empty manager or
// teamLead relationship filter). Declared once, up top, so both can use it.
const NO_MATCH_ID = new mongoose.Types.ObjectId();

const POPULATE_LIST = [
  { path: 'project', select: 'name projectCode manager' },
  { path: 'department', select: 'name code' },
  { path: 'assignedBy', select: 'name email employeeId' },
  { path: 'assignees.user', select: 'name email employeeId role' },
];

const POPULATE_LIST_DETAILED = [
  { path: 'project' },
  { path: 'department' },
  { path: 'assignedBy', select: 'name email employeeId role' },
  { path: 'assignees.user', select: 'name email employeeId role' },
];
/* ============================================================
 * GENERIC HELPERS
 * ============================================================ */
const sendServerError = (res, context, error) => {
  console.error(`${context}:`, error);
  return res.status(500).json({
    success: false,
    message: 'Server Error',
  });
};
const sendError = (res, statusCode, message) => res.status(statusCode).json({ success: false, message });

const isValidObjectId = (id) => Boolean(id) && mongoose.Types.ObjectId.isValid(id);

/**
 * Authentication middleware is expected to attach req.user before this
 * controller ever runs. This is a defensive guard only. It performs NO
 * module-permission check and NO task-visibility check.
 */
const requireUser = (req, res) => {
  if (!req.user || !req.user._id) {
    sendError(res, 401, 'Not authenticated.');
    return false;
  }
  return true;
};

/**
 * DEDUP: every :id-based endpoint repeated the same
 * "read req.params.id, validate as ObjectId, or 400" block.
 * Sends the 400 itself and returns null on failure so callers can just:
 *   const id = requireValidTaskId(req, res);
 *   if (!id) return;
 */
const requireValidTaskId = (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    sendError(res, 400, 'Invalid task id.');
    return null;
  }
  return id;
};

/** Roles are expected to be stored lowercase, but never trust that blindly. */
const normalizeRole = (role) => String(role || '').toLowerCase();

const populateTask = (query, detailed = false) => {
  const list = detailed ? POPULATE_LIST_DETAILED : POPULATE_LIST;
  return list.reduce((q, p) => q.populate(p), query);
};

/**
 * DEDUP: archiveTask / restoreTask / duplicateTask all loaded the task the
 * same way (only the project-select field is ever identical: 'manager').
 * Kept intentionally narrow — functions needing different population
 * (assignTask, sendTaskReminder, updateTask) still build their own query,
 * since forcing them through this helper would hide what they actually need.
 */
const loadTaskWithProjectManager = (id) => Task.findById(id).populate('project', 'manager');

/**
 * Converts uploaded files (req.files, from the taskAttachmentUpload middleware)
 * into stored URLs saved on the Task document.
 */
const buildAttachmentPaths = (files = []) => {
  if (!Array.isArray(files)) return [];
  return files.slice(0, MAX_ATTACHMENTS).map((file) => `/uploads/tasks/${file.filename}`);
};

/* ============================================================
 * VALIDATION HELPERS
 * ============================================================ */

const validateProject = async (projectId) => {
  if (!isValidObjectId(projectId)) {
    return { valid: false, message: 'Invalid project.' };
  }
  const project = await Project.findById(projectId);
  if (!project) return { valid: false, message: 'Project not found.' };
  return { valid: true, project };
};

const validateDepartment = async (departmentId) => {
  if (!isValidObjectId(departmentId)) {
    return { valid: false, message: 'Invalid department.' };
  }
  const department = await Department.findById(departmentId);
  if (!department) return { valid: false, message: 'Department not found.' };
  return { valid: true, department };
};

const validateAssignedUser = async (userId) => {
  if (!isValidObjectId(userId)) {
    return { valid: false, message: 'Invalid assigned user.' };
  }
  const user = await User.findById(userId);
  if (!user) return { valid: false, message: 'Assigned user not found.' };
  return { valid: true, user };
};

/** Confirms the given department matches the project's own department. */
const validateProjectDepartment = (project, departmentId) => {
  if (!project?.department) return { valid: true }; // project has no fixed department, skip
  if (project.department.toString() !== departmentId.toString()) {
    return { valid: false, message: 'Selected project does not belong to the selected department.' };
  }
  return { valid: true };
};

/** Confirms the employee sits in the department and on the project team. */
const validateProjectMember = (project, user, departmentId) => {
  if (user.department && departmentId && user.department.toString() !== departmentId.toString()) {
    return { valid: false, message: 'Selected employee is not assigned to this department.', };
  }

  const isMember = Array.isArray(project?.teamMembers) && project.teamMembers.some((member) => member.toString() === user._id.toString());

  // SCHEMA-VERIFIED: Project.manager, not Project.projectManager.
  const isManager = project?.manager && project.manager.toString() === user._id.toString();

  if (!isMember && !isManager) {
    return {
      valid: false,
      message: 'Employee is not a member of this project.',
    };
  }
  return { valid: true };
};
const validateTaskCodeUnique = async (taskCode, excludeId = null) => {
  const normalized = taskCode.trim().toUpperCase();
  const query = { taskCode: normalized };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await Task.findOne(query);
  return { unique: !existing, normalized };
};
const validateDateRange = (startDate, deadline) => {
  if (!deadline) return { valid: true };
  const start = startDate ? new Date(startDate) : new Date();
  if (start > new Date(deadline)) {
    return { valid: false, message: 'Deadline must be after start date.' };
  }
  return { valid: true };
};
const validateProgress = (progress) => {
  if (progress === undefined || progress === null) return { valid: true };
  const num = Number(progress);
  if (Number.isNaN(num) || num < 0 || num > 100) {
    return { valid: false, message: 'Progress must be a number between 0 and 100.' };
  }
  return { valid: true };
};
const validateHours = (value, label) => {
  if (value === undefined || value === null || value === '') return { valid: true };
  const num = Number(value);
  if (Number.isNaN(num) || num < 0) {
    return { valid: false, message: `${label} must be a positive number.` };
  }
  return { valid: true };
};
const validateStatusTransition = (currentStatus, nextStatus) => {
  if (!TASK_STATUSES.includes(nextStatus)) {
    return { valid: false, message: 'Invalid task status.' };
  }
  if (currentStatus === nextStatus) {
    return { valid: false, message: `Task is already in "${currentStatus}" status.` };
  }
  const allowed = STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    return {
      valid: false,
      message: `Cannot change status from "${currentStatus}" to "${nextStatus}".`,
    };
  }
  return { valid: true };
};

/* ============================================================
 * OWNERSHIP-BASED "CAN MANAGE" HELPER
 * ------------------------------------------------------------
 * IMPORTANT: this is intentionally still here and intentionally still
 * used — but ONLY by functions that have no route wired to
 * canModifyTask middleware (updateTaskStatus, assignTask,
 * sendTaskReminder, archiveTask, restoreTask, duplicateTask, and the
 * bulk-* endpoints via partitionManageableTasks).
 *
 * It is NO LONGER used by updateTask/deleteTask — those two are routed
 * through canModifyTask (role-hierarchy) middleware, which is now the
 * single source of truth for their authorization. Keeping both models
 * active on the same endpoint would be exactly the "third authorization
 * system" you told me not to create, so it was removed there.
 *
 * This function's own authorization model was NOT changed. See SECTION 8.
 * ============================================================ */

const isPrivilegedRole = (role) => ['admin', 'hr'].includes(normalizeRole(role));

const canManageTask = (task, user, { allowAssignee = false } = {}) => {
  if (!user) return false;
  if (isPrivilegedRole(user.role)) return true;

  const userId = user._id.toString();
  const isCreator = task.assignedBy && (task.assignedBy._id || task.assignedBy).toString() === userId;
  const isAssignee = allowAssignee && task.assignedTo && (task.assignedTo._id || task.assignedTo).toString() === userId;

  const isProjectManager = task.project?.manager && task.project.manager.toString() === userId;

  return Boolean(isCreator || isAssignee || isProjectManager);
};

/* ============================================================
 * TASK DATA VISIBILITY ("which tasks can this user see?")
 * ------------------------------------------------------------
 * Unrelated to modify-authorization — untouched.
 * ============================================================ */

const getRoleTaskVisibility = async (user) => {
  if (!user) return { denied: true };
  const role = normalizeRole(user.role);

  switch (role) {
    case 'admin':
      return { restriction: null };

    case 'manager': {
      const headedDepartments = await Department.find({ headOf: user._id, status: { $ne: 'inactive' }, }).select('_id');

      if (headedDepartments.length > 0) {
        return {
          restriction: { department: { $in: headedDepartments.map((d) => d._id) } },
        };
      }

      if (user.department) {
        return { restriction: { department: user.department._id } };
      }

      return { denied: true };
    }

    case 'team-lead': {
      const ledProjects = await Project.find({
        manager: user._id,
        isActive: { $ne: false },
      }).select('_id');

      if (ledProjects.length === 0) return { denied: true };

      return {
        restriction: { project: { $in: ledProjects.map((p) => p._id) } },
      };
    }

    case 'employee': default: return { restriction: { 'assignees.user': user._id } };
  }
};

/**
 * Narrows `filters` (already built by buildTaskFilters — i.e. the
 * GlobalFilters + Timeline request) down to whatever the role-visibility
 * restriction allows. AND logic in both directions:
 *   - a plain requested value is checked against a $in restriction
 *   - a $in requested value (e.g. from a manager/teamLead GlobalFilter,
 *     which resolves to a *set* of allowed project ids) is intersected
 *     against a $in restriction
 * Either way, visibility can only ever shrink what GlobalFilters already
 * asked for — never expand it.
 */
const applyVisibilityRestriction = (filters, restriction) => {
  if (!restriction) return filters;

  Object.entries(restriction).forEach(([field, restrictedValue]) => {
    const requested = filters[field];

    if (requested === undefined || requested === null) {
      filters[field] = restrictedValue;
      return;
    }

    const restrictedIsIn = restrictedValue && Array.isArray(restrictedValue.$in);
    const requestedIsIn = requested && typeof requested === 'object' && Array.isArray(requested.$in);

    if (restrictedIsIn && requestedIsIn) {
      const allowedIds = new Set(restrictedValue.$in.map((id) => id.toString()));
      const intersected = requested.$in.filter((id) => allowedIds.has(id.toString()));
      filters[field] = { $in: intersected.length ? intersected : [NO_MATCH_ID] };
      return;
    }

    if (restrictedIsIn) {
      const allowedIds = restrictedValue.$in.map((id) => id.toString());
      filters[field] = allowedIds.includes(requested.toString()) ? requested : NO_MATCH_ID;
      return;
    }

    if (requestedIsIn) {
      const allowedStr = restrictedValue.toString();
      filters[field] = requested.$in.some((id) => id.toString() === allowedStr)
        ? restrictedValue
        : NO_MATCH_ID;
      return;
    }

    filters[field] =
      requested.toString() === restrictedValue.toString() ? requested : NO_MATCH_ID;
  });

  return filters;
};

const isTaskWithinVisibility = (task, restriction) => {
  if (!restriction) return true;

  return Object.entries(restriction).every(([field, restrictedValue]) => {
    const taskValue = task[field];
    if (!taskValue) return false;

    const taskId = (taskValue._id || taskValue).toString();

    if (restrictedValue && Array.isArray(restrictedValue.$in)) {
      return restrictedValue.$in.map((id) => id.toString()).includes(taskId);
    }
    return taskId === restrictedValue.toString();
  });
};

const emptyPaginatedResult = (page = 1, limit = 10) => ({
  success: true,
  count: 0,
  total: 0,
  page: Math.max(Number(page) || 1, 1),
  pages: 0,
  tasks: [],
});

const emptyStatistics = () => ({
  overview: {
    totalTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    reviewTasks: 0,
    notStartedTasks: 0,
    cancelledTasks: 0,
    overdueTasks: 0,
    completionRate: 0,
    averageProgress: 0,
    estimatedHours: 0,
    actualHours: 0,
  },
  prioritySummary: [],
  statusSummary: [],
  upcomingTasks: [],
  upcomingDeadlines: [],
  lateTasks: [],
  topPerformers: [],
  departmentSummary: [],
});

/* ============================================================
 * NOTIFICATION HELPER
 * ============================================================ */

const sendTaskNotification = async ({ recipient, sender, type, title, message, task }) => {
  if (!recipient) return;
  if (sender && recipient.toString() === sender.toString()) return;
  try {
    await notificationService.notify({
      recipient,
      sender,
      type,
      title,
      message,
      data: task ? { taskId: task._id, taskCode: task.taskCode } : undefined,
    });
  } catch (error) {
    console.error('Task Notification Error:', error);
  }
};

/* ============================================================
 * QUERY BUILDERS
 * ------------------------------------------------------------
 * buildTaskFilters is the SINGLE filtering engine for GET /api/tasks
 * (and every endpoint that reuses it). It now additionally supports:
 *
 *   employee    -> assignees.user   (never assignedTo on the document)
 *   manager     -> Project.manager  -> Task.project $in [...]
 *   teamLead    -> Project.teamMembers -> Task.project $in [...]
 *   timelineStart / timelineEnd -> startDate/deadline OVERLAP filter
 *
 * `assignedTo` is still accepted as an incoming query param for
 * backward compatibility (Tasks.jsx already sends it) — it is mapped
 * internally to `assignees.user` and is NEVER written back onto the
 * Task document.
 * ============================================================ */

const buildTaskFilters = async (queryParams, baseFilter = {}) => {
  const {
    search,
    project,
    department,
    assignedTo,
    employee,
    assignedBy,
    manager,
    teamLead,
    priority,
    status,
    type,
    deadlineFrom,
    deadlineTo,
    startDateFrom,
    startDateTo,
    timelineStart,
    timelineEnd,
    includeInactive,
  } = queryParams;

  const filters = { ...baseFilter };
  // if (!includeInactive) filters.isActive = { $ne: false };

  if (department) filters.department = department;
  if (project) filters.project = project;

  /* --------------------------------------------------------
     MANAGER / TEAM-LEAD -> PROJECT constraints
     Manager: Project.manager === managerId
     Team Lead: managerId is a member of Project.teamMembers
     Both resolve to a *set* of allowed project ids. Those sets
     (and any explicit `project` filter already set above) are
     intersected — AND logic, same relationship semantics as the
     GlobalFilters frontend cooperation.
  -------------------------------------------------------- */
  const projectConstraintSets = [];

  if (manager) {
    if (!isValidObjectId(manager)) {
      filters.project = NO_MATCH_ID;
    } else {
      const managedProjects = await Project.find({ manager }).select('_id');
      projectConstraintSets.push(new Set(managedProjects.map((p) => p._id.toString())));
    }
  }

  if (teamLead) {
    if (!isValidObjectId(teamLead)) {
      filters.project = NO_MATCH_ID;
    } else {
      const ledProjects = await Project.find({ teamMembers: teamLead }).select('_id');
      projectConstraintSets.push(new Set(ledProjects.map((p) => p._id.toString())));
    }
  }

  if (projectConstraintSets.length > 0 && filters.project !== NO_MATCH_ID) {
    let intersected = projectConstraintSets.reduce(
      (acc, set) => (acc === null ? set : new Set([...acc].filter((id) => set.has(id)))),
      null
    );

    if (filters.project) {
      const explicitId = filters.project.toString();
      intersected = new Set([...intersected].filter((id) => id === explicitId));
    }

    filters.project = { $in: intersected.size ? [...intersected] : [NO_MATCH_ID] };
  }

  /* --------------------------------------------------------
     EMPLOYEE (never assignedTo on the document)
  -------------------------------------------------------- */
  const employeeId = employee || assignedTo;
  if (employeeId) filters['assignees.user'] = employeeId;

  if (assignedBy) filters.assignedBy = assignedBy;
  if (priority) filters.priority = priority;
  if (status) filters.status = status;
  if (type && ['self', 'project'].includes(type)) filters.taskType = type;

  if (deadlineFrom || deadlineTo) {
    filters.deadline = { ...(filters.deadline || {}) };
    if (deadlineFrom) filters.deadline.$gte = new Date(deadlineFrom);
    if (deadlineTo) filters.deadline.$lte = new Date(deadlineTo);
  }

  if (startDateFrom || startDateTo) {
    filters.startDate = { ...(filters.startDate || {}) };
    if (startDateFrom) filters.startDate.$gte = new Date(startDateFrom);
    if (startDateTo) filters.startDate.$lte = new Date(startDateTo);
  }

  /* --------------------------------------------------------
     TIMELINE OVERLAP
     Visible in [timelineStart, timelineEnd] when:
       task.startDate <= timelineEnd
       AND
       task.deadline  >= timelineStart
     A task with no deadline is treated as a single-day
     milestone at startDate, so it only needs startDate itself
     to fall on/after timelineStart.
  -------------------------------------------------------- */
  if (timelineStart || timelineEnd) {
    const rangeStart = timelineStart ? new Date(timelineStart) : null;
    const rangeEnd = timelineEnd ? new Date(timelineEnd) : null;
    const overlapConditions = [];

    if (rangeEnd) {
      overlapConditions.push({
        $or: [
          { startDate: { $lte: rangeEnd } },
          { startDate: null },
          { startDate: { $exists: false } },
        ],
      });
    }

    if (rangeStart) {
      overlapConditions.push({
        $or: [
          { deadline: { $gte: rangeStart } },
          { deadline: null, startDate: { $gte: rangeStart } },
          { deadline: { $exists: false }, startDate: { $gte: rangeStart } },
        ],
      });
    }

    if (overlapConditions.length) {
      filters.$and = [...(filters.$and || []), ...overlapConditions];
    }
  }

  if (search) {
    filters.$or = SEARCHABLE_FIELDS.map((field) => ({
      [field]: { $regex: search, $options: 'i' },
    }));
  }

  return filters;
};

const buildSortOption = (sortBy, sortOrder = 'asc') => {
  const field = SORTABLE_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
  const direction = sortOrder === 'desc' ? -1 : 1;
  return { [field]: direction };
};

const paginateTasks = async (filters, { page = 1, limit = 10, sort }, detailed = false) => {
  const pageNum = Math.max(Number(page) || 1, 1);
  const limitNum = Math.max(Number(limit) || 10, 1);
  const [tasks, total] = await Promise.all([
    populateTask(Task.find(filters).sort(sort).skip((pageNum - 1) * limitNum).limit(limitNum), detailed),
    Task.countDocuments(filters),
  ]);

  return {
    tasks, count: tasks.length, total, page: pageNum, limit: limitNum,
    pages: Math.ceil(total / limitNum) || 0,
  };
};

/* ============================================================
 * CORE CONTROLLERS
 * ============================================================ */

/**
 * DEDUP (createTask): self/project payloads used to be built as two full,
 * separately-written Task.create({...}) objects sharing ~12 fields. This
 * builds the shared base once, then Object.assign's the per-type fields —
 * exactly the pattern you specified. Resulting documents are identical to
 * before: same fields, same values, same defaults.
 */
const buildTaskData = ({ title, description, category, currentUserId, priority, status, startDate, deadline, estimatedHours, remarks, proofFiles, attachmentPaths, }) => ({
  title: title.trim(),
  description,
  category,
  assignedBy: currentUserId,
  priority,
  status,
  startDate: startDate || undefined,
  deadline: deadline || null,
  estimatedHours,
  remarks,
  proofFiles,
  attachments: attachmentPaths,
  createdBy: currentUserId,
});

/**
 * @desc    Create Task
 * @route   POST /api/tasks
 * @access  Private
 */

/* ============================================================
 * CREATE TASK RECORD
 * ------------------------------------------------------------
 * Common database creation logic used by:
 *
 * 1. Normal frontend task creation
 * 2. Excel task import
 *
 * IMPORTANT:
 * This function receives NORMALIZED data.
 *
 * Excel-specific values such as:
 *   projectCode
 *   departmentCode
 *   employeeId
 *
 * must already have been converted into:
 *   project ObjectId
 *   department ObjectId
 *   assignedTo ObjectId
 *
 * by the Excel import middleware.
 * ============================================================ */

const createTaskRecord = async ({ data, createdBy, currentUser }) => {
  const { title, description, taskType, project, department, category, assignedTo, priority, status, startDate, deadline, estimatedHours, actualHours, progress, remarks, proofFiles, attachments = [], taskCode, } = data;
  /* ==========================================================
     1. BASIC VALIDATION
  ========================================================== */
  if (!title || !String(title).trim()) {
    throw new Error("Task title is required.");
  }

  const normalizedTaskType = String(taskType || "project").trim().toLowerCase();

  if (!["project", "self"].includes(normalizedTaskType)) {
    throw new Error(
      'Task type must be either "project" or "self".'
    );
  }
  /* ==========================================================
     2. VALIDATE HOURS
  ========================================================== */

  const hoursCheck = validateHours(estimatedHours, "Estimated hours");

  if (!hoursCheck.valid) { throw new Error(hoursCheck.message); }

  /* ==========================================================
     3. DATE VALIDATION
  ========================================================== */

  const dateCheck = validateDateRange(startDate, deadline);

  if (!dateCheck.valid) { throw new Error(dateCheck.message); }

  /* ==========================================================
     4. SELF TASK
     ----------------------------------------------------------
     Self tasks never use:
       project
       assignedTo from Excel/frontend
       department from frontend
  ========================================================== */
  if (normalizedTaskType === "self") {
    const currentUser = await User.findById(createdBy).select("_id department");

    if (!currentUser) { throw new Error("Current user not found."); }
    const finalProgress = status === "completed" ? 100 : progress !== undefined && progress !== "" ? Number(progress) : 0;
    if (Number.isNaN(finalProgress) || finalProgress < 0 || finalProgress > 100) {
      throw new Error("Progress must be between 0 and 100.");
    }
    const taskData = {
      title: String(title).trim(),
      taskType: "self",
      description: description || "",
      project: null,
      department: currentUser.department || null,
      category: category || "",
      assignedBy: createdBy,
      assignees: [
        {
          user: createdBy,
          status: String(status || "not-started").trim().toLowerCase(),
          progress: finalProgress,
          actualHours: actualHours === "" || actualHours === undefined ? 0 : Number(actualHours),
        },
      ],
      priority: String(priority || "medium").trim().toLowerCase(),
      status: String(status || "not-started").trim().toLowerCase(),
      startDate: startDate || undefined,
      deadline: deadline || null,
      estimatedHours: estimatedHours === "" || estimatedHours === undefined ? 0 : Number(estimatedHours),
      actualHours: actualHours === "" || actualHours === undefined ? 0 : Number(actualHours),
      progress: finalProgress,
      remarks: remarks || "",
      proofFiles: Array.isArray(proofFiles) ? proofFiles : [],
      attachments: Array.isArray(attachments) ? attachments : [],
      createdBy,
    };

    /*
     * Only use taskCode when supplied.
     *
     * If your Task schema automatically generates taskCode,
     * leave this undefined.
     */
    if (taskCode && String(taskCode).trim()) {
      const normalizedCode = String(taskCode).trim().toUpperCase();
      const existingTask = await Task.findOne({ taskCode: normalizedCode });
      if (existingTask) { throw new Error(`Task code ${normalizedCode} already exists.`); }
      taskData.taskCode = normalizedCode;
    }
    const task = await Task.create(taskData);
    return task;
  }
  /* ==========================================================
 * 5. PROJECT-TASK AUTHORIZATION
 * ========================================================== */

  const user = currentUser || await User.findById(createdBy).select("_id name email employeeId role department");

  if (!user) {
    throw new Error("Current user not found.");
  }

  const normalizedRole = normalizeRole(user.role);

  /*
   * Project tasks can only be created by permitted roles.
   *
   * Admin / HR / other permitted roles are controlled by
   * PROJECT_TASK_ROLES.
   */
  if (
    !PROJECT_TASK_ROLES.includes(normalizedRole)
  ) {
    throw new Error(
      "You are not authorized to create project tasks."
    );
  }

  /* ==========================================================
     6. REQUIRED PROJECT-TASK REFERENCES
  ========================================================== */

  if (!department) { throw new Error("Department is required for a project task."); }
  if (!project) { throw new Error("Project is required for a project task."); }
  const assignedEmployees = Array.isArray(assignedTo) ? assignedTo : assignedTo ? [assignedTo] : [];

  if (assignedEmployees.length === 0) {
    throw new Error("At least one employee must be assigned to the project task.");
  }
  /* ==========================================================
     7. VALIDATE DEPARTMENT
  ========================================================== */

  const departmentResult = await validateDepartment(department);
  if (!departmentResult.valid) { throw new Error(departmentResult.message); }

  /* ==========================================================
     8. VALIDATE PROJECT
  ========================================================= */

  const projectResult = await validateProject(project);
  if (!projectResult.valid) { throw new Error(projectResult.message); }
  const projectDocument = projectResult.project;

  /* ==========================================================
     9. PROJECT → DEPARTMENT VALIDATION
  ========================================================== */

  const departmentCheck = validateProjectDepartment(projectDocument, department);
  if (!departmentCheck.valid) { throw new Error(departmentCheck.message); }

  /* ==========================================================
     10. VALIDATE ASSIGNED EMPLOYEE
  ========================================================== */
  const assignedUsers = [];

  const uniqueEmployeeIds = [
    ...new Set(assignedEmployees.map(id => id.toString()))
  ];

  for (const employeeId of uniqueEmployeeIds) {
    const userResult = await validateAssignedUser(employeeId);
    if (!userResult.valid) { throw new Error(userResult.message); }
    const memberCheck = validateProjectMember(projectDocument, userResult.user, department);
    if (!memberCheck.valid) { throw new Error(memberCheck.message); }
    assignedUsers.push(userResult.user);
  }
  const validatedAssignees = assignedUsers.map((user) => ({ user: user._id, status: "not-started", progress: 0, actualHours: 0, }));

  /* ==========================================================
     12. TASK CODE
  ========================================================== */

  let normalizedTaskCode;
  if (taskCode && String(taskCode).trim()) {
    normalizedTaskCode = String(taskCode).trim().toUpperCase();
    const existingTask = await Task.findOne({ taskCode: normalizedTaskCode });
    if (existingTask) { throw new Error(`Task code ${normalizedTaskCode} already exists.`); }
  }

  /* ==========================================================
     13. NUMERIC VALUES
  ========================================================== */
  const finalEstimatedHours = estimatedHours === undefined || estimatedHours === "" ? 0 : Number(estimatedHours);
  const finalActualHours = actualHours === undefined || actualHours === "" ? 0 : Number(actualHours);
  if (Number.isNaN(finalEstimatedHours) || finalEstimatedHours < 0) {
    throw new Error("Estimated hours must be a valid non-negative number.");
  }
  if (Number.isNaN(finalActualHours) || finalActualHours < 0) {
    throw new Error("Actual hours must be a valid non-negative number.");
  }
  /* ==========================================================
     14. PROGRESS
  ========================================================== */
  let finalProgress = progress === undefined || progress === "" ? 0 : Number(progress);
  if (status === "completed") { finalProgress = 100; }
  if (status === "not-started") { finalProgress = 0; }
  if (Number.isNaN(finalProgress) || finalProgress < 0 || finalProgress > 100) {
    throw new Error("Progress must be between 0 and 100.");
  }

  /* ==========================================================
     15. CREATE TASK
  ========================================================== */

  const taskData = {
    title: String(title).trim(),
    taskType: "project",
    description: description || "",
    project: project,
    department: department,
    category: category || "",
    assignedBy: createdBy,
    assignees: validatedAssignees,
    priority: String(priority || "medium").trim().toLowerCase(),
    status: String(status || "not-started").trim().toLowerCase(),
    startDate: startDate || undefined,
    deadline: deadline || null,
    estimatedHours: finalEstimatedHours,
    actualHours: finalActualHours,
    progress: finalProgress,
    remarks: remarks || "",
    proofFiles: Array.isArray(proofFiles) ? proofFiles : [],
    attachments: Array.isArray(attachments) ? attachments : [],
    createdBy,
  };

  /*
   * Only set taskCode when it was supplied.
   *
   * This allows your existing Task schema/code generator
   * to continue generating TASK-XXXX when the frontend
   * does not provide one.
   */
  if (normalizedTaskCode) {
    taskData.taskCode = normalizedTaskCode;
  }
  const task = await Task.create(taskData);
  return task;
};

/* ============================================================
 * CREATE TASK
 * ------------------------------------------------------------
 * Normal frontend POST
 *
 * POST /api/tasks
 *
 * This controller:
 *   1. Handles multipart attachments
 *   2. Builds normalized data
 *   3. Calls createTaskRecord()
 *
 * It does NOT contain the database creation logic anymore.
 * ============================================================ */

const createTask = async (req, res) => {
  try {
    if (!requireUser(req, res)) { return; }
    /* =====================================================
       1. ATTACHMENTS
    ===================================================== */
    if (req.files && req.files.length > MAX_ATTACHMENTS) {
      return sendError(res, 400, "Maximum 4 attachments are allowed.");
    }
    const attachmentPaths = buildAttachmentPaths(req.files);
    /* =====================================================
       2. NORMALIZED DATA
    ===================================================== */
    const data = {
      title: req.body.title,
      description: req.body.description,
      taskType: req.body.taskType,
      project: req.body.project,
      department: req.body.department,
      category: req.body.category,
      assignedTo: Array.isArray(req.body.assignedTo) ? req.body.assignedTo : req.body.assignedTo ? [req.body.assignedTo] : [],
      priority: req.body.priority,
      status: req.body.status,
      startDate: req.body.startDate,
      deadline: req.body.deadline,
      estimatedHours: req.body.estimatedHours,
      actualHours: req.body.actualHours,
      progress: req.body.progress,
      remarks: req.body.remarks,
      proofFiles: req.body.proofFiles,
      attachments: attachmentPaths,
      taskCode: req.body.taskCode,
    };

    /* =====================================================
       3. CREATE USING COMMON FUNCTION
    ===================================================== */

    const task = await createTaskRecord({ data, createdBy: req.user._id, currentUser: req.user, });
    /* =====================================================
       4. POPULATE
    ===================================================== */
    const populatedTask = await populateTask(Task.findById(task._id));
    /* =====================================================
       5. RESPONSE
    ===================================================== */
    return res.status(201).json({
      success: true,
      message: data.taskType === "self" ? "Self task created successfully." : "Task created successfully.",
      task: populatedTask,
    });
  } catch (error) {
    console.error("Create Task:", error);
    return sendError(res, 400, error.message || "Failed to create task.");
  }
};
/* ============================================================
 * IMPORT TASKS FROM EXCEL
 * ------------------------------------------------------------
 * POST /api/tasks/import
 *
 * The Excel middleware has already converted:
 *
 * Department Code
 *      ↓
 * department ObjectId
 *
 * Project Code
 *      ↓
 * project ObjectId
 *
 * Employee ID
 *      ↓
 * assignedTo ObjectId
 *
 * Therefore this controller only calls createTaskRecord().
 * ============================================================ */

const importTasks = async (req, res) => {

  try {
    if (!requireUser(req, res)) {
      return;
    }
    const rows = req.importedTasks;

    /* =====================================================
       1. CHECK IMPORT DATA
    ===================================================== */
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: "No valid task rows were found.", });
    }
    /* =====================================================
       2. PROCESS EACH ROW
    ===================================================== */
    const createdTasks = [];
    const errors = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      try {
        const task = await createTaskRecord({
          data: row,
          createdBy: req.user._id,
          currentUser: req.user,
        });
        createdTasks.push(task);
      } catch (error) {
        errors.push({
          row: index + 2,
          title: row.title || "",
          taskCode: row.taskCode || null,
          message: error.message || "Failed to create task.",
        });
      }
    }
    /* =====================================================
       3. ALL ROWS FAILED
    ===================================================== */
    if (createdTasks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No tasks were imported.",
        createdCount: 0,
        failedCount: errors.length,
        errors,
      });
    }

    /* =====================================================
       4. POPULATE CREATED TASKS
    ===================================================== */

    const taskIds =
      createdTasks.map(
        task => task._id
      );

    const populatedTasks =
      await Task.find({

        _id: {
          $in: taskIds
        }

      })
        .populate(
          "project",
          "name projectCode"
        )
        .populate(
          "department",
          "name code"
        )
        .populate(
          "assignedBy",
          "name email employeeId"
        )
        .populate(
          "assignees.user",
          "name email employeeId"
        )
        .sort({
          createdAt: -1
        });

    /* =====================================================
       5. RESPONSE
    ===================================================== */

    return res.status(201).json({

      success: true,

      message:
        errors.length > 0
          ? "Excel import completed with some row errors."
          : "Excel import completed successfully.",

      createdCount:
        populatedTasks.length,

      failedCount:
        errors.length,

      tasks:
        populatedTasks,

      errors,

    });

  } catch (error) {

    console.error(
      "Import Tasks:",
      error
    );

    return res.status(500).json({

      success: false,

      message:
        error.message ||
        "Excel task import failed.",

    });
  }
};
/**
 * @desc    Get All Tasks
 * @route   GET /api/tasks
 * @access  Private
 */
const getTasks = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const { page = 1, limit = 10, sortBy, sortOrder } = req.query;

    const visibility = await getRoleTaskVisibility(req.user);
    if (visibility.denied) {
      return res.status(200).json(emptyPaginatedResult(page, limit));
    }

    let filters = await buildTaskFilters(req.query);
    filters = applyVisibilityRestriction(filters, visibility.restriction);

    const sort = buildSortOption(sortBy, sortOrder);
    const result = await paginateTasks(filters, { page, limit, sort });

    return res.status(200).json({
      success: true,
      count: result.count,
      total: result.total,
      page: result.page,
      pages: result.pages,
      tasks: result.tasks,
    });
  } catch (error) {
    return sendServerError(res, 'Get Tasks', error);
  }
};

// =========================================================
// GET TASK SUMMARY
// =========================================================
const getTaskSummary = async (req, res) => {
  try {
    // -----------------------------------------------------
    // 1. Build the SAME filters used by GET /api/tasks
    // -----------------------------------------------------
    let filters = await buildTaskFilters(req.query);
    // -----------------------------------------------------
    // 2. Apply the SAME role-based visibility restriction
    // -----------------------------------------------------
    const visibility = await getRoleTaskVisibility(req.user);

    filters = applyVisibilityRestriction(
      filters,
      visibility.restriction
    );

    // -----------------------------------------------------
    // 3. Current date/time
    // -----------------------------------------------------
    const now = new Date();

    // -----------------------------------------------------
    // 4. Get all summary counts in ONE aggregation
    // -----------------------------------------------------
    const result = await Task.aggregate([
      {
        $match: filters,
      },

      {
        $facet: {
          // ---------------------------------------------
          // TOTAL
          // ---------------------------------------------
          total: [
            { $count: "count", },
          ],

          // ---------------------------------------------
          // IN PROGRESS
          // ---------------------------------------------
          inProgress: [
            { $match: { status: "in-progress", }, },
            { $count: "count", },
          ],

          // ---------------------------------------------
          // COMPLETED
          // ---------------------------------------------
          completed: [
            { $match: { status: "completed", }, },
            { $count: "count", },
          ],

          // ---------------------------------------------
          // OVERDUE
          //
          // deadline has passed
          // AND task is not completed
          // ---------------------------------------------
          overdue: [
            {
              $match: {
                deadline: { $lt: now, $ne: null, },
                status: { $ne: "completed", },
              },
            },
            { $count: "count", },
          ],
        },
      },
    ]);

    const summary = result[0] || {};
    const total = summary.total?.[0]?.count || 0;
    const inProgress = summary.inProgress?.[0]?.count || 0;
    const completed = summary.completed?.[0]?.count || 0;
    const overdue = summary.overdue?.[0]?.count || 0;

    // -----------------------------------------------------
    // 5. Response
    // -----------------------------------------------------
    return res.status(200).json({
      success: true,
      summary: { total, inProgress, completed, overdue, },
    });
  } catch (error) {
    console.error("getTaskSummary error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get task summary",
      error: error.message,
    });
  }
};

/**
 * @desc    Get Single Task
 * @route   GET /api/tasks/:id
 * @access  Private
 */
const getTask = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const id = requireValidTaskId(req, res);
    if (!id) return;

    const task = await populateTask(Task.findById(id), true);
    if (!task) return sendError(res, 404, 'Task not found.');

    const visibility = await getRoleTaskVisibility(req.user);
    if (visibility.denied || !isTaskWithinVisibility(task, visibility.restriction)) {
      return sendError(res, 403, 'You do not have permission to view this task.');
    }

    return res.status(200).json({ success: true, task });
  } catch (error) {
    return sendServerError(res, 'Get Task', error);
  }
};
/**
 * @desc    Get Tasks By Project
 * @route   GET /api/tasks/project/:projectId
 * @access  Private
 */
const getProjectTasks = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const { projectId } = req.params;

    if (!isValidObjectId(projectId)) {
      return sendError(res, 400, 'Invalid project id.');
    }

    const project = await Project.findById(projectId);
    if (!project) return sendError(res, 404, 'Project not found.');

    const visibility = await getRoleTaskVisibility(req.user);
    if (visibility.denied) {
      return res.status(200).json({
        success: true,
        summary: { total: 0, completed: 0, inProgress: 0, review: 0, notStarted: 0, cancelled: 0 },
        tasks: [],
      });
    }

    let filters = { project: projectId, isActive: { $ne: false } };
    filters = applyVisibilityRestriction(filters, visibility.restriction);

    const [tasks, statusCounts] = await Promise.all([
      populateTask(Task.find(filters).sort({ deadline: 1, priority: -1 })),
      Task.aggregate([{ $match: filters }, { $group: { _id: '$status', total: { $sum: 1 } } }]),
    ]);

    const countByStatus = (status) => statusCounts.find((s) => s._id === status)?.total || 0;

    const summary = {
      total: tasks.length,
      completed: countByStatus('completed'),
      inProgress: countByStatus('in-progress'),
      review: countByStatus('review'),
      notStarted: countByStatus('not-started'),
      cancelled: countByStatus('cancelled'),
    };

    return res.status(200).json({ success: true, summary, tasks });
  } catch (error) {
    return sendServerError(res, 'Get Project Tasks', error);
  }
};
/**
 * @desc    Get My Tasks
 * @route   GET /api/tasks/my
 * @access  Private
 */
const getMyTasks = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const { page = 1, limit = 10, sortBy, sortOrder } = req.query;
    const filters = await buildTaskFilters(req.query, { 'assignees.user': req.user._id });

    filters['assignees.user'] = req.user._id; // hard override, never trust query params for this
    const sort = sortBy ? buildSortOption(sortBy, sortOrder) : { deadline: 1, priority: -1 };

    const baseFilters = { 'assignees.user': req.user._id, isActive: { $ne: false } };

    const [result, statusCounts, overdue] = await Promise.all([
      paginateTasks(filters, { page, limit, sort }),
      Task.aggregate([{ $match: baseFilters }, { $group: { _id: '$status', total: { $sum: 1 } } },]),
      Task.countDocuments({ ...baseFilters, deadline: { $lt: new Date() }, status: { $ne: 'completed' }, }),
    ]);
    const countByStatus = (status) => statusCounts.find((s) => s._id === status)?.total || 0;
    const summary = {
      total: result.total,
      notStarted: countByStatus('not-started'),
      inProgress: countByStatus('in-progress'),
      review: countByStatus('review'),
      completed: countByStatus('completed'),
      cancelled: countByStatus('cancelled'),
      overdue,
    };

    return res.status(200).json({ success: true, summary, count: result.count, total: result.total, page: result.page, pages: result.pages, tasks: result.tasks });
  } catch (error) {
    return sendServerError(res, 'Get My Tasks', error);
  }
};

/**
 * @desc    Update Task Status
 * @route   PUT /api/tasks/:id/status
 * @access  Private
 *
 * NOT routed through canModifyTask (no such route exists). Authorization
 * model UNCHANGED — see SECTION 8.
 */
const updateTaskStatus = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const id = requireValidTaskId(req, res);
    if (!id) return;

    const { status, progress, remarks, actualHours } = req.body;

    const task = await populateTask(Task.findById(id));
    if (!task) return sendError(res, 404, 'Task not found.');

    if (!canManageTask(task, req.user, { allowAssignee: true })) {
      return sendError(res, 403, 'You are not authorized to update this task.');
    }

    const transitionCheck = validateStatusTransition(task.status, status);
    if (!transitionCheck.valid) return sendError(res, 400, transitionCheck.message);

    const progressCheck = validateProgress(progress);
    if (!progressCheck.valid) return sendError(res, 400, progressCheck.message);

    const hoursCheck = validateHours(actualHours, 'Actual hours');
    if (!hoursCheck.valid) return sendError(res, 400, hoursCheck.message);

    const previousStatus = task.status;
    task.status = status;

    switch (status) {
      case 'not-started':
        task.progress = 0;
        task.completedDate = null;
        break;
      case 'in-progress':
        task.progress = progress !== undefined ? progress : Math.max(task.progress, 1);
        task.completedDate = null;
        break;
      case 'review':
        task.progress = 95;
        task.completedDate = null;
        break;
      case 'completed':
        task.progress = 100;
        task.completedDate = new Date();
        break;
      case 'cancelled':
        task.completedDate = null;
        break;
    }

    if (progress !== undefined && status !== 'completed') task.progress = progress;
    if (remarks !== undefined) task.remarks = remarks;
    if (actualHours !== undefined) task.actualHours = actualHours;

    await task.save();

    const updatedTask = await populateTask(Task.findById(task._id));

    await sendTaskNotification({
      recipient: updatedTask.assignedBy,
      sender: req.user._id,
      type: 'task-status-changed',
      title: 'Task Status Updated',
      message: `"${updatedTask.title}" moved from ${previousStatus} to ${status}.`,
      task: updatedTask,
    });

    return res.status(200).json({
      success: true,
      message: 'Task status updated successfully.',
      task: updatedTask,
    });
  } catch (error) {
    return sendServerError(res, 'Update Task Status', error);
  }
};

/**
 * @desc    Assign / Reassign Task
 * @route   PUT /api/tasks/:id/assign
 * @access  Private
 *
 * NOT routed through canModifyTask (no such route exists). Authorization
 * model UNCHANGED — see SECTION 8.
 */
const assignTask = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const id = requireValidTaskId(req, res);
    if (!id) return;

    const { assignedTo } = req.body;
    if (!assignedTo) return sendError(res, 400, 'Assigned user is required.');

    const task = await Task.findById(id)
      .populate({ path: 'project', select: 'name projectCode teamMembers manager' })
      .populate('department', 'name code');

    if (!task) return sendError(res, 404, 'Task not found.');

    if (task.taskType === 'self') {
      return sendError(res, 400, 'Self tasks cannot be reassigned.');
    }

    if (
      !PROJECT_TASK_ROLES.includes(normalizeRole(req.user.role)) &&
      !isPrivilegedRole(req.user.role)
    ) {
      return sendError(res, 403, 'You are not authorized to reassign this task.');
    }

    if (!canManageTask(task, req.user)) {
      return sendError(res, 403, 'You are not authorized to reassign this task.');
    }

    const validatedAssignees = [];

    for (const employeeId of assignedEmployees) {
      const userResult = await validateAssignedUser(employeeId);
      if (!userResult.valid) { throw new Error(userResult.message); }

      const assignedUser = userResult.user;
      const memberCheck = validateProjectMember(projectDocument, assignedUser, department);
      if (!memberCheck.valid) { throw new Error(memberCheck.message); }
      validatedAssignees.push({ user: assignedUser._id, status: "not-started", progress: 0, actualHours: 0, });
    }


    if (task.assignedTo.toString() === assignedTo) {
      return sendError(res, 400, 'Task is already assigned to this employee.');
    }

    const previousAssignee = task.assignedTo;
    task.assignedTo = assignedTo;

    if (task.status === 'completed') {
      task.status = 'not-started';
      task.progress = 0;
      task.completedDate = null;
    }

    await task.save();

    const updatedTask = await populateTask(Task.findById(task._id));

    await Promise.all([
      sendTaskNotification({
        recipient: previousAssignee,
        sender: req.user._id,
        type: 'task-unassigned',
        title: 'Task Reassigned',
        message: `"${updatedTask.title}" has been reassigned to another employee.`,
        task: updatedTask,
      }),
      sendTaskNotification({
        recipient: assignedTo,
        sender: req.user._id,
        type: 'task-assigned',
        title: 'New Task Assigned',
        message: `You have been assigned the task: ${updatedTask.title}`,
        task: updatedTask,
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Task assigned successfully.',
      task: updatedTask,
    });
  } catch (error) {
    return sendServerError(res, 'Assign Task', error);
  }
};

/**
 * @desc    Delete Task (soft delete)
 * @route   DELETE /api/tasks/:id
 * @access  Private
 *
 * Route runs: protect -> moduleAccess('tasks','edit') -> canModifyTask.
 * canModifyTask ALREADY decided whether this user may modify/delete this
 * task (role-hierarchy check against task.assignedBy). This function must
 * not re-decide that with a second, different rule — so the previous
 * canManageTask() ownership check has been removed here.
 *
 * req.task (set by canModifyTask) is a .lean() object, so it can't be
 * .save()'d directly and isn't reused for the mutation itself — but its
 * _id is reused instead of re-reading req.params, avoiding a second
 * "look this task up by param" step.
 */
const deleteTask = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const id = req.task?._id || requireValidTaskId(req, res);
    if (!id) return;

    const task = await Task.findById(id);
    if (!task) return sendError(res, 404, 'Task not found.');

    task.isActive = false;
    task.deletedAt = new Date();
    await task.save();

    await sendTaskNotification({
      recipient: task.assignedTo,
      sender: req.user._id,
      type: 'task-deleted',
      title: 'Task Removed',
      message: `The task "${task.title}" has been removed.`,
      task,
    });

    return res.status(200).json({ success: true, message: 'Task deleted successfully.' });
  } catch (error) {
    return sendServerError(res, 'Delete Task', error);
  }
};

/**
 * @desc    Send Task Reminder
 * @route   POST /api/tasks/:id/reminder
 * @access  Private
 *
 * NOT routed through canModifyTask (no such route exists). Authorization
 * model UNCHANGED — see SECTION 8.
 */
const sendTaskReminder = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const id = requireValidTaskId(req, res);
    if (!id) return;

    const task = await Task.findById(id)
      .populate('project', 'name manager')
      .populate('assignees.user', 'name email employeeId')
      .populate('assignedBy', 'name');

    if (!task) return sendError(res, 404, 'Task not found.');

    if (!canManageTask(task, req.user, { allowAssignee: true })) {
      return sendError(res, 403, 'You are not authorized to send a reminder for this task.');
    }

    if (!task.assignedTo?.email) {
      return sendError(res, 400, 'Assigned employee does not have an email.');
    }

    await sendTaskNotification({
      recipient: task.assignedTo._id,
      sender: req.user._id,
      type: 'task-reminder',
      title: `Task Reminder: ${task.title}`,
      message: `Reminder: "${task.title}" (Project: ${task.project?.name}, Priority: ${task.priority}, Status: ${task.status}) is due ${new Date(task.deadline).toLocaleDateString()}.`,
      task,
    });

    return res.status(200).json({ success: true, message: 'Reminder sent successfully.' });
  } catch (error) {
    return sendServerError(res, 'Send Reminder', error);
  }
};

/**
 * @desc    Update Task
 * @route   PUT /api/tasks/:id
 * @access  Private
 *
 * Route runs: protect -> moduleAccess('tasks','edit') -> canModifyTask.
 * As with deleteTask, canModifyTask already made the modify-rights
 * decision — the previous canManageTask() ownership check has been
 * removed here so there's only one authorization decision for this route.
 *
 * req.task from canModifyTask does NOT populate `project` (needed here
 * for validateProjectDepartment/validateProjectMember) and is `.lean()`
 * (can't `.save()`). So this reuses req.task's _id but still loads a
 * fresh, correctly-populated Mongoose document — that's a population/
 * mutation requirement, not a second authorization check.
 *
 * BUSINESS RULE (kept, not authorization): only PROJECT_TASK_ROLES /
 * privileged roles may attach a task to a project or change its
 * assignment — this governs *what a task becomes*, not *whether this
 * user may touch this specific task* (that's canModifyTask's job).
 */
const updateTask = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const id = req.task?._id || requireValidTaskId(req, res);
    if (!id) return;

    let task = await Task.findById(id).populate('project', 'name teamMembers department manager');
    if (!task) return sendError(res, 404, 'Task not found.');

    const {
      title,
      taskCode,
      description,
      project,
      department,
      category,
      assignedTo,
      priority,
      status,
      startDate,
      deadline,
      completedDate,
      estimatedHours,
      actualHours,
      progress,
      remarks,
      proofFiles,
      existingAttachments,
    } = req.body;

    if (taskCode && taskCode.trim().toUpperCase() !== task.taskCode) {
      const { unique, normalized } = await validateTaskCodeUnique(taskCode, id);
      if (!unique) return sendError(res, 400, 'Task code already exists.');
      task.taskCode = normalized;
    }

    const wantsReassignment = Boolean(project || department || assignedTo !== undefined);

    if (task.taskType === 'self' && wantsReassignment) {
      return sendError(res, 400, 'Self tasks cannot be linked to a project or reassigned.');
    }

    if (
      task.taskType === 'project' &&
      wantsReassignment &&
      !PROJECT_TASK_ROLES.includes(normalizeRole(req.user.role)) &&
      !isPrivilegedRole(req.user.role)
    ) {
      return sendError(res, 403, "You are not authorized to modify this task's assignment.");
    }

    let effectiveProject = task.project;
    if (project) {
      const projectResult = await validateProject(project);
      if (!projectResult.valid) return sendError(res, 404, projectResult.message);
      effectiveProject = projectResult.project;
      task.project = project;
    }

    if (department) {
      const departmentResult = await validateDepartment(department);
      if (!departmentResult.valid) return sendError(res, 404, departmentResult.message);

      const deptCheck = validateProjectDepartment(effectiveProject, department);
      if (!deptCheck.valid) return sendError(res, 400, deptCheck.message);

      task.department = department;
    }

    if (assignedTo !== undefined) {
      const assignedEmployees = Array.isArray(assignedTo) ? assignedTo : assignedTo ? [assignedTo] : [];
      const uniqueEmployeeIds = [...new Set(assignedEmployees.map((id) => String(id)))];

      const updatedAssignees = [];
      for (const employeeId of uniqueEmployeeIds) {
        const userResult = await validateAssignedUser(employeeId);
        if (!userResult.valid) { return sendError(res, 404, userResult.message); }

        const memberCheck = validateProjectMember(effectiveProject, userResult.user, department || task.department);
        if (!memberCheck.valid) {
          return sendError(res, 400, memberCheck.message);
        }
        /*
         * Preserve existing per-employee task data
         * when an employee remains assigned.
         */
        const existingAssignee = task.assignees?.find((assignee) => String(assignee.user?._id || assignee.user) === String(userResult.user._id));

        updatedAssignees.push({ user: userResult.user._id, status: existingAssignee?.status || "not-started", progress: existingAssignee?.progress || 0, actualHours: existingAssignee?.actualHours || 0, });
      }
      task.assignees = updatedAssignees;
    }

    const dateCheck = validateDateRange(startDate || task.startDate, deadline || task.deadline);
    if (!dateCheck.valid) return sendError(res, 400, dateCheck.message);

    if (status !== undefined && status !== task.status) {
      const transitionCheck = validateStatusTransition(task.status, status);
      if (!transitionCheck.valid) return sendError(res, 400, transitionCheck.message);
      task.status = status;

      if (status === 'completed') {
        task.progress = 100;
        task.completedDate = completedDate || new Date();
      }
      if (status === 'not-started') {
        task.progress = 0;
        task.completedDate = null;
      }
    }

    const progressCheck = validateProgress(progress);
    if (!progressCheck.valid) return sendError(res, 400, progressCheck.message);
    const estHoursCheck = validateHours(estimatedHours, 'Estimated hours');
    if (!estHoursCheck.valid) return sendError(res, 400, estHoursCheck.message);
    const actHoursCheck = validateHours(actualHours, 'Actual hours');
    if (!actHoursCheck.valid) return sendError(res, 400, actHoursCheck.message);

    if (title !== undefined) task.title = title.trim();
    if (description !== undefined) task.description = description;
    if (category !== undefined) task.category = category;
    if (priority !== undefined) task.priority = priority;
    if (startDate !== undefined) task.startDate = startDate;
    if (deadline !== undefined) task.deadline = deadline || null;
    if (estimatedHours !== undefined) task.estimatedHours = estimatedHours;
    if (actualHours !== undefined) task.actualHours = actualHours;
    if (progress !== undefined && status !== 'completed') task.progress = progress;
    if (remarks !== undefined) task.remarks = remarks;
    if (proofFiles !== undefined) task.proofFiles = proofFiles;

    let keptAttachments = task.attachments || [];
    if (existingAttachments !== undefined) {
      try {
        const parsed = JSON.parse(existingAttachments);
        keptAttachments = Array.isArray(parsed) ? parsed : [];
      } catch {
        keptAttachments = [];
      }
    }

    const newAttachmentPaths = buildAttachmentPaths(req.files);
    const finalAttachments = [...keptAttachments, ...newAttachmentPaths];

    if (finalAttachments.length > MAX_ATTACHMENTS) {
      return sendError(res, 400, 'Maximum 4 attachments are allowed.');
    }

    task.attachments = finalAttachments;

    await task.save();

    task = await populateTask(Task.findById(task._id));

    return res.status(200).json({
      success: true,
      message: 'Task updated successfully.',
      task,
    });
  } catch (error) {
    return sendServerError(res, 'Update Task', error);
  }
};

/* ============================================================
 * KPI / STATISTICS
 * ============================================================ */

const computeTaskStatistics = async (matchQuery) => {
  const [
    totalTasks,
    completedTasks,
    inProgressTasks,
    reviewTasks,
    notStartedTasks,
    cancelledTasks,
    overdueTasks,
    progressAgg,
    prioritySummary,
    statusSummary,
    upcomingTasks,
    lateTasks,
    topPerformersAgg,
    departmentSummaryAgg,
  ] = await Promise.all([
    Task.countDocuments(matchQuery),
    Task.countDocuments({ ...matchQuery, status: 'completed' }),
    Task.countDocuments({ ...matchQuery, status: 'in-progress' }),
    Task.countDocuments({ ...matchQuery, status: 'review' }),
    Task.countDocuments({ ...matchQuery, status: 'not-started' }),
    Task.countDocuments({ ...matchQuery, status: 'cancelled' }),
    Task.countDocuments({
      ...matchQuery,
      deadline: { $lt: new Date() },
      status: { $ne: 'completed' },
    }),
    Task.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          avgProgress: { $avg: '$progress' },
          estimatedHours: { $sum: '$estimatedHours' },
          actualHours: { $sum: '$actualHours' },
        },
      },
    ]),
    Task.aggregate([
      { $match: matchQuery },
      { $group: { _id: '$priority', total: { $sum: 1 } } },
    ]),
    Task.aggregate([{ $match: matchQuery }, { $group: { _id: '$status', total: { $sum: 1 } } }]),
    populateTask(
      Task.find({ ...matchQuery, status: { $ne: 'completed' } })
        .sort({ deadline: 1 })
        .limit(5)
    ),
    populateTask(
      Task.find({
        ...matchQuery,
        deadline: { $lt: new Date() },
        status: { $ne: 'completed' },
      })
        .sort({ deadline: 1 })
        .limit(10)
    ),
    Task.aggregate([
      { $match: { ...matchQuery, status: 'completed' } },
      { $group: { _id: '$assignedTo', completedCount: { $sum: 1 } } },
      { $sort: { completedCount: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: '$user.name',
          employeeId: '$user.employeeId',
          completedCount: 1,
        },
      },
    ]),
    Task.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$department',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          avgProgress: { $avg: '$progress' },
        },
      },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'department' } },
      { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          departmentId: '$_id',
          name: '$department.name',
          total: 1,
          completed: 1,
          avgProgress: { $round: ['$avgProgress', 2] },
        },
      },
    ]),
  ]);

  const stats = progressAgg[0] || { avgProgress: 0, estimatedHours: 0, actualHours: 0 };

  return {
    overview: {
      totalTasks,
      completedTasks,
      inProgressTasks,
      reviewTasks,
      notStartedTasks,
      cancelledTasks,
      overdueTasks,
      completionRate: totalTasks === 0 ? 0 : Number(((completedTasks / totalTasks) * 100).toFixed(2)),
      averageProgress: Number((stats.avgProgress || 0).toFixed(2)),
      estimatedHours: stats.estimatedHours || 0,
      actualHours: stats.actualHours || 0,
    },
    prioritySummary,
    statusSummary,
    upcomingTasks,
    upcomingDeadlines: upcomingTasks,
    lateTasks,
    topPerformers: topPerformersAgg,
    departmentSummary: departmentSummaryAgg,
  };
};

const getProjectKPI = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const { projectId } = req.query;

    if (projectId && !isValidObjectId(projectId)) {
      return sendError(res, 400, 'Invalid project id.');
    }

    const visibility = await getRoleTaskVisibility(req.user);
    if (visibility.denied) {
      return res.status(200).json({ success: true, ...emptyStatistics() });
    }

    let matchQuery = { isActive: { $ne: false } };
    if (projectId) matchQuery.project = new mongoose.Types.ObjectId(projectId);
    matchQuery = applyVisibilityRestriction(matchQuery, visibility.restriction);

    const stats = await computeTaskStatistics(matchQuery);

    return res.status(200).json({
      success: true,
      overview: stats.overview,
      prioritySummary: stats.prioritySummary,
      statusSummary: stats.statusSummary,
      upcomingTasks: stats.upcomingTasks,
      topPerformers: stats.topPerformers,
      lateTasks: stats.lateTasks,
      departmentSummary: stats.departmentSummary,
    });
  } catch (error) {
    return sendServerError(res, 'Project KPI', error);
  }
};

const getTaskStatistics = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const { department, project } = req.query;

    if (department && !isValidObjectId(department)) {
      return sendError(res, 400, 'Invalid department id.');
    }
    if (project && !isValidObjectId(project)) {
      return sendError(res, 400, 'Invalid project id.');
    }

    const visibility = await getRoleTaskVisibility(req.user);
    if (visibility.denied) {
      return res.status(200).json({ success: true, ...emptyStatistics() });
    }

    let matchQuery = { isActive: { $ne: false } };
    if (department) matchQuery.department = new mongoose.Types.ObjectId(department);
    if (project) matchQuery.project = new mongoose.Types.ObjectId(project);
    matchQuery = applyVisibilityRestriction(matchQuery, visibility.restriction);

    const stats = await computeTaskStatistics(matchQuery);

    return res.status(200).json({ success: true, ...stats });
  } catch (error) {
    return sendServerError(res, 'Task Statistics', error);
  }
};

/* ============================================================
 * OTHER FEATURES
 * ------------------------------------------------------------
 * None of these have any route wired to canModifyTask (in fact, none
 * currently have a route at all). Their canManageTask-based
 * authorization is UNCHANGED — see SECTION 8.
 * ============================================================ */

const archiveTask = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const id = requireValidTaskId(req, res);
    if (!id) return;

    const task = await loadTaskWithProjectManager(id);
    if (!task) return sendError(res, 404, 'Task not found.');

    if (!canManageTask(task, req.user)) {
      return sendError(res, 403, 'You are not authorized to archive this task.');
    }

    task.isActive = false;
    task.archivedAt = new Date();
    await task.save();

    return res.status(200).json({ success: true, message: 'Task archived successfully.' });
  } catch (error) {
    return sendServerError(res, 'Archive Task', error);
  }
};

const restoreTask = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const id = requireValidTaskId(req, res);
    if (!id) return;

    const task = await loadTaskWithProjectManager(id);
    if (!task) return sendError(res, 404, 'Task not found.');

    if (!canManageTask(task, req.user)) {
      return sendError(res, 403, 'You are not authorized to restore this task.');
    }

    task.isActive = true;
    task.archivedAt = null;
    task.deletedAt = null;
    await task.save();

    const restoredTask = await populateTask(Task.findById(task._id));

    return res.status(200).json({
      success: true,
      message: 'Task restored successfully.',
      task: restoredTask,
    });
  } catch (error) {
    return sendServerError(res, 'Restore Task', error);
  }
};

const duplicateTask = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const id = requireValidTaskId(req, res);
    if (!id) return;

    const source = await loadTaskWithProjectManager(id);
    if (!source) return sendError(res, 404, 'Task not found.');

    const visibility = await getRoleTaskVisibility(req.user);
    if (visibility.denied || !isTaskWithinVisibility(source, visibility.restriction)) {
      return sendError(res, 403, 'You do not have permission to view this task.');
    }

    if (!canManageTask(source, req.user)) {
      return sendError(res, 403, 'You are not authorized to duplicate this task.');
    }

    const sourceObj = source.toObject();

    const baseCode = `${sourceObj.taskCode}-COPY`;
    let newCode = baseCode;
    let suffix = 1;
    while (!(await validateTaskCodeUnique(newCode)).unique) {
      suffix += 1;
      newCode = `${baseCode}-${suffix}`;
    }

    const { _id, createdAt, updatedAt, completedDate, taskCode, project, ...rest } = sourceObj;

    const duplicated = await Task.create({
      ...rest,
      project: project?._id || project || null,
      taskCode: newCode,
      title: `${sourceObj.title} (Copy)`,
      status: 'not-started',
      progress: 0,
      completedDate: null,
      isActive: true,
      assignedBy: req.user._id,
    });

    const populatedTask = await populateTask(Task.findById(duplicated._id));

    await sendTaskNotification({
      recipient: duplicated.assignedTo,
      sender: req.user._id,
      type: 'task-assigned',
      title: 'New Task Assigned',
      message: `You have been assigned a new task: ${populatedTask.title}`,
      task: populatedTask,
    });

    return res.status(201).json({
      success: true,
      message: 'Task duplicated successfully.',
      task: populatedTask,
    });
  } catch (error) {
    return sendServerError(res, 'Duplicate Task', error);
  }
};

/**
 * Shared helper for all bulk-mutation endpoints. UNCHANGED — see SECTION 8.
 */
const partitionManageableTasks = async (rawTaskIds, user, populateProjectSelect = 'manager') => {
  const skipped = [];
  const validIds = [];

  (Array.isArray(rawTaskIds) ? rawTaskIds : []).forEach((taskId) => {
    if (isValidObjectId(taskId)) {
      validIds.push(taskId);
    } else {
      skipped.push({ taskId, reason: 'Invalid task id.' });
    }
  });

  if (validIds.length === 0) {
    return { authorizedIds: [], tasks: [], skipped };
  }

  const tasks = await Task.find({ _id: { $in: validIds } }).populate(
    'project',
    populateProjectSelect
  );

  const foundIds = new Set(tasks.map((t) => t._id.toString()));
  validIds.forEach((id) => {
    if (!foundIds.has(id.toString())) {
      skipped.push({ taskId: id, reason: 'Task not found.' });
    }
  });

  const authorized = [];
  tasks.forEach((task) => {
    if (canManageTask(task, user)) {
      authorized.push(task);
    } else {
      skipped.push({ taskId: task._id, reason: 'Not authorized to manage this task.' });
    }
  });

  return {
    authorizedIds: authorized.map((t) => t._id),
    tasks: authorized,
    skipped,
  };
};

const bulkDeleteTasks = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const { taskIds } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return sendError(res, 400, 'taskIds must be a non-empty array.');
    }

    const { authorizedIds, skipped } = await partitionManageableTasks(taskIds, req.user);

    const result = authorizedIds.length
      ? await Task.updateMany(
        { _id: { $in: authorizedIds } },
        { $set: { isActive: false, deletedAt: new Date() } }
      )
      : { modifiedCount: 0, matchedCount: 0 };

    return res.status(200).json({
      success: true,
      message: 'Bulk delete processed.',
      matched: result.matchedCount ?? result.n ?? 0,
      modified: result.modifiedCount ?? result.nModified ?? 0,
      skipped,
    });
  } catch (error) {
    return sendServerError(res, 'Bulk Delete Tasks', error);
  }
};

const bulkAssignTasks = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const { taskIds, assignedTo } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0 || !assignedTo) {
      return sendError(res, 400, 'taskIds and assignedTo are required.');
    }

    const userResult = await validateAssignedUser(assignedTo);
    if (!userResult.valid) return sendError(res, 404, userResult.message);

    const { tasks, skipped } = await partitionManageableTasks(
      taskIds,
      req.user,
      'manager teamMembers'
    );

    const assignable = [];
    tasks.forEach((task) => {
      if (task.taskType !== 'project') {
        skipped.push({ taskId: task._id, reason: 'Self tasks cannot be reassigned.' });
        return;
      }
      const memberCheck = validateProjectMember(task.project, userResult.user, task.department);
      if (!memberCheck.valid) {
        skipped.push({ taskId: task._id, reason: memberCheck.message });
        return;
      }
      assignable.push(task._id);
    });

    const result = assignable.length
      ? await Task.updateMany({ _id: { $in: assignable } }, { $set: { assignedTo } })
      : { modifiedCount: 0, matchedCount: 0 };

    if (assignable.length) {
      await sendTaskNotification({
        recipient: assignedTo,
        sender: req.user._id,
        type: 'task-assigned',
        title: 'Tasks Assigned',
        message: `You have been assigned ${assignable.length} task(s).`,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Bulk assign processed.',
      matched: result.matchedCount ?? result.n ?? 0,
      modified: result.modifiedCount ?? result.nModified ?? 0,
      skipped,
    });
  } catch (error) {
    return sendServerError(res, 'Bulk Assign Tasks', error);
  }
};

const bulkUpdateStatus = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const { taskIds, status } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0 || !status) {
      return sendError(res, 400, 'taskIds and status are required.');
    }

    const { tasks, skipped } = await partitionManageableTasks(taskIds, req.user);

    const updatable = [];
    tasks.forEach((task) => {
      const check = validateStatusTransition(task.status, status);
      if (check.valid) {
        updatable.push(task._id);
      } else {
        skipped.push({ taskId: task._id, reason: check.message });
      }
    });

    const updatePayload = { status };
    if (status === 'completed') {
      updatePayload.progress = 100;
      updatePayload.completedDate = new Date();
    }
    if (status === 'not-started') {
      updatePayload.progress = 0;
      updatePayload.completedDate = null;
    }

    const result = updatable.length
      ? await Task.updateMany({ _id: { $in: updatable } }, { $set: updatePayload })
      : { modifiedCount: 0 };

    return res.status(200).json({
      success: true,
      message: 'Bulk status update processed.',
      updated: updatable.length,
      skipped,
    });
  } catch (error) {
    return sendServerError(res, 'Bulk Update Status', error);
  }
};

const bulkUpdatePriority = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const { taskIds, priority } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0 || !priority) {
      return sendError(res, 400, 'taskIds and priority are required.');
    }

    const { authorizedIds, skipped } = await partitionManageableTasks(taskIds, req.user);

    const result = authorizedIds.length
      ? await Task.updateMany({ _id: { $in: authorizedIds } }, { $set: { priority } })
      : { modifiedCount: 0, matchedCount: 0 };

    return res.status(200).json({
      success: true,
      message: 'Bulk priority update processed.',
      matched: result.matchedCount ?? result.n ?? 0,
      modified: result.modifiedCount ?? result.nModified ?? 0,
      skipped,
    });
  } catch (error) {
    return sendServerError(res, 'Bulk Update Priority', error);
  }
};

const getTasksByDepartment = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const { departmentId } = req.params;
    if (!isValidObjectId(departmentId)) {
      return sendError(res, 400, 'Invalid department id.');
    }

    const { page = 1, limit = 10, sortBy, sortOrder } = req.query;

    const department = await Department.findById(departmentId);
    if (!department) return sendError(res, 404, 'Department not found.');

    const visibility = await getRoleTaskVisibility(req.user);
    if (visibility.denied) {
      return res.status(200).json(emptyPaginatedResult(page, limit));
    }

    let filters = await buildTaskFilters(req.query, { department: departmentId });
    filters = applyVisibilityRestriction(filters, visibility.restriction);

    const sort = buildSortOption(sortBy, sortOrder);
    const result = await paginateTasks(filters, { page, limit, sort });

    return res.status(200).json({
      success: true,
      count: result.count,
      total: result.total,
      page: result.page,
      pages: result.pages,
      tasks: result.tasks,
    });
  } catch (error) {
    return sendServerError(res, 'Get Tasks By Department', error);
  }
};

const getOverdueTasks = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const { page = 1, limit = 10 } = req.query;

    const visibility = await getRoleTaskVisibility(req.user);
    if (visibility.denied) {
      return res.status(200).json(emptyPaginatedResult(page, limit));
    }

    let filters = await buildTaskFilters(req.query, {
      deadline: { $lt: new Date() },
      status: { $ne: 'completed' },
    });
    filters = applyVisibilityRestriction(filters, visibility.restriction);

    const result = await paginateTasks(filters, { page, limit, sort: { deadline: 1 } });

    return res.status(200).json({
      success: true,
      count: result.count,
      total: result.total,
      page: result.page,
      pages: result.pages,
      tasks: result.tasks,
    });
  } catch (error) {
    return sendServerError(res, 'Get Overdue Tasks', error);
  }
};

const getCompletedTasks = async (req, res) => {
  try {
    if (!requireUser(req, res)) return;

    const { page = 1, limit = 10 } = req.query;

    const visibility = await getRoleTaskVisibility(req.user);
    if (visibility.denied) {
      return res.status(200).json(emptyPaginatedResult(page, limit));
    }

    let filters = await buildTaskFilters(req.query, { status: 'completed' });
    filters = applyVisibilityRestriction(filters, visibility.restriction);

    const result = await paginateTasks(filters, { page, limit, sort: { completedDate: -1 } });

    return res.status(200).json({
      success: true,
      count: result.count,
      total: result.total,
      page: result.page,
      pages: result.pages,
      tasks: result.tasks,
    });
  } catch (error) {
    return sendServerError(res, 'Get Completed Tasks', error);
  }
};

module.exports = {
  createTask,
  importTasks,
  createTaskRecord,
  getTasks,
  getTask,
  getProjectTasks,
  getMyTasks,
  updateTaskStatus,
  assignTask,
  deleteTask,
  sendTaskReminder,
  updateTask,
  getProjectKPI,
  getTaskSummary,

  archiveTask,
  restoreTask,
  duplicateTask,
  bulkDeleteTasks,
  bulkAssignTasks,
  bulkUpdateStatus,
  bulkUpdatePriority,
  getTasksByDepartment,
  getOverdueTasks,
  getCompletedTasks,
  getTaskStatistics,
};