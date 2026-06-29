const express = require('express');
const router = express.Router();
const { createEmployee, 
    sendOfferLetter, 
    sendCredentials, 
    getAllEmployees, 
    getEmployee,
     updateEmployee, 
     updateOwnProfile,
      deleteEmployee,
      setEmployeeStatus,
      getTeamMembers,
      getProfileCompletion,
       uploadProfilePhoto, 
       deleteProfilePhoto,
        getMyProfile,
        attachEmployeeDocs } = require('../controllers/employeeController');
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
router.get('/team', getTeamMembers);
router.get('/me', getMyProfile);
router.get('/me/profile-completion', getProfileCompletion);
router.post('/me/profile-photo', uploadProfilePhoto_middleware.single('file'), uploadProfilePhoto);
router.delete('/me/profile-photo', deleteProfilePhoto);
router.put('/me/profile', updateOwnProfile);

// HR / Admin routes
router.post('/', hrEmployeesEdit, createEmployee);
router.post('/send-offer', hrEmployeesEdit, sendOfferLetter);
router.post('/send-credentials', hrEmployeesEdit, sendCredentials);
router.get('/', hrEmployeesView, getAllEmployees);
router.get('/:id', getEmployee);
router.put('/:id', hrEmployeesEdit, updateEmployee);
router.patch('/:id/status', hrEmployeesEdit, setEmployeeStatus);
router.delete('/:id', hrEmployeesEdit, deleteEmployee);
router.post('/:id/attach-docs', hrEmployeesEdit, uploadEmployeeDocs_middleware.fields([{ name: 'joiningLetter', maxCount: 1 }, { name: 'idCard', maxCount: 1 }]), attachEmployeeDocs);

module.exports = router;
