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
/**
 * @swagger
 * /api/finance/income:
 *   get:
 *     summary: Get income
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/income', financeView, financeController.getIncome);
/**
 * @swagger
 * /api/finance/income/stats:
 *   get:
 *     summary: Get income stats
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/income/stats', financeView, financeController.getIncomeStats);
/**
 * @swagger
 * /api/finance/income/{id}:
 *   get:
 *     summary: Get income by id
 *     tags:
 *       - Finance
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
router.get('/income/:id', financeView, financeController.getIncomeById);
/**
 * @swagger
 * /api/finance/income:
 *   post:
 *     summary: Create income
 *     tags:
 *       - Finance
 *     description: "Requires role: hr"
 *     security:
 *       - BearerAuth: []
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
 */
router.post('/income', roleCheck('hr'), financeController.createIncome);
/**
 * @swagger
 * /api/finance/income/{id}:
 *   delete:
 *     summary: Delete income
 *     tags:
 *       - Finance
 *     description: "Requires role: hr"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete('/income/:id', roleCheck('hr'), financeController.deleteIncome);
/**
 * @swagger
 * /api/finance/income/sync-deals:
 *   post:
 *     summary: Sync deals to income
 *     tags:
 *       - Finance
 *     description: "Requires role: hr"
 *     security:
 *       - BearerAuth: []
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
 */
router.post('/income/sync-deals', roleCheck('hr'), financeController.syncDealsToIncome);

// ============ EXPENSE ROUTES ============
/**
 * @swagger
 * /api/finance/expenses:
 *   get:
 *     summary: Get expenses
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/expenses', financeView, financeController.getExpenses);
/**
 * @swagger
 * /api/finance/expenses/stats:
 *   get:
 *     summary: Get expense stats
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/expenses/stats', financeView, financeController.getExpenseStats);
/**
 * @swagger
 * /api/finance/expenses/{id}:
 *   get:
 *     summary: Get expense by id
 *     tags:
 *       - Finance
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
router.get('/expenses/:id', financeView, financeController.getExpenseById);
/**
 * @swagger
 * /api/finance/expenses:
 *   post:
 *     summary: Create expense
 *     tags:
 *       - Finance
 *     description: "Requires role: hr"
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
 *       403:
 *         description: Forbidden
 */
router.post('/expenses', roleCheck('hr'), (req, res, next) => {
  upload.single('receipt')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
    next();
  });
}, financeController.createExpense);
/**
 * @swagger
 * /api/finance/expenses/{id}:
 *   put:
 *     summary: Update expense
 *     tags:
 *       - Finance
 *     description: "Requires role: hr"
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
router.put('/expenses/:id', roleCheck('hr'), financeController.updateExpense);
/**
 * @swagger
 * /api/finance/expenses/{id}/approve:
 *   put:
 *     summary: Approve expense
 *     tags:
 *       - Finance
 *     description: "Requires role: admin"
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
router.put('/expenses/:id/approve', roleCheck('admin'), financeController.approveExpense);
/**
 * @swagger
 * /api/finance/expenses/{id}/reject:
 *   put:
 *     summary: Reject expense
 *     tags:
 *       - Finance
 *     description: "Requires role: admin"
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
router.put('/expenses/:id/reject', roleCheck('admin'), financeController.rejectExpense);
/**
 * @swagger
 * /api/finance/expenses/{id}/set-status:
 *   put:
 *     summary: Set expense status
 *     tags:
 *       - Finance
 *     description: "Requires role: admin"
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
router.put('/expenses/:id/set-status', roleCheck('admin'), financeController.setExpenseStatus);
/**
 * @swagger
 * /api/finance/expenses/{id}:
 *   delete:
 *     summary: Delete expense
 *     tags:
 *       - Finance
 *     description: "Requires role: hr"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete('/expenses/:id', roleCheck('hr'), financeController.deleteExpense);

// ============ DASHBOARD + REPORT ROUTES ============
/**
 * @swagger
 * /api/finance/dashboard:
 *   get:
 *     summary: Get dashboard
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/dashboard', financeView, financeController.getDashboard);
/**
 * @swagger
 * /api/finance/reports/yearly:
 *   get:
 *     summary: Get yearly report
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/reports/yearly', financeView, financeController.getYearlyReport);
/**
 * @swagger
 * /api/finance/reports/by-category:
 *   get:
 *     summary: Get by category
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/reports/by-category', financeView, financeController.getByCategory);
/**
 * @swagger
 * /api/finance/reports/by-service:
 *   get:
 *     summary: Get by service
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/reports/by-service', financeView, financeController.getByService);
/**
 * @swagger
 * /api/finance/reports/profit-by-service:
 *   get:
 *     summary: Get profit by service
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/reports/profit-by-service', financeView, financeController.getProfitByService);

// ============ INVOICE ROUTES ============
/**
 * @swagger
 * /api/finance/invoices:
 *   get:
 *     summary: Get invoices
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/invoices', financeView, financeController.getInvoices);
/**
 * @swagger
 * /api/finance/invoices/{id}:
 *   get:
 *     summary: Get invoice by id
 *     tags:
 *       - Finance
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
router.get('/invoices/:id', financeView, financeController.getInvoiceById);
/**
 * @swagger
 * /api/finance/invoices:
 *   post:
 *     summary: Create invoice
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
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
 */
router.post('/invoices', financeEdit, financeController.createInvoice);
/**
 * @swagger
 * /api/finance/invoices/{id}:
 *   put:
 *     summary: Update invoice
 *     tags:
 *       - Finance
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
 *       404:
 *         description: Not found
 */
router.put('/invoices/:id', financeEdit, financeController.updateInvoice);
/**
 * @swagger
 * /api/finance/invoices/{id}:
 *   delete:
 *     summary: Delete invoice
 *     tags:
 *       - Finance
 *     description: "Requires role: admin"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete('/invoices/:id', roleCheck('admin'), financeController.deleteInvoice);

// ============ PAYMENT ROUTES ============
/**
 * @swagger
 * /api/finance/payments:
 *   get:
 *     summary: Get payments
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/payments', financeView, financeController.getPayments);
/**
 * @swagger
 * /api/finance/payments:
 *   post:
 *     summary: Create payment
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
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
 */
router.post('/payments', financeEdit, financeController.createPayment);
/**
 * @swagger
 * /api/finance/payments/{id}:
 *   put:
 *     summary: Update payment
 *     tags:
 *       - Finance
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
 *       404:
 *         description: Not found
 */
router.put('/payments/:id', financeEdit, financeController.updatePayment);
/**
 * @swagger
 * /api/finance/payments/{id}:
 *   delete:
 *     summary: Delete payment
 *     tags:
 *       - Finance
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
router.delete('/payments/:id', financeEdit, financeController.deletePayment);

// ============ RECEIVABLES ROUTES ============
/**
 * @swagger
 * /api/finance/receivables:
 *   get:
 *     summary: Get receivables
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/receivables', financeView, financeController.getReceivables);

// ============ VENDOR ROUTES ============
/**
 * @swagger
 * /api/finance/vendors:
 *   get:
 *     summary: Get vendors
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/vendors', financeView, financeController.getVendors);
/**
 * @swagger
 * /api/finance/vendors:
 *   post:
 *     summary: Create vendor
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
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
 */
router.post('/vendors', financeEdit, financeController.createVendor);
/**
 * @swagger
 * /api/finance/vendors/{id}:
 *   put:
 *     summary: Update vendor
 *     tags:
 *       - Finance
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
 *       404:
 *         description: Not found
 */
router.put('/vendors/:id', financeEdit, financeController.updateVendor);
/**
 * @swagger
 * /api/finance/vendors/{id}:
 *   delete:
 *     summary: Delete vendor
 *     tags:
 *       - Finance
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
router.delete('/vendors/:id', financeEdit, financeController.deleteVendor);

// ============ SALARY ROUTES ============
/**
 * @swagger
 * /api/finance/salary:
 *   get:
 *     summary: Get salary register
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/salary', financeView, financeController.getSalaryRegister);

// ============ CASH FLOW ROUTES ============
/**
 * @swagger
 * /api/finance/cashflow:
 *   get:
 *     summary: Get cash flow
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/cashflow', financeView, financeController.getCashFlow);

// ============ LEDGER ROUTES ============
/**
 * @swagger
 * /api/finance/ledger:
 *   get:
 *     summary: Get ledger
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/ledger', financeView, financeController.getLedger);

// ============ COMPLIANCE ROUTES ============
/**
 * @swagger
 * /api/finance/compliance:
 *   get:
 *     summary: Get compliance status
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/compliance',              financeView,                 financeController.getComplianceStatus);
/**
 * @swagger
 * /api/finance/compliance:
 *   post:
 *     summary: Create compliance filing
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
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
 */
router.post('/compliance',             financeEdit,                 financeController.createComplianceFiling);
/**
 * @swagger
 * /api/finance/compliance/{id}:
 *   put:
 *     summary: Update compliance filing
 *     tags:
 *       - Finance
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
 *       404:
 *         description: Not found
 */
router.put('/compliance/:id',          financeEdit,                 financeController.updateComplianceFiling);
/**
 * @swagger
 * /api/finance/compliance/{id}/mark-filed:
 *   put:
 *     summary: Mark filed
 *     tags:
 *       - Finance
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
 *       404:
 *         description: Not found
 */
router.put('/compliance/:id/mark-filed', financeEdit,               financeController.markFiled);
/**
 * @swagger
 * /api/finance/compliance/{id}:
 *   delete:
 *     summary: Delete compliance filing
 *     tags:
 *       - Finance
 *     description: "Requires role: admin"
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
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete('/compliance/:id',       roleCheck('admin'),          financeController.deleteComplianceFiling);

// ============ AUDIT LOG ROUTES ============
/**
 * @swagger
 * /api/finance/audit-log:
 *   get:
 *     summary: Get audit log
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/audit-log', financeView, financeController.getAuditLog);

// ============ INTELLIGENCE ROUTES ============
/**
 * @swagger
 * /api/finance/intelligence:
 *   get:
 *     summary: Get intelligence
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/intelligence', financeView, financeController.getIntelligence);

// ============ SETTINGS ROUTES ============
/**
 * @swagger
 * /api/finance/settings:
 *   get:
 *     summary: Get finance settings
 *     tags:
 *       - Finance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get('/settings', financeView, financeController.getFinanceSettings);
/**
 * @swagger
 * /api/finance/settings:
 *   put:
 *     summary: Update finance settings
 *     tags:
 *       - Finance
 *     description: "Requires role: admin"
 *     security:
 *       - BearerAuth: []
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
 */
router.put('/settings', roleCheck('admin'), financeController.updateFinanceSettings);

module.exports = router;
