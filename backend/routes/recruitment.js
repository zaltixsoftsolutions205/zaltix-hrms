const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');

// Recruitment Controller
const ctrl = require('../controllers/recruitmentController');

// Project Controller
const {
    getProjects,
    createProject,
    updateProject,
    deleteProject,
    getProject
} = require('../controllers/projectController');

router.use(protect);

const recruitAccess = moduleAccess('recruitment', 'view');
const recruitEdit = moduleAccess('recruitment', 'edit');

// ==========================
// Resume Upload
// ==========================
const uploadDir = path.join(__dirname, '../uploads/resumes');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `resume_${Date.now()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();

        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, DOC, DOCX, JPG, PNG files are allowed.'));
        }
    },
});

// ==========================
// Recruitment Projects
// (Handled by Project Controller)
// ==========================
/**
 * @swagger
 * /api/recruitment/projects:
 *   get:
 *     summary: Get projects
 *     tags:
 *       - Recruitment
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/projects', recruitAccess, getProjects);
/**
 * @swagger
 * /api/recruitment/projects/{id}:
 *   get:
 *     summary: Get project
 *     tags:
 *       - Recruitment
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
router.get('/projects/:id', recruitAccess, getProject);
/**
 * @swagger
 * /api/recruitment/projects:
 *   post:
 *     summary: Create project
 *     tags:
 *       - Recruitment
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
router.post('/projects', recruitEdit, createProject);
/**
 * @swagger
 * /api/recruitment/projects/{id}:
 *   put:
 *     summary: Update project
 *     tags:
 *       - Recruitment
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
router.put('/projects/:id', recruitEdit, updateProject);
/**
 * @swagger
 * /api/recruitment/projects/{id}:
 *   delete:
 *     summary: Delete project
 *     tags:
 *       - Recruitment
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
router.delete('/projects/:id', recruitEdit, deleteProject);

// ==========================
// Recruitment Dashboard
// ==========================
/**
 * @swagger
 * /api/recruitment/stats:
 *   get:
 *     summary: Get stats
 *     tags:
 *       - Recruitment
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/stats', recruitAccess, ctrl.getStats);

// ==========================
// Job Postings
// ==========================
/**
 * @swagger
 * /api/recruitment/jobs:
 *   get:
 *     summary: Get job postings
 *     tags:
 *       - Recruitment
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/jobs',        recruitAccess, ctrl.getJobPostings);
/**
 * @swagger
 * /api/recruitment/jobs:
 *   post:
 *     summary: Create job posting
 *     tags:
 *       - Recruitment
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
router.post('/jobs',       recruitEdit,   ctrl.createJobPosting);
/**
 * @swagger
 * /api/recruitment/jobs/bulk:
 *   post:
 *     summary: Bulk create job postings
 *     tags:
 *       - Recruitment
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
router.post('/jobs/bulk',  recruitEdit,   ctrl.bulkCreateJobPostings);
/**
 * @swagger
 * /api/recruitment/jobs/{id}:
 *   put:
 *     summary: Update job posting
 *     tags:
 *       - Recruitment
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
router.put('/jobs/:id',    recruitEdit,   ctrl.updateJobPosting);
/**
 * @swagger
 * /api/recruitment/jobs/{id}:
 *   delete:
 *     summary: Delete job posting
 *     tags:
 *       - Recruitment
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
router.delete('/jobs/:id', recruitEdit,   ctrl.deleteJobPosting);

// ==========================
// Applicants
// ==========================
/**
 * @swagger
 * /api/recruitment/applicants:
 *   get:
 *     summary: Get applicants
 *     tags:
 *       - Recruitment
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/applicants',              recruitAccess, ctrl.getApplicants);
/**
 * @swagger
 * /api/recruitment/applicants:
 *   post:
 *     summary: Create applicant
 *     tags:
 *       - Recruitment
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
router.post('/applicants',             recruitEdit,   upload.single('resume'), ctrl.createApplicant);
/**
 * @swagger
 * /api/recruitment/applicants/bulk:
 *   post:
 *     summary: Bulk create applicants
 *     tags:
 *       - Recruitment
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
router.post('/applicants/bulk',        recruitEdit,   ctrl.bulkCreateApplicants);
/**
 * @swagger
 * /api/recruitment/applicants/{id}/status:
 *   put:
 *     summary: Update status
 *     tags:
 *       - Recruitment
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
router.put('/applicants/:id/status',   recruitEdit,   ctrl.updateStatus);
/**
 * @swagger
 * /api/recruitment/applicants/{id}/comment:
 *   put:
 *     summary: Update comment
 *     tags:
 *       - Recruitment
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
router.put('/applicants/:id/comment',  recruitEdit,   ctrl.updateComment);
/**
 * @swagger
 * /api/recruitment/applicants/{id}:
 *   delete:
 *     summary: Delete applicant
 *     tags:
 *       - Recruitment
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
router.delete('/applicants/:id',       recruitEdit,   ctrl.deleteApplicant);

module.exports = router;