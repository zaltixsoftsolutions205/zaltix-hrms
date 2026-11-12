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

// ── Employee: own claims, gated by the 'expense_claims' module.
//    view = see own claims; edit = submit / withdraw. Admin bypasses. ──
const canView = moduleAccess('expense_claims', 'view');
const canClaim = moduleAccess('expense_claims', 'edit');
/**
 * @swagger
 * /api/expense-claims/my:
 *   get:
 *     summary: Get my claims
 *     tags:
 *       - Expense Claims
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/my', canView, ctrl.getMyClaims);
/**
 * @swagger
 * /api/expense-claims:
 *   post:
 *     summary: Create claim
 *     tags:
 *       - Expense Claims
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
router.post('/', canClaim, upload.single('receipt'), ctrl.createClaim);
/**
 * @swagger
 * /api/expense-claims/{id}:
 *   delete:
 *     summary: Delete claim
 *     tags:
 *       - Expense Claims
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
router.delete('/:id', canClaim, ctrl.deleteClaim); // withdraw own pending claim

// ── HR / Admin: review ──
/**
 * @swagger
 * /api/expense-claims:
 *   get:
 *     summary: Get all claims
 *     tags:
 *       - Expense Claims
 *     description: "Requires role: hr,admin"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.get('/', roleCheck('hr', 'admin'), ctrl.getAllClaims);
/**
 * @swagger
 * /api/expense-claims/{id}/review:
 *   put:
 *     summary: Review claim
 *     tags:
 *       - Expense Claims
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
router.put('/:id/review', roleCheck('hr', 'admin'), ctrl.reviewClaim);

module.exports = router;
