const express = require('express');
const router = express.Router();

const { createDepartment, getDepartments, getDepartment, updateDepartment, deleteDepartment, addDepartmentMember, removeDepartmentMember, importDepartments, exportDepartments, getDepartmentEmployees, addDepartmentEmployee, removeDepartmentEmployee, getDepartmentProjects, getDepartmentLeads, addDepartmentLead, assignDepartmentLead, unassignDepartmentLead, } = require("../controllers/departmentController");

const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, }, });

router.use(protect);

// Put these BEFORE /:id
/**
 * @swagger
 * /api/departments/import:
 *   post:
 *     summary: Import departments
 *     tags:
 *       - Departments
 *     description: "Requires role: admin"
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
 *       403:
 *         description: Forbidden
 */
router.post("/import", roleCheck("admin"), upload.single("file"), importDepartments);
/**
 * @swagger
 * /api/departments/export:
 *   get:
 *     summary: Export departments
 *     tags:
 *       - Departments
 *     description: "Requires role: admin"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.get("/export", roleCheck("admin"), exportDepartments);
// CRUD
/**
 * @swagger
 * /api/departments:
 *   post:
 *     summary: Create department
 *     tags:
 *       - Departments
 *     description: "Requires role: admin"
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
 *       403:
 *         description: Forbidden
 */
router.post('/', roleCheck('admin'), createDepartment);
/**
 * @swagger
 * /api/departments:
 *   get:
 *     summary: Get departments
 *     tags:
 *       - Departments
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', getDepartments);
/**
 * @swagger
 * /api/departments/{id}:
 *   get:
 *     summary: Get department
 *     tags:
 *       - Departments
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
router.get('/:id', getDepartment);
/**
 * @swagger
 * /api/departments/{id}:
 *   put:
 *     summary: Update department
 *     tags:
 *       - Departments
 *     description: "Requires role: admin"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.put('/:id', roleCheck('admin'), updateDepartment);
/**
 * @swagger
 * /api/departments/{id}:
 *   delete:
 *     summary: Delete department
 *     tags:
 *       - Departments
 *     description: "Requires role: admin"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete('/:id', roleCheck('admin'), deleteDepartment);

// Members
/**
 * @swagger
 * /api/departments/{id}/members:
 *   post:
 *     summary: Add department member
 *     tags:
 *       - Departments
 *     description: "Requires role: admin"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.post('/:id/members', roleCheck('admin'), addDepartmentMember);
/**
 * @swagger
 * /api/departments/{id}/members/{userId}:
 *   delete:
 *     summary: Remove department member
 *     tags:
 *       - Departments
 *     description: "Requires role: admin"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete('/:id/members/:userId', roleCheck('admin'), removeDepartmentMember);

// Department Employees (Employee Management tab -> Section A)
/**
 * @swagger
 * /api/departments/{id}/employees:
 *   get:
 *     summary: Get department employees
 *     tags:
 *       - Departments
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
router.get("/:id/employees", protect, getDepartmentEmployees);
/**
 * @swagger
 * /api/departments/{id}/employees:
 *   post:
 *     summary: Add department employee
 *     tags:
 *       - Departments
 *     description: "Requires role: admin,manager"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.post("/:id/employees", protect, roleCheck("admin", "manager"), addDepartmentEmployee);
/**
 * @swagger
 * /api/departments/{id}/employees/{employeeId}:
 *   delete:
 *     summary: Remove department employee
 *     tags:
 *       - Departments
 *     description: "Requires role: admin,manager"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete("/:id/employees/:employeeId", protect, roleCheck("admin", "manager"), removeDepartmentEmployee);

// Lead Positions (Employee Management tab -> Section B)
/**
 * @swagger
 * /api/departments/{id}/leads:
 *   get:
 *     summary: Get department leads
 *     tags:
 *       - Departments
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
router.get("/:id/leads", protect, getDepartmentLeads);
/**
 * @swagger
 * /api/departments/{id}/leads:
 *   post:
 *     summary: Add department lead
 *     tags:
 *       - Departments
 *     description: "Requires role: admin,manager"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.post("/:id/leads", protect, roleCheck("admin", "manager"), addDepartmentLead);
/**
 * @swagger
 * /api/departments/{id}/leads/{leadId}:
 *   put:
 *     summary: Assign department lead
 *     tags:
 *       - Departments
 *     description: "Requires role: admin,manager"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: leadId
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.put("/:id/leads/:leadId", protect, roleCheck("admin", "manager"), assignDepartmentLead);
/**
 * @swagger
 * /api/departments/{id}/leads/{leadId}:
 *   delete:
 *     summary: Unassign department lead
 *     tags:
 *       - Departments
 *     description: "Requires role: admin,manager"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: leadId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete("/:id/leads/:leadId", protect, roleCheck("admin", "manager"), unassignDepartmentLead);

// Department Projects (Employee Management tab -> Section C, read side)
/**
 * @swagger
 * /api/departments/{id}/projects:
 *   get:
 *     summary: Get department projects
 *     tags:
 *       - Departments
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
router.get("/:id/projects", protect, getDepartmentProjects);


const { shiftProjectDepartment, addProjectTeamMember, removeProjectTeamMember, } = require("../controllers/projectController");

/**
 * @swagger
 * /api/departments/{projectId}/department:
 *   put:
 *     summary: Shift project department
 *     tags:
 *       - Departments
 *     description: "Requires role: admin,manager"
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
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.put("/:projectId/department", protect, roleCheck("admin", "manager"), shiftProjectDepartment);
/**
 * @swagger
 * /api/departments/{projectId}/team-members:
 *   post:
 *     summary: Add project team member
 *     tags:
 *       - Departments
 *     description: "Requires role: admin,manager"
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
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.post("/:projectId/team-members", protect, roleCheck("admin", "manager"), addProjectTeamMember);
/**
 * @swagger
 * /api/departments/{projectId}/team-members/{userId}:
 *   delete:
 *     summary: Remove project team member
 *     tags:
 *       - Departments
 *     description: "Requires role: admin,manager"
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
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete("/:projectId/team-members/:userId", protect, roleCheck("admin", "manager"), removeProjectTeamMember)

module.exports = router;