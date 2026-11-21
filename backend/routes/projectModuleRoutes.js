const express = require("express");

// Mounted from projectRoutes at /api/projects/:projectId/modules (protect already applied)
const router = express.Router({ mergeParams: true });

const { listModules, createModule, updateModule, deleteModule, savePositions, addLink, removeLink } = require("../controllers/projectModuleController");
const { loadProjectWithAccess, requireProjectAccess } = require("../services/projectAccessService");

const canView = requireProjectAccess("moduleTree", "view");
const canEdit = requireProjectAccess("moduleTree", "edit");

router.use(loadProjectWithAccess);

/**
 * @swagger
 * /api/projects/{projectId}/modules:
 *   get:
 *     summary: Module tree of a project (cards + links) and the caller's access
 *     tags:
 *       - Project Modules
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
 *         description: No module-tree access
 *   post:
 *     summary: Create a module card
 *     tags:
 *       - Project Modules
 *     description: "Requires moduleTree edit access"
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               color:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [planning, in-progress, done]
 *               lead:
 *                 type: string
 *               position:
 *                 type: object
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Invalid / duplicate name
 *       403:
 *         description: Forbidden
 */
router.get("/", canView, listModules);
router.post("/", canEdit, createModule);

/**
 * @swagger
 * /api/projects/{projectId}/modules/positions:
 *   put:
 *     summary: Save card positions after dragging
 *     tags:
 *       - Project Modules
 *     description: "Requires moduleTree edit access"
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
 *               positions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     x:
 *                       type: number
 *                     y:
 *                       type: number
 *     responses:
 *       200:
 *         description: Success
 */
router.put("/positions", canEdit, savePositions);

/**
 * @swagger
 * /api/projects/{projectId}/modules/{moduleId}:
 *   put:
 *     summary: Update a module card
 *     tags:
 *       - Project Modules
 *     description: "Requires moduleTree edit access"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: moduleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *   delete:
 *     summary: Delete a module card (and links pointing to it)
 *     tags:
 *       - Project Modules
 *     description: "Requires moduleTree edit access"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: moduleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.put("/:moduleId", canEdit, updateModule);
router.delete("/:moduleId", canEdit, deleteModule);

/**
 * @swagger
 * /api/projects/{projectId}/modules/{moduleId}/links:
 *   post:
 *     summary: Link this module to another module of the same project
 *     tags:
 *       - Project Modules
 *     description: "Requires moduleTree edit access"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: moduleId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               target:
 *                 type: string
 *               label:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Self link, duplicate, or other project
 * /api/projects/{projectId}/modules/{moduleId}/links/{linkId}:
 *   delete:
 *     summary: Remove a link
 *     tags:
 *       - Project Modules
 *     description: "Requires moduleTree edit access"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: moduleId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: linkId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.post("/:moduleId/links", canEdit, addLink);
router.delete("/:moduleId/links/:linkId", canEdit, removeLink);

module.exports = router;
