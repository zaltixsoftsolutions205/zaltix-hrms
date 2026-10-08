const Project = require("../models/Project");
const Department = require("../models/Department");
const WorkflowStage = require("../models/WorkflowStage");

const isPrivilegedRole = (role) => {
    return ["admin", "hr"].includes(role);
};

const canManageWorkflowStage = async (req, res, next) => {
    try {
        let projectId =
            req.params.projectId ||
            req.body.project ||
            req.body.projectId;

        /*
         * For update/delete:
         * /workflow-stages/:id
         *
         * :id is the stage ID, so resolve the project
         * through the WorkflowStage document.
         */
        if (!projectId && req.params.id) {
            const stage = await WorkflowStage.findById(
                req.params.id
            ).select("project");

            if (!stage) {
                return res.status(404).json({
                    success: false,
                    message: "Workflow stage not found",
                });
            }

            projectId = stage.project;
        }

        /*
         * Reorder request can contain:
         *
         * {
         *   project: "...",
         *   stages: [...]
         * }
         */
        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Project is required",
            });
        }

        const project = await Project.findById(projectId)
            .select("manager department teamMembers isActive");

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        if (!project.isActive) {
            return res.status(400).json({
                success: false,
                message:
                    "Cannot modify stages of an inactive project",
            });
        }

        const userId = req.user._id.toString();

        /*
         * Admin / HR
         */
        if (isPrivilegedRole(req.user.role)) {
            req.workflowProject = project;
            return next();
        }

        /*
         * Project Manager
         */
        if (
            project.manager &&
            project.manager.toString() === userId
        ) {
            req.workflowProject = project;
            return next();
        }

        /*
         * Department Manager
         */
        if (req.user.role === "manager") {
            const department = await Department.findById(
                project.department
            ).select("headOf");

            if (
                department &&
                department.headOf &&
                department.headOf.toString() === userId
            ) {
                req.workflowProject = project;
                return next();
            }
        }

        return res.status(403).json({
            success: false,
            message:
                "You do not have permission to manage workflow stages for this project",
        });
    } catch (error) {
        console.error(
            "canManageWorkflowStage error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

module.exports = {
    canManageWorkflowStage,
};