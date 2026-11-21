const express = require("express");

const router = express.Router();

const {
    createProject,
    getProjects,
    getProject,
    updateProject,
    deleteProject,
    addProjectMember,
    removeProjectMember,
    archiveProject,
    shiftProjectDepartment,
    addProjectTeamMember,
    removeProjectTeamMember
} = require("../controllers/projectController");

const {
    protect
} = require("../middleware/auth");

router.use(protect);

/* ============================================================
   PROJECT CREATE
============================================================ */

/*
 * Normal JSON project creation.
 *
 * Frontend sends:
 *
 * {
 *   name,
 *   department: ObjectId,
 *   manager: ObjectId,
 *   teamMembers: [ObjectId]
 * }
 */
/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create project
 *     tags:
 *       - Projects
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
router.post( "/", createProject);

/* ============================================================
   GET PROJECTS
============================================================ */
/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get projects
 *     tags:
 *       - Projects
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get( "/", getProjects);

/* ============================================================
   SINGLE PROJECT
============================================================ */
/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     summary: Get project
 *     tags:
 *       - Projects
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
router.get( "/:id", getProject);

/* ============================================================
   UPDATE PROJECT
============================================================ */
/**
 * @swagger
 * /api/projects/{id}:
 *   put:
 *     summary: Update project
 *     tags:
 *       - Projects
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
router.put( "/:id", updateProject);

/* ============================================================
   DELETE PROJECT
============================================================ */
/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     summary: Delete project
 *     tags:
 *       - Projects
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
router.delete( "/:id", deleteProject);

/* ============================================================
   PROJECT MEMBERS
============================================================ */

/**
 * @swagger
 * /api/projects/{id}/members:
 *   post:
 *     summary: Add project member
 *     tags:
 *       - Projects
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
router.post( "/:id/members", addProjectMember);
/**
 * @swagger
 * /api/projects/{id}/members/{userId}:
 *   delete:
 *     summary: Remove project member
 *     tags:
 *       - Projects
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
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
router.delete( "/:id/members/:userId", removeProjectMember);

/* ============================================================
   ARCHIVE / RESTORE
============================================================ */
/**
 * @swagger
 * /api/projects/{id}/archive:
 *   put:
 *     summary: Archive project
 *     tags:
 *       - Projects
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
router.put( "/:id/archive", archiveProject);

/* ============================================================
   DEPARTMENT PAGE HELPERS (also mounted under /api/departments)
============================================================ */

/**
 * @swagger
 * /api/projects/{projectId}/department:
 *   put:
 *     summary: Move a project to another owning department
 *     tags:
 *       - Projects
 *     description: "Admin, or a manager who heads both departments"
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
 *               departmentId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.put("/:projectId/department", shiftProjectDepartment);
/**
 * @swagger
 * /api/projects/{projectId}/team-members:
 *   post:
 *     summary: Add one team member (must belong to one of the project's departments)
 *     tags:
 *       - Projects
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
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         description: Not in a project department
 *       403:
 *         description: Forbidden
 */
router.post("/:projectId/team-members", addProjectTeamMember);
/**
 * @swagger
 * /api/projects/{projectId}/team-members/{userId}:
 *   delete:
 *     summary: Remove one team member
 *     tags:
 *       - Projects
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *       403:
 *         description: Forbidden
 */
router.delete("/:projectId/team-members/:userId", removeProjectTeamMember);

/* ============================================================
   MODULE TREE  (/api/projects/:projectId/modules/...)
============================================================ */
router.use("/:projectId/modules", require("./projectModuleRoutes"));

/* ============================================================
   MODULE WORK: tasks / bugs / milestones, plans, bug stages
   (/api/projects/:projectId/work/...)
============================================================ */
router.use("/:projectId/work", require("./projectWorkRoutes"));

module.exports = router;