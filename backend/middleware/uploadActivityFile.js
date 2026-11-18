const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Files attached to lead activities (registration invoices). Not served statically:
// they are downloaded through the activities API, which checks access first.
// Outside uploads/ on purpose: server.js serves uploads/ publicly.
const uploadDir = path.join(__dirname, '../private-uploads/activity-files');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED = ['.pdf', '.jpg', '.jpeg', '.png'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `activity_${String(req.params.id).replace(/[^a-f0-9]/gi, '')}_${Date.now()}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (ALLOWED.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
  else cb(new Error('Only PDF, JPG and PNG files are allowed'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

/** upload.single('file') with JSON errors (too large / wrong type). */
const uploadActivityFile = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (!err) return next();
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'The file can be at most 5 MB' : err.message;
  return res.status(400).json({ message });
});

module.exports = { uploadActivityFile, uploadDir };
