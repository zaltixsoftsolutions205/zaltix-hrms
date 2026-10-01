/**
 * middleware/taskUpload.js
 *
 * ASSUMPTION TO VERIFY: no existing Multer/upload middleware was provided,
 * so this creates a fresh one with local disk storage under /uploads/tasks.
 * If your project already has an upload middleware (e.g. S3, Cloudinary),
 * DELETE this file and instead:
 *   1. reuse your existing `upload` instance
 *   2. update `buildAttachmentPaths()` in taskController.js to build URLs
 *      the way your existing storage provider does (e.g. file.location for S3)
 *
 * Serves files statically — make sure your main server file has:
 *   app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const MAX_ATTACHMENTS = 4;

const uploadDir = path.join(__dirname, '..', 'uploads', 'tasks');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

// Adjust allowed mimetypes here if you want to restrict file types.
const fileFilter = (req, file, cb) => cb(null, true);

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file — adjust as needed
    files: MAX_ATTACHMENTS,
  },
});

/**
 * Wraps multer's `.array()` so a file-count/size violation returns a clean
 * JSON 400 instead of an unhandled multer error reaching Express's default
 * error handler.
 */
const taskAttachmentUpload = (req, res, next) => {
  upload.array('attachments', MAX_ATTACHMENTS)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: 'Maximum 4 attachments are allowed.',
        });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'Each attachment must be smaller than 10MB.',
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error.',
      });
    }
    next();
  });
};

module.exports = { taskAttachmentUpload, MAX_ATTACHMENTS };