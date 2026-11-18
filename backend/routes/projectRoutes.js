const express = require("express");

const router = express.Router();

const {
    createProject,
    importProjects,
    getProjects,
    getProject,
    updateProject,
    deleteProject,
    addProjectMember,
    removeProjectMember,
    archiveProject
} = require("../controllers/projectController");

const {
    uploadProjectExcel,
    importProjectsFromExcel
} = require("../middleware/projectImportMiddleware");

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
   EXCEL IMPORT
============================================================ */

/*
 * Excel upload:
 *
 * multipart/form-data
 * field name = "file"
 *
 * Flow:
 *
 * uploadProjectExcel
 *       ↓
 * importProjectsFromExcel
 *       ↓
 * departmentCode → department ObjectId
 * teamLeadEmployeeId → manager ObjectId
 * teamMemberEmployeeIds → ObjectId[]
 *       ↓
 * req.importedProjects
 *       ↓
 * importProjects
 *       ↓
 * createProjectRecord()
 */
/**
 * @swagger
 * /api/projects/import:
 *   post:
 *     summary: Import projects
 *     tags:
 *       - Projects
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.post( "/import", uploadProjectExcel, importProjectsFromExcel, importProjects);

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

module.exports = router;