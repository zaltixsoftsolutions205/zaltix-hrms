const express = require('express');
const router = express.Router();
const { createEmployee, sendOfferLetter, sendCredentials, getAllEmployees, getEmployee, updateEmployee, updateOwnProfile, deleteEmployee, setEmployeeStatus, updateInternshipStatus,
    getTeamMembers,
    getProfileCompletion,
    uploadProfilePhoto,
    deleteProfilePhoto,
    getMyProfile,
    attachEmployeeDocs,
    getAssignmentOptions } = require('../controllers/employeeController');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');
const uploadProfilePhoto_middleware = require('../middleware/uploadProfilePhoto');
const uploadEmployeeDocs_middleware = require('../middleware/uploadEmployeeDocs');

// HR employee management gated by the 'hr_employees' module.
// NOTE: granting hr_employees edit lets a non-admin create/update employees,
// including setting other employees' moduleAccess. Grant it deliberately.
const hrEmployeesView = moduleAccess('hr_employees', 'view');
const hrEmployeesEdit = moduleAccess('hr_employees', 'edit');

router.use(protect);

// Any authenticated employee — must be before /:id
/**
 * @swagger
 * /api/employees/team:
 *   get:
 *     summary: Get team members
 *     tags:
 *       - Employees
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/team', getTeamMembers);
/**
 * @swagger
 * /api/employees/me:
 *   get:
 *     summary: Get my profile
 *     tags:
 *       - Employees
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/me', getMyProfile);
/**
 * @swagger
 * /api/employees/me/profile-completion:
 *   get:
 *     summary: Get profile completion
 *     tags:
 *       - Employees
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/me/profile-completion', getProfileCompletion);
/**
 * @swagger
 * /api/employees/me/profile-photo:
 *   post:
 *     summary: Upload profile photo
 *     tags:
 *       - Employees
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
router.post('/me/profile-photo', uploadProfilePhoto_middleware.single('file'), uploadProfilePhoto);
/**
 * @swagger
 * /api/employees/me/profile-photo:
 *   delete:
 *     summary: Delete profile photo
 *     tags:
 *       - Employees
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.delete('/me/profile-photo', deleteProfilePhoto);
/**
 * @swagger
 * /api/employees/me/profile:
 *   put:
 *     summary: Update own profile
 *     tags:
 *       - Employees
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
router.put('/me/profile', updateOwnProfile);

// HR / Admin routes
/**
 * @swagger
 * /api/employees/assignment-options:
 *   get:
 *     summary: Get assignment options
 *     tags:
 *       - Employees
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/assignment-options', hrEmployeesEdit, getAssignmentOptions);
/**
 * @swagger
 * /api/employees:
 *   post:
 *     summary: Create employee
 *     tags:
 *       - Employees
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
router.post('/', hrEmployeesEdit, createEmployee);
/**
 * @swagger
 * /api/employees/send-offer:
 *   post:
 *     summary: Send offer letter
 *     tags:
 *       - Employees
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
router.post('/send-offer', hrEmployeesEdit, sendOfferLetter);
/**
 * @swagger
 * /api/employees/send-credentials:
 *   post:
 *     summary: Send credentials
 *     tags:
 *       - Employees
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
router.post('/send-credentials', hrEmployeesEdit, sendCredentials);
/**
 * @swagger
 * /api/employees:
 *   get:
 *     summary: Get all employees
 *     tags:
 *       - Employees
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/', getAllEmployees);
/**
 * @swagger
 * /api/employees/{id}:
 *   get:
 *     summary: Get employee
 *     tags:
 *       - Employees
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
router.get('/:id', getEmployee);
/**
 * @swagger
 * /api/employees/{id}:
 *   put:
 *     summary: Update employee
 *     tags:
 *       - Employees
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
router.put('/:id', hrEmployeesEdit, updateEmployee);
/**
 * @swagger
 * /api/employees/{id}/status:
 *   patch:
 *     summary: Set employee status
 *     tags:
 *       - Employees
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
router.patch('/:id/status', hrEmployeesEdit, setEmployeeStatus);
/**
 * @swagger
 * /api/employees/{id}:
 *   delete:
 *     summary: Delete employee
 *     tags:
 *       - Employees
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
router.delete('/:id', hrEmployeesEdit, deleteEmployee);
/**
 * @swagger
 * /api/employees/{id}/internship:
 *   patch:
 *     summary: Update internship status
 *     tags:
 *       - Employees
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
router.patch('/:id/internship', hrEmployeesEdit, updateInternshipStatus);
/**
 * @swagger
 * /api/employees/{id}/attach-docs:
 *   post:
 *     summary: Attach employee docs
 *     tags:
 *       - Employees
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
 *         multipart/form-data:
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
router.post('/:id/attach-docs', hrEmployeesEdit, uploadEmployeeDocs_middleware.fields([{ name: 'joiningLetter', maxCount: 1 }, { name: 'idCard', maxCount: 1 }]), attachEmployeeDocs);

module.exports = router;
