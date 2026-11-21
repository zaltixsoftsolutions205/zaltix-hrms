const express = require("express");

// Mounted from projectRoutes at /api/projects/:projectId/work (protect already applied)
const router = express.Router({ mergeParams: true });

const c = require("../controllers/projectWorkController");
const { loadProjectWithAccess } = require("../services/projectAccessService");
const { taskAttachmentUpload } = require("../middleware/taskUpload");

router.use(loadProjectWithAccess, c.attachPrivilege);

/**
 * @swagger
 * /api/projects/{projectId}/work/items:
 *   get:
 *     summary: Module work items (tasks, bugs, milestones) the caller may see
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: kind
 *         description: "Comma list: task,bug,milestone"
 *         schema:
 *           type: string
 *       - in: query
 *         name: module
 *         schema:
 *           type: string
 *       - in: query
 *         name: plan
 *         description: "Plan id, or 'none' for items without a plan"
 *         schema:
 *           type: string
 *       - in: query
 *         name: stage
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: assignee
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *       403:
 *         description: No access to these kinds
 *   post:
 *     summary: Create a task / milestone (Tasks & Plans edit) or report a bug (Bug Sheet view)
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               kind:
 *                 type: string
 *                 enum: [task, bug, milestone]
 *               module:
 *                 type: string
 *               plan:
 *                 type: string
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               assignees:
 *                 type: array
 *                 items:
 *                   type: string
 *               priority:
 *                 type: string
 *               startDate:
 *                 type: string
 *               deadline:
 *                 type: string
 *               status:
 *                 type: string
 *               stage:
 *                 type: string
 *               isPrivate:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Invalid input
 *       403:
 *         description: Forbidden
 */
router.get("/items", c.listItems);
router.post("/items", c.createItem);

/**
 * @swagger
 * /api/projects/{projectId}/work/items/{itemId}:
 *   put:
 *     summary: Update an item (edit access or bug reporter = everything; assignee = status/stage/progress)
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *   delete:
 *     summary: Delete an item
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 * /api/projects/{projectId}/work/items/{itemId}/move:
 *   patch:
 *     summary: Move a bug on the kanban board
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stage:
 *                 type: string
 *               order:
 *                 type: number
 *     responses:
 *       200:
 *         description: Success
 */
router.put("/items/:itemId", c.updateItem);
router.patch("/items/:itemId/move", c.moveItem);
router.delete("/items/:itemId", c.deleteItem);

/**
 * @swagger
 * /api/projects/{projectId}/work/items/{itemId}/comments:
 *   get:
 *     summary: Comments on an item (anyone who can see the item)
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *   post:
 *     summary: Add a comment (notifies the creator, reporter, assignees and earlier commenters)
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               body:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created
 * /api/projects/{projectId}/work/items/{itemId}/comments/{commentId}:
 *   delete:
 *     summary: Delete a comment (its author, or someone with full edit on the item)
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 * /api/projects/{projectId}/work/items/{itemId}/attachments:
 *   post:
 *     summary: Upload files to an item (multipart field "attachments", max 4 per item, 10MB each)
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Uploaded
 *       400:
 *         description: Too many files
 *   delete:
 *     summary: Remove a file from an item ({ path })
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Removed
 */
router.get("/items/:itemId/comments", c.listComments);
router.post("/items/:itemId/comments", c.addComment);
router.delete("/items/:itemId/comments/:commentId", c.deleteComment);
router.post("/items/:itemId/attachments", taskAttachmentUpload, c.addAttachments);
router.delete("/items/:itemId/attachments", c.removeAttachment);

/**
 * @swagger
 * /api/projects/{projectId}/work/plans:
 *   get:
 *     summary: Plans with progress computed from their tasks
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: module
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *   post:
 *     summary: Create a plan (optionally with taskIds)
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Created
 * /api/projects/{projectId}/work/plans/{planId}:
 *   put:
 *     summary: Update a plan; taskIds replaces its task list
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *   delete:
 *     summary: Delete a plan (tasks are kept)
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.get("/plans", c.listPlans);
router.post("/plans", c.createPlan);
router.put("/plans/:planId", c.updatePlan);
router.delete("/plans/:planId", c.deletePlan);

/**
 * @swagger
 * /api/projects/{projectId}/work/bug-stages:
 *   get:
 *     summary: Bug pipeline stages (default three are created on first use)
 *     tags:
 *       - Project Work
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
 *   post:
 *     summary: Add a bug stage
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Created
 * /api/projects/{projectId}/work/bug-stages/reorder:
 *   put:
 *     summary: Reorder bug stages (send every id once)
 *     tags:
 *       - Project Work
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
 * /api/projects/{projectId}/work/bug-stages/{stageId}:
 *   put:
 *     summary: Rename / recolor a stage or mark it as the done stage
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: stageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *   delete:
 *     summary: Delete a stage (?moveTo=<stageId> when it still has bugs)
 *     tags:
 *       - Project Work
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: stageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *       409:
 *         description: Stage still has bugs
 */
/**
 * @swagger
 * /api/projects/{projectId}/work/timeline:
 *   get:
 *     summary: Gantt data — modules, plans (with progress), tasks and milestones (bugs excluded)
 *     tags:
 *       - Project Work
 *     description: "Requires timeline view access. Dates are changed through the item / plan update endpoints."
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
 *       403:
 *         description: No timeline access
 */
router.get("/timeline", c.getTimeline);

router.get("/bug-stages", c.listBugStages);
router.post("/bug-stages", c.createBugStage);
router.put("/bug-stages/reorder", c.reorderBugStages);
router.put("/bug-stages/:stageId", c.updateBugStage);
router.delete("/bug-stages/:stageId", c.deleteBugStage);

module.exports = router;
