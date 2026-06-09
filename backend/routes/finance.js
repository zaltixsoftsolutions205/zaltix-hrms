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
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
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

// ============ INCOME ROUTES ============
router.get('/income', roleCheck('admin', 'hr'), financeController.getIncome);
router.get('/income/stats', roleCheck('admin', 'hr'), financeController.getIncomeStats);
router.get('/income/:id', roleCheck('admin', 'hr'), financeController.getIncomeById);
router.post('/income', roleCheck('hr'), financeController.createIncome);
router.delete('/income/:id', roleCheck('hr'), financeController.deleteIncome);
router.post('/income/sync-deals', roleCheck('hr'), financeController.syncDealsToIncome);

// ============ EXPENSE ROUTES ============
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

// ============ DASHBOARD + REPORT ROUTES ============
router.get('/dashboard', roleCheck('admin', 'hr'), financeController.getDashboard);
router.get('/reports/yearly', roleCheck('admin', 'hr'), financeController.getYearlyReport);
router.get('/reports/by-category', roleCheck('admin', 'hr'), financeController.getByCategory);
router.get('/reports/by-service', roleCheck('admin', 'hr'), financeController.getByService);
router.get('/reports/profit-by-service', roleCheck('admin', 'hr'), financeController.getProfitByService);

// ============ INVOICE ROUTES ============
router.get('/invoices', roleCheck('admin', 'hr'), financeController.getInvoices);
router.get('/invoices/:id', roleCheck('admin', 'hr'), financeController.getInvoiceById);
router.post('/invoices', roleCheck('admin', 'hr'), financeController.createInvoice);
router.put('/invoices/:id', roleCheck('admin', 'hr'), financeController.updateInvoice);
router.delete('/invoices/:id', roleCheck('admin'), financeController.deleteInvoice);

// ============ PAYMENT ROUTES ============
router.get('/payments', roleCheck('admin', 'hr'), financeController.getPayments);
router.post('/payments', roleCheck('admin', 'hr'), financeController.createPayment);
router.put('/payments/:id', roleCheck('admin', 'hr'), financeController.updatePayment);
router.delete('/payments/:id', roleCheck('admin', 'hr'), financeController.deletePayment);

// ============ RECEIVABLES ROUTES ============
router.get('/receivables', roleCheck('admin', 'hr'), financeController.getReceivables);

// ============ VENDOR ROUTES ============
router.get('/vendors', roleCheck('admin', 'hr'), financeController.getVendors);
router.post('/vendors', roleCheck('admin', 'hr'), financeController.createVendor);
router.put('/vendors/:id', roleCheck('admin', 'hr'), financeController.updateVendor);
router.delete('/vendors/:id', roleCheck('admin', 'hr'), financeController.deleteVendor);

// ============ SALARY ROUTES ============
router.get('/salary', roleCheck('admin', 'hr'), financeController.getSalaryRegister);

// ============ CASH FLOW ROUTES ============
router.get('/cashflow', roleCheck('admin', 'hr'), financeController.getCashFlow);

// ============ LEDGER ROUTES ============
router.get('/ledger', roleCheck('admin', 'hr'), financeController.getLedger);

// ============ COMPLIANCE ROUTES ============
router.get('/compliance',              roleCheck('admin', 'hr'),    financeController.getComplianceStatus);
router.post('/compliance',             roleCheck('admin', 'hr'),    financeController.createComplianceFiling);
router.put('/compliance/:id',          roleCheck('admin', 'hr'),    financeController.updateComplianceFiling);
router.put('/compliance/:id/mark-filed', roleCheck('admin', 'hr'), financeController.markFiled);
router.delete('/compliance/:id',       roleCheck('admin'),          financeController.deleteComplianceFiling);

// ============ AUDIT LOG ROUTES ============
router.get('/audit-log', roleCheck('admin', 'hr'), financeController.getAuditLog);

// ============ INTELLIGENCE ROUTES ============
router.get('/intelligence', roleCheck('admin', 'hr'), financeController.getIntelligence);

// ============ SETTINGS ROUTES ============
router.get('/settings', roleCheck('admin', 'hr'), financeController.getFinanceSettings);
router.put('/settings', roleCheck('admin'), financeController.updateFinanceSettings);

module.exports = router;
