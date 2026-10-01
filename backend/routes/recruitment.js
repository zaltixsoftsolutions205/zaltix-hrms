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
router.get('/projects', recruitAccess, getProjects);
router.get('/projects/:id', recruitAccess, getProject);
router.post('/projects', recruitEdit, createProject);
router.put('/projects/:id', recruitEdit, updateProject);
router.delete('/projects/:id', recruitEdit, deleteProject);

// ==========================
// Recruitment Dashboard
// ==========================
router.get('/stats', recruitAccess, ctrl.getStats);

// ==========================
// Job Postings
<<<<<<< HEAD
// ==========================
router.get('/jobs', recruitAccess, ctrl.getJobPostings);
router.post('/jobs', recruitEdit, ctrl.createJobPosting);
router.put('/jobs/:id', recruitEdit, ctrl.updateJobPosting);
router.delete('/jobs/:id', recruitEdit, ctrl.deleteJobPosting);
=======
router.get('/jobs',        recruitAccess, ctrl.getJobPostings);
router.post('/jobs',       recruitEdit,   ctrl.createJobPosting);
router.post('/jobs/bulk',  recruitEdit,   ctrl.bulkCreateJobPostings);
router.put('/jobs/:id',    recruitEdit,   ctrl.updateJobPosting);
router.delete('/jobs/:id', recruitEdit,   ctrl.deleteJobPosting);
>>>>>>> dadaa0fa5a861c2e90636fae4c4da1b4b13b770e

// ==========================
// Applicants
<<<<<<< HEAD
// ==========================
router.get('/applicants', recruitAccess, ctrl.getApplicants);
router.post(
    '/applicants',
    recruitEdit,
    upload.single('resume'),
    ctrl.createApplicant
);
router.put('/applicants/:id/status', recruitEdit, ctrl.updateStatus);
router.delete('/applicants/:id', recruitEdit, ctrl.deleteApplicant);
=======
router.get('/applicants',              recruitAccess, ctrl.getApplicants);
router.post('/applicants',             recruitEdit,   upload.single('resume'), ctrl.createApplicant);
router.post('/applicants/bulk',        recruitEdit,   ctrl.bulkCreateApplicants);
router.put('/applicants/:id/status',   recruitEdit,   ctrl.updateStatus);
router.put('/applicants/:id/comment',  recruitEdit,   ctrl.updateComment);
router.delete('/applicants/:id',       recruitEdit,   ctrl.deleteApplicant);
>>>>>>> dadaa0fa5a861c2e90636fae4c4da1b4b13b770e

module.exports = router;