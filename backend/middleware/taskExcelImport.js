const multer = require("multer");
const XLSX = require("xlsx");

const Department = require("../models/Department");
const User = require("../models/User");
const Project = require("../models/Project");

/* ============================================================
 * MULTER
 * ============================================================ */
const upload = multer({
    storage: multer.memoryStorage(),

    limits: { fileSize: 10 * 1024 * 1024,  },//10MB
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [ "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel",];
        const extension = file.originalname.split(".").pop().toLowerCase();
        if (allowedMimeTypes.includes(file.mimetype) || ["xlsx", "xls"].includes(extension)) {
            cb(null, true);
        } else {
            cb( new Error( "Only .xlsx and .xls Excel files are allowed."));
        }
    },
});
/* ============================================================
 * HELPERS
 * ============================================================ */

const normalizeRole = (role) => String(role || "").trim().toLowerCase();
const isValidNumber = (value) => {
    if (value === "" || value === null || value === undefined) { return true;}
    return !Number.isNaN(Number(value));
};

/* ============================================================
 * RESOLVE TASK REFERENCES
 *
 * Excel:
 *
 * Department Code
 * Project Code
 * Assigned To Employee ID
 *
 * becomes:
 *
 * department: ObjectId
 * project: ObjectId
 * assignedTo: ObjectId
 * ============================================================ */

const resolveTaskReferences = async ({ departmentCode, projectCode, assignedToEmployeeId,}) => {
    /* ---------------------------------------------------------
     * 1. Department
     * --------------------------------------------------------- */

    if (!departmentCode) { throw new Error("Department Code is required.");}
    const normalizedDepartmentCode = String(departmentCode).trim().toUpperCase();
    const department = await Department.findOne({ code: normalizedDepartmentCode,});

    if (!department) {
        throw new Error( `Department with code ${normalizedDepartmentCode} not found.`);
    }

    /* ---------------------------------------------------------
     * 2. Project
     * --------------------------------------------------------- */

    if (!projectCode) { throw new Error("Project Code is required.");}

    const normalizedProjectCode = String(projectCode).trim().toUpperCase();

    const project = await Project.findOne({ projectCode: normalizedProjectCode,});

    if (!project) {
        throw new Error( `Project with code ${normalizedProjectCode} not found.`);
    }

    /* ---------------------------------------------------------
     * 3. Project Department Validation
     * --------------------------------------------------------- */

    if ( project.department && project.department.toString() !== department._id.toString()) {
        throw new Error( `Project ${normalizedProjectCode} does not belong to department ${normalizedDepartmentCode}.`);
    }

    /* ---------------------------------------------------------
     * 4. Assigned Employee
     * --------------------------------------------------------- */

    if (!assignedToEmployeeId) { throw new Error( "Assigned To Employee ID is required.");}

    const normalizedEmployeeId = String(assignedToEmployeeId).trim();

    const assignedUser = await User.findOne({ employeeId: normalizedEmployeeId,});

    if (!assignedUser) { throw new Error( `Employee ${normalizedEmployeeId} not found.`);}

    if (!assignedUser.isActive) { throw new Error( `Employee ${normalizedEmployeeId} is inactive.`);}

    /* ---------------------------------------------------------
     * 5. Employee Department Validation
     * --------------------------------------------------------- */

    if ( !assignedUser.department || assignedUser.department.toString() !== department._id.toString()) {
        throw new Error( `Employee ${normalizedEmployeeId} does not belong to department ${normalizedDepartmentCode}.`);
    }

    /* ---------------------------------------------------------
     * 6. Employee Project Membership
     * --------------------------------------------------------- */

    const isProjectMember =
        Array.isArray(project.teamMembers) &&
        project.teamMembers.some( (member) => member.toString() === assignedUser._id.toString());

    const isProjectManager = project.manager && project.manager.toString() === assignedUser._id.toString();

    if (!isProjectMember && !isProjectManager) {
        throw new Error( `Employee ${normalizedEmployeeId} is not a member of project ${normalizedProjectCode}.`);
    }
    return { department: department._id, project: project._id, assignedTo: assignedUser._id,};
};

/* ============================================================
 * EXCEL IMPORT
 *
 * Excel
 *   ↓
 * Read workbook
 *   ↓
 * Read rows
 *   ↓
 * Normalize columns
 *   ↓
 * Validate values
 *   ↓
 * Resolve ObjectIds
 *   ↓
 * req.importedTasks
 *   ↓
 * next()
 * ============================================================ */

const importTasksFromExcel = async (req, res, next) => {
    try {
        /* -----------------------------------------------------
         * 1. FILE CHECK
         * ----------------------------------------------------- */

        if (!req.file) { return res.status(400).json({ success: false, message: "Please upload an Excel file.", });}

        /* -----------------------------------------------------
         * 2. READ WORKBOOK
         * ----------------------------------------------------- */

        const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true,});
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            return res.status(400).json({ success: false, message:"Excel file does not contain a worksheet.",});
        }
        const worksheet = workbook.Sheets[sheetName];
        /* -----------------------------------------------------
         * 3. CONVERT EXCEL → JSON ROWS
         * ----------------------------------------------------- */

        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "",});
        if (!rows.length) {
            return res.status(400).json({ success: false, message: "Excel file contains no data rows.",});
        }

        /* -----------------------------------------------------
         * 4. NORMALIZE EVERY ROW
         * ----------------------------------------------------- */

        const normalizedRows = [];

        for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            // Excel row starts at row 2 because row 1 = headers
            const excelRowNumber = index + 2;
            /* =================================================
             * COLUMN MAPPING
             * ================================================= */
            const title = row.title ?? row.Title ?? row["Task Title"] ?? row["Task Name"] ?? "";

            const description = row.description ?? row.Description ?? "";

            const taskCode = row.taskCode ?? row.TaskCode ?? row["Task Code"] ?? "";
            const taskType = row.taskType ?? row.TaskType ?? row["Task Type"] ?? "project";

            const departmentCode = row.departmentCode ?? row.DepartmentCode ?? row["Department Code"] ?? row["Department code"] ?? "";

            const projectCode = row.projectCode ?? row.ProjectCode ?? row["Project Code"] ?? row["Project code"] ?? "";

            const assignedToEmployeeId = row.assigneeEmployeeId ?? row.assigneeEmployeeID ?? row.AssigneeEmployeeId ?? row.assignedToEmployeeId ?? row.AssignedToEmployeeId ?? row["Assigned To Employee ID"] ?? row["Assigned To Employee Id"] ?? row["Assignee Employee ID"] ?? row["Assignee Employee Id"] ?? row["Employee ID"] ?? "";

            const category = row.category ??  row.Category ??  "";

            const priority = row.priority ?? row.Priority ?? "medium";

            const status = row.status ?? row.Status ?? "not-started";

            const startDate = row.startDate ?? row.StartDate ?? row["Start Date"] ?? "";

            const deadline = row.deadline ?? row.Deadline ?? row["Due Date"] ?? row["Deadline"] ?? "";

            const estimatedHours = row.estimatedHours ?? row.EstimatedHours ?? row["Estimated Hours"] ?? "";

            const actualHours =  row.actualHours ??  row.ActualHours ??  row["Actual Hours"] ??  "";

            const progress = row.progress ?? row.Progress ?? 0;

            const remarks = row.remarks ?? row.Remarks ?? "";

            const proofFiles = row.proofFiles ?? row.ProofFiles ?? "";

            /* =================================================
             * REQUIRED VALIDATION
             * ================================================= */

            if (!String(title).trim()) {
                throw new Error( `Excel row ${excelRowNumber}: Task Title is required.`);
            }

            if (!String(taskType).trim()) {
                throw new Error(`Excel row ${excelRowNumber}: Task Type is required.`);
            }

            const normalizedTaskType = String(taskType).trim().toLowerCase();

            if ( !["project", "self"].includes(normalizedTaskType)) {
                throw new Error( `Excel row ${excelRowNumber}: Task Type must be "project" or "self".`);
            }

            /* =================================================
             * PROJECT TASK
             * ================================================= */

            let references = { department: null, project: null, assignedTo: null,};

            if (normalizedTaskType === "project") {
                if (!String(departmentCode).trim()) {
                    throw new Error( `Excel row ${excelRowNumber}: Department Code is required for project tasks.`);
                }

                if (!String(projectCode).trim()) {
                    throw new Error( `Excel row ${excelRowNumber}: Project Code is required for project tasks.`);
                }

                if (!String(assignedToEmployeeId).trim()) {
                    throw new Error( `Excel row ${excelRowNumber}: Assigned To Employee ID is required for project tasks.`);
                }

                /* ---------------------------------------------
                 * Resolve references
                 * --------------------------------------------- */

                references = await resolveTaskReferences({ departmentCode, projectCode, assignedToEmployeeId,});
            }

            /* =================================================
             * NUMBER VALIDATION
             * ================================================= */

            if (!isValidNumber(progress)) {
                throw new Error( `Excel row ${excelRowNumber}: Progress must be a number.`);
            }

            const numericProgress = progress === "" ? 0 : Number(progress);

            if ( numericProgress < 0 || numericProgress > 100) {
                throw new Error( `Excel row ${excelRowNumber}: Progress must be between 0 and 100.`);
            }

            if (!isValidNumber(estimatedHours)) {
                throw new Error(`Excel row ${excelRowNumber}: Estimated Hours must be a number.`);
            }

            if (!isValidNumber(actualHours)) {
                throw new Error( `Excel row ${excelRowNumber}: Actual Hours must be a number.`);
            }

            /* =================================================
             * STATUS VALIDATION
             * ================================================= */

            const normalizedStatus = String(status || "").trim().toLowerCase();

            const allowedStatuses = ["not-started","in-progress","review","completed","cancelled",];

            if (!allowedStatuses.includes( normalizedStatus) ) {
                throw new Error( `Excel row ${excelRowNumber}: Invalid task status "${normalizedStatus}".`);
            }
            /* =================================================
             * PRIORITY
             * ================================================= */
            const normalizedPriority = String( priority || "medium" ).trim().toLowerCase();

            const allowedPriorities = [ "low", "medium", "high", "critical",];

            if ( !allowedPriorities.includes( normalizedPriority)) {
                throw new Error( `Excel row ${excelRowNumber}: Invalid priority "${normalizedPriority}".`);
            }

            /* =================================================
             * DATE VALIDATION
             * ================================================= */

            if (deadline && startDate) {
                const start = new Date(startDate);
                const end = new Date(deadline);
                if (Number.isNaN(start.getTime())) {
                    throw new Error( `Excel row ${excelRowNumber}: Invalid Start Date.`);
                }

                if ( Number.isNaN(end.getTime())) {
                    throw new Error( `Excel row ${excelRowNumber}: Invalid Deadline.`);
                }

                if (start > end) {
                    throw new Error( `Excel row ${excelRowNumber}: Deadline must be after Start Date.`);
                }
            }

            /* =================================================
             * PROOF FILES
             *
             * Optional Excel value:
             *
             * file1.jpg,file2.pdf
             * ================================================= */

            let parsedProofFiles = [];

            if (proofFiles) {
                parsedProofFiles = String(proofFiles).split(",").map((file) => file.trim()).filter(Boolean);
            }

            /* =================================================
             * FINAL NORMALIZED TASK
             *
             * This object is the same style of data that
             * createTask expects.
             * ================================================= */

            normalizedRows.push({
                title: String(title).trim(),
                taskCode: String(taskCode || "").trim().toUpperCase(),
                description: String(description || "").trim(),
                taskType: normalizedTaskType,
                category: String( category || "").trim(),
                /* ObjectId */
                department: references.department,
                /* ObjectId */
                project:  references.project,
                /* ObjectId */
                assignedTo: references.assignedTo,
                priority: normalizedPriority,
                status: normalizedStatus,
                startDate: startDate || undefined,
                deadline: deadline || undefined,
                estimatedHours: estimatedHours === ""? undefined : Number(estimatedHours),
                actualHours: actualHours === ""? undefined : Number(actualHours),
                progress: numericProgress,
                remarks: String( remarks || "" ).trim(),
                proofFiles: parsedProofFiles,
                attachments: [],
            });
        }

        /* =====================================================
         * DO NOT SAVE HERE
         *
         * createTask controller/service will handle creation.
         * ===================================================== */

        req.importedTasks = normalizedRows;

        next();
    } catch (error) {
        console.error( "Task Excel Import:", error);

        return res.status(400).json({ success: false, message: error.message || "Failed to process Excel file.",});
    }
};
/* ============================================================
 * EXPORTS
 * ============================================================ */
module.exports = { uploadTaskExcel: upload.single("file"), importTasksFromExcel, resolveTaskReferences,};
