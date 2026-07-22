const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const { protect } = require('../middleware/auth');
const { roleCheck, moduleAccess } = require('../middleware/roleCheck');
const ctrl = require('../controllers/expenseClaimController');

// Reuse the finance receipts directory — same kind of attachment.
const uploadDir = path.join(__dirname, '../uploads/expenses');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `claim-${Date.now()}-${file.originalname}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only jpg, png, pdf allowed.'));
  },
});

router.use(protect);

// ── Employee: own claims. Gated by Field Sales *edit* access, so only
//    field-sales editors can submit — HR/Admin pass via the admin bypass. ──
const canClaim = moduleAccess('field_sales', 'edit');
router.get('/my', canClaim, ctrl.getMyClaims);
router.post('/', canClaim, upload.single('receipt'), ctrl.createClaim);
router.delete('/:id', canClaim, ctrl.deleteClaim); // withdraw own pending claim

// ── HR / Admin: review ──
router.get('/', roleCheck('hr', 'admin'), ctrl.getAllClaims);
router.put('/:id/review', roleCheck('hr', 'admin'), ctrl.reviewClaim);

module.exports = router;
