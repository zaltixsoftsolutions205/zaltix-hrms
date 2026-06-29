const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const financeController = require('../controllers/financeController');
const { protect } = require('../middleware/auth');
const { roleCheck, moduleAccess } = require('../middleware/roleCheck');

// Finance module access. Read/list/report endpoints (previously roleCheck
// admin+hr) use 'finance' view; mutating general endpoints use 'finance' edit.
// Sensitive admin-only ops (approve/reject expense, delete invoice/compliance,
// settings update) keep their explicit roleCheck('admin') guard.
const financeView = moduleAccess('finance', 'view');
const financeEdit = moduleAccess('finance', 'edit');

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
router.get('/income', financeView, financeController.getIncome);
router.get('/income/stats', financeView, financeController.getIncomeStats);
router.get('/income/:id', financeView, financeController.getIncomeById);
router.post('/income', roleCheck('hr'), financeController.createIncome);
router.delete('/income/:id', roleCheck('hr'), financeController.deleteIncome);
router.post('/income/sync-deals', roleCheck('hr'), financeController.syncDealsToIncome);

// ============ EXPENSE ROUTES ============
router.get('/expenses', financeView, financeController.getExpenses);
router.get('/expenses/stats', financeView, financeController.getExpenseStats);
router.get('/expenses/:id', financeView, financeController.getExpenseById);
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
router.get('/dashboard', financeView, financeController.getDashboard);
router.get('/reports/yearly', financeView, financeController.getYearlyReport);
router.get('/reports/by-category', financeView, financeController.getByCategory);
router.get('/reports/by-service', financeView, financeController.getByService);
router.get('/reports/profit-by-service', financeView, financeController.getProfitByService);

// ============ INVOICE ROUTES ============
router.get('/invoices', financeView, financeController.getInvoices);
router.get('/invoices/:id', financeView, financeController.getInvoiceById);
router.post('/invoices', financeEdit, financeController.createInvoice);
router.put('/invoices/:id', financeEdit, financeController.updateInvoice);
router.delete('/invoices/:id', roleCheck('admin'), financeController.deleteInvoice);

// ============ PAYMENT ROUTES ============
router.get('/payments', financeView, financeController.getPayments);
router.post('/payments', financeEdit, financeController.createPayment);
router.put('/payments/:id', financeEdit, financeController.updatePayment);
router.delete('/payments/:id', financeEdit, financeController.deletePayment);

// ============ RECEIVABLES ROUTES ============
router.get('/receivables', financeView, financeController.getReceivables);

// ============ VENDOR ROUTES ============
router.get('/vendors', financeView, financeController.getVendors);
router.post('/vendors', financeEdit, financeController.createVendor);
router.put('/vendors/:id', financeEdit, financeController.updateVendor);
router.delete('/vendors/:id', financeEdit, financeController.deleteVendor);

// ============ SALARY ROUTES ============
router.get('/salary', financeView, financeController.getSalaryRegister);

// ============ CASH FLOW ROUTES ============
router.get('/cashflow', financeView, financeController.getCashFlow);

// ============ LEDGER ROUTES ============
router.get('/ledger', financeView, financeController.getLedger);

// ============ COMPLIANCE ROUTES ============
router.get('/compliance',              financeView,                 financeController.getComplianceStatus);
router.post('/compliance',             financeEdit,                 financeController.createComplianceFiling);
router.put('/compliance/:id',          financeEdit,                 financeController.updateComplianceFiling);
router.put('/compliance/:id/mark-filed', financeEdit,               financeController.markFiled);
router.delete('/compliance/:id',       roleCheck('admin'),          financeController.deleteComplianceFiling);

// ============ AUDIT LOG ROUTES ============
router.get('/audit-log', financeView, financeController.getAuditLog);

// ============ INTELLIGENCE ROUTES ============
router.get('/intelligence', financeView, financeController.getIntelligence);

// ============ SETTINGS ROUTES ============
router.get('/settings', financeView, financeController.getFinanceSettings);
router.put('/settings', roleCheck('admin'), financeController.updateFinanceSettings);

module.exports = router;
