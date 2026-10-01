const mongoose = require("mongoose");
const Project = require("../models/Project");
const Task = require("../models/Task");
const Department = require("../models/Department");

/*
=========================================================
IST-SAFE DATE HELPERS
=========================================================
The frontend and its users are in India (UTC+5:30). If the server
process runs in UTC (the normal case in production/containers),
building dates with `new Date(year, month, day)` uses the SERVER's
local timezone, not IST — so "August 2026" on the server can end up
meaning a window that starts/ends 5:30 hours away from what an
Indian user means by "August 2026". That's the off-by-one-day risk
called out in the brief.

istMidnight() sidesteps this entirely: it is built from Date.UTC
(which only ever interprets its Y/M/D/H/M/S arguments as literal
UTC calendar fields, never the host's TZ) and then shifts by the
fixed IST offset. The result is the correct UTC instant for
"00:00:00 on this calendar date, in India" — regardless of what
timezone the Node process happens to be running in.
=========================================================
*/
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const istMidnight = (year, monthIndex, day) =>
  new Date(Date.UTC(year, monthIndex, day, 0, 0, 0) - IST_OFFSET_MS);

// Weekday of a pure calendar date (Y/M/D), 1=Mon..7=Sun. This is plain
// calendar arithmetic — deliberately NOT derived from an IST-shifted
// instant, so it can't be thrown off by the offset shift above.
const getISOWeekday = (year, monthIndex, day) => {
  const jsDay = new Date(Date.UTC(year, monthIndex, day)).getUTCDay(); // 0=Sun..6=Sat
  return jsDay === 0 ? 7 : jsDay;
};

/*
=========================================================
RESOLVE DATE RANGE
=========================================================
Supports ?year=2026, ?year=2026&month=8, ?year=2026&month=8&week=2.

The range is computed ONCE per request and the resulting
{ startDate, endDate } pair is threaded through every helper below —
project filter, task filter, and every per-department calculation in
departmentPerformance — instead of each section recomputing its own
notion of "the period".

UNCHANGED from the original controller. GlobalFilters.jsx only ever
sends year/month/week the same way the old Overview did (month and
week are mutually exclusive on the frontend), so no new date
calculation is introduced anywhere in this file — every new filter
(project/manager/teamLead/employee) is layered on top of the single
{ startDate, endDate, period } this function returns.
=========================================================
*/
const resolveDateRange = ({ year, month, week }) => {
  const now = new Date();
  const selectedYear = year ? Number(year) : now.getFullYear();

  if (!Number.isInteger(selectedYear) || selectedYear < 2000 || selectedYear > 2100) {
    throw Object.assign(new Error("Invalid year"), { statusCode: 400 });
  }

  if (week) {
    const selectedWeek = Number(week);
    if (!Number.isInteger(selectedWeek) || selectedWeek < 1 || selectedWeek > 53) {
      throw Object.assign(new Error("Week must be between 1 and 53"), { statusCode: 400 });
    }

    // ISO-style week: week 1 is the week containing Jan 4th.
    const jan4Weekday = getISOWeekday(selectedYear, 0, 4);
    const startDay = 4 - jan4Weekday + 1 + (selectedWeek - 1) * 7;

    const startDate = istMidnight(selectedYear, 0, startDay);
    const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    return { startDate, endDate, period: "week" };
  }

  if (month) {
    const selectedMonth = Number(month);
    if (!Number.isInteger(selectedMonth) || selectedMonth < 1 || selectedMonth > 12) {
      throw Object.assign(new Error("Month must be between 1 and 12"), { statusCode: 400 });
    }

    const startDate = istMidnight(selectedYear, selectedMonth - 1, 1);
    const endDate = istMidnight(selectedYear, selectedMonth, 1); // rolls into next year for Dec, via Date.UTC normalization

    return { startDate, endDate, period: "month" };
  }

  const startDate = istMidnight(selectedYear, 0, 1);
  const endDate = istMidnight(selectedYear + 1, 0, 1);

  return { startDate, endDate, period: "year" };
};

/*
=========================================================
IMPOSSIBLE_MATCH
=========================================================
A filter guaranteed to match zero documents. Used for users with no
department (scopeType "none") instead of `{ department: null }`,
because Task.department legitimately defaults to null for self-tasks
— `{ department: null }` would leak every department-less task in
the system to any user who happens to have no department set.

Also reused below (see buildProjectFilter/buildTaskFilter) as the
safe "manager heads zero departments" result — an empty
`managerDepartmentIds` array must narrow results to nothing, never
widen them back out to "all departments".
=========================================================
*/
const IMPOSSIBLE_MATCH = { _id: null };

/*
=========================================================
RESOLVE WORKSPACE ACCESS
=========================================================
Single source of truth for "what is this user allowed to see".
Derived ONLY from req.user — never from the request query string.

The User model exposes exactly one department relationship
(`user.department`) and there's no separate permission table for
broader-than-one-department, narrower-than-all access. Per explicit
product decision, HR gets the same org-wide visibility as admin
("all"), since nothing in the schema models a narrower HR scope to
enforce instead. Every other role is scoped to their own department.

If a narrower/broader scope is added later (e.g. a
`managedDepartments: [ObjectId]` field), this is the one function
that needs to change — everything downstream is already written
generically against scopeType + departmentIds.

UNCHANGED — the new GlobalFilters (project/manager/teamLead/employee)
are resolved and applied strictly AFTER this function runs, and are
always intersected with whatever department scope it returns. They
can narrow a user's view, never widen it.
=========================================================
*/
const ALL_SCOPE_ROLES = new Set(["admin", "hr"]);

const resolveWorkspaceAccess = (user) => {
  if (!user) {
    throw Object.assign(new Error("Authenticated user not found"), { statusCode: 401 });
  }

  const role = String(user.role || "").toLowerCase();
  if (ALL_SCOPE_ROLES.has(role)) {
    return { role, scopeType: "all", departmentIds: null };
  }
  if (!user.department) {
    return { role, scopeType: "none", departmentIds: [] };
  }
  return { role, scopeType: "department", departmentIds: [user.department._id] };
};

/*
=========================================================
VALIDATE + RESOLVE REQUESTED DEPARTMENT (admin/hr only)
=========================================================
Returns a real mongoose.Types.ObjectId if the requested department
exists, otherwise null. Deliberately returns an ObjectId instance
(not the raw string) — see note in buildProjectFilter/buildTaskFilter
below for why this matters.

Never used for authorization on its own; buildProjectFilter /
buildTaskFilter still enforce scope separately, so a non-admin's
`?department=OTHER_ID` is ignored regardless of what this resolves to.

UNCHANGED.
=========================================================
*/
const resolveRequestedDepartmentId = async (rawDepartmentId, access) => {
  if (!rawDepartmentId) return null;
  if (access.scopeType !== "all") return null; // only admin/hr may pick a department via query string

  if (!mongoose.Types.ObjectId.isValid(rawDepartmentId)) {
    throw Object.assign(new Error("Invalid department id"), { statusCode: 400 });
  }

  const exists = await Department.exists({ _id: rawDepartmentId });
  if (!exists) {
    throw Object.assign(new Error("Department not found"), { statusCode: 400 });
  }

  return new mongoose.Types.ObjectId(rawDepartmentId);
};

/*
=========================================================
VALIDATE OPTIONAL OBJECT ID  (project / manager / teamLead / employee)
=========================================================
Same validation style/error shape as resolveRequestedDepartmentId
above ({ statusCode: 400 }), reused for the four new optional
GlobalFilters query params. Unlike department, these are NOT gated
to admin/hr scope — a department-scoped user is still allowed to
filter by project/manager/teamLead/employee, because the resulting
filter is always intersected with their forced department scope in
buildProjectFilter/buildTaskFilter, so it can only narrow what they
already see, never expand it (see section 13/15 requirements).

Deliberately does NOT check the referenced document exists (unlike
department) — an unmatched-but-valid id is not a security concern,
it just yields an empty (but well-formed) result set, same as any
other filter combination that happens to match nothing.
=========================================================
*/
const validateOptionalObjectId = (rawValue, fieldLabel) => {
  if (!rawValue) return null;
  if (!mongoose.Types.ObjectId.isValid(rawValue)) {
    throw Object.assign(new Error(`Invalid ${fieldLabel} id`), { statusCode: 400 });
  }
  return new mongoose.Types.ObjectId(rawValue);
};

/*
=========================================================
RESOLVE EFFECTIVE DEPARTMENT
=========================================================
Collapses access scope + requested department into ONE value that
every downstream filter is built from:

  - scope "department" -> always the user's own department (forced)
  - scope "all", department picked  -> that department
  - scope "all", no department picked -> null ("all departments")
  - scope "none" -> null (irrelevant; filters short-circuit to
    IMPOSSIBLE_MATCH before this value is even used)

UNCHANGED.
=========================================================
*/
const resolveEffectiveDepartmentId = (access, requestedDepartmentId) => {
  if (access.scopeType === "department") return access.departmentIds[0];
  if (access.scopeType === "all") return requestedDepartmentId;
  return null;
};

/*
=========================================================
RESOLVE MANAGER -> DEPARTMENTS
=========================================================
New for GlobalFilters. In this application "Manager" means
Department.headOf, NOT Project.manager (that's the separate
"Team Lead" filter — see buildProjectFilter below).

    Manager = Krishna
      -> every Department where headOf = Krishna
      -> every Project whose department is one of those departments

Returns:
  - null            if no managerId was supplied (filter inactive)
  - []              if the manager heads zero departments
  - [ids...]        the department ids the manager heads

IMPORTANT: an empty array must NOT be treated as "no filter" by the
callers below — that would silently widen the result set back out to
"all departments" for a manager who (validly) heads none. See
buildProjectFilter's `managerDepartmentIds || []` handling.
=========================================================
*/
const resolveManagerDepartmentIds = async (managerId) => {
  if (!managerId) return null;
  return Department.find({ headOf: managerId }).distinct("_id");
};

/*
=========================================================
DATE OVERLAP FILTER (projects)
=========================================================
"Prefer projects that overlap the selected period rather than only
projects created during the period":

    project.startDate <= endDate  AND  project.endDate >= startDate

A project with a missing startDate/endDate must not be silently
excluded (existing data has nulls), so each side of the overlap is
OR'd with "the field isn't set".

UNCHANGED.
=========================================================
*/
const buildDateOverlapFilter = (startDate, endDate) => ({
  $and: [
    {
      $or: [
        { startDate: { $exists: false } },
        { startDate: null },
        { startDate: { $lte: endDate } },
      ],
    },
    {
      $or: [
        { endDate: { $exists: false } },
        { endDate: null },
        { endDate: { $gte: startDate } },
      ],
    },
  ],
});

/*
=========================================================
BUILD PROJECT FILTER  (the ONE canonical project query)
=========================================================
Extended to accept the full GlobalFilters set, but the shape and the
existing department-only behavior are unchanged: called with just
`{ departmentId, dateRange }` (e.g. from calculateDepartmentPerformance,
or from the main request when only year/month/week/department are
supplied) it returns EXACTLY what the old two-argument
`buildProjectFilter(departmentId, dateRange)` used to return.

  departmentId  -> Project.department (equality). null = "all departments"
                   the caller is allowed to see.
  projectId     -> Project._id (equality).
  managerId     -> NOT Project.manager. Manager = Department.headOf, so
                   this restricts Project.department to the set of
                   departments that manager heads (managerDepartmentIds,
                   resolved by resolveManagerDepartmentIds above). If a
                   departmentId is ALSO active, the manager restriction is
                   layered on as an additional $and clause rather than
                   overwriting the department equality, so a department-
                   scoped user's forced department can never be widened.
  teamLeadId    -> Project.manager (equality). This is the actual
                   "who leads/manages this project" field in the schema;
                   "Team Lead" is only the frontend's label for it.
  employeeId    -> Project.teamMembers (array-contains).

managerDepartmentIds must be an array (possibly empty) whenever
managerId is set — an empty array intentionally collapses the
department clause to `{ $in: [] }`, which matches zero projects. This
must never be skipped/defaulted away, per the "manager heads no
departments -> empty result, not all results" requirement.

IMPORTANT — this is the root cause of a bug the original controller
already had to work around, and it still applies to every id passed
in here: $match stages inside Model.aggregate([...]) are handed
straight to the MongoDB driver and are NOT run through Mongoose's
schema-aware casting the way Model.find()/.findOne() are.
Project.find({department: "<string>"}) auto-casts the string to an
ObjectId and matches fine; Project.aggregate([{ $match: { department:
"<string>" } }]) does NOT — it compares a string to a stored ObjectId
and matches nothing. Every id passed into this filter (departmentId,
projectId, managerId's resolved department list, teamLeadId,
employeeId) must already be a real ObjectId instance, never a raw
query-string. resolveRequestedDepartmentId and
validateOptionalObjectId both return real ObjectId instances for
exactly this reason.
=========================================================
*/
const buildProjectFilter = ({
  departmentId = null,
  projectId = null,
  managerId = null,
  teamLeadId = null,
  employeeId = null,
  managerDepartmentIds = null,
  dateRange,
}) => {
  const filter = buildDateOverlapFilter(dateRange.startDate, dateRange.endDate);

  if (departmentId) {
    filter.department = departmentId;
  }

  if (projectId) {
    filter._id = projectId;
  }

  if (managerId) {
    const deptIds = managerDepartmentIds || [];
    if (departmentId) {
      // A specific department AND a manager filter are both active —
      // layer the manager's department set on as an additional
      // constraint instead of overwriting the equality above, so this
      // can only narrow the result, never replace the forced department.
      filter.$and = [...(filter.$and || []), { department: { $in: deptIds } }];
    } else {
      filter.department = { $in: deptIds };
    }
  }

  if (teamLeadId) {
    filter.manager = teamLeadId;
  }

  if (employeeId) {
    filter.teamMembers = employeeId;
  }

  return filter;
};

/*
=========================================================
BUILD TASK FILTER  (the ONE canonical task query)
=========================================================
Task.department defaults to null — plenty of real task rows will
only be reachable through their `project` field, not a department
set directly on the task. Trusting task.department alone (the old
behaviour) silently drops those tasks from every section that uses
the task filter. So when a department is in scope, a task counts if
EITHER:
  - task.department equals the department, OR
  - task.project is one of that department's projects

Task period filtering stays on createdAt (unchanged from the
original design).

BACKWARD-COMPATIBILITY SPLIT:
When none of the new project-scoping filters (project/manager/
teamLead/employee) are active, this function takes the EXACT same
code path as the original two-argument `buildTaskFilter(departmentId,
dateRange)` — same query, same result, for every request shape listed
in the "must keep working" list (year-only, year+month, year+month+
week, department-only). This matters because the original
department-only path resolves department-projects with a plain
`{ department: departmentId }` lookup (no date bound), while a
project/manager/teamLead/employee filter needs tasks narrowed to the
SAME project set as the canonical projectFilter (which DOES carry the
date-overlap bound and the new filters) — two genuinely different
project sets. Collapsing them into one path would either break the
old department-only date semantics or fail to apply the new filters,
so the split is deliberate, not leftover duplication.

When one or more new filters ARE active, tasks are drawn from
`Project.find(projectFilter).distinct('_id')` — i.e. the identical
project set every other analytics function in this file already
matches against — plus, when an employee filter is active, an
additional direct restriction to tasks that employee is assigned to
(`assignees.user`), since a task can belong to a matching project
without that specific employee being one of its assignees.
=========================================================
*/
const buildTaskFilter = async ({
  departmentId = null,
  projectId = null,
  managerId = null,
  teamLeadId = null,
  employeeId = null,
  dateRange,
  projectFilter = null,
}) => {
  const filter = {
    createdAt: { $gte: dateRange.startDate, $lt: dateRange.endDate },
  };

  const hasNewProjectScopingFilters = Boolean(projectId || managerId || teamLeadId || employeeId);

  if (!hasNewProjectScopingFilters) {
    // Original behavior, byte-for-byte: department-only (or no filter at all).
    if (departmentId) {
      const departmentProjectIds = await Project.find({ department: departmentId }).distinct("_id");
      filter.$or = [{ department: departmentId }, { project: { $in: departmentProjectIds } }];
    }
    return filter;
  }

  // One or more of project/manager/teamLead/employee are active — tasks must
  // come from the exact same project set as the canonical projectFilter.
  const scopedProjectIds = await Project.find(projectFilter).distinct("_id");

  if (departmentId) {
    filter.$or = [{ department: departmentId }, { project: { $in: scopedProjectIds } }];
  } else {
    filter.project = { $in: scopedProjectIds };
  }

  if (employeeId) {
    filter["assignees.user"] = employeeId;
  }

  return filter;
};

/*
=========================================================
CALCULATE SUMMARY
=========================================================
UNCHANGED — still just consumes whatever projectFilter/taskFilter it
is handed.
=========================================================
*/
const calculateSummary = async (projectFilter, taskFilter) => {
  const [projectAgg, taskAgg] = await Promise.all([
    Project.aggregate([
      { $match: projectFilter },
      {
        $group: {
          _id: null,
          totalProjects: { $sum: 1 },
          completedProjects: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          averageProgress: { $avg: "$progress" },
          totalBudget: { $sum: "$budget" },
        },
      },
    ]),
    Task.aggregate([
      { $match: taskFilter },
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          completedTasks: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          averageProgress: { $avg: "$progress" },
          estimatedHours: { $sum: "$estimatedHours" },
          actualHours: { $sum: "$actualHours" },
        },
      },
    ]),
  ]);

  const p = projectAgg[0] || {};
  const t = taskAgg[0] || {};

  return {
    totalProjects: p.totalProjects || 0,
    completedProjects: p.completedProjects || 0,
    totalTasks: t.totalTasks || 0,
    completedTasks: t.completedTasks || 0,
    averageProjectProgress: Math.round(p.averageProgress || 0),
    averageTaskProgress: Math.round(t.averageProgress || 0),
    totalBudget: p.totalBudget || 0,
    estimatedHours: t.estimatedHours || 0,
    actualHours: t.actualHours || 0,
  };
};

/*
=========================================================
CALCULATE PROJECT / TASK STATUS
=========================================================
UNCHANGED.
=========================================================
*/
const calculateProjectStatus = (projectFilter) =>
  Project.aggregate([
    { $match: projectFilter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

const calculateTaskStatus = (taskFilter) =>
  Task.aggregate([
    { $match: taskFilter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

/*
=========================================================
CALCULATE DEPARTMENT PERFORMANCE
=========================================================
Deliberately NOT extended with project/manager/teamLead/employee.
Its purpose is department-level performance, and blindly intersecting
it with e.g. a single employee or a single project would turn "how is
each department doing" into "how is each department doing for one
person/project", which is a different question than what this section
answers. Per the brief, its behavior is preserved exactly as-is; only
the two helper calls below were updated to the new object-argument
signatures (same values as before: departmentId + dateRange only), so
this still exercises the EXACT same original code path inside
buildProjectFilter/buildTaskFilter as before this change.

- scope "none": no departments, empty array.
- scope "department": exactly the user's own department.
- scope "all": every active department, narrowed to the requested
  one if a department was selected.
=========================================================
*/
const calculateDepartmentPerformance = async (access, effectiveDepartmentId, dateRange) => {
  if (access.scopeType === "none") return [];

  let departments;
  if (access.scopeType === "department") {
    departments = await Department.find({ _id: access.departmentIds[0] })
      .select("name code")
      .lean();
  } else {
    const match = { status: "active" };
    if (effectiveDepartmentId) match._id = effectiveDepartmentId;
    departments = await Department.find(match).select("name code").lean();
  }

  const results = await Promise.all(
    departments.map(async (dept) => {
      const projectFilter = buildProjectFilter({ departmentId: dept._id, dateRange });
      const taskFilter = await buildTaskFilter({ departmentId: dept._id, dateRange, projectFilter });

      const [projectAgg, taskAgg] = await Promise.all([
        Project.aggregate([
          { $match: projectFilter },
          { $group: { _id: null, projects: { $sum: 1 }, avgProgress: { $avg: "$progress" } } },
        ]),
        Task.aggregate([
          { $match: taskFilter },
          {
            $group: {
              _id: null,
              tasks: { $sum: 1 },
              completedTasks: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
              avgProgress: { $avg: "$progress" },
            },
          },
        ]),
      ]);

      const p = projectAgg[0] || {};
      const t = taskAgg[0] || {};

      return {
        _id: dept._id,
        name: dept.name,
        code: dept.code,
        projects: p.projects || 0,
        tasks: t.tasks || 0,
        completedTasks: t.completedTasks || 0,
        projectProgress: Math.round(p.avgProgress || 0),
        taskProgress: Math.round(t.avgProgress || 0),
      };
    })
  );

  return results.sort((a, b) => b.projects - a.projects);
};

/*
=========================================================
GET PROJECT PROGRESS
=========================================================
Response shape unchanged — same fields Overview.jsx already reads.
UNCHANGED.
=========================================================
*/
const getProjectProgress = (projectFilter) =>
  Project.find(projectFilter)
    .populate("department", "name code")
    .populate("manager", "name employeeId")
    .select("name projectCode department manager status priority progress startDate endDate")
    .sort({ progress: -1 })
    .limit(10)
    .lean();

/*
=========================================================
GET RECENT ACTIVITY
=========================================================
Response shape unchanged. Built from the exact same projectFilter /
taskFilter as every other section, so it can never disagree with
summary/projectStatus/taskStatus about which department+period+
project/manager/teamLead/employee scope is in effect.
UNCHANGED.
=========================================================
*/
const getRecentActivity = async (projectFilter, taskFilter) => {
  const [recentProjects, recentTasks] = await Promise.all([
    Project.find(projectFilter)
      .populate("department", "name code")
      .populate("createdBy", "name employeeId")
      .select("name projectCode department createdBy status createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Task.find(taskFilter)
      .populate("project", "name projectCode")
      .populate("department", "name code")
      .populate("createdBy", "name employeeId")
      .select("title taskCode project department createdBy status createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  return [
    ...recentProjects.map((project) => ({
      type: "project",
      action: "created",
      title: `Project "${project.name}" created`,
      project: project.name,
      projectCode: project.projectCode,
      department: project.department?.name || null,
      user: project.createdBy?.name || null,
      createdAt: project.createdAt,
    })),
    ...recentTasks.map((task) => ({
      type: "task",
      action: "created",
      title: `Task "${task.title}" created`,
      task: task.title,
      taskCode: task.taskCode,
      project: task.project?.name || null,
      department: task.department?.name || null,
      user: task.createdBy?.name || null,
      createdAt: task.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);
};

/*
=========================================================
BUILD ACCESS RESPONSE (department populated for the UI)
=========================================================
Overview.jsx reads access.department._id / .name to lock/label the
department selector — this must stay a populated object.
UNCHANGED.
=========================================================
*/
const buildAccessResponse = async (access, selectedDepartmentId) => {
  const idToLoad =
    access.scopeType === "department" ? access.departmentIds[0] : selectedDepartmentId || null;

  const departmentDoc = idToLoad
    ? await Department.findById(idToLoad).select("name code").lean()
    : null;

  return {
    role: access.role,
    scope: access.scopeType,
    department: departmentDoc
      ? { _id: departmentDoc._id, name: departmentDoc.name, code: departmentDoc.code }
      : null,
  };
};

/*
=========================================================
WORKSPACE OVERVIEW
=========================================================
*/
const getWorkspaceOverview = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    /* 1-3. Auth -> role/scope -> resolved department (backend is the source of truth) */
    const access = resolveWorkspaceAccess(user);
    const requestedDepartmentId = await resolveRequestedDepartmentId(req.query.department, access);
    const effectiveDepartmentId = resolveEffectiveDepartmentId(access, requestedDepartmentId);

    /* 4. Date range — calculated once, reused everywhere below */
    const { year, month, week } = req.query;
    const dateRange = resolveDateRange({ year, month, week });

    /* 4b. Validate + resolve the new GlobalFilters (project/manager/teamLead/employee).
       Applied strictly AFTER access scope above — these can only narrow the
       department-scoped result, never widen it (see buildProjectFilter). */
    const projectId = validateOptionalObjectId(req.query.project, "project");
    const managerId = validateOptionalObjectId(req.query.manager, "manager");
    const teamLeadId = validateOptionalObjectId(req.query.teamLead, "teamLead");
    const employeeId = validateOptionalObjectId(req.query.employee, "employee");

    // Manager = Department.headOf, not Project.manager. Resolve which
    // departments (if any) this manager heads before building the filters.
    const managerDepartmentIds = await resolveManagerDepartmentIds(managerId);

    /* 5-6. Canonical project + task filters */
    let projectFilter;
    let taskFilter;
    if (access.scopeType === "none") {
      projectFilter = IMPOSSIBLE_MATCH;
      taskFilter = IMPOSSIBLE_MATCH;
    } else {
      projectFilter = buildProjectFilter({
        departmentId: effectiveDepartmentId,
        projectId,
        managerId,
        teamLeadId,
        employeeId,
        managerDepartmentIds,
        dateRange,
      });
      taskFilter = await buildTaskFilter({
        departmentId: effectiveDepartmentId,
        projectId,
        managerId,
        teamLeadId,
        employeeId,
        dateRange,
        projectFilter,
      });
    }

    /* 7-9. Every analytic, calculated from the same two filters.
       calculateDepartmentPerformance intentionally still receives only
       access/effectiveDepartmentId/dateRange — see its comment above. */
    const [summary, projectStatus, taskStatus, departmentPerformance, projectProgress, recentActivity, accessResponse] =
      await Promise.all([
        calculateSummary(projectFilter, taskFilter),
        calculateProjectStatus(projectFilter),
        calculateTaskStatus(taskFilter),
        calculateDepartmentPerformance(access, effectiveDepartmentId, dateRange),
        getProjectProgress(projectFilter),
        getRecentActivity(projectFilter, taskFilter),
        buildAccessResponse(access, requestedDepartmentId),
      ]);

    /* 10. Response — existing structure/fields unchanged, new filter fields appended */
    return res.status(200).json({
      success: true,

      access: accessResponse,

      filters: {
        year: year ? Number(year) : null,
        month: month ? Number(month) : null,
        week: week ? Number(week) : null,
        department: effectiveDepartmentId ? effectiveDepartmentId.toString() : null,
        project: projectId ? projectId.toString() : null,
        manager: managerId ? managerId.toString() : null,
        teamLead: teamLeadId ? teamLeadId.toString() : null,
        employee: employeeId ? employeeId.toString() : null,
        period: dateRange.period,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      },

      data: {
        summary,
        projectStatus,
        taskStatus,
        departmentPerformance,
        projectProgress,
        recentActivity,
      },
    });
  } catch (error) {
    console.error("Workspace Overview Error:", error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to load workspace overview",
    });
  }
};

module.exports = {
  getWorkspaceOverview,
};