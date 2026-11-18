const Project = require("../models/Project");
const Department = require("../models/Department");
const User = require("../models/User");

const { sanitizeModuleAccess } = require("../constants/modules");
const PROJECT_WORKSPACE_MODULE_KEYS = ["overview", "department", "project", "task"];

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
/**
 * Common project creation logic.
 *
 * Both:
 *
 * POST /projects
 *
 * and
 *
 * POST /projects/import
 *
 * eventually use this function.
 */
const createProjectRecord = async ({ data, createdBy }) => {
    const { name, description, client, department, manager, teamMembers, moduleAccess, startDate, endDate, priority, status, budget, progress, attachments } = data;
    // =========================================================
    // 1. Required fields
    // =========================================================
    if (!name || !department || !manager) {
        throw new Error("Please fill all required fields.");
    }

    // =========================================================
    // 2. Department
    // =========================================================
    const departmentExists = await Department.findById(department);
    if (!departmentExists) {
        throw new Error("Department not found.");
    }
    // =========================================================
    // 3. Project Lead
    // =========================================================
    const managerExists = await User.findById(manager);
    if (!managerExists) {
        throw new Error("Project manager not found.");
    }

    if (!managerExists.isActive) {
        throw new Error("Project manager must be an active employee.");
    }
    // =========================================================
    // 4. Manager must belong to department
    // =========================================================
    if (!managerExists.department || managerExists.department.toString() !== department.toString()) {
        throw new Error("Project manager must belong to the selected department.");
    }

    // =========================================================
    // 5. Module access
    // =========================================================
    const validModuleAccess = validateProjectModuleAccess(moduleAccess);
    // =========================================================
    // 6. Team members
    // =========================================================

    let validMembers = [];
    const suppliedMembers = normalizeArray(teamMembers);

    const memberIds = [...suppliedMembers, manager];

    const uniqueMemberIds = [...new Set(memberIds.filter(Boolean).map(String))];

    if (uniqueMemberIds.length > 0) {
        const users = await User.find({ _id: { $in: uniqueMemberIds }, isActive: true });

        if (users.length !== uniqueMemberIds.length) {
            throw new Error("One or more team members or the project team lead were not found or are inactive.");
        }
        // =====================================================
        // Department validation
        // =====================================================
        const invalidMembers = users.filter(user => !user.department || user.department.toString() !== department.toString());

        if (invalidMembers.length > 0) {
            throw new Error("The project team lead and all team members must belong to the selected department.");
        }

        // =====================================================
        // Do not store manager in teamMembers
        // =====================================================

        validMembers = users.filter(user => user._id.toString() !== manager.toString()).map(user => user._id);
    }
    // =========================================================
    // 7. Date validation
    // =========================================================
    if (startDate && endDate) {

        const start = new Date(startDate);

        const end = new Date(endDate);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            throw new Error("Invalid start or end date.");
        }
        if (start > end) {
            throw new Error("End date must be after start date.");
        }
    }
    // =========================================================
    // 8. Numeric validation
    // =========================================================
    const finalBudget = budget === undefined || budget === "" ? 0 : Number(budget);

    const finalProgress = progress === undefined || progress === "" ? 0 : Number(progress);

    if (Number.isNaN(finalBudget) || finalBudget < 0) {
        throw new Error("Budget must be a valid non-negative number.");
    }

    if (Number.isNaN(finalProgress) || finalProgress < 0 || finalProgress > 100) {
        throw new Error("Progress must be between 0 and 100.");
    }
    // =========================================================
    // 9. Create project
    // =========================================================
    const project =
        await Project.create({
            name: String(name).trim(),
            description: description || "",
            client: client || "",
            department,
            manager,
            teamMembers: validMembers,
            startDate,
            endDate,
            priority: priority || "medium",
            status: status || "planning",
            budget: finalBudget,
            progress: finalProgress,
            attachments: Array.isArray(attachments) ? attachments : [],
            createdBy
        });
    // =========================================================
    // 10. Promote project manager
    // =========================================================
    await User.findByIdAndUpdate(
        manager, { $set: { role: "team-lead", moduleAccess: validModuleAccess } }, { new: true, runValidators: true }
    );
    return project;
};

/* ============================================================
   CREATE PROJECT
============================================================ */

const createProject = async (req, res
) => {
    try {
        const project = await createProjectRecord({ data: req.body, createdBy: req.user._id });
        const populatedProject =
            await Project.findById(project._id).populate("department", "name code").populate("manager", "name email employeeId role moduleAccess").populate("teamMembers", "name email employeeId role").populate("createdBy", "name");

        return res.status(201).json({ success: true, message: "Project created successfully.", project: populatedProject });
    } catch (error) {
        console.error("Create Project:", error);
        return res.status(400).json({ success: false, message: error.message || "Server Error" });
    }
};
/* ============================================================
   IMPORT PROJECTS FROM EXCEL
============================================================ */
const importProjects = async (req, res) => {
    try {
        const rows = req.importedProjects;
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ success: false, message: "No valid project rows were found." });
        }
        const createdProjects = [];
        const errors = [];
        /*
         * Process each Excel row separately.
         *
         * Each row has already been converted by the middleware:
         *
         * departmentCode
         *      ↓
         * department ObjectId
         *
         * teamLeadEmployeeId
         *      ↓
         * manager ObjectId
         *
         * teamMemberEmployeeIds
         *      ↓
         * teamMembers ObjectId[]
         */
        for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            try {
                const project = await createProjectRecord({ data: row, createdBy: req.user._id });
                createdProjects.push(project);
            } catch (error) {
                errors.push({ row: index + 2, name: row.name, message: error.message || "Failed to create project." });
            }
        }
        // =====================================================
        // All rows failed
        // =====================================================
        if (createdProjects.length === 0) {
            return res.status(400).json({ success: false, message: "No projects were imported.", createdCount: 0, failedCount: errors.length, errors });
        }
        // =====================================================
        // Populate created projects
        // =====================================================
        const projectIds = createdProjects.map(project => project._id);
        const populatedProjects =
            await Project.find({ _id: { $in: projectIds } })
                .populate("department", "name code")
                .populate("manager", "name email employeeId role moduleAccess")
                .populate("teamMembers", "name email employeeId role")
                .populate("createdBy", "name");
        return res.status(201).json({
            success: true,
            message: errors.length > 0 ? "Excel import completed with some row errors." : "Excel import completed successfully.",
            createdCount: populatedProjects.length,
            failedCount: errors.length,
            projects: populatedProjects,
            errors
        });
    } catch (error) {
        console.error("Import Projects:", error);
        return res.status(500).json({ success: false, message: error.message || "Excel import failed." });
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
        if (isActive !== undefined) {
            query.isActive = isActive === "true";
        }
        if (status) {
            query.status = status;
        }
        if (priority) {
            query.priority = priority;
        }
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { projectCode: { $regex: search, $options: "i" } },
                { client: { $regex: search, $options: "i" } }
            ];
        }
        const role = String(user.role || "").toLowerCase();
        // ADMIN
        if (role === "admin") {
            if (department) { query.department = department; }
            if (manager) { query.manager = manager; }
        }
        // HR
        else if (role === "hr") {
            if (department) { query.department = department; }
            if (manager) { query.manager = manager; }
        }
        // MANAGER
        else if (role === "manager") {
            const departments = await Department.find({ headOf: user._id }).select("_id");

            const departmentIds = departments.map((department) => String(department._id));

            if (department) {
                if (!departmentIds.includes(String(department))) {
                    return res.status(403).json({ success: false, message: "You do not have access to this department." });
                }
                query.department = department;
            } else {
                query.department = { $in: departmentIds };
            }
            // Optional Team Lead filter.
            // Project.manager contains the assigned Team Lead.
            if (manager) {
                query.manager = manager;
            }
        }
        // TEAM LEAD
        else if (role === "team-lead") {
            query.manager = user._id;
        }
        // EMPLOYEE
        else {
            query.teamMembers = user._id;
        }
        const pageNumber = Math.max(Number(page) || 1, 1);
        const pageLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);

        const projects = await Project.find(query).populate("department", "name code headOf").populate("manager", "name email employeeId role moduleAccess").populate("teamMembers", "name email employeeId role").populate("createdBy", "name").sort({ createdAt: -1 }).skip((pageNumber - 1) * pageLimit).limit(pageLimit);
        const total = await Project.countDocuments(query);

        return res.status(200).json({
            success: true,
            count: projects.length,
            total,
            page: pageNumber,
            pages: Math.ceil(total / pageLimit),
            projects
        });
    } catch (error) {
        console.error("Get Projects:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

/* ============================================================
   GET SINGLE PROJECT
============================================================ */

const getProject = async (req, res) => {
    try {
        const project = await Project.findById(req.params.id)
            .populate("department", "name code description")
            .populate("manager", "name email employeeId role moduleAccess")
            .populate("teamMembers", "name email employeeId role")
            .populate("createdBy", "name email");

        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }
        return res.status(200).json({ success: true, project });
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

        const { name, projectCode, description, client, department, manager, teamMembers, moduleAccess, startDate, endDate, priority, status, budget, progress, attachments, isActive } = req.body;

        // =====================================================
        // Project code
        // =====================================================

        if (projectCode && projectCode.trim().toUpperCase() !== project.projectCode) {
            const existing = await Project.findOne({
                projectCode: projectCode.trim().toUpperCase(),
                _id: { $ne: id }
            });

            if (existing) {
                return res.status(400).json({ success: false, message: "Project code already exists." });
            }
            project.projectCode = projectCode.trim().toUpperCase();
        }
        // =====================================================
        // Department
        // =====================================================

        if (department) {
            const departmentExists = await Department.findById(department);

            if (!departmentExists) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Department not found."
                });
            }

            project.department =
                department;
        }

        const finalDepartment =
            department ||
            project.department;

        // =====================================================
        // Manager
        // =====================================================

        if (manager) {

            const managerExists =
                await User.findById(
                    manager
                );

            if (!managerExists) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Manager not found."
                });
            }

            if (!managerExists.isActive) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Manager must be active."
                });
            }

            if (
                !managerExists.department ||
                managerExists.department.toString() !==
                finalDepartment.toString()
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Manager must belong to the selected project department."
                });
            }

            project.manager =
                manager;

            const managerUpdate = {
                role: "team-lead"
            };

            if (
                moduleAccess !==
                undefined
            ) {
                managerUpdate.moduleAccess =
                    validateProjectModuleAccess(
                        moduleAccess
                    );
            }

            await User.findByIdAndUpdate(
                manager,
                {
                    $set:
                        managerUpdate
                },
                {
                    new: true,
                    runValidators: true
                }
            );
        }

        // =====================================================
        // Team members
        // =====================================================

        if (teamMembers !== undefined) {

            const memberIds =
                normalizeArray(
                    teamMembers
                );

            const uniqueMemberIds = [
                ...new Set(
                    memberIds.map(String)
                )
            ];

            const members =
                await User.find({
                    _id: {
                        $in:
                            uniqueMemberIds
                    },
                    isActive: true
                });

            if (
                members.length !==
                uniqueMemberIds.length
            ) {
                return res.status(404).json({
                    success: false,
                    message:
                        "One or more team members not found or inactive."
                });
            }

            const invalidMembers =
                members.filter(
                    member =>
                        !member.department ||
                        member.department.toString() !==
                        finalDepartment.toString()
                );

            if (
                invalidMembers.length
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "All team members must belong to the selected project department."
                });
            }

            project.teamMembers =
                members
                    .filter(
                        member =>
                            member._id.toString() !==
                            project.manager.toString()
                    )
                    .map(
                        member =>
                            member._id
                    );
        }

        // =====================================================
        // Dates
        // =====================================================

        const projectStart =
            startDate ||
            project.startDate;

        const projectEnd =
            endDate ||
            project.endDate;

        if (
            projectStart &&
            projectEnd &&
            new Date(projectStart) >
            new Date(projectEnd)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "End date must be after start date."
            });
        }

        // =====================================================
        // Other fields
        // =====================================================

        if (name !== undefined)
            project.name =
                String(name).trim();

        if (description !== undefined)
            project.description =
                description;

        if (client !== undefined)
            project.client =
                client;

        if (startDate !== undefined)
            project.startDate =
                startDate;

        if (endDate !== undefined)
            project.endDate =
                endDate;

        if (priority !== undefined)
            project.priority =
                priority;

        if (status !== undefined)
            project.status =
                status;

        if (budget !== undefined)
            project.budget =
                Number(budget);

        if (progress !== undefined)
            project.progress =
                Number(progress);

        if (attachments !== undefined)
            project.attachments =
                attachments;

        if (isActive !== undefined)
            project.isActive =
                isActive;

        await project.save();

        project =
            await Project.findById(id)
                .populate(
                    "department",
                    "name code"
                )
                .populate(
                    "manager",
                    "name email employeeId role moduleAccess"
                )
                .populate(
                    "teamMembers",
                    "name email employeeId role"
                )
                .populate(
                    "createdBy",
                    "name"
                );

        return res.status(200).json({
            success: true,
            message:
                "Project updated successfully.",
            project
        });

    } catch (error) {

        console.error(
            "Update Project:",
            error
        );

        return res.status(400).json({
            success: false,
            message:
                error.message ||
                "Server Error"
        });
    }
};

/* ============================================================
   DELETE PROJECT
============================================================ */

const deleteProject = async (
    req,
    res
) => {

    try {

        const {
            id
        } = req.params;

        const project =
            await Project.findById(id);

        if (!project) {
            return res.status(404).json({
                success: false,
                message:
                    "Project not found."
            });
        }

        await Project.findByIdAndDelete(
            id
        );

        return res.status(200).json({
            success: true,
            message:
                "Project deleted successfully."
        });

    } catch (error) {

        console.error(
            "Delete Project:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Server Error"
        });
    }
};

/* ============================================================
   ADD MEMBERS
============================================================ */

const addProjectMember = async (
    req,
    res
) => {

    try {

        const {
            id
        } = req.params;

        const {
            userIds
        } = req.body;

        if (
            !Array.isArray(userIds) ||
            userIds.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Please provide one or more user IDs."
            });
        }

        const project =
            await Project.findById(id);

        if (!project) {
            return res.status(404).json({
                success: false,
                message:
                    "Project not found."
            });
        }

        const users =
            await User.find({
                _id: {
                    $in:
                        userIds
                },
                department:
                    project.department,
                isActive: true
            });

        if (
            users.length !==
            userIds.length
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "All selected members must be active employees of the project department."
            });
        }

        const memberSet =
            new Set(
                project.teamMembers.map(
                    member =>
                        member.toString()
                )
            );

        users.forEach(
            user =>
                memberSet.add(
                    user._id.toString()
                )
        );

        // Never put project manager into teamMembers
        memberSet.delete(
            project.manager.toString()
        );

        project.teamMembers =
            [...memberSet];

        await project.save();

        const updatedProject =
            await Project.findById(
                project._id
            )
                .populate(
                    "department",
                    "name code"
                )
                .populate(
                    "manager",
                    "name email employeeId role moduleAccess"
                )
                .populate(
                    "teamMembers",
                    "name email employeeId"
                )
                .populate(
                    "createdBy",
                    "name"
                );

        return res.status(200).json({
            success: true,
            message:
                "Member(s) added successfully.",
            project:
                updatedProject
        });

    } catch (error) {

        console.error(
            "Add Project Member:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Server Error"
        });
    }
};

/* ============================================================
   REMOVE MEMBER
============================================================ */

const removeProjectMember = async (
    req,
    res
) => {

    try {

        const {
            id,
            userId
        } = req.params;

        const project =
            await Project.findById(id);

        if (!project) {
            return res.status(404).json({
                success: false,
                message:
                    "Project not found."
            });
        }

        const exists =
            project.teamMembers.some(
                member =>
                    member.toString() ===
                    userId
            );

        if (!exists) {
            return res.status(400).json({
                success: false,
                message:
                    "User is not a member of this project."
            });
        }

        project.teamMembers =
            project.teamMembers.filter(
                member =>
                    member.toString() !==
                    userId
            );

        await project.save();

        const updatedProject =
            await Project.findById(
                project._id
            )
                .populate(
                    "department",
                    "name code"
                )
                .populate(
                    "manager",
                    "name email employeeId"
                )
                .populate(
                    "teamMembers",
                    "name email employeeId"
                );

        return res.status(200).json({
            success: true,
            message:
                "Member removed successfully.",
            project:
                updatedProject
        });

    } catch (error) {

        console.error(
            "Remove Project Member:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Server Error"
        });
    }
};

/* ============================================================
   ARCHIVE / RESTORE
============================================================ */

const archiveProject = async (
    req,
    res
) => {

    try {

        const {
            id
        } = req.params;

        const project =
            await Project.findById(id);

        if (!project) {
            return res.status(404).json({
                success: false,
                message:
                    "Project not found."
            });
        }

        project.isActive =
            !project.isActive;

        await project.save();

        const updatedProject =
            await Project.findById(
                project._id
            )
                .populate(
                    "department",
                    "name code"
                )
                .populate(
                    "manager",
                    "name email employeeId"
                )
                .populate(
                    "teamMembers",
                    "name email employeeId"
                );

        return res.status(200).json({
            success: true,
            message:
                project.isActive
                    ? "Project restored successfully."
                    : "Project archived successfully.",
            project:
                updatedProject
        });

    } catch (error) {

        console.error(
            "Archive Project:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Server Error"
        });
    }
};
/**
 * ADD THESE INTO YOUR EXISTING controllers/projectController.js
 * ---------------------------------------------------------------
 * These three functions are new — they don't replace anything you already
 * have. Paste them in alongside your existing project controller functions
 * (they assume `Project`, `User`, and `Department` are already required at
 * the top of that file, the same way departmentController.js requires
 * them). Then add the three names to your existing module.exports.
 */

/**
 * @desc    Move a project to a different department
 * @route   PUT /api/projects/:projectId/department
 * @access  Private (Admin/Manager)
 * @body    { departmentId: "NEW_DEPARTMENT_ID" }
 *
 * IMPORTANT (spec section 17): department membership and project
 * membership are different concepts. This ONLY updates Project.department.
 * It deliberately never touches User.department for the manager or any
 * team member, and never removes team members automatically — a project's
 * members may belong to departments other than the project's own
 * department.
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

        const department = await Department.findById(departmentId);
        if (!department) {
            return res.status(404).json({ success: false, message: "Target department not found." });
        }

        project.department = departmentId;
        await project.save();

        const populated = await Project.findById(projectId)
            .populate("manager", "name employeeId email")
            .populate("teamMembers", "name employeeId email profilePicture")
            .populate("department", "name code");

        return res.status(200).json({
            success: true,
            message: "Project department updated successfully.",
            project: populated,
        });
    } catch (error) {
        console.error("Shift Project Department:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

/**
 * @desc    Add a team member to a project
 * @route   POST /api/projects/:projectId/team-members
 * @access  Private (Admin/Manager)
 * @body    { userId: "USER_ID" }
 */
const addProjectTeamMember = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ success: false, message: "userId is required." });
        }

        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }

        const user = await User.findById(userId).select("_id isActive");
        if (!user) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }
        if (!user.isActive) {
            return res.status(400).json({ success: false, message: "Employee must be active." });
        }

        const alreadyMember = project.teamMembers.some(
            (memberId) => String(memberId) === String(userId)
        );
        if (!alreadyMember) {
            project.teamMembers.push(userId);
            await project.save();
        }

        const populated = await Project.findById(projectId)
            .populate("manager", "name employeeId email")
            .populate("teamMembers", "name employeeId email profilePicture");

        return res.status(200).json({
            success: true,
            message: "Team member added successfully.",
            project: populated,
        });
    } catch (error) {
        console.error("Add Project Team Member:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

/**
 * @desc    Remove a team member from a project
 * @route   DELETE /api/projects/:projectId/team-members/:userId
 * @access  Private (Admin/Manager)
 */
const removeProjectTeamMember = async (req, res) => {
    try {
        const { projectId, userId } = req.params;

        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }

        project.teamMembers = project.teamMembers.filter(
            (memberId) => String(memberId) !== String(userId)
        );
        await project.save();

        const populated = await Project.findById(projectId)
            .populate("manager", "name employeeId email")
            .populate("teamMembers", "name employeeId email profilePicture");

        return res.status(200).json({
            success: true,
            message: "Team member removed successfully.",
            project: populated,
        });
    } catch (error) {
        console.error("Remove Project Team Member:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Add to your existing module.exports in projectController.js, e.g.:
//
// module.exports = {
//   ...yourExistingExports,
//   shiftProjectDepartment,
//   addProjectTeamMember,
//   removeProjectTeamMember,
// };

module.exports = {
    createProject,
    importProjects,
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

    // Exporting this is useful if another controller/service
    // needs the same creation logic.
    createProjectRecord
};