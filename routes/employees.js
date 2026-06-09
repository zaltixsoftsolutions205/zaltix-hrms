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
      getTeamMembers, 
      getProfileCompletion,
       uploadProfilePhoto, 
       deleteProfilePhoto,
        getMyProfile, 
        attachEmployeeDocs } = require('../controllers/employeeController');
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const uploadProfilePhoto_middleware = require('../middleware/uploadProfilePhoto');
const uploadEmployeeDocs_middleware = require('../middleware/uploadEmployeeDocs');

router.use(protect);

// Any authenticated employee — must be before /:id
router.get('/team', getTeamMembers);
router.get('/me', getMyProfile);
router.get('/me/profile-completion', getProfileCompletion);
router.post('/me/profile-photo', uploadProfilePhoto_middleware.single('file'), uploadProfilePhoto);
router.delete('/me/profile-photo', deleteProfilePhoto);
router.put('/me/profile', updateOwnProfile);

// HR / Admin routes
router.post('/', roleCheck('hr', 'admin'), createEmployee);
router.post('/send-offer', roleCheck('hr', 'admin'), sendOfferLetter);
router.post('/send-credentials', roleCheck('hr', 'admin'), sendCredentials);
router.get('/', roleCheck('hr', 'admin'), getAllEmployees);
router.get('/:id', getEmployee);
router.put('/:id', roleCheck('hr', 'admin'), updateEmployee);
router.delete('/:id', roleCheck('hr', 'admin'), deleteEmployee);
router.post('/:id/attach-docs', roleCheck('hr', 'admin'), uploadEmployeeDocs_middleware.fields([{ name: 'joiningLetter', maxCount: 1 }, { name: 'idCard', maxCount: 1 }]), attachEmployeeDocs);

module.exports = router;
