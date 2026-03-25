const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../uploads/profile-photos');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `profile_${req.user._id}_${Date.now()}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.jfif'];
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'image/jfif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext) || allowedMimes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPG, JPEG, PNG and WEBP files are allowed for profile photos'));
};

module.exports = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });
