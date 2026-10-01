const Department = require("../models/Department");
const User = require("../models/User");
const Project = require("../models/Project");
const Task = require("../models/Task");
const { sanitizeModuleAccess } = require("../constants/modules");

const multer = require("multer");
const XLSX = require("xlsx");
/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */
// Safe percentage: returns 0 when the denominator is 0 instead of NaN/Infinity.
const pct = (numerator, denominator) => {
    if (!denominator) return 0;
    return Math.round((numerator / denominator) * 100);
};
// Overall score = average of only the metrics that actually have data
// (a department with 0 projects shouldn't drag its score down with a 0%).
const overallScore = (parts) => {
    const available = parts.filter((p) => p !== null && p !== undefined);
    if (!available.length) return 0;
    return Math.round(available.reduce((sum, v) => sum + v, 0) / available.length);
};

const PROJECT_STATUSES = ["planning", "in-progress", "on-hold", "completed", "cancelled"];
const PROJECT_STATUS_LABELS = { planning: "Planning", "in-progress": "In Progress", "on-hold": "On Hold", completed: "Completed", cancelled: "Cancelled", };
const TASK_STATUSES = ["not-started", "in-progress", "review", "completed", "cancelled"];
const TASK_STATUS_LABELS = { "not-started": "Not Started", "in-progress": "In Progress", review: "Review", completed: "Completed", cancelled: "Cancelled", };
// A manager can head multiple departments, so their User.department must
// never be touched by department-membership sync logic. This helper is the
// single source of truth for "is this user a manager" across create/update.
const isManagerRole = (role) => String(role || "").toLowerCase() === "manager";

/**
 * Bulk-assign a department to a set of users.
 *
 * Single source of truth for "user joins department" - used by
 * createDepartment, updateDepartment, and addDepartmentMember/addDepartmentEmployee.
 * Never touches User.role - role changes (e.g. promoting a department
 * head to "manager") are handled separately, deliberately, wherever
 * headOf is assigned.
 */
const assignUsersToDepartment = async (userIds, departmentId) => {
    if (!Array.isArray(userIds) || !userIds.length) return;
    await User.updateMany(
        { _id: { $in: userIds } },
        { $set: { department: departmentId } }
    );
};

/**
 * Bulk-remove a set of users from a department.
 *
 * Single source of truth for "user leaves department" - used by
 * updateDepartment and removeDepartmentMember/removeDepartmentEmployee.
 * Never touches User.role. Removing a normal employee from a department
 * must NOT change their role (employee/team-lead/sales/field_sales/hr/
 * admin all stay exactly as they were). Role changes for department
 * heads are handled separately in updateDepartment's head-change block.
 */
const removeUsersFromDepartment = async (userIds, departmentId) => {
    if (!Array.isArray(userIds) || !userIds.length) return;
    await User.updateMany(
        { _id: { $in: userIds }, department: departmentId },
        { $set: { department: null } }
    );
};

/* ------------------------------------------------------------------ */
/* Stats helpers for the redesigned Department Details page            */
/* IMPORTANT: Task.assignees is [{ user, status, progress, actualHours }] */
/* — never task.assignedTo. Every lookup below inspects assignees[].user */
/* ------------------------------------------------------------------ */

const buildEmployeeTaskStats = (employees, tasks) => {
    const statsMap = {};
    employees.forEach((emp) => {
        const employeeId = String(emp._id);

        const assignedTasks = tasks.filter((task) =>
            Array.isArray(task.assignees) &&
            task.assignees.some(
                (assignee) => String(assignee.user?._id || assignee.user) === employeeId
            )
        );

        const totalTasks = assignedTasks.length;
        const completedTasks = assignedTasks.filter((t) => t.status === "completed").length;
        const inProgressTasks = assignedTasks.filter((t) => t.status === "in-progress").length;
        const pendingTasks = assignedTasks.filter((t) => t.status === "not-started").length;
        const reviewTasks = assignedTasks.filter((t) => t.status === "review").length;
        const cancelledTasks = assignedTasks.filter((t) => t.status === "cancelled").length;

        statsMap[employeeId] = {
            totalTasks,
            completedTasks,
            inProgressTasks,
            pendingTasks,
            reviewTasks,
            cancelledTasks,
            completionPercentage: pct(completedTasks, totalTasks),
        };
    });
    return statsMap;
};

// Project membership = manager OR teamMembers. An employee's personal
// department (User.department) is a different concept from project
// membership and is never used here.
const buildEmployeeProjectStats = (employees, projects) => {
    const statsMap = {};
    employees.forEach((emp) => {
        const employeeId = String(emp._id);

        const involvedProjects = projects.filter((project) => {
            const managerId = project.manager?._id
                ? String(project.manager._id)
                : String(project.manager || "");
            const isManager = managerId === employeeId;
            const isMember =
                Array.isArray(project.teamMembers) &&
                project.teamMembers.some((m) => String(m?._id || m) === employeeId);
            return isManager || isMember;
        });

        statsMap[employeeId] = { totalProjects: involvedProjects.length };
    });
    return statsMap;
};

const buildProjectStats = (projects) => {
    const stats = {
        totalProjects: projects.length,
        planningProjects: 0,
        inProgressProjects: 0,
        onHoldProjects: 0,
        completedProjects: 0,
        cancelledProjects: 0,
    };

    projects.forEach((p) => {
        if (p.status === "planning") stats.planningProjects++;
        else if (p.status === "in-progress") stats.inProgressProjects++;
        else if (p.status === "on-hold") stats.onHoldProjects++;
        else if (p.status === "completed") stats.completedProjects++;
        else if (p.status === "cancelled") stats.cancelledProjects++;
    });

    stats.activeProjects = stats.planningProjects + stats.inProgressProjects;
    return stats;
};

// "Due soon" = open task (not completed/cancelled) whose deadline falls
// within the next 3 days. Chosen since the spec didn't pin an exact
// window; adjust DUE_SOON_WINDOW_MS if the product wants a different one.
const DUE_SOON_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const buildTaskStats = (tasks) => {
    const now = new Date();

    const stats = {
        totalTasks: tasks.length,
        notStartedTasks: 0,
        inProgressTasks: 0,
        reviewTasks: 0,
        completedTasks: 0,
        cancelledTasks: 0,
        overdueTasks: 0,
        dueSoonTasks: 0,
        estimatedHours: 0,
        actualHours: 0,
    };

    let progressSum = 0;

    tasks.forEach((t) => {
        if (t.status === "not-started") stats.notStartedTasks++;
        else if (t.status === "in-progress") stats.inProgressTasks++;
        else if (t.status === "review") stats.reviewTasks++;
        else if (t.status === "completed") stats.completedTasks++;
        else if (t.status === "cancelled") stats.cancelledTasks++;

        stats.estimatedHours += Number(t.estimatedHours) || 0;
        stats.actualHours += Number(t.actualHours) || 0;
        progressSum += Number(t.progress) || 0;

        // Overdue / due-soon: compare against deadline, only for open tasks.
        const isOpen = t.status !== "completed" && t.status !== "cancelled";
        if (isOpen && t.deadline) {
            const deadline = new Date(t.deadline);
            if (!Number.isNaN(deadline.getTime())) {
                const diffMs = deadline.getTime() - now.getTime();
                if (diffMs < 0) stats.overdueTasks++;
                else if (diffMs <= DUE_SOON_WINDOW_MS) stats.dueSoonTasks++;
            }
        }
    });

    stats.pendingTasks = stats.notStartedTasks;
    stats.averageProgress = tasks.length ? Math.round(progressSum / tasks.length) : 0;
    stats.completionRate = pct(stats.completedTasks, stats.totalTasks);

    return stats;
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = [".xlsx", ".xls"];
        const extension = require("path")
            .extname(file.originalname)
            .toLowerCase();

        if (!allowedExtensions.includes(extension)) {
            return cb(
                new Error("Only .xlsx and .xls Excel files are allowed.")
            );
        }

        cb(null, true);
    },
});

const importDepartments = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please upload an Excel file.",
            });
        }

        const workbook = XLSX.read(req.file.buffer, {
            type: "buffer",
        });

        const sheetName = workbook.SheetNames[0];

        if (!sheetName) {
            return res.status(400).json({
                success: false,
                message: "Excel file does not contain a worksheet.",
            });
        }

        const worksheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json(worksheet, {
            defval: "",
            raw: false,
        });

        if (!rows.length) {
            return res.status(400).json({
                success: false,
                message: "Excel file is empty.",
            });
        }

        const results = {
            total: rows.length,
            created: 0,
            failed: 0,
            errors: [],
        };

        for (let index = 0; index < rows.length; index++) {
            const row = rows[index];

            const rowNumber = index + 2;

            try {
                const name = String(
                    row["Department Name"] || ""
                ).trim();

                const code = String(
                    row["Department Code"] || ""
                ).trim().toUpperCase();

                const description = String(
                    row["Description"] || ""
                ).trim();

                const status = String(
                    row["Status"] || "active"
                ).trim().toLowerCase();

                const headEmployeeId = String(
                    row["Head Employee ID"] || ""
                ).trim();

                const parentCode = String(
                    row["Parent Department Code"] || ""
                ).trim().toUpperCase();

                const memberEmployeeIds = String(
                    row["Member Employee IDs"] || ""
                )
                    .split(",")
                    .map((id) => id.trim())
                    .filter(Boolean);

                // ---------------------------------------------
                // Required fields
                // ---------------------------------------------

                if (!name) {
                    throw new Error(
                        "Department Name is required."
                    );
                }

                if (!["active", "inactive"].includes(status)) {
                    throw new Error(
                        "Status must be active or inactive."
                    );
                }

                // ---------------------------------------------
                // Duplicate department name
                // ---------------------------------------------

                const existingName = await Department.findOne({
                    name,
                });

                if (existingName) {
                    throw new Error(
                        `Department "${name}" already exists.`
                    );
                }

                // ---------------------------------------------
                // Department code
                // ---------------------------------------------

                if (code) {
                    const existingCode =
                        await Department.findOne({ code });

                    if (existingCode) {
                        throw new Error(
                            `Department code "${code}" already exists.`
                        );
                    }
                }

                // ---------------------------------------------
                // Find department head
                // ---------------------------------------------

                let departmentHead = null;

                if (headEmployeeId) {
                    departmentHead = await User.findOne({
                        employeeId: headEmployeeId,
                    }).select(
                        "_id name email employeeId role isActive department"
                    );

                    if (!departmentHead) {
                        throw new Error(
                            `Head employee "${headEmployeeId}" was not found.`
                        );
                    }

                    if (!departmentHead.isActive) {
                        throw new Error(
                            `Head employee "${headEmployeeId}" is inactive.`
                        );
                    }
                }

                // ---------------------------------------------
                // Find parent department
                // ---------------------------------------------

                let parentDepartment = null;

                if (parentCode) {
                    parentDepartment =
                        await Department.findOne({
                            code: parentCode,
                        });

                    if (!parentDepartment) {
                        throw new Error(
                            `Parent department "${parentCode}" was not found.`
                        );
                    }
                }

                // ---------------------------------------------
                // Find members
                // ---------------------------------------------

                let memberUsers = [];

                if (memberEmployeeIds.length) {
                    memberUsers = await User.find({
                        employeeId: {
                            $in: memberEmployeeIds,
                        },
                        isActive: true,
                    }).select(
                        "_id name employeeId role department isActive"
                    );

                    if (
                        memberUsers.length !==
                        memberEmployeeIds.length
                    ) {
                        const foundIds = new Set(
                            memberUsers.map(
                                (user) => user.employeeId
                            )
                        );

                        const missingIds =
                            memberEmployeeIds.filter(
                                (employeeId) =>
                                    !foundIds.has(employeeId)
                            );

                        throw new Error(
                            `Member employee(s) not found or inactive: ${missingIds.join(", ")}`
                        );
                    }
                }

                // ---------------------------------------------
                // Remove head from normal members
                // ---------------------------------------------

                const headId = departmentHead
                    ? String(departmentHead._id)
                    : null;

                const normalMembers =
                    memberUsers.filter(
                        (user) =>
                            String(user._id) !== headId
                    );

                // ---------------------------------------------
                // Validate department conflicts
                // ---------------------------------------------

                const conflictingMembers =
                    normalMembers.filter(
                        (user) =>
                            !isManagerRole(user.role) &&
                            user.department
                    );

                if (conflictingMembers.length) {
                    throw new Error(
                        `Employee(s) already belong to another department: ${conflictingMembers
                            .map((user) => user.employeeId)
                            .join(", ")}`
                    );
                }

                // ---------------------------------------------
                // Create department
                // ---------------------------------------------

                const department =
                    await Department.create({
                        name,
                        ...(code ? { code } : {}),
                        description,
                        status,
                        headOf:
                            departmentHead?._id || null,
                        parentDepartment:
                            parentDepartment?._id || null,
                        createdBy: req.user._id,
                    });

                // ---------------------------------------------
                // Promote head
                // ---------------------------------------------

                if (departmentHead) {
                    await User.findByIdAndUpdate(
                        departmentHead._id,
                        {
                            $set: {
                                role: "manager",
                            },
                        },
                        {
                            runValidators: true,
                        }
                    );
                }

                // ---------------------------------------------
                // Assign normal members
                // ---------------------------------------------

                const normalMemberIds =
                    normalMembers
                        .filter(
                            (user) =>
                                !isManagerRole(user.role)
                        )
                        .map((user) => user._id);

                await assignUsersToDepartment(
                    normalMemberIds,
                    department._id
                );

                results.created++;

            } catch (rowError) {
                results.failed++;

                results.errors.push({
                    row: rowNumber,
                    department:
                        row["Department Name"] || "",
                    code:
                        row["Department Code"] || "",
                    message: rowError.message,
                });
            }
        }

        return res.status(200).json({
            success: true,
            message:
                results.failed > 0
                    ? "Department import completed with some errors."
                    : "All departments imported successfully.",
            summary: {
                total: results.total,
                created: results.created,
                failed: results.failed,
            },
            errors: results.errors,
        });

    } catch (error) {
        console.error(
            "Import Departments:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to import departments.",
        });
    }
};

const exportDepartments = async (req, res) => {
    try {
        const departments =
            await Department.find({})
                .populate(
                    "headOf",
                    "employeeId name"
                )
                .populate(
                    "parentDepartment",
                    "code name"
                )
                .sort({ createdAt: -1 });

        const departmentIds =
            departments.map((department) => department._id);

        const members = await User.find({
            department: {
                $in: departmentIds,
            },
        }).select(
            "employeeId department"
        );

        const membersByDepartment = new Map();

        members.forEach((member) => {
            const departmentId =
                String(member.department);

            if (!membersByDepartment.has(departmentId)) {
                membersByDepartment.set(
                    departmentId,
                    []
                );
            }

            membersByDepartment
                .get(departmentId)
                .push(member.employeeId);
        });

        const rows = departments.map((department) => {
            const departmentId =
                String(department._id);

            return {
                "Department Name":
                    department.name || "",

                "Department Code":
                    department.code || "",

                "Description":
                    department.description || "",

                "Status":
                    department.status || "active",

                "Head Employee ID":
                    department.headOf?.employeeId || "",

                "Head Name":
                    department.headOf?.name || "",

                "Parent Department Code":
                    department.parentDepartment?.code || "",

                "Parent Department Name":
                    department.parentDepartment?.name || "",

                "Member Employee IDs":
                    (
                        membersByDepartment.get(
                            departmentId
                        ) || []
                    ).join(","),
            };
        });

        const worksheet =
            XLSX.utils.json_to_sheet(rows);

        const workbook =
            XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Departments"
        );

        worksheet["!cols"] = [
            { wch: 25 },
            { wch: 18 },
            { wch: 35 },
            { wch: 12 },
            { wch: 20 },
            { wch: 25 },
            { wch: 25 },
            { wch: 25 },
            { wch: 50 },
        ];

        const buffer =
            XLSX.write(workbook, {
                type: "buffer",
                bookType: "xlsx",
            });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        res.setHeader(
            "Content-Disposition",
            'attachment; filename="departments.xlsx"'
        );

        return res.send(buffer);

    } catch (error) {
        console.error(
            "Export Departments:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to export departments.",
        });
    }
};

/**
 * @desc    Create Department
 * @route   POST /api/departments
 * @access  Private (Admin)
 */
const createDepartment = async (req, res) => {
    try {
        const { name, code, description, headOf, parentDepartment, email, phone, icon, budget, status, members, moduleAccess, } = req.body;
        // =========================
        // 1. Validate department name
        // =========================
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Department name required.", });
        }
        // =========================
        // 2. Duplicate department name
        // =========================
        const existingDepartment = await Department.findOne({ name: name.trim(), });
        if (existingDepartment) {
            return res.status(400).json({ success: false, message: "Department name already exists.", });
        }
        // =========================
        // 3. Duplicate department code
        // =========================
        let normalizedCode = null;
        if (code) {
            normalizedCode = code.trim().toUpperCase();
            const existingCode = await Department.findOne({ code: normalizedCode, });
            if (existingCode) {
                return res.status(400).json({ success: false, message: "Department code already exists.", });
            }
        }
        // =========================
        // 4. Validate Department Head
        // =========================
        let departmentHead = null;
        if (headOf) {
            departmentHead = await User.findById(headOf).select("_id name email employeeId role isActive");

            if (!departmentHead) {
                return res.status(404).json({ success: false, message: "Department head not found.", });
            }
            if (!departmentHead.isActive) {
                return res.status(400).json({ success: false, message: "Department head must be an active employee.", });
            }
        }
        // =========================
        // 5. Sanitize manager permissions
        // =========================
        const sanitizedModuleAccess = sanitizeModuleAccess(moduleAccess);
        // =========================
        // 6. Validate Parent Department
        // =========================
        if (parentDepartment) {
            const parent = await Department.findById(parentDepartment);
            if (!parent) {
                return res.status(404).json({ success: false, message: "Parent department not found.", });
            }
        }
        // =========================
        // 7. Validate selected NORMAL members (head handled separately above)
        // =========================
        //
        // A manager can be head of multiple departments, so managers are
        // exempt from the "already belongs to another department" check
        // (they aren't tracked via User.department in the first place).
        // Normal employees, however, must not already belong to another
        // department - we do NOT silently move them.
        //
        const headIdStr = headOf ? String(headOf) : null;
        const normalMemberIds = [...new Set((Array.isArray(members) ? members : []).filter(Boolean).map(String)),].filter((id) => id !== headIdStr);

        let normalMemberUsers = [];
        if (normalMemberIds.length) {
            normalMemberUsers = await User.find({ _id: { $in: normalMemberIds }, isActive: true, }).select("_id name email employeeId role isActive department");
            // =====================================================
            // Make sure every ID exists and is active
            // =====================================================
            if (normalMemberUsers.length !== normalMemberIds.length) {
                return res.status(404).json({ success: false, message: "One or more department members were not found or are inactive." });
            }
            // =====================================================
            // Normal employees must not already belong to another
            // department. Managers are exempt (they can be members/
            // heads of several departments simultaneously).
            // =====================================================
            const alreadyAssigned = normalMemberUsers.some((user) => !isManagerRole(user.role) && user.department);

            if (alreadyAssigned) {
                return res.status(400).json({ success: false, message: "One or more selected employees already belong to another department.", });
            }
        }
        // =========================
        // 8. Create Department
        // =========================
        const department = await Department.create({
            name: name.trim(),
            ...(normalizedCode ? { code: normalizedCode } : {}),
            description,
            headOf: headOf || null,
            parentDepartment: parentDepartment || null,
            email,
            phone,
            icon,
            budget,
            status,
            createdBy: req.user._id,
        });
        // =========================
        // 9. Promote Department Head
        // =========================
        //
        // NOTE: The head's User.department is intentionally left
        // untouched. A manager can be Head of multiple departments,
        // and headship is tracked via Department.headOf - never via
        // User.department.
        //
        if (headOf) {
            await User.findByIdAndUpdate(headOf, { $set: { role: "manager", moduleAccess: sanitizedModuleAccess, }, }, { new: true, runValidators: true, });
        }
        // =========================
        // 10. Assign NORMAL MEMBERS only
        // =========================
        //
        // The department head is deliberately excluded here (see note
        // above). Any selected member who turns out to already be a
        // manager is also excluded, since managers don't use
        // User.department to represent department membership.
        //
        // Uses the shared assignUsersToDepartment helper - the single
        // source of truth for "user joins department", also used by
        // updateDepartment and addDepartmentMember.
        //
        const normalMembersToAssign = normalMemberUsers.filter((user) => !isManagerRole(user.role)).map((user) => user._id);
        await assignUsersToDepartment(normalMembersToAssign, department._id);
        // =========================
        // 11. Get populated department
        // =========================
        const [populatedDepartment, populatedMembers] = await Promise.all([
            Department.findById(department._id)
                .populate(
                    "headOf",
                    "name email employeeId role designation isActive moduleAccess"
                )
                .populate("parentDepartment", "name code")
                .populate("createdBy", "name"),

            User.find({
                department: department._id,
                isActive: true,
            }).select(
                "_id employeeId name email role designation profilePicture isActive joiningDate department moduleAccess"
            ),
        ]);

        return res.status(201).json({
            success: true,
            message: "Department created successfully.",
            department: {
                ...populatedDepartment.toObject(),
                populatedMembers,
            },
        });
    } catch (error) {
        console.error("Create Department:", error);
        return res.status(500).json({ success: false, message: "Server Error", });
    }
};
/**
 * @desc    Get All Departments
 * @route   GET /api/departments
 * @access  Private
 */
const getDepartments = async (req, res) => {
    try {
        const {
            search,
            status,
            project,
            manager,
            employee,
            page = 1,
            limit = 10,
        } = req.query;

        const query = {};

        // ---------------------------------------------------------
        // Basic Department filters
        // ---------------------------------------------------------

        if (status) {
            query.status = status;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i", }, },
                { code: { $regex: search, $options: "i", }, },
                { email: { $regex: search, $options: "i", }, },
            ];
        }

        // ---------------------------------------------------------
        // Role-based visibility
        // ---------------------------------------------------------

        const user = req.user;
        if (user) {
            const role = String(user.role || "").toLowerCase();
            if (role === "manager") {
                // Manager can only see departments
                // where they are the head.
                query.headOf = user._id;
            } else if (role === "team-lead" || role === "employee") {
                // Lower roles only see their
                // assigned department.
                query._id = user.department || null;
            }
        }

        // ---------------------------------------------------------
        // Manager filter
        // ---------------------------------------------------------
        //
        // Department.headOf = Manager
        //
        // So:
        // manager=<employeeId>
        //
        // becomes:
        //
        // department.headOf = employeeId
        //

        if (manager) {
            query.headOf = manager;
        }
        // ---------------------------------------------------------
        // Project filter
        // ---------------------------------------------------------
        //
        // Project.department = Department
        //
        // Find the department(s) containing this project.
        //
        if (project) {
            const projectDoc = await Project.findById(project).select("department");
            if (!projectDoc) {
                return res.status(200).json({ success: true, count: 0, total: 0, page: Number(page), pages: 0, departments: [], });
            }
            query._id = projectDoc.department;
        }

        // ---------------------------------------------------------
        // Employee filter
        // ---------------------------------------------------------
        //
        // Employee.department = Department
        //
        // Find the employee's department.
        //

        if (employee) {
            const employeeDoc = await User.findById(employee).select("department");

            if (
                !employeeDoc ||
                !employeeDoc.department
            ) {
                return res.status(200).json({
                    success: true,
                    count: 0,
                    total: 0,
                    page: Number(page),
                    pages: 0,
                    departments: [],
                });
            }
            query._id = employeeDoc.department;
        }

        // ---------------------------------------------------------
        // Pagination
        // ---------------------------------------------------------

        const pageNumber =
            Math.max(Number(page) || 1, 1);

        const pageLimit =
            Math.min(
                Math.max(Number(limit) || 10, 1),
                100
            );

        // ---------------------------------------------------------
        // Query
        // ---------------------------------------------------------
        const departments = await Department.find(query).populate("headOf", "name email employeeId role").populate("parentDepartment", "name code").populate("createdBy", "name").sort({ createdAt: -1, }).skip((pageNumber - 1) * pageLimit).limit(pageLimit);
        const total = await Department.countDocuments(query);
        return res.status(200).json({ success: true, count: departments.length, total, page: pageNumber, pages: Math.ceil(total / pageLimit), departments, });
    } catch (error) {
        console.error("Get Departments:", error);
        return res.status(500).json({ success: false, message: "Server Error", });
    }
};
/**
 * @desc    Get Single Department (redesigned Department Details page)
 * @route   GET /api/departments/:id
 * @access  Private
 *
 * Returns everything both the Analysis tab and the Employee Management
 * tab need in a single call, so the frontend never re-fetches the same
 * department repeatedly for individual cards.
 */
const getDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        // =========================
        // Department + Employees + Projects + Tasks (independent queries -> parallel)
        // =========================
        const [department, employees, projects, tasks] = await Promise.all([
            Department.findById(id)
                .populate("headOf", "name email employeeId role designation profilePicture")
                .populate("parentDepartment", "name code")
                .populate("createdBy", "name")
                .populate("leadPositions.user", "name email employeeId role designation profilePicture"),
            User.find({ department: id }).select("employeeId name email role designation profilePicture isActive joiningDate"),
            Project.find({ department: id })
                .populate("manager", "name employeeId email")
                .populate("teamMembers", "name employeeId email profilePicture")
                .select("projectCode name status priority progress manager teamMembers department startDate endDate"),
            // NOTE: completedDate/estimatedHours/actualHours are selected — required
            // for Monthly Productivity + Task Analysis. These fields already exist
            // on the Task schema (no migration needed), they just weren't returned
            // to the client before.
            // NEVER populate "assignedTo" — the Task schema uses assignees[].user.
            Task.find({ department: id })
                .populate("assignees.user", "name employeeId email role designation profilePicture")
                .populate("project", "name projectCode")
                .select("taskCode title priority deadline status assignees project progress completedDate estimatedHours actualHours department"),
        ]);
        if (!department) {
            return res.status(404).json({ success: false, message: "Department not found", });
        }
        // =========================
        // Legacy analytics (unchanged shape — kept for any other consumers
        // of this endpoint that already depend on it)
        // =========================
        const analytics = {
            totalEmployees: employees.length,
            activeEmployees: employees.filter(e => e.isActive === true).length,
            totalProjects: projects.length,
            completedProjects: projects.filter(p => p.status === "completed").length,
            activeProjects: projects.filter(p => p.status === "planning" || p.status === "in-progress").length,
            totalTasks: tasks.length,
            completedTasks: tasks.filter(t => t.status === "completed").length,
            inProgressTasks: tasks.filter(t => t.status === "in-progress").length,
            pendingTasks: tasks.filter(t => t.status === "not-started").length,
            reviewTasks: tasks.filter(t => t.status === "review").length,
            cancelledTasks: tasks.filter(t => t.status === "cancelled").length,
        };
        analytics.completionRate = analytics.totalTasks === 0 ? 0 : Math.round((analytics.completedTasks / analytics.totalTasks) * 100);
        const employeePerformance = pct(analytics.activeEmployees, analytics.totalEmployees);
        const projectPerformance = pct(analytics.completedProjects, analytics.totalProjects);
        const taskPerformance = pct(analytics.completedTasks, analytics.totalTasks);
        analytics.departmentPerformance = [
            { name: "Employees", value: employeePerformance },
            { name: "Projects", value: projectPerformance },
            { name: "Tasks", value: taskPerformance },
            {
                name: "Overall",
                value: overallScore([
                    analytics.totalEmployees > 0 ? employeePerformance : null,
                    analytics.totalProjects > 0 ? projectPerformance : null,
                    analytics.totalTasks > 0 ? taskPerformance : null,
                ]),
            },
        ];
        analytics.taskStatus = TASK_STATUSES.map((statusKey) => ({ name: TASK_STATUS_LABELS[statusKey], value: tasks.filter((t) => t.status === statusKey).length, }));
        analytics.projectDistribution = PROJECT_STATUSES.map((statusKey) => ({ name: PROJECT_STATUS_LABELS[statusKey], value: projects.filter((p) => p.status === statusKey).length, }));
        analytics.employeeDistribution = [{ name: "Active", value: analytics.activeEmployees }, { name: "Inactive", value: analytics.totalEmployees - analytics.activeEmployees },];
        const monthlyBuckets = {};
        tasks.forEach((t) => {
            if (t.status !== "completed" || !t.completedDate) return;
            const d = new Date(t.completedDate);
            if (Number.isNaN(d.getTime())) return;
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            monthlyBuckets[key] = (monthlyBuckets[key] || 0) + 1;
        });
        analytics.monthlyProductivity = Object.keys(monthlyBuckets).sort().map((key) => {
            const [year, month] = key.split("-");
            const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
            return { month: label, completed: monthlyBuckets[key] };
        });
        const [allDepartments, employeeAgg, projectAgg, taskAgg] = await Promise.all([
            Department.find().select("name"),
            User.aggregate([
                { $match: { department: { $ne: null } } },
                { $group: { _id: "$department", total: { $sum: 1 }, active: { $sum: { $cond: ["$isActive", 1, 0] } }, }, },
            ]),
            Project.aggregate([
                { $match: { department: { $ne: null } } },
                { $group: { _id: "$department", total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } }, }, },
            ]),
            Task.aggregate([
                { $match: { department: { $ne: null } } },
                { $group: { _id: "$department", total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } }, }, },
            ]),
        ]);
        const employeeMap = new Map(employeeAgg.map((e) => [e._id.toString(), e]));
        const projectMap = new Map(projectAgg.map((p) => [p._id.toString(), p]));
        const taskMap = new Map(taskAgg.map((t) => [t._id.toString(), t]));
        analytics.topPerformingDepartments = allDepartments.map((dept) => {
            const key = dept._id.toString();
            const e = employeeMap.get(key) || { total: 0, active: 0 };
            const p = projectMap.get(key) || { total: 0, completed: 0 };
            const t = taskMap.get(key) || { total: 0, completed: 0 };
            const ePerf = pct(e.active, e.total);
            const pPerf = pct(p.completed, p.total);
            const tPerf = pct(t.completed, t.total);
            return {
                departmentId: dept._id,
                name: dept.name,
                performance: overallScore([
                    e.total > 0 ? ePerf : null,
                    p.total > 0 ? pPerf : null,
                    t.total > 0 ? tPerf : null,
                ]),
            };
        }).sort((a, b) => b.performance - a.performance).slice(0, 5);

        // =========================
        // NEW: granular stats for the redesigned Analysis + Employee
        // Management tabs.
        // =========================
        const employeeTaskStats = buildEmployeeTaskStats(employees, tasks);
        const employeeProjectStats = buildEmployeeProjectStats(employees, projects);
        const projectStats = buildProjectStats(projects);
        const taskStats = buildTaskStats(tasks);

        // =========================
        // Response
        // =========================
        return res.status(200).json({
            success: true,
            department,
            analytics,
            employees,
            projects,
            tasks,
            employeeTaskStats,
            employeeProjectStats,
            projectStats,
            taskStats,
            leadPositions: department.leadPositions || [],
            // No activity-log collection exists yet in this codebase — kept
            // empty rather than fabricated, per spec section 4E / 18.
            recentActivity: [],
        });
    } catch (error) {
        console.error("Get Department:", error);
        return res.status(500).json({ success: false, message: "Server Error", });
    }
};
/**
 * @desc    Update Department
 * @route   PUT /api/departments/:id
 * @access  Private (Admin)
 */
const updateDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        let department = await Department.findById(id);
        if (!department) {
            return res.status(404).json({ success: false, message: "Department not found.", });
        }
        if (!department.createdBy) {
            return res.status(400).json({ success: false, message: "This department is missing createdBy information." });
        }
        const { name, code, description, headOf, parentDepartment, email, phone, icon, budget, status, members, moduleAccess, } = req.body;
        // =====================================================
        // 1. Duplicate department name
        // =====================================================
        if (name && name.trim() !== department.name) {
            const existing = await Department.findOne({ name: name.trim(), _id: { $ne: id }, });
            if (existing) {
                return res.status(400).json({ success: false, message: "Department name already exists.", });
            }
            department.name = name.trim();
        }
        // =====================================================
        // 2. Duplicate department code
        // =====================================================
        if (code) {
            const normalizedCode = code.trim().toUpperCase();
            if (normalizedCode !== department.code) {
                const existing = await Department.findOne({ code: normalizedCode, _id: { $ne: id }, });
                if (existing) {
                    return res.status(400).json({ success: false, message: "Department code already exists.", });
                }
                department.code = normalizedCode;
            }
        }
        // =====================================================
        // 3. Validate new Department Head
        // =====================================================
        let newDepartmentHead = null;
        if (headOf !== undefined && headOf !== null && headOf !== "") {
            newDepartmentHead = await User.findById(headOf).select("_id name email employeeId role isActive");
            if (!newDepartmentHead) {
                return res.status(404).json({ success: false, message: "Department head not found.", });
            }
            if (!newDepartmentHead.isActive) {
                return res.status(400).json({ success: false, message: "Department head must be an active employee.", });
            }
        }
        // =====================================================
        // 4. Validate parent department
        // =====================================================
        if (parentDepartment) {
            if (String(parentDepartment) === String(id)) {
                return res.status(400).json({ success: false, message: "Department cannot be its own parent.", });
            }

            const parent = await Department.findById(parentDepartment);
            if (!parent) {
                return res.status(404).json({ success: false, message: "Parent department not found.", });
            }
            department.parentDepartment = parentDepartment;
        }
        // =====================================================
        // 5. Sanitize manager module access
        // =====================================================
        const sanitizedModuleAccess = sanitizeModuleAccess(moduleAccess);
        // =====================================================
        // 6. Other department fields
        // =====================================================
        if (description !== undefined) department.description = description;
        if (email !== undefined) department.email = email;
        if (phone !== undefined) department.phone = phone;
        if (icon !== undefined) department.icon = icon;
        if (budget !== undefined) department.budget = budget;
        if (status !== undefined) department.status = status;
        // =====================================================
        // 7. Handle Department Head change
        // =====================================================
        //
        // This is the ONLY place updateDepartment ever changes a
        // User.role. Normal member add/remove (step 8 below) never
        // touches role - it only touches User.department.
        // =====================================================
        const oldHeadId = department.headOf ? String(department.headOf) : null;
        const newHeadId = headOf ? String(headOf) : null;
        // -----------------------------------------------------
        // Head changed
        // -----------------------------------------------------
        if (oldHeadId !== newHeadId) {
            // Remove old manager role only if
            // the old head is no longer head of
            // another department.
            if (oldHeadId) {
                const otherDepartment = await Department.findOne({ _id: { $ne: id, }, headOf: oldHeadId, });
                if (!otherDepartment) {
                    await User.findByIdAndUpdate(
                        oldHeadId,
                        { $set: { role: "employee", moduleAccess: [], }, },
                        { runValidators: true, }
                    );
                }
            }
            // Promote new head
            if (newHeadId) {
                await User.findByIdAndUpdate(newHeadId,
                    { $set: { role: "manager", moduleAccess: sanitizedModuleAccess, }, },
                    { runValidators: true, }
                );
            }
            department.headOf = headOf || null;
        }
        // -----------------------------------------------------
        // Head did not change
        // -----------------------------------------------------
        else if (newHeadId) {
            // Update manager permissions
            // even when the same manager remains.
            await User.findByIdAndUpdate(
                newHeadId,
                { $set: { role: "manager", moduleAccess: sanitizedModuleAccess, }, },
                { runValidators: true, }
            );
        }
        // =====================================================
        // 8. Synchronize Department Members
        // =====================================================
        //
        // Department.members does NOT exist on the schema. User.department
        // is the ONLY source of truth for membership. We diff the CURRENT
        // members - queried live from User - against the incoming desired
        // membership (req.body.members), then apply the diff through
        // assignUsersToDepartment / removeUsersFromDepartment - the exact
        // same helpers used by createDepartment and by the standalone
        // addDepartmentMember / removeDepartmentMember endpoints. There is
        // exactly one place in the codebase that sets User.department to a
        // value, and exactly one place that nulls it out.
        //
        // Neither helper touches User.role. Role changes are handled
        // entirely by the head-change block in step 7 above. Normal
        // members keep whatever role they already had - we never downgrade
        // employee/team-lead/sales/field_sales/hr/admin just because a
        // department membership changed.
        //
        // The department head (old or new) is excluded from both sides of
        // the diff - a manager can head multiple departments, and headship
        // is tracked exclusively via Department.headOf, never via
        // User.department.
        // =====================================================
        if (Array.isArray(members) || headOf !== undefined) {
            // Desired membership from the frontend
            let nextMemberIds = Array.isArray(members)
                ? [...new Set(members.filter(Boolean).map(String))]
                : [];

            if (newHeadId && !nextMemberIds.includes(newHeadId)) {
                nextMemberIds.push(newHeadId);
            }

            // Current membership - queried live from User, never from
            // department.members (which does not exist on the schema).
            const currentMembers = await User.find({
                department: department._id,
            }).select("_id role department");
            const currentMemberIds = currentMembers.map((user) => String(user._id));

            // Validate every incoming, non-head ID exists and is active
            const incomingNonHeadIds = nextMemberIds.filter((uid) => uid !== newHeadId);

            let incomingUsers = [];
            if (incomingNonHeadIds.length) {
                incomingUsers = await User.find({
                    _id: { $in: incomingNonHeadIds },
                    isActive: true,
                }).select("_id role department");

                if (incomingUsers.length !== incomingNonHeadIds.length) {
                    return res.status(404).json({
                        success: false,
                        message: "One or more department members were not found or are inactive.",
                    });
                }
            }
            const userMap = new Map(incomingUsers.map((user) => [String(user._id), user]));

            // =====================================================
            // Members to ADD / REMOVE (head excluded from both sides)
            // =====================================================
            const toAdd = incomingNonHeadIds.filter((uid) => !currentMemberIds.includes(uid));
            const toRemove = currentMemberIds.filter(
                (uid) => uid !== newHeadId && uid !== oldHeadId && !nextMemberIds.includes(uid)
            );

            // =====================================================
            // Normal employees being ADDED
            // =====================================================
            //
            // Managers are never normal members - not tracked via
            // User.department for membership purposes.
            //
            const normalToAdd = toAdd.filter((uid) => {
                const user = userMap.get(uid);
                return user && !isManagerRole(user.role);
            });

            // =====================================================
            // Do not silently move an employee who already
            // belongs to a different department.
            // =====================================================
            const conflictingAdds = normalToAdd.filter((uid) => {
                const user = userMap.get(uid);
                return user?.department && String(user.department) !== String(department._id);
            });

            if (conflictingAdds.length) {
                return res.status(400).json({
                    success: false,
                    message: "One or more selected employees already belong to another department.",
                });
            }

            // =====================================================
            // Apply the diff via the shared helpers - the single
            // source of truth for member add/remove, also used by
            // createDepartment / addDepartmentMember / removeDepartmentMember.
            // =====================================================
            await assignUsersToDepartment(normalToAdd, department._id);
            await removeUsersFromDepartment(toRemove, department._id);
        }

        // =====================================================
        // 9. Save department
        // =====================================================
        await department.save();

        // =====================================================
        // 10. Populate
        // =====================================================
        department = await Department.findById(id)
            .populate("headOf", "name email employeeId role designation isActive moduleAccess")
            .populate("parentDepartment", "name code")
            .populate("createdBy", "name");

        // =====================================================
        // 11. Response
        // =====================================================
        return res.status(200).json({
            success: true,
            message: "Department updated successfully.",
            department,
        });

    } catch (error) {
        console.error("Update Department:", error);
        return res.status(500).json({ success: false, message: "Server Error", });
    }
};



/**
 * @desc    Delete Department
 * @route   DELETE /api/departments/:id
 * @access  Private (Admin)
 */
const deleteDepartment = async (req, res) => {

    try {

        const { id } = req.params;

        const department = await Department.findById(id);

        if (!department) {
            return res.status(404).json({
                success: false,
                message: "Department not found."
            });
        }

        // Check child departments
        const childDepartment = await Department.findOne({
            parentDepartment: id
        });

        if (childDepartment) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete department. It has child departments."
            });
        }

        // Check employees assigned
        const employeeCount = await User.countDocuments({
            department: id
        });

        if (employeeCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete department. ${employeeCount} employee(s) are assigned.`
            });
        }

        await Department.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: "Department deleted successfully."
        });

    } catch (error) {

        console.error("Delete Department:", error);

        return res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};

/**
 * @desc    Add Member(s) to Department
 * @route   POST /api/departments/:id/members
 * @access  Private (Admin)
 */
const addDepartmentMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { userIds } = req.body;

        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide at least one user."
            });
        }

        const department = await Department.findById(id);

        if (!department) {
            return res.status(404).json({ success: false, message: "Department not found." });
        }
        const users = await User.find({ _id: { $in: userIds } });
        if (users.length !== userIds.length) {
            return res.status(404).json({ success: false, message: "One or more users were not found." });
        }
        // Shared helper - single source of truth for "user joins
        // department", also used by createDepartment / updateDepartment.
        await assignUsersToDepartment(userIds, department._id);
        return res.status(200).json({ success: true, message: `${users.length} member(s) added successfully.` });
    } catch (error) {
        console.error("Add Department Members:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};
/**
 * @desc    Remove Member from Department
 * @route   DELETE /api/departments/:id/members/:userId
 * @access  Private (Admin)
 */
const removeDepartmentMember = async (req, res) => {
    try {
        const { id, userId } = req.params;
        const department = await Department.findById(id);
        if (!department) { return res.status(404).json({ success: false, message: "Department not found." }); }
        const user = await User.findById(userId);
        if (!user) { return res.status(404).json({ success: false, message: "User not found." }); }
        if (!user.department || user.department.toString() !== id) { return res.status(400).json({ success: false, message: "User does not belong to this department." }); }
        // Shared helper - single source of truth for "user leaves
        // department", also used by updateDepartment. Never touches role.
        await removeUsersFromDepartment([userId], department._id);
        return res.status(200).json({ success: true, message: "Member removed successfully." });
    } catch (error) {
        console.error("Remove Department Member:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

/* ==================================================================== */
/* NEW: Department Details page endpoints                                */
/* ==================================================================== */

/**
 * @desc    List a department's employees
 * @route   GET /api/departments/:id/employees
 * @access  Private
 */
const getDepartmentEmployees = async (req, res) => {
    try {
        const { id } = req.params;
        const department = await Department.findById(id).select("_id");
        if (!department) {
            return res.status(404).json({ success: false, message: "Department not found." });
        }
        const employees = await User.find({ department: id }).select(
            "employeeId name email role designation profilePicture isActive joiningDate"
        );
        return res.status(200).json({ success: true, count: employees.length, employees });
    } catch (error) {
        console.error("Get Department Employees:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

/**
 * @desc    Add a single employee to a department (Employee Management tab)
 * @route   POST /api/departments/:id/employees
 * @access  Private (Admin/Manager)
 * @body    { employeeId: "USER_ID" }
 */
const addDepartmentEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const { employeeId } = req.body;

        if (!employeeId) {
            return res.status(400).json({ success: false, message: "employeeId is required." });
        }

        const department = await Department.findById(id);
        if (!department) {
            return res.status(404).json({ success: false, message: "Department not found." });
        }

        const user = await User.findById(employeeId).select("_id name role isActive department");
        if (!user) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }
        if (!user.isActive) {
            return res.status(400).json({ success: false, message: "Employee must be active." });
        }

        // Managers are exempt from the department-membership check (see
        // isManagerRole doc-comment above) - they don't use User.department
        // to represent membership, so there's nothing to add for them.
        if (isManagerRole(user.role)) {
            return res.status(200).json({ success: true, message: "Manager added as department head/lead elsewhere; no membership change needed." });
        }

        if (user.department && String(user.department) !== String(id)) {
            return res.status(400).json({ success: false, message: "Employee already belongs to another department." });
        }

        await assignUsersToDepartment([employeeId], department._id);

        return res.status(200).json({ success: true, message: "Employee added to department successfully." });
    } catch (error) {
        console.error("Add Department Employee:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

/**
 * @desc    Remove a single employee from a department (Employee Management tab)
 * @route   DELETE /api/departments/:id/employees/:employeeId
 * @access  Private (Admin/Manager)
 *
 * Business rule: the department head cannot be silently removed. The head
 * must be changed first (via Edit Department / updateDepartment).
 */
const removeDepartmentEmployee = async (req, res) => {
    try {
        const { id, employeeId } = req.params;

        const department = await Department.findById(id);
        if (!department) {
            return res.status(404).json({ success: false, message: "Department not found." });
        }

        if (department.headOf && String(department.headOf) === String(employeeId)) {
            return res.status(400).json({
                success: false,
                message: "Cannot remove the department head. Change the department head first.",
            });
        }

        const user = await User.findById(employeeId).select("_id department");
        if (!user) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }
        if (!user.department || String(user.department) !== String(id)) {
            return res.status(400).json({ success: false, message: "Employee does not belong to this department." });
        }

        await removeUsersFromDepartment([employeeId], department._id);

        return res.status(200).json({ success: true, message: "Employee removed from department successfully." });
    } catch (error) {
        console.error("Remove Department Employee:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

/**
 * @desc    List a department's projects (with summary stats)
 * @route   GET /api/departments/:id/projects
 * @access  Private
 */
const getDepartmentProjects = async (req, res) => {
    try {
        const { id } = req.params;
        const department = await Department.findById(id).select("_id");
        if (!department) {
            return res.status(404).json({ success: false, message: "Department not found." });
        }
        const projects = await Project.find({ department: id })
            .populate("manager", "name employeeId email")
            .populate("teamMembers", "name employeeId email profilePicture")
            .select("projectCode name status priority progress manager teamMembers department startDate endDate");

        const projectStats = buildProjectStats(projects);

        return res.status(200).json({ success: true, count: projects.length, projects, projectStats });
    } catch (error) {
        console.error("Get Department Projects:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

/**
 * @desc    List a department's lead positions
 * @route   GET /api/departments/:id/leads
 * @access  Private
 */
const getDepartmentLeads = async (req, res) => {
    try {
        const { id } = req.params;
        const department = await Department.findById(id).populate(
            "leadPositions.user",
            "name email employeeId role designation profilePicture"
        );
        if (!department) {
            return res.status(404).json({ success: false, message: "Department not found." });
        }
        return res.status(200).json({ success: true, leadPositions: department.leadPositions || [] });
    } catch (error) {
        console.error("Get Department Leads:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

/**
 * @desc    Create a new lead position (e.g. "Technical Lead")
 * @route   POST /api/departments/:id/leads
 * @access  Private (Admin/Manager)
 * @body    { title, description }
 */
const addDepartmentLead = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: "Lead position title is required." });
        }

        const department = await Department.findById(id);
        if (!department) {
            return res.status(404).json({ success: false, message: "Department not found." });
        }

        department.leadPositions.push({
            title: title.trim(),
            description: description || "",
            user: null,
            isActive: true,
        });
        await department.save();

        const populated = await Department.findById(id).populate(
            "leadPositions.user",
            "name email employeeId role designation profilePicture"
        );

        return res.status(201).json({
            success: true,
            message: "Lead position created successfully.",
            leadPositions: populated.leadPositions,
        });
    } catch (error) {
        console.error("Add Department Lead:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

/**
 * @desc    Assign (or change) the employee holding a lead position
 * @route   PUT /api/departments/:id/leads/:leadId
 * @access  Private (Admin/Manager)
 * @body    { userId }
 */
const assignDepartmentLead = async (req, res) => {
    try {
        const { id, leadId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ success: false, message: "userId is required." });
        }

        const department = await Department.findById(id);
        if (!department) {
            return res.status(404).json({ success: false, message: "Department not found." });
        }

        const leadPosition = department.leadPositions.id(leadId);
        if (!leadPosition) {
            return res.status(404).json({ success: false, message: "Lead position not found." });
        }

        const user = await User.findById(userId).select("_id isActive");
        if (!user) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }
        if (!user.isActive) {
            return res.status(400).json({ success: false, message: "Employee must be active." });
        }

        leadPosition.user = userId;
        await department.save();

        const populated = await Department.findById(id).populate(
            "leadPositions.user",
            "name email employeeId role designation profilePicture"
        );

        return res.status(200).json({
            success: true,
            message: "Lead position assigned successfully.",
            leadPositions: populated.leadPositions,
        });
    } catch (error) {
        console.error("Assign Department Lead:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

/**
 * @desc    Unassign the employee holding a lead position (position itself stays)
 * @route   DELETE /api/departments/:id/leads/:leadId
 * @access  Private (Admin/Manager)
 */
const unassignDepartmentLead = async (req, res) => {
    try {
        const { id, leadId } = req.params;

        const department = await Department.findById(id);
        if (!department) {
            return res.status(404).json({ success: false, message: "Department not found." });
        }

        const leadPosition = department.leadPositions.id(leadId);
        if (!leadPosition) {
            return res.status(404).json({ success: false, message: "Lead position not found." });
        }

        leadPosition.user = null;
        await department.save();

        const populated = await Department.findById(id).populate(
            "leadPositions.user",
            "name email employeeId role designation profilePicture"
        );

        return res.status(200).json({
            success: true,
            message: "Lead position unassigned successfully.",
            leadPositions: populated.leadPositions,
        });
    } catch (error) {
        console.error("Unassign Department Lead:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    createDepartment,
    getDepartments,
    getDepartment,
    updateDepartment,
    deleteDepartment,
    addDepartmentMember,
    removeDepartmentMember,
    importDepartments,
    exportDepartments,
    // New — Department Details page (Employee Management tab)
    getDepartmentEmployees,
    addDepartmentEmployee,
    removeDepartmentEmployee,
    getDepartmentProjects,
    getDepartmentLeads,
    addDepartmentLead,
    assignDepartmentLead,
    unassignDepartmentLead,
};