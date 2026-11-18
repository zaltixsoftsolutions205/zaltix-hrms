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
  downloadDocument,
} = require('../controllers/documentController');

// Employee: get own documents
/**
 * @swagger
 * /api/documents/my:
 *   get:
 *     summary: Get my documents
 *     tags:
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/my', protect, getMyDocuments);

// Employee: upload a document
/**
 * @swagger
 * /api/documents/upload:
 *   post:
 *     summary: Upload document
 *     tags:
 *       - Documents
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
router.post('/upload', protect, upload.single('file'), uploadDocument);

// HR/Admin: get all documents for a specific employee
/**
 * @swagger
 * /api/documents/employee/{employeeId}:
 *   get:
 *     summary: Get employee documents
 *     tags:
 *       - Documents
 *     description: "Requires role: hr,admin"
 *     security:
 *       - BearerAuth: []
 *     parameters:
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
router.get('/employee/:employeeId', protect, roleCheck('hr', 'admin'), getEmployeeDocuments);

// HR/Admin: approve or reject a document
/**
 * @swagger
 * /api/documents/{id}/review:
 *   patch:
 *     summary: Review document
 *     tags:
 *       - Documents
 *     description: "Requires role: hr,admin"
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
router.patch('/:id/review', protect, roleCheck('hr', 'admin'), reviewDocument);

// 
/**
 * @swagger
 * /api/documents/{id}/download:
 *   get:
 *     summary: Download document
 *     tags:
 *       - Documents
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
router.get("/:id/download", protect, downloadDocument );
module.exports = router;
