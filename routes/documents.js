const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const upload = require('../middleware/uploadDocument');
const {
  getMyDocuments,
  uploadDocument,
  getEmployeeDocuments,
  reviewDocument,
} = require('../controllers/documentController');

// Employee: get own documents
router.get('/my', protect, getMyDocuments);

// Employee: upload a document
router.post('/upload', protect, upload.single('file'), uploadDocument);

// HR/Admin: get all documents for a specific employee
router.get('/employee/:employeeId', protect, roleCheck('hr', 'admin'), getEmployeeDocuments);

// HR/Admin: approve or reject a document
router.patch('/:id/review', protect, roleCheck('hr', 'admin'), reviewDocument);

module.exports = router;
