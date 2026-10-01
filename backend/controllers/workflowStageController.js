const mongoose = require("mongoose");

const WorkflowStage = require("../models/WorkflowStage");
const Project = require("../models/Project");

/* ============================================================
 * HELPERS
 * ============================================================ */

/**
 * Normalize a stage name.
 *
 * We use this for duplicate detection.
 * Example:
 *
 * "In Progress"
 * " in progress "
 * "IN PROGRESS"
 *
 * are treated as the same stage name inside one project.
 */
const normalizeStageName = (value) => { return String(value || "").trim().replace(/\s+/g, " ").toLowerCase(); };
/**
 * Safely convert an id to string.
 */
const toIdString = (value) => {
    if (!value) return null;
    if (value._id) { return value._id.toString(); }
    return value.toString();
};


/*
 * Get and validate a project.
 */
const getProject = async (projectId) => {
    if (!projectId) { return { valid: false, status: 400, message: "Project is required.", }; }
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
        return { valid: false, status: 400, message: "Invalid project id.", };
    }
    const project = await Project.findById(projectId).select("name projectCode department manager teamMembers isActive");

    if (!project) {
        return { valid: false, status: 404, message: "Project not found.", };
    }
    return { valid: true, project, };
};

/**
 * Validate a stage id.
 */
const validateStageId = (id) => { return mongoose.Types.ObjectId.isValid(id); };

/**
 * Calculate the next order value.
 *
 * Example:
 *
 * Existing:
 * 0
 * 1
 * 2
 *
 * New stage:
 * 3
 */
const getNextOrder = async (projectId) => {
    const lastStage = await WorkflowStage.findOne({ project: projectId, isActive: true, }).sort({ order: -1 }).select("order");
    if (!lastStage) { return 0; }
    return Number(lastStage.order || 0) + 1;
};
/**
 * Check duplicate stage name within one project.
 *
 * Stage names are unique per project, not globally.
 */
const findDuplicateStage = async ({ projectId, name, excludeId = null, }) => {
    const normalizedName = normalizeStageName(name);
    const stages = await WorkflowStage.find({ project: projectId, isActive: true, }).select("_id name");
    return stages.find((stage) => {
        if (excludeId && stage._id.toString() === excludeId.toString()) {
            return false;
        }
        return normalizeStageName(stage.name) === normalizedName;
    });
};

/* ============================================================
 * CREATE WORKFLOW STAGE
 * ============================================================ */

/**
 * @desc    Create Workflow Stage
 * @route   POST /api/workflow-stages
 * @access  Private
 */
const createStage = async (req, res) => {
    try {
        const { name, description, color, icon, project, order, isSystem, isCompleted, } = req.body;
        /* --------------------------------------------------------
         * 1. Validate required fields
         * -------------------------------------------------------- */
        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, message: "Stage name is required.", });
        }

        if (!project) {
            return res.status(400).json({ success: false, message: "Project is required.", });
        }
        /* --------------------------------------------------------
         * 2. Validate project
         * -------------------------------------------------------- */
        const projectExists = req.workflowProject;

        if (!projectExists) {
            return res.status(404).json({
                success: false,
                message: "Project not found.",
            });
        }

        /* --------------------------------------------------------
         * 4. Authorization
         * -------------------------------------------------------- */

        /* --------------------------------------------------------
         * 5. Duplicate stage protection
         * -------------------------------------------------------- */
        const duplicateStage = await findDuplicateStage({ projectId: project, name, });

        if (duplicateStage) {
            return res.status(409).json({ success: false, message: "A workflow stage with this name already exists in this project.", });
        }
        /* --------------------------------------------------------
         * 6. Determine order
         * -------------------------------------------------------- */
        let stageOrder;
        if (order !== undefined && order !== null && order !== "") {
            stageOrder = Number(order);
            if (!Number.isInteger(stageOrder) || stageOrder < 0) {
                return res.status(400).json({ success: false, message: "Stage order must be a non-negative integer.", });
            }
            /*
             * If inserting into an existing position,
             * move the stages after it forward.
             */
            await WorkflowStage.updateMany(
                { project, isActive: true, order: { $gte: stageOrder }, },
                { $inc: { order: 1 }, }
            );
        } else { stageOrder = await getNextOrder(project); }
        /* --------------------------------------------------------
         * 7. Create stage
         * -------------------------------------------------------- */

        const stage = await WorkflowStage.create({
            name: String(name).trim(),
            description: description ? String(description).trim() : "",
            color: color || "#6366f1",
            icon: icon || "Circle",
            project,
            order: stageOrder,
            /*
             * Only the backend should decide whether a stage
             * is a system stage.
             *
             * Do not allow a normal user to create an arbitrary
             * system stage.
             */
            isSystem: false,
            isCompleted: isCompleted === true,
            isActive: true,
            createdBy: req.user._id,
            updatedBy: req.user._id,
        });
        const populatedStage = await WorkflowStage.findById(stage._id).populate("project", "name projectCode department manager").populate("createdBy", "name email employeeId").populate("updatedBy", "name email employeeId");
        return res.status(201).json({ success: true, message: "Workflow stage created successfully.", stage: populatedStage, });
    } catch (error) {
        console.error("Create Workflow Stage:", error);
        /*
         * Handle MongoDB duplicate-key errors as a safety net
         * if the schema has a unique project/name index.
         */
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: "A workflow stage with this value already exists in this project.", });
        }
        return res.status(500).json({
            success: false,
            message: "Server Error",
        });
    }
};

/* ============================================================
 * GET WORKFLOW STAGES BY PROJECT
 * ============================================================ */
/**
 * @desc    Get Workflow Stages for Project
 * @route   GET /api/workflow-stages?project=:projectId
 * @access  Private
 */
const getStagesByProject = async (req, res) => {
    try {
        const projectId = req.query.project || req.query.projectId;
        /* --------------------------------------------------------
         * 1. Validate project
         * -------------------------------------------------------- */
        const projectResult = await getProject(projectId);
        if (!projectResult.valid) {
            return res.status(projectResult.status).json({ success: false, message: projectResult.message, });
        }
        const project = projectResult.project;
        /* --------------------------------------------------------
         * 2. Authorization
         *
         * Reading is broader than managing.
         *
         * Admin / HR:
         *   allowed
         *
         * Manager:
         *   department scope
         *
         * Team lead:
         *   assigned project
         *
         * Employee:
         *   project team member
         * -------------------------------------------------------- */
        const role = String(req.user.role || "").trim().toLowerCase();
        let canView = false;
        if (isPrivilegedRole(role)) { canView = true; }
        const userId = req.user._id.toString();
        // Project manager / team lead
        if (project.manager && project.manager.toString() === userId) {
            canView = true;
        }

        // Project team member
        if (Array.isArray(project.teamMembers) && project.teamMembers.some((member) => member.toString() === userId)) {
            canView = true;
        }
        // Manager
        if (role === "manager") {
            const Department = require("../models/Department");
            const departmentIds = await Department.find({ headOf: req.user._id, }).distinct("_id");

            if (project.department && departmentIds.some((departmentId) => departmentId.toString() === project.department.toString())) {
                canView = true;
            }

            if (req.user.department && project.department && req.user.department.toString() === project.department.toString()) {
                canView = true;
            }
        }

        if (!canView) {
            return res.status(403).json({ success: false, message: "You are not authorized to view workflow stages for this project.", });
        }

        /* --------------------------------------------------------
         * 3. Get stages
         * -------------------------------------------------------- */
        const stages = await WorkflowStage.find({ project: projectId, isActive: true, }).populate("createdBy", "name email employeeId").populate("updatedBy", "name email employeeId").sort({ order: 1, createdAt: 1, });
        return res.status(200).json({ success: true, count: stages.length, project: { _id: project._id, name: project.name, projectCode: project.projectCode, }, stages, });
    } catch (error) {
        console.error("Get Workflow Stages By Project:", error);
        return res.status(500).json({ success: false, message: "Server Error", });
    }
};

/* ============================================================
 * GET SINGLE WORKFLOW STAGE
 * ============================================================ */

/**
 * @desc    Get Single Workflow Stage
 * @route   GET /api/workflow-stages/:id
 * @access  Private
 */
const getStageById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!validateStageId(id)) {
            return res.status(400).json({ success: false, message: "Invalid workflow stage id.", });
        }

        const stage = await WorkflowStage.findById(id).populate("project", "name projectCode department manager teamMembers isActive").populate("createdBy", "name email employeeId").populate("updatedBy", "name email employeeId");

        if (!stage) {
            return res.status(404).json({ success: false, message: "Workflow stage not found.", });
        }
        const project = stage.project;
        if (!project) {
            return res.status(404).json({ success: false, message: "The project associated with this workflow stage no longer exists.", });
        }
        /* --------------------------------------------------------
         * Authorization
         * -------------------------------------------------------- */
        if (Array.isArray(project.teamMembers) && project.teamMembers.some((member) => member.toString() === userId)) {
            canView = true;
        }
        if (role === "manager") {
            const Department = require("../models/Department");
            const departmentIds = await Department.find({ headOf: req.user._id, }).distinct("_id");
            if (project.department && departmentIds.some((departmentId) => departmentId.toString() === project.department.toString())) {
                canView = true;
            }
            if (req.user.department && project.department && req.user.department.toString() === project.department.toString()) {
                canView = true;
            }
        }
        if (!canView) {
            return res.status(403).json({ success: false, message: "You are not authorized to view this workflow stage.", });
        }

        return res.status(200).json({ success: true, stage, });
    } catch (error) {
        console.error("Get Workflow Stage:", error);
        return res.status(500).json({ success: false, message: "Server Error", });
    }
};

/* ============================================================
 * UPDATE WORKFLOW STAGE
 * ============================================================ */

/**
 * @desc    Update Workflow Stage
 * @route   PUT /api/workflow-stages/:id
 * @access  Private
 */
const updateStage = async (req, res) => {
    try {
        const { id } = req.params;

        if (!validateStageId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid workflow stage id.",
            });
        }

        /* --------------------------------------------------------
         * 1. Find stage
         * -------------------------------------------------------- */

        const stage = await WorkflowStage.findById(id);

        if (!stage) {
            return res.status(404).json({ success: false, message: "Workflow stage not found.", });
        }


        const { name, description, color, icon, order, isCompleted, isActive, } = req.body;

        /* --------------------------------------------------------
         * 5. Validate name
         * -------------------------------------------------------- */

        if (name !== undefined && !String(name).trim()) {
            return res.status(400).json({
                success: false, message: "Stage name cannot be empty.",
            });
        }
        /* --------------------------------------------------------
         * 6. Duplicate stage protection
         * -------------------------------------------------------- */
        if (name !== undefined) {
            const duplicateStage = await findDuplicateStage({ projectId: stage.project, name, excludeId: stage._id, });

            if (duplicateStage) {
                return res.status(409).json({ success: false, message: "A workflow stage with this name already exists in this project.", });
            }
        }

        /* --------------------------------------------------------
         * 7. Update basic fields
         * -------------------------------------------------------- */

        if (name !== undefined) { stage.name = String(name).trim(); }

        if (description !== undefined) { stage.description = String(description).trim(); }

        if (color !== undefined) { stage.color = color; }

        if (icon !== undefined) { stage.icon = icon; }

        if (isCompleted !== undefined) { stage.isCompleted = Boolean(isCompleted); }

        /*
         * isActive can be changed by a manager/admin/HR.
         *
         * We do NOT physically delete the stage when inactive.
         */
        if (isActive !== undefined) { stage.isActive = Boolean(isActive); }
        /* --------------------------------------------------------
         * 8. Handle order change
         * -------------------------------------------------------- */
        if (order !== undefined) {
            const newOrder = Number(order);
            if (!Number.isInteger(newOrder) || newOrder < 0) {
                return res.status(400).json({ success: false, message: "Stage order must be a non-negative integer.", });
            }
            const oldOrder = Number(stage.order);
            if (newOrder !== oldOrder) {
                if (newOrder < oldOrder) {
                    /*
                     * Example:
                     *
                     * A = 0
                     * B = 1
                     * C = 2
                     * D = 3
                     *
                     * Move D -> 1
                     *
                     * B and C become 2 and 3.
                     */
                    await WorkflowStage.updateMany(
                        { project: stage.project, isActive: true, _id: { $ne: stage._id }, order: { $gte: newOrder, $lt: oldOrder, }, },
                        { $inc: { order: 1 }, }
                    );
                } else {
                    /*
                     * Move A -> 3
                     *
                     * B/C/D move one position backward.
                     */
                    await WorkflowStage.updateMany(
                        { project: stage.project, isActive: true, _id: { $ne: stage._id }, order: { $gt: oldOrder, $lte: newOrder, }, },
                        { $inc: { order: -1 }, }
                    );
                }
                stage.order = newOrder;
            }
        }
        stage.updatedBy = req.user._id;
        await stage.save();
        const updatedStage = await WorkflowStage.findById(stage._id).populate("project", "name projectCode department manager").populate("createdBy", "name email employeeId").populate("updatedBy", "name email employeeId");

        return res.status(200).json({ success: true, message: "Workflow stage updated successfully.", stage: updatedStage, });
    } catch (error) {
        console.error("Update Workflow Stage:", error);
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: "A workflow stage with this value already exists in this project.", });
        }
        return res.status(500).json({ success: false, message: "Server Error", });
    }
};

/* ============================================================
 * DELETE WORKFLOW STAGE
 * ============================================================ */
/**
 * @desc    Delete Workflow Stage
 * @route   DELETE /api/workflow-stages/:id
 * @access  Private
 */
const deleteStage = async (req, res) => {
    try {
        const { id } = req.params;
        if (!validateStageId(id)) {
            return res.status(400).json({ success: false, message: "Invalid workflow stage id.", });
        }
        /* --------------------------------------------------------
         * 1. Find stage
         * -------------------------------------------------------- */
        const stage = await WorkflowStage.findById(id);
        if (!stage) {
            return res.status(404).json({ success: false, message: "Workflow stage not found.", });
        }

        /* --------------------------------------------------------
         * 4. System stage protection
         * -------------------------------------------------------- */
        if (stage.isSystem) {
            return res.status(400).json({ success: false, message: "System workflow stages cannot be deleted.", });
        }
        /* --------------------------------------------------------
         * 5. Do not delete the only active stage
         * -------------------------------------------------------- */
        const activeStageCount = await WorkflowStage.countDocuments({ project: stage.project, isActive: true, });
        if (activeStageCount <= 1) {
            return res.status(400).json({ success: false, message: "A project must have at least one active workflow stage.", });
        }

        /* --------------------------------------------------------
         * 6. IMPORTANT TASK CHECK
         *
         * Task.workflowStage is not assumed here until Phase 3.
         *
         * Once Task is connected to WorkflowStage, this section
         * should verify whether tasks are using this stage and
         * require those tasks to be moved before deletion.
         * -------------------------------------------------------- */

        /*
         * For now we perform a soft delete.
         *
         * This preserves the stage document and its historical
         * information instead of physically removing it.
         */
        stage.isActive = false;
        stage.updatedBy = req.user._id;
        await stage.save();
        /* --------------------------------------------------------
         * 7. Close the ordering gap
         * -------------------------------------------------------- */
        await WorkflowStage.updateMany(
            { project: stage.project, isActive: true, order: { $gt: stage.order }, },
            { $inc: { order: -1 }, }
        );
        return res.status(200).json({ success: true, message: "Workflow stage deleted successfully.", stageId: stage._id, });
    } catch (error) {
        console.error("Delete Workflow Stage:", error);
        return res.status(500).json({ success: false, message: "Server Error", });
    }
};
/* ============================================================
 * REORDER WORKFLOW STAGES
 * ============================================================ */

/**
 * @desc    Reorder Workflow Stages
 * @route   PATCH /api/workflow-stages/reorder
 * @access  Private
 *
 * Expected body:
 *
 * {
 *   "project": "PROJECT_ID",
 *   "stages": [
 *      {
 *        "_id": "STAGE_ID_1",
 *        "order": 0
 *      },
 *      {
 *        "_id": "STAGE_ID_2",
 *        "order": 1
 *      }
 *   ]
 * }
 */
const reorderStages = async (req, res) => {
    try {
        const { project, stages } = req.body;
        /* --------------------------------------------------------
         * 1. Validate input
         * -------------------------------------------------------- */
        if (!project) {
            return res.status(400).json({ success: false, message: "Project is required.", });
        }
        if (!Array.isArray(stages) || stages.length === 0) {
            return res.status(400).json({ success: false, message: "Stages must be a non-empty array.", });
        }
        const projectExists = req.workflowProject;

        if (!projectExists) {
            return res.status(404).json({
                success: false,
                message: "Project not found.",
            });
        }
        /* --------------------------------------------------------
         * 4. Validate stage IDs and orders
         * -------------------------------------------------------- */
        const seenIds = new Set();
        const seenOrders = new Set();
        for (const item of stages) {
            if (!item || !item._id) {
                return res.status(400).json({ success: false, message: "Every stage must contain an _id.", });
            }
            if (!validateStageId(item._id)) { return res.status(400).json({ success: false, message: `Invalid workflow stage id: ${item._id}`, }); }
            const stageId = item._id.toString();
            if (seenIds.has(stageId)) {
                return res.status(400).json({ success: false, message: "Duplicate workflow stage id in reorder request.", });
            }
            seenIds.add(stageId);
            const stageOrder = Number(item.order);
            if (!Number.isInteger(stageOrder) || stageOrder < 0) {
                return res.status(400).json({ success: false, message: "Every stage order must be a non-negative integer.", });
            }
            if (seenOrders.has(stageOrder)) {
                return res.status(400).json({ success: false, message: "Workflow stage orders must be unique.", });
            }
            seenOrders.add(stageOrder);
        }
        /* --------------------------------------------------------
         * 5. Load all active stages for project
         * -------------------------------------------------------- */
        const existingStages = await WorkflowStage.find({ project, isActive: true, }).select("_id order");
        /* --------------------------------------------------------
         * 6. Ensure request does not contain another project's stage
         * -------------------------------------------------------- */
        const existingStageIds = new Set(
            existingStages.map((stage) => stage._id.toString())
        );
        for (const item of stages) {
            if (!existingStageIds.has(item._id.toString())) {
                return res.status(400).json({ success: false, message: "One or more workflow stages do not belong to this project.", });
            }
        }
        /* --------------------------------------------------------
         * 7. Ensure all active stages are included
         * -------------------------------------------------------- */
        if (stages.length !== existingStages.length) {
            return res.status(400).json({ success: false, message: "The reorder request must include all active workflow stages for this project.", });
        }
        /* --------------------------------------------------------
         * 8. Update orders
         * -------------------------------------------------------- */
        const bulkOperations = stages.map((item) => ({
            updateOne: {
                filter: { _id: item._id, project, isActive: true },
                update: { $set: { order: Number(item.order), updatedBy: req.user._id, }, },
            },
        }));
        await WorkflowStage.bulkWrite(bulkOperations);
        /* --------------------------------------------------------
         * 9. Return stages in final order
         * -------------------------------------------------------- */
        const updatedStages = await WorkflowStage.find({ project, isActive: true, }).populate("createdBy", "name email employeeId").populate("updatedBy", "name email employeeId").sort({ order: 1, createdAt: 1, });
        return res.status(200).json({ success: true, message: "Workflow stages reordered successfully.", count: updatedStages.length, stages: updatedStages, });
    } catch (error) {
        console.error("Reorder Workflow Stages:", error);
        return res.status(500).json({ success: false, message: "Server Error", });
    }
};

/* ============================================================
 * EXPORTS
 * ============================================================ */
module.exports = { createStage, getStagesByProject, getStageById, updateStage, deleteStage, reorderStages, };