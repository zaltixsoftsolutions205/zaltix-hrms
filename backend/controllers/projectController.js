const Project = require("../models/Project");
const Department = require("../models/Department");
const User = require("../models/User");

const { sanitizeModuleAccess } = require("../constants/modules");
const { promote, releaseIfUnused } = require("../services/rolePromotionService");
const {
    projectDepartmentIds,
    headedDepartmentIds,
    canManageProject,
    canEditProject,
    canCreateProjectIn,
    getEffectiveProjectAccess,
} = require("../services/projectAccessService");

const PROJECT_WORKSPACE_MODULE_KEYS = ["department", "project", "project_module_tree", "project_tasks", "project_bugs", "project_timeline"];

/**
 * Module access for a project lead: the form only covers the workspace keys,
 * so merge those into the lead's existing custom access instead of replacing
 * it. A lead on role defaults (empty list) stays on role defaults.
 */
async function leadModuleAccess(userId, input) {
    if (input === undefined) return undefined;
    const user = await User.findById(userId).select("moduleAccess").lean();
    const current = (user && user.moduleAccess) || [];
    if (!current.length) return undefined;
    const workspace = validateProjectModuleAccess(input);
    return [...current.filter((a) => !PROJECT_WORKSPACE_MODULE_KEYS.includes(a.module)), ...workspace];
}

function validateProjectModuleAccess(input) {
    const sanitized = sanitizeModuleAccess(input);
    if (!sanitized) return [];
    return sanitized.filter(entry => PROJECT_WORKSPACE_MODULE_KEYS.includes(entry.module));
}

/* ============================================================
   HELPERS
============================================================ */

const normalizeArray = value => {
    if (Array.isArray(value)) { return value.filter(Boolean); }
    if (value === undefined || value === null || value === "") { return []; }
    return [value];
};

const idOf = (v) => (v ? String(v._id || v) : null);

/** Error carrying an HTTP status, thrown by the shared validators below. */
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const POPULATE = [
    ["department", "name code headOf"],
    ["departments", "name code headOf"],
    ["manager", "name email employeeId role moduleAccess department"],
    ["teamMembers", "name email employeeId role department profilePicture"],
    ["createdBy", "name email"],
];
const populateProject = (query) => POPULATE.reduce((q, [path, select]) => q.populate(path, select), query);

/**
 * Resolve the full department list of a project: owning department first,
 * then the extra ones, de-duplicated. Every id must exist.
 */
const resolveDepartments = async (owning, extra) => {
    const ids = [...new Set([owning, ...normalizeArray(extra)].filter(Boolean).map(idOf))];
    if (!ids.length) {
        throw new HttpError(400, "Please select the project's department.");
    }
    const found = await Department.find({ _id: { $in: ids } }).select("_id name").lean();
    if (found.length !== ids.length) {
        throw new HttpError(404, "One or more departments were not found.");
    }
    return ids;
};

/**
 * Load the lead + members, check they're active and belong to one of the
 * project's departments. Returns { lead, memberIds } (lead never in members).
 */
const validatePeople = async ({ manager, teamMembers, departmentIds }) => {
    const memberIds = [...new Set(normalizeArray(teamMembers).map(idOf))];
    const allIds = [...new Set([idOf(manager), ...memberIds].filter(Boolean))];

    const users = await User.find({ _id: { $in: allIds } }).select("_id name isActive department");
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const lead = manager ? byId.get(idOf(manager)) : null;
    if (manager && !lead) throw new HttpError(404, "Project team lead not found.");
    if (lead && !lead.isActive) throw new HttpError(400, "Project team lead must be an active employee.");

    const missing = memberIds.filter((id) => !byId.get(id) || !byId.get(id).isActive);
    if (missing.length) throw new HttpError(404, "One or more team members were not found or are inactive.");

    const deptSet = new Set(departmentIds.map(String));
    const outside = allIds
        .map((id) => byId.get(id))
        .filter((u) => !u.department || !deptSet.has(String(u.department)));
    if (outside.length) {
        throw new HttpError(
            400,
            `The team lead and members must belong to one of the project's departments: ${outside.map((u) => u.name).join(", ")}.`
        );
    }

    return { lead, memberIds: memberIds.filter((id) => id !== idOf(manager)) };
};

const validateDatesAndNumbers = ({ startDate, endDate, budget, progress }) => {
    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            throw new HttpError(400, "Invalid start or end date.");
        }
        if (start > end) throw new HttpError(400, "End date must be after start date.");
    }
    const finalBudget = budget === undefined || budget === "" ? 0 : Number(budget);
    const finalProgress = progress === undefined || progress === "" ? 0 : Number(progress);
    if (Number.isNaN(finalBudget) || finalBudget < 0) throw new HttpError(400, "Budget must be a valid non-negative number.");
    if (Number.isNaN(finalProgress) || finalProgress < 0 || finalProgress > 100) throw new HttpError(400, "Progress must be between 0 and 100.");
    return { finalBudget, finalProgress };
};

const sendError = (res, label, error) => {
    if (error instanceof HttpError) {
        return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error(`${label}:`, error);
    return res.status(500).json({ success: false, message: "Server Error" });
};

/**
 * Common project creation logic (POST /projects).
 */
const createProjectRecord = async ({ data, createdBy, user }) => {
    const { name, description, client, department, departments, manager, teamMembers, moduleAccess, startDate, endDate, priority, status, budget, progress, attachments } = data;

    if (!name || !department || !manager) {
        throw new HttpError(400, "Please fill all required fields.");
    }
    if (user && !(await canCreateProjectIn(user, department))) {
        throw new HttpError(403, "Only admin or the manager of the owning department can create its projects.");
    }

    const departmentIds = await resolveDepartments(department, departments);
    const { memberIds } = await validatePeople({ manager, teamMembers, departmentIds });
    const { finalBudget, finalProgress } = validateDatesAndNumbers({ startDate, endDate, budget, progress });
    const validModuleAccess = validateProjectModuleAccess(moduleAccess);

    const project = await Project.create({
        name: String(name).trim(),
        description: description || "",
        client: client || "",
        department,
        departments: departmentIds,
        manager,
        teamMembers: memberIds,
        startDate,
        endDate,
        priority: priority || "medium",
        status: status || "planning",
        budget: finalBudget,
        progress: finalProgress,
        attachments: Array.isArray(attachments) ? attachments : [],
        createdBy,
    });

    // Promote the project lead (reversible, never lowers a higher role)
    void validModuleAccess;
    await promote(manager, { role: "team-lead", moduleAccess: await leadModuleAccess(manager, moduleAccess), reason: "project-lead" });
    return project;
};

/* ============================================================
   CREATE PROJECT
============================================================ */

const createProject = async (req, res) => {
    try {
        const project = await createProjectRecord({ data: req.body, createdBy: req.user._id, user: req.user });
        const populatedProject = await populateProject(Project.findById(project._id));
        return res.status(201).json({ success: true, message: "Project created successfully.", project: populatedProject });
    } catch (error) {
        if (!(error instanceof HttpError)) console.error("Create Project:", error);
        return res.status(error.status || 400).json({ success: false, message: error.message || "Server Error" });
    }
};

/* ============================================================
   GET PROJECTS
============================================================ */

const getProjects = async (req, res) => {
    try {
        const { search, status, priority, department, manager, isActive, page = 1, limit = 10 } = req.query;
        const query = {};
        const user = req.user;
        if (!user) {
            return res.status(401).json({ success: false, message: "Authenticated user not found." });
        }
        if (isActive !== undefined) query.isActive = isActive === "true";
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { projectCode: { $regex: search, $options: "i" } },
                { client: { $regex: search, $options: "i" } },
            ];
        }

        const role = String(user.role || "").toLowerCase();
        // A project belongs to every department in `departments`.
        if (role === "admin" || role === "hr") {
            if (department) query.departments = department;
            if (manager) query.manager = manager;
        } else if (role === "manager") {
            const headed = await headedDepartmentIds(user);
            if (department) {
                if (!headed.includes(String(department))) {
                    return res.status(403).json({ success: false, message: "You do not have access to this department." });
                }
                query.departments = department;
            } else {
                query.departments = { $in: headed };
            }
            if (manager) query.manager = manager;
        } else {
            // Team lead / employee: projects they lead or are a member of.
            const own = { $or: [{ manager: user._id }, { teamMembers: user._id }] };
            if (query.$or) {
                query.$and = [{ $or: query.$or }, own];
                delete query.$or;
            } else {
                Object.assign(query, own);
            }
            if (department) query.departments = department;
        }

        const pageNumber = Math.max(Number(page) || 1, 1);
        const pageLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);

        const projects = await populateProject(
            Project.find(query).sort({ createdAt: -1 }).skip((pageNumber - 1) * pageLimit).limit(pageLimit)
        );
        const total = await Project.countDocuments(query);

        return res.status(200).json({
            success: true,
            count: projects.length,
            total,
            page: pageNumber,
            pages: Math.ceil(total / pageLimit),
            projects,
        });
    } catch (error) {
        console.error("Get Projects:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

/* ============================================================
   GET SINGLE PROJECT (+ the caller's permissions)
============================================================ */

const getProject = async (req, res) => {
    try {
        const project = await populateProject(Project.findById(req.params.id));
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }
        const [access, canEdit, canManage] = await Promise.all([
            getEffectiveProjectAccess(req.user, project),
            canEditProject(req.user, project),
            canManageProject(req.user, project),
        ]);
        // Only people involved in the project (or with a role that oversees it) may open it.
        const hasAny = Object.values(access).some((level) => level !== "none");
        if (!hasAny && !canEdit) {
            return res.status(403).json({ success: false, message: "You do not have access to this project." });
        }
        return res.status(200).json({ success: true, project, access, permissions: { canEdit, canManage } });
    } catch (error) {
        console.error("Get Project:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

/* ============================================================
   UPDATE PROJECT
============================================================ */

const updateProject = async (req, res) => {
    try {
        const { id } = req.params;
        let project = await Project.findById(id);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }

        const { name, projectCode, description, client, department, departments, manager, teamMembers, moduleAccess, startDate, endDate, priority, status, budget, progress, attachments, isActive } = req.body;

        if (!(await canEditProject(req.user, project))) {
            return res.status(403).json({ success: false, message: "Only admin, the department manager or the project's team lead can edit this project." });
        }

        // Forms send the full record back; only real changes need manage rights.
        const sameSet = (a, b) => {
            const x = new Set(a.map(idOf)); const y = new Set(b.map(idOf));
            return x.size === y.size && [...x].every((v) => y.has(v));
        };
        const changesDepartment = department !== undefined && department !== "" && idOf(department) !== idOf(project.department);
        const changesDepartments = departments !== undefined &&
            !sameSet([department || project.department, ...normalizeArray(departments)], projectDepartmentIds(project));
        const changesLead = manager !== undefined && manager !== "" && idOf(manager) !== idOf(project.manager);
        const manages = await canManageProject(req.user, project);
        const previousLead = idOf(project.manager);
        if ((changesDepartment || changesDepartments || changesLead) && !manages) {
            return res.status(403).json({ success: false, message: "Only admin or the owning department's manager can change departments or the team lead." });
        }
        if (changesDepartment && req.user.role !== "admin" && !(await canCreateProjectIn(req.user, department))) {
            return res.status(403).json({ success: false, message: "You can only move a project to a department you manage." });
        }

        // Project code
        if (projectCode && projectCode.trim().toUpperCase() !== project.projectCode) {
            const existing = await Project.findOne({ projectCode: projectCode.trim().toUpperCase(), _id: { $ne: id } });
            if (existing) {
                return res.status(400).json({ success: false, message: "Project code already exists." });
            }
            project.projectCode = projectCode.trim().toUpperCase();
        }

        // Departments
        const owning = department || project.department;
        const extra = departments !== undefined ? departments : project.departments;
        const departmentIds = await resolveDepartments(owning, extra);

        // People (re-validated whenever departments, lead or members change)
        const finalLead = manager || project.manager;
        const finalMembers = teamMembers !== undefined ? teamMembers : project.teamMembers;
        const { memberIds } = await validatePeople({ manager: finalLead, teamMembers: finalMembers, departmentIds });

        // Dates
        const projectStart = startDate || project.startDate;
        const projectEnd = endDate || project.endDate;
        if (projectStart && projectEnd && new Date(projectStart) > new Date(projectEnd)) {
            return res.status(400).json({ success: false, message: "End date must be after start date." });
        }

        project.department = owning;
        project.departments = departmentIds;
        project.manager = finalLead;
        project.teamMembers = memberIds;

        if (name !== undefined) project.name = String(name).trim();
        if (description !== undefined) project.description = description;
        if (client !== undefined) project.client = client;
        if (startDate !== undefined) project.startDate = startDate;
        if (endDate !== undefined) project.endDate = endDate;
        if (priority !== undefined) project.priority = priority;
        if (status !== undefined) project.status = status;
        if (budget !== undefined) project.budget = Number(budget);
        // Calculated from module tasks once the project has them.
        if (progress !== undefined && !project.progressAuto) project.progress = Number(progress);
        if (attachments !== undefined) project.attachments = attachments;
        if (isActive !== undefined) project.isActive = isActive;

        await project.save();

        // Promote the (new) lead; module access only when sent. Only admin /
        // the owning department's manager may do this — a team lead must not
        // be able to rewrite their own module access through this form.
        if (manager && manages) {
            await promote(manager, { role: "team-lead", moduleAccess: await leadModuleAccess(manager, moduleAccess), reason: "project-lead" });
        }
        // The previous lead gets their old role / access back if they lead nothing else.
        if (previousLead && previousLead !== idOf(project.manager)) {
            await releaseIfUnused(previousLead);
        }

        project = await populateProject(Project.findById(id));
        return res.status(200).json({ success: true, message: "Project updated successfully.", project });
    } catch (error) {
        if (error instanceof HttpError) return sendError(res, "Update Project", error);
        console.error("Update Project:", error);
        return res.status(400).json({ success: false, message: error.message || "Server Error" });
    }
};

/* ============================================================
   DELETE PROJECT
============================================================ */

const deleteProject = async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }
        if (!(await canManageProject(req.user, project))) {
            return res.status(403).json({ success: false, message: "Only admin or the owning department's manager can delete this project." });
        }
        await Project.findByIdAndDelete(project._id);
        await releaseIfUnused(project.manager);
        return res.status(200).json({ success: true, message: "Project deleted successfully." });
    } catch (error) {
        return sendError(res, "Delete Project", error);
    }
};

/* ============================================================
   MEMBERS
============================================================ */

/** Shared: add users to a project after access + department checks. */
const addMembers = async (req, projectId, userIds) => {
    const project = await Project.findById(projectId);
    if (!project) throw new HttpError(404, "Project not found.");
    if (!(await canEditProject(req.user, project))) {
        throw new HttpError(403, "Only admin, the department manager or the project's team lead can change members.");
    }
    const ids = [...new Set(normalizeArray(userIds).map(idOf))];
    if (!ids.length) throw new HttpError(400, "Please provide one or more user IDs.");

    const { memberIds } = await validatePeople({
        manager: project.manager,
        teamMembers: [...project.teamMembers.map(idOf), ...ids],
        departmentIds: projectDepartmentIds(project),
    });
    project.teamMembers = memberIds;
    await project.save();
    return project;
};

const removeMember = async (req, projectId, userId) => {
    const project = await Project.findById(projectId);
    if (!project) throw new HttpError(404, "Project not found.");
    if (!(await canEditProject(req.user, project))) {
        throw new HttpError(403, "Only admin, the department manager or the project's team lead can change members.");
    }
    if (!project.teamMembers.some((m) => idOf(m) === String(userId))) {
        throw new HttpError(400, "User is not a member of this project.");
    }
    project.teamMembers = project.teamMembers.filter((m) => idOf(m) !== String(userId));
    await project.save();
    return project;
};

// POST /api/projects/:id/members  { userIds: [] }
const addProjectMember = async (req, res) => {
    try {
        const project = await addMembers(req, req.params.id, req.body.userIds);
        return res.status(200).json({ success: true, message: "Member(s) added successfully.", project: await populateProject(Project.findById(project._id)) });
    } catch (error) {
        return sendError(res, "Add Project Member", error);
    }
};

// DELETE /api/projects/:id/members/:userId
const removeProjectMember = async (req, res) => {
    try {
        const project = await removeMember(req, req.params.id, req.params.userId);
        return res.status(200).json({ success: true, message: "Member removed successfully.", project: await populateProject(Project.findById(project._id)) });
    } catch (error) {
        return sendError(res, "Remove Project Member", error);
    }
};

/* ============================================================
   ARCHIVE / RESTORE
============================================================ */

const archiveProject = async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }
        if (!(await canManageProject(req.user, project))) {
            return res.status(403).json({ success: false, message: "Only admin or the owning department's manager can archive this project." });
        }
        project.isActive = !project.isActive;
        await project.save();
        return res.status(200).json({
            success: true,
            message: project.isActive ? "Project restored successfully." : "Project archived successfully.",
            project: await populateProject(Project.findById(project._id)),
        });
    } catch (error) {
        return sendError(res, "Archive Project", error);
    }
};

/* ============================================================
   Department page helpers
   (mounted under both /api/projects and /api/departments)
============================================================ */

/**
 * @desc    Move a project to a different owning department
 * @route   PUT /api/projects/:projectId/department
 * @body    { departmentId }
 *
 * Only Project.department / departments change. User.department of the
 * lead and members is never touched; members from the old owning department
 * stay valid because it is kept in `departments`.
 */
const shiftProjectDepartment = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { departmentId } = req.body;
        if (!departmentId) {
            return res.status(400).json({ success: false, message: "departmentId is required." });
        }
        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }
        if (!(await canManageProject(req.user, project)) || !(await canCreateProjectIn(req.user, departmentId))) {
            return res.status(403).json({ success: false, message: "You can only move projects between departments you manage." });
        }
        const department = await Department.findById(departmentId);
        if (!department) {
            return res.status(404).json({ success: false, message: "Target department not found." });
        }

        project.departments = [...new Set([String(departmentId), ...projectDepartmentIds(project)])];
        project.department = departmentId;
        await project.save();

        return res.status(200).json({
            success: true,
            message: "Project department updated successfully.",
            project: await populateProject(Project.findById(projectId)),
        });
    } catch (error) {
        return sendError(res, "Shift Project Department", error);
    }
};

// POST /api/projects/:projectId/team-members  { userId }
const addProjectTeamMember = async (req, res) => {
    try {
        if (!req.body.userId) {
            return res.status(400).json({ success: false, message: "userId is required." });
        }
        const project = await addMembers(req, req.params.projectId, [req.body.userId]);
        return res.status(200).json({ success: true, message: "Team member added successfully.", project: await populateProject(Project.findById(project._id)) });
    } catch (error) {
        return sendError(res, "Add Project Team Member", error);
    }
};

// DELETE /api/projects/:projectId/team-members/:userId
const removeProjectTeamMember = async (req, res) => {
    try {
        const project = await removeMember(req, req.params.projectId, req.params.userId);
        return res.status(200).json({ success: true, message: "Team member removed successfully.", project: await populateProject(Project.findById(project._id)) });
    } catch (error) {
        return sendError(res, "Remove Project Team Member", error);
    }
};

module.exports = {
    createProject,
    getProjects,
    getProject,
    shiftProjectDepartment,
    addProjectTeamMember,
    removeProjectTeamMember,
    updateProject,
    deleteProject,
    addProjectMember,
    removeProjectMember,
    archiveProject,
    createProjectRecord,
};
