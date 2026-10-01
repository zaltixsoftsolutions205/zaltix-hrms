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
router.post("/", protect, canManageWorkflowStage, createStage);
/**
 * Get stages for project
 */
router.get("/project/:projectId", protect, getStagesByProject);
/**
 * Get single stage
 */
router.get("/:id", protect, getStageById);
/**
 * Reorder stages
 */
router.put("/reorder", protect, canManageWorkflowStage, reorderStages);
/**
 * Update stage
 */
router.put("/:id", protect, canManageWorkflowStage, updateStage);
/**
 * Delete stage
 */
router.delete("/:id", protect, canManageWorkflowStage, deleteStage);
module.exports = router;