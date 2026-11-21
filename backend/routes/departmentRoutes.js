const express = require('express');
const router = express.Router();

const { createDepartment, getDepartments, getDepartment, updateDepartment, deleteDepartment, addDepartmentMember, removeDepartmentMember, getDepartmentEmployees, addDepartmentEmployee, removeDepartmentEmployee, getDepartmentProjects, getDepartmentLeads, addDepartmentLead, assignDepartmentLead, unassignDepartmentLead, getDepartmentRoleTree, updateDepartmentRoleTree, getRoleOptions, moveDepartmentEmployee, getDeleteDepartmentPreview, } = require("../controllers/departmentController");

const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

router.use(protect);

// Department details (employees, roles, projects, lead positions) are only for
// admin, HR, users with the department / hr_employees module, or the head.
const mongoose = require('mongoose');
const Department = require('../models/Department');
const { canViewDepartmentDetails } = require('../services/departmentAccessService');
const canViewDepartment = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid department id.' });
    const dept = await Department.findById(req.params.id).select('headOf').lean();
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found.' });
    if (!canViewDepartmentDetails(req.user, dept)) {
      return res.status(403).json({ success: false, message: 'You do not have access to this department.' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

// Put these BEFORE /:id
/**
 * @swagger
 * /api/departments/roles/options:
 *   get:
 *     summary: Roles that can be added to a department role tree
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
router.get("/roles/options", getRoleOptions);
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
router.get('/:id', canViewDepartment, getDepartment);
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

/**
 * @swagger
 * /api/departments/{id}/delete-preview:
 *   get:
 *     summary: What deleting a department affects (employees, child departments, projects, targets)
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
 *       404:
 *         description: Not found
 */
router.get('/:id/delete-preview', roleCheck('admin'), getDeleteDepartmentPreview);


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
router.get("/:id/employees", protect, canViewDepartment, getDepartmentEmployees);
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
/**
 * @swagger
 * /api/departments/{id}/employees/{employeeId}/move:
 *   post:
 *     summary: Move an employee to another department
 *     tags:
 *       - Departments
 *     description: "Admin, or a manager who heads both departments. The employee's role must be in the target's role tree."
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
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               toDepartment:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         description: Role not allowed / invalid move
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.post("/:id/employees/:employeeId/move", protect, roleCheck("admin", "manager"), moveDepartmentEmployee);

// Role & Permission management
/**
 * @swagger
 * /api/departments/{id}/role-tree:
 *   get:
 *     summary: Get the department's role tree and member count per role
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
 *       404:
 *         description: Not found
 *   put:
 *     summary: Replace the department's role tree
 *     tags:
 *       - Departments
 *     description: "Admin or this department's manager"
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
 *             properties:
 *               roleTree:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                     parentRole:
 *                       type: string
 *                     order:
 *                       type: number
 *                     projectAccess:
 *                       type: object
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         description: Invalid tree
 *       403:
 *         description: Forbidden
 *       409:
 *         description: Members still have a removed role
 */
router.get("/:id/role-tree", protect, canViewDepartment, getDepartmentRoleTree);
router.put("/:id/role-tree", protect, roleCheck("admin", "manager"), updateDepartmentRoleTree);

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
router.get("/:id/leads", protect, canViewDepartment, getDepartmentLeads);
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
router.get("/:id/projects", protect, canViewDepartment, getDepartmentProjects);


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