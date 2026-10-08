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
router.post( "/import", uploadProjectExcel, importProjectsFromExcel, importProjects);

/* ============================================================
   GET PROJECTS
============================================================ */
router.get( "/", getProjects);

/* ============================================================
   SINGLE PROJECT
============================================================ */
router.get( "/:id", getProject);

/* ============================================================
   UPDATE PROJECT
============================================================ */
router.put( "/:id", updateProject);

/* ============================================================
   DELETE PROJECT
============================================================ */
router.delete( "/:id", deleteProject);

/* ============================================================
   PROJECT MEMBERS
============================================================ */

router.post( "/:id/members", addProjectMember);
router.delete( "/:id/members/:userId", removeProjectMember);

/* ============================================================
   ARCHIVE / RESTORE
============================================================ */
router.put( "/:id/archive", archiveProject);

module.exports = router;