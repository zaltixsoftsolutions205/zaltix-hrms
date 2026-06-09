const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/recruitmentController');

router.use(protect);

const recruitAccess = (req, res, next) => {
  if (req.user.role === 'admin' || req.user.employeeId === 'ZSSE0023') return next();
  return res.status(403).json({ message: 'Access denied' });
};

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
router.post('/projects',       recruitAccess, ctrl.createProject);
router.put('/projects/:id',    recruitAccess, ctrl.updateProject);
router.delete('/projects/:id', recruitAccess, ctrl.deleteProject);

// Stats
router.get('/stats', recruitAccess, ctrl.getStats);

// Job Postings
router.get('/jobs',        recruitAccess, ctrl.getJobPostings);
router.post('/jobs',       recruitAccess, ctrl.createJobPosting);
router.put('/jobs/:id',    recruitAccess, ctrl.updateJobPosting);
router.delete('/jobs/:id', recruitAccess, ctrl.deleteJobPosting);

// Applicants
router.get('/applicants',              recruitAccess, ctrl.getApplicants);
router.post('/applicants',             recruitAccess, upload.single('resume'), ctrl.createApplicant);
router.put('/applicants/:id/status',   recruitAccess, ctrl.updateStatus);
router.delete('/applicants/:id',       recruitAccess, ctrl.deleteApplicant);

module.exports = router;
