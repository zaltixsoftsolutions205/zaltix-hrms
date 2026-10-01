const express = require('express');
const router = express.Router();

const { createDepartment, getDepartments, getDepartment, updateDepartment, deleteDepartment, addDepartmentMember, removeDepartmentMember, importDepartments, exportDepartments, getDepartmentEmployees, addDepartmentEmployee, removeDepartmentEmployee, getDepartmentProjects, getDepartmentLeads, addDepartmentLead, assignDepartmentLead, unassignDepartmentLead, } = require("../controllers/departmentController");

const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, }, });

router.use(protect);

// Put these BEFORE /:id
router.post("/import", roleCheck("admin"), upload.single("file"), importDepartments);
router.get("/export", roleCheck("admin"), exportDepartments);
// CRUD
router.post('/', roleCheck('admin'), createDepartment);
router.get('/', getDepartments);
router.get('/:id', getDepartment);
router.put('/:id', roleCheck('admin'), updateDepartment);
router.delete('/:id', roleCheck('admin'), deleteDepartment);

// Members
router.post('/:id/members', roleCheck('admin'), addDepartmentMember);
router.delete('/:id/members/:userId', roleCheck('admin'), removeDepartmentMember);

// Department Employees (Employee Management tab -> Section A)
router.get("/:id/employees", protect, getDepartmentEmployees);
router.post("/:id/employees", protect, roleCheck("admin", "manager"), addDepartmentEmployee);
router.delete("/:id/employees/:employeeId", protect, roleCheck("admin", "manager"), removeDepartmentEmployee);

// Lead Positions (Employee Management tab -> Section B)
router.get("/:id/leads", protect, getDepartmentLeads);
router.post("/:id/leads", protect, roleCheck("admin", "manager"), addDepartmentLead);
router.put("/:id/leads/:leadId", protect, roleCheck("admin", "manager"), assignDepartmentLead);
router.delete("/:id/leads/:leadId", protect, roleCheck("admin", "manager"), unassignDepartmentLead);

// Department Projects (Employee Management tab -> Section C, read side)
router.get("/:id/projects", protect, getDepartmentProjects);


const { shiftProjectDepartment, addProjectTeamMember, removeProjectTeamMember, } = require("../controllers/projectController");

router.put("/:projectId/department", protect, roleCheck("admin", "manager"), shiftProjectDepartment);
router.post("/:projectId/team-members", protect, roleCheck("admin", "manager"), addProjectTeamMember);
router.delete("/:projectId/team-members/:userId", protect, roleCheck("admin", "manager"), removeProjectTeamMember)

module.exports = router;