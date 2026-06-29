const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');
const ctrl = require('../controllers/recruitmentController');

router.use(protect);

// Recruitment access is now driven by the 'recruitment' module grant
// (admin bypasses). Replaces the former hardcoded ZSSE0023 special-case.
const recruitAccess = moduleAccess('recruitment', 'view');
const recruitEdit = moduleAccess('recruitment', 'edit');

// Resume upload
const uploadDir = path.join(__dirname, '../uploads/resumes');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'resume_' + Date.now() + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PDF, DOC, DOCX, JPG, PNG files are allowed'), false);
  },
});

// Projects
router.get('/projects',        recruitAccess, ctrl.getProjects);
router.post('/projects',       recruitEdit,   ctrl.createProject);
router.put('/projects/:id',    recruitEdit,   ctrl.updateProject);
router.delete('/projects/:id', recruitEdit,   ctrl.deleteProject);

// Stats
router.get('/stats', recruitAccess, ctrl.getStats);

// Job Postings
router.get('/jobs',        recruitAccess, ctrl.getJobPostings);
router.post('/jobs',       recruitEdit,   ctrl.createJobPosting);
router.put('/jobs/:id',    recruitEdit,   ctrl.updateJobPosting);
router.delete('/jobs/:id', recruitEdit,   ctrl.deleteJobPosting);

// Applicants
router.get('/applicants',              recruitAccess, ctrl.getApplicants);
router.post('/applicants',             recruitEdit,   upload.single('resume'), ctrl.createApplicant);
router.put('/applicants/:id/status',   recruitEdit,   ctrl.updateStatus);
router.delete('/applicants/:id',       recruitEdit,   ctrl.deleteApplicant);

module.exports = router;
