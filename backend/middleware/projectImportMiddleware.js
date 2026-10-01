const multer = require("multer");
const XLSX = require("xlsx");

const Department = require("../models/Department");
const User = require("../models/User");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },// 10 MB
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];

        const extension = file.originalname.split(".").pop().toLowerCase();
        if (allowedMimeTypes.includes(file.mimetype) || ["xlsx", "xls"].includes(extension)) {
            cb(null, true);
        } else {
            cb(
                new Error("Only .xlsx and .xls Excel files are allowed.")
            );
        }
    }
});

/**
 * Resolve:
 *
 * departmentCode
 * teamLeadEmployeeId
 * teamMemberEmployeeIds
 *
 * into:
 * department ObjectId
 * manager ObjectId
 * teamMembers ObjectId[]
 */
const resolveProjectReferences = async ({ departmentCode, teamLeadEmployeeId, teamMemberEmployeeIds = [] }) => {
    // ---------------------------------------------------------
    // 1. Department
    // ---------------------------------------------------------
    if (!departmentCode) {
        throw new Error(
            "Department Code is required."
        );
    }
    const normalizedDepartmentCode = String(departmentCode).trim().toUpperCase();
    const department = await Department.findOne({ code: normalizedDepartmentCode });
    if (!department) {
        throw new Error(`Department with code ${normalizedDepartmentCode} not found.`);
    }
    // ---------------------------------------------------------
    // 2. Team Lead
    // ---------------------------------------------------------
    if (!teamLeadEmployeeId) {
        throw new Error("Team Lead Employee ID is required.");
    }
    const normalizedTeamLeadId = String(teamLeadEmployeeId).trim();
    const manager = await User.findOne({ employeeId: normalizedTeamLeadId });
    if (!manager) {
        throw new Error(`Team lead ${normalizedTeamLeadId} not found.`);
    }
    if (!manager.isActive) {
        throw new Error(`Team lead ${normalizedTeamLeadId} is inactive.`);
    }
    // ---------------------------------------------------------
    // 3. Team Lead Department
    // ---------------------------------------------------------
    if (!manager.department || manager.department.toString() !== department._id.toString()) {
        throw new Error(`Team lead ${normalizedTeamLeadId} does not belong to department ${normalizedDepartmentCode}.`);
    }

    // ---------------------------------------------------------
    // 4. Normalize team member IDs
    // ---------------------------------------------------------
    let employeeIds = [];
    if (Array.isArray(teamMemberEmployeeIds)) {
        employeeIds = teamMemberEmployeeIds.filter(Boolean).flatMap(value => String(value).split(",").map(id => id.trim()).filter(Boolean)
        );
    }
    // Remove duplicates
    employeeIds = [
        ...new Set(employeeIds)
    ];
    // ---------------------------------------------------------
    // 5. Find members
    // ---------------------------------------------------------
    let members = [];
    if (employeeIds.length > 0) {
        members = await User.find({employeeId: { $in: employeeIds},
            isActive: true
        });
        if (members.length !== employeeIds.length) {
            const foundIds = new Set( members.map( user => String(user.employeeId)));

            const missingIds = employeeIds.filter( employeeId => !foundIds.has(String(employeeId)));
            throw new Error(`Team member(s) not found or inactive: ${missingIds.join(", ")}`);
        }
        // -----------------------------------------------------
        // 6. Department validation
        // -----------------------------------------------------
        const invalidMembers = members.filter( user => !user.department || user.department.toString() !== department._id.toString());

        if (invalidMembers.length > 0) {
            throw new Error(
                "All project team members must belong to the selected department."
            );
        }
    }
    // ---------------------------------------------------------
    // 7. Don't store team lead inside teamMembers
    // ---------------------------------------------------------
    const validMembers = members.filter(user => user._id.toString() !== manager._id.toString()).map(user => user._id);

    return { department: department._id, manager: manager._id, teamMembers: validMembers};
};

/**
 * Parse Excel file and convert each row into the same
 * JSON shape expected by the project creation service.
 */
const importProjectsFromExcel = async (req, res, next) => {

    try {

        if (!req.file) { return res.status(400).json({ success: false, message: "Please upload an Excel file." });}
        const workbook = XLSX.read(
            req.file.buffer,
            {
                type: "buffer",
                cellDates: true
            }
        );

        const sheetName =
            workbook.SheetNames[0];

        if (!sheetName) {
            return res.status(400).json({
                success: false,
                message: "Excel file does not contain a worksheet."
            });
        }

        const worksheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json(
                worksheet,
                {
                    defval: ""
                }
            );

        if (!rows.length) {
            return res.status(400).json({ success: false,  message: "Excel file contains no data rows."});
        }
        const normalizedRows = [];
        for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            const excelRowNumber = index + 2;
            // -------------------------------------------------
            // Normalize Excel column names
            // -------------------------------------------------
            const name = row.name ?? row.Name ?? row["Project Name"] ?? "";

            const description = row.description ?? row.Description ?? "";

            const client = row.client ?? row.Client ?? "";

            const departmentCode = row.departmentCode ?? row.DepartmentCode ?? row["Department Code"] ?? row["Department code"] ?? "";

            const teamLeadEmployeeId = row.teamLeadEmployeeId ??  row.TeamLeadEmployeeId ?? row["Team Lead Employee ID"] ?? row["Team Lead Employee Id"] ?? "";

            const teamMemberEmployeeIds = row.teamMemberEmployeeIds ?? row.TeamMemberEmployeeIds ?? row["Team Member Employee IDs"] ?? row["Team Member Employee Ids"] ?? "";

            const moduleAccess = row.moduleAccess ?? row.ModuleAccess ?? "";

            const startDate = row.startDate ?? row.StartDate ?? row["Start Date"] ?? "";

            const endDate = row.endDate ?? row.EndDate ?? row["End Date"] ?? "";

            const priority = row.priority ?? row.Priority ?? "medium";

            const status = row.status ?? row.Status ?? "planning";

            const budget = row.budget ?? row.Budget ?? 0;

            const progress = row.progress ?? row.Progress ?? 0;

            // -------------------------------------------------
            // Required Excel fields
            // -------------------------------------------------

            if (!String(name).trim()) {
                throw new Error( `Excel row ${excelRowNumber}: Project Name is required.` );
            }

            if (!String(departmentCode).trim()) {
                throw new Error( `Excel row ${excelRowNumber}: Department Code is required.` );
            }

            if (!String(teamLeadEmployeeId).trim()) {
                throw new Error( `Excel row ${excelRowNumber}: Team Lead Employee ID is required.`);
            }

            // -------------------------------------------------
            // Team members
            //
            // Supports:
            //
            // emp20,emp21,emp22
            //
            // -------------------------------------------------
            let memberIds = [];
            if (teamMemberEmployeeIds) {
                memberIds = String( teamMemberEmployeeIds).split(",").map(id => id.trim()).filter(Boolean);
            }

            // -------------------------------------------------
            // Resolve references
            // -------------------------------------------------

            const references =
                await resolveProjectReferences({ departmentCode, teamLeadEmployeeId, teamMemberEmployeeIds: memberIds});

            // -------------------------------------------------
            // moduleAccess
            //
            // Excel can optionally contain JSON:
            //
            // [{"module":"project","permission":"edit"}]
            //
            // Or leave empty.
            // -------------------------------------------------

            let parsedModuleAccess = [];

            if (moduleAccess) {
                if (Array.isArray(moduleAccess)) {
                    parsedModuleAccess = moduleAccess;
                } else {
                    try {
                        parsedModuleAccess =
                            JSON.parse(  String(moduleAccess));
                    } catch {
                        throw new Error(`Excel row ${excelRowNumber}: moduleAccess must contain valid JSON.`);
                    }
                }
            }

            normalizedRows.push({
                name: String(name).trim(),
                description: String(description || "").trim(),

                client: String(client || "").trim(),

                // ObjectId
                department: references.department,

                // ObjectId
                manager: references.manager,

                // ObjectId[]
                teamMembers: references.teamMembers,

                moduleAccess: parsedModuleAccess,

                startDate: startDate || undefined,

                endDate: endDate || undefined,

                priority: String(priority || "medium").trim().toLowerCase(),

                status: String(status || "planning").trim().toLowerCase(),

                budget: budget === ""? 0 : Number(budget),

                progress: progress === ""? 0: Number(progress),

                attachments: []
            });
        }

        /*
         * IMPORTANT:
         *
         * We do NOT save anything here.
         *
         * We put the normalized rows on req.importedProjects.
         * The controller/service will perform the actual creation.
         */

        req.importedProjects = normalizedRows;
        next();
    } catch (error) {
        console.error("Project Excel Import:",error);
        return res.status(400).json({ success: false, message: error.message ||"Failed to process Excel file."});
    }
};

module.exports = {
    uploadProjectExcel: upload.single("file"),
    importProjectsFromExcel,
    resolveProjectReferences
};