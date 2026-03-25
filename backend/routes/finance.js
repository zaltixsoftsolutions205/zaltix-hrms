const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const financeController = require('../controllers/financeController');
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

// Multer setup for receipt uploads
const uploadDir = path.join(__dirname, '../uploads/expenses');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only jpg, png, pdf allowed.'));
    }
  },
});

// Protect all routes
router.use(protect);

// ============ INCOME ROUTES ============
// View: hr + admin | Mutate: hr only
router.get('/income', roleCheck('admin', 'hr'), financeController.getIncome);
router.get('/income/stats', roleCheck('admin', 'hr'), financeController.getIncomeStats);
router.get('/income/:id', roleCheck('admin', 'hr'), financeController.getIncomeById);
router.post('/income', roleCheck('hr'), financeController.createIncome);
router.delete('/income/:id', roleCheck('hr'), financeController.deleteIncome);
router.post('/income/sync-deals', roleCheck('hr'), financeController.syncDealsToIncome);

// ============ EXPENSE ROUTES ============
// View: hr + admin | Mutate: hr only
router.get('/expenses', roleCheck('admin', 'hr'), financeController.getExpenses);
router.get('/expenses/stats', roleCheck('admin', 'hr'), financeController.getExpenseStats);
router.get('/expenses/:id', roleCheck('admin', 'hr'), financeController.getExpenseById);
router.post('/expenses', roleCheck('hr'), (req, res, next) => {
  upload.single('receipt')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
    next();
  });
}, financeController.createExpense);
router.put('/expenses/:id', roleCheck('hr'), financeController.updateExpense);
router.put('/expenses/:id/approve', roleCheck('admin'), financeController.approveExpense);
router.put('/expenses/:id/reject', roleCheck('admin'), financeController.rejectExpense);
router.put('/expenses/:id/set-status', roleCheck('admin'), financeController.setExpenseStatus);
router.delete('/expenses/:id', roleCheck('hr'), financeController.deleteExpense);

// ============ DASHBOARD ROUTES ============
// View: hr + admin
router.get('/dashboard', roleCheck('admin', 'hr'), financeController.getDashboard);
router.get('/reports/yearly', roleCheck('admin', 'hr'), financeController.getYearlyReport);
router.get('/reports/by-category', roleCheck('admin', 'hr'), financeController.getByCategory);
router.get('/reports/by-service', roleCheck('admin', 'hr'), financeController.getByService);
router.get('/reports/profit-by-service', roleCheck('admin', 'hr'), financeController.getProfitByService);

module.exports = router;
