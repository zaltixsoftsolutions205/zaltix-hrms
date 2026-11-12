const express = require("express");

const router = express.Router();

const { createStage, getStagesByProject, getStageById, updateStage, deleteStage, reorderStages, } = require("../controllers/workflowStageController");
const { protect } = require("../middleware/auth");
const { canManageWorkflowStage, } = require("../middleware/workflowStageMiddleware");

/*
|--------------------------------------------------------------------------
| Workflow Stage Routes
|--------------------------------------------------------------------------
*/

/**
 * Create Stage
 */
/**
 * @swagger
 * /api/workflow-stages:
 *   post:
 *     summary: Create stage
 *     tags:
 *       - Workflow Stages
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.post("/", protect, canManageWorkflowStage, createStage);
/**
 * Get stages for project
 */
/**
 * @swagger
 * /api/workflow-stages/project/{projectId}:
 *   get:
 *     summary: Get stages by project
 *     tags:
 *       - Workflow Stages
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Not found
 */
router.get("/project/:projectId", protect, getStagesByProject);
/**
 * Get single stage
 */
/**
 * @swagger
 * /api/workflow-stages/{id}:
 *   get:
 *     summary: Get stage by id
 *     tags:
 *       - Workflow Stages
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Not found
 */
router.get("/:id", protect, getStageById);
/**
 * Reorder stages
 */
/**
 * @swagger
 * /api/workflow-stages/reorder:
 *   put:
 *     summary: Reorder stages
 *     tags:
 *       - Workflow Stages
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.put("/reorder", protect, canManageWorkflowStage, reorderStages);
/**
 * Update stage
 */
/**
 * @swagger
 * /api/workflow-stages/{id}:
 *   put:
 *     summary: Update stage
 *     tags:
 *       - Workflow Stages
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Not found
 */
router.put("/:id", protect, canManageWorkflowStage, updateStage);
/**
 * Delete stage
 */
/**
 * @swagger
 * /api/workflow-stages/{id}:
 *   delete:
 *     summary: Delete stage
 *     tags:
 *       - Workflow Stages
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Not found
 */
router.delete("/:id", protect, canManageWorkflowStage, deleteStage);
module.exports = router;