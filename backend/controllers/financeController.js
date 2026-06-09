const Income = require('../models/Income');
const Expense = require('../models/Expense');
const Deal = require('../models/Deal');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Vendor = require('../models/Vendor');
const FinanceAuditLog = require('../models/FinanceAuditLog');
const FinanceSettings = require('../models/FinanceSettings');
const Payslip = require('../models/Payslip');
const ComplianceFiling = require('../models/ComplianceFiling');

// ─── helpers ────────────────────────────────────────────────────────────────

function monthRange(month, year) {
  const start = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { $gte: start, $lt: end };
}

async function logAudit(userId, action, module, target, details = '', ip = '') {
  try {
    await FinanceAuditLog.create({ user: userId, action, module, target, details, ip });
  } catch (_) { /* non-blocking */ }
}

// ============ INCOME HANDLERS ============

exports.getIncome = async (req, res) => {
  const { month, year, type, category, serviceType, limit = 50, skip = 0 } = req.query;
  try {
    let filter = {};
    if (month && year) filter.date = monthRange(month, year);
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (serviceType) filter.serviceType = serviceType;

    const income = await Income.find(filter)
      .populate('dealId', 'name finalDealAmount status')
      .populate('createdBy', 'name employeeId')
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Income.countDocuments(filter);
    res.json({ income, total, limit: parseInt(limit), skip: parseInt(skip) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getIncomeStats = async (req, res) => {
  const { month, year } = req.query;
  try {
    let filter = {};
    if (month && year) filter.date = monthRange(month, year);

    const [totalIncome, dealIncome, manualIncome, byService] = await Promise.all([
      Income.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Income.aggregate([{ $match: { ...filter, type: 'deal' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Income.aggregate([{ $match: { ...filter, type: 'manual' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Income.aggregate([{ $match: filter }, { $group: { _id: '$serviceType', total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    ]);

    res.json({
      totalIncome: totalIncome[0]?.total || 0,
      dealIncome: dealIncome[0]?.total || 0,
      manualIncome: manualIncome[0]?.total || 0,
      byService: byService || [],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getIncomeById = async (req, res) => {
  try {
    const income = await Income.findById(req.params.id)
      .populate('dealId')
      .populate('createdBy', 'name employeeId');
    if (!income) return res.status(404).json({ message: 'Income not found' });
    res.json(income);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createIncome = async (req, res) => {
  const { amount, date, description, notes, category } = req.body;
  try {
    if (!amount || !date) return res.status(400).json({ message: 'Amount and date are required' });

    const income = await Income.create({
      type: 'manual',
      category: category || 'general',
      amount,
      date: new Date(date),
      description,
      notes,
      createdBy: req.user._id,
    });

    await logAudit(req.user._id, 'Created', 'Income', income._id.toString(), `₹${amount}`, req.ip);
    const populated = await Income.findById(income._id).populate('createdBy', 'name employeeId');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteIncome = async (req, res) => {
  try {
    const income = await Income.findById(req.params.id);
    if (!income) return res.status(404).json({ message: 'Income not found' });
    if (income.type !== 'manual') {
      return res.status(400).json({ message: 'Cannot delete auto-synced deal income. Delete the deal instead.' });
    }

    await income.deleteOne();
    await logAudit(req.user._id, 'Deleted', 'Income', req.params.id, '', req.ip);
    res.json({ message: 'Income deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.syncDealsToIncome = async (req, res) => {
  try {
    const wonDeals = await Deal.find({ status: 'won' });
    const synced = [];
    const skipped = [];

    for (const deal of wonDeals) {
      const existingIncome = await Income.findOne({ dealId: deal._id });
      if (existingIncome) {
        skipped.push(deal._id);
      } else {
        await Income.create({
          type: 'deal',
          amount: deal.finalDealAmount,
          date: new Date(),
          description: `Revenue from deal: ${deal.name}`,
          dealId: deal._id,
          serviceType: deal.serviceType,
          syncedAt: new Date(),
          createdBy: deal.assignedTo,
        });
        synced.push(deal._id);
      }
    }

    res.json({ synced: synced.length, skipped: skipped.length, message: `Synced ${synced.length} deals` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============ EXPENSE HANDLERS ============

exports.getExpenses = async (req, res) => {
  const { month, year, category, status, limit = 50, skip = 0 } = req.query;
  try {
    let filter = {};
    if (month && year) filter.date = monthRange(month, year);
    if (category) filter.category = category;
    if (status) filter.status = status;

    const expenses = await Expense.find(filter)
      .populate('createdBy', 'name employeeId')
      .populate('approvedBy', 'name employeeId')
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Expense.countDocuments(filter);
    res.json({ expenses, total, limit: parseInt(limit), skip: parseInt(skip) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getExpenseStats = async (req, res) => {
  const { month, year } = req.query;
  try {
    let filter = {};
    if (month && year) filter.date = monthRange(month, year);

    const [totalExpense, byCategory, byStatus] = await Promise.all([
      Expense.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Expense.aggregate([{ $match: filter }, { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Expense.aggregate([{ $match: filter }, { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    ]);

    res.json({
      totalExpense: totalExpense[0]?.total || 0,
      byCategory: byCategory || [],
      byStatus: byStatus || [],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('createdBy', 'name employeeId')
      .populate('approvedBy', 'name employeeId');
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    res.json(expense);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createExpense = async (req, res) => {
  const { category, amount, date, description, notes } = req.body;
  try {
    if (!category || !amount || !date || !description) {
      return res.status(400).json({ message: 'Category, amount, date, and description are required' });
    }

    const expenseData = {
      category,
      amount,
      date: new Date(date),
      description,
      notes,
      createdBy: req.user._id,
    };

    if (req.file) {
      expenseData.receiptPath = req.file.path;
      expenseData.receiptFileName = req.file.filename;
    }

    const expense = await Expense.create(expenseData);
    await logAudit(req.user._id, 'Created', 'Expense', expense._id.toString(), `₹${amount} - ${category}`, req.ip);
    const populated = await Expense.findById(expense._id)
      .populate('createdBy', 'name employeeId')
      .populate('approvedBy', 'name employeeId');

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateExpense = async (req, res) => {
  const { category, amount, date, description, customCategory, notes } = req.body;
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    if (expense.status === 'approved') {
      return res.status(400).json({ message: 'Cannot update approved expense' });
    }

    if (category) expense.category = category;
    if (amount !== undefined) expense.amount = amount;
    if (date) expense.date = new Date(date);
    if (description) expense.description = description;
    if (customCategory) expense.customCategory = customCategory;
    if (notes) expense.notes = notes;

    await expense.save();
    await logAudit(req.user._id, 'Edited', 'Expense', expense._id.toString(), '', req.ip);

    const populated = await Expense.findById(expense._id)
      .populate('createdBy', 'name employeeId')
      .populate('approvedBy', 'name employeeId');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.approveExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    expense.status = 'approved';
    expense.approvedBy = req.user._id;
    await expense.save();
    await logAudit(req.user._id, 'Approved', 'Expense', expense._id.toString(), '', req.ip);

    const populated = await Expense.findById(expense._id)
      .populate('createdBy', 'name employeeId')
      .populate('approvedBy', 'name employeeId');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.rejectExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    expense.status = 'rejected';
    expense.approvedBy = req.user._id;
    await expense.save();
    await logAudit(req.user._id, 'Rejected', 'Expense', expense._id.toString(), '', req.ip);

    const populated = await Expense.findById(expense._id)
      .populate('createdBy', 'name employeeId')
      .populate('approvedBy', 'name employeeId');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.setExpenseStatus = async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    expense.status = status;
    if (status === 'pending') {
      expense.approvedBy = undefined;
    } else {
      expense.approvedBy = req.user._id;
    }
    await expense.save();
    res.json({ _id: expense._id, status: expense.status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    if (expense.status !== 'pending') {
      return res.status(400).json({ message: 'Can only delete pending expenses' });
    }

    await expense.deleteOne();
    await logAudit(req.user._id, 'Deleted', 'Expense', req.params.id, '', req.ip);
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============ DASHBOARD HANDLERS ============

exports.getDashboard = async (req, res) => {
  const { month, year } = req.query;
  try {
    let filter = {};
    if (month && year) filter.date = monthRange(month, year);

    const [incomeStats, expenseStats, invoiceStats, pendingInvoices] = await Promise.all([
      Income.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Expense.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Invoice.aggregate([{ $match: filter.date ? { date: filter.date } : {} }, { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Invoice.countDocuments({ status: 'pending' }),
    ]);

    const totalIncome = incomeStats[0]?.total || 0;
    const totalExpense = expenseStats[0]?.total || 0;
    const profit = totalIncome - totalExpense;
    const profitMargin = totalIncome > 0 ? Math.round((profit / totalIncome) * 100) : 0;

    const invoiceByStatus = {};
    invoiceStats.forEach(s => { invoiceByStatus[s._id] = { total: s.total, count: s.count }; });

    res.json({
      totalIncome,
      totalExpense,
      profit,
      profitMargin,
      invoices: invoiceByStatus,
      pendingInvoices,
      month: month || new Date().getMonth() + 1,
      year: year || new Date().getFullYear(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getYearlyReport = async (req, res) => {
  const { year = new Date().getFullYear() } = req.query;
  try {
    const months = [];
    for (let i = 1; i <= 12; i++) {
      const range = monthRange(i, year);
      const [income, expense] = await Promise.all([
        Income.aggregate([{ $match: { date: range } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Expense.aggregate([{ $match: { date: range } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      ]);

      const totalIncome = income[0]?.total || 0;
      const totalExpense = expense[0]?.total || 0;
      const profit = totalIncome - totalExpense;

      months.push({
        month: i,
        monthName: new Date(`${year}-${String(i).padStart(2, '0')}-01`).toLocaleString('default', { month: 'short' }),
        income: totalIncome,
        expense: totalExpense,
        profit,
        margin: totalIncome > 0 ? Math.round((profit / totalIncome) * 100) : 0,
      });
    }

    res.json(months);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getByCategory = async (req, res) => {
  const { month, year } = req.query;
  try {
    let filter = {};
    if (month && year) filter.date = monthRange(month, year);

    const byCategory = await Expense.aggregate([
      { $match: filter },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    const totalExpense = await Expense.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const total = totalExpense[0]?.total || 0;
    res.json({
      data: byCategory.map((cat) => ({
        ...cat,
        percentage: total > 0 ? Math.round((cat.total / total) * 100) : 0,
      })),
      total,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getByService = async (req, res) => {
  const { year = new Date().getFullYear(), month } = req.query;
  try {
    const dateFilter = month ? monthRange(month, year) : { $gte: new Date(`${year}-01-01`), $lt: new Date(`${parseInt(year) + 1}-01-01`) };

    const byService = await Income.aggregate([
      { $match: { date: dateFilter } },
      { $group: { _id: '$serviceType', revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
    ]);

    res.json(byService || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getProfitByService = async (req, res) => {
  const { year = new Date().getFullYear() } = req.query;
  try {
    const yearRange = { $gte: new Date(`${year}-01-01`), $lt: new Date(`${parseInt(year) + 1}-01-01`) };

    const revenue = await Income.aggregate([
      { $match: { date: yearRange } },
      { $group: { _id: '$serviceType', revenue: { $sum: '$amount' } } },
    ]);

    res.json(revenue.map((s) => ({ serviceType: s._id || 'Unknown', revenue: s.revenue })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============ INVOICE HANDLERS ============

async function nextInvoiceNumber() {
  const settings = await FinanceSettings.findOne();
  const prefix = settings?.invoicePrefix || 'INV-';
  const last = await Invoice.findOne({}, {}, { sort: { createdAt: -1 } });
  if (!last) return `${prefix}${settings?.invoiceStart || 1001}`;
  const match = last.invoiceNumber.match(/(\d+)$/);
  const nextNum = match ? parseInt(match[1]) + 1 : (settings?.invoiceStart || 1001);
  return `${prefix}${nextNum}`;
}

exports.getInvoices = async (req, res) => {
  const { status, client, month, year, limit = 50, skip = 0 } = req.query;
  try {
    let filter = {};
    if (status) filter.status = status;
    if (client) filter.client = new RegExp(client, 'i');
    if (month && year) filter.date = monthRange(month, year);

    const invoices = await Invoice.find(filter)
      .populate('createdBy', 'name employeeId')
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Invoice.countDocuments(filter);
    const stats = await Invoice.aggregate([
      { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    res.json({ invoices, total, stats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('createdBy', 'name employeeId');
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    await logAudit(req.user._id, 'Viewed', 'Invoice', invoice.invoiceNumber, '', req.ip);
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createInvoice = async (req, res) => {
  const { client, amount, gstRate, hsn, date, dueDate, description } = req.body;
  try {
    if (!client || !amount || !date || !dueDate) {
      return res.status(400).json({ message: 'Client, amount, date, and due date are required' });
    }

    const rate = parseFloat(gstRate) || 18;
    const gst = Math.round((parseFloat(amount) * rate) / 100);
    const invoiceNumber = await nextInvoiceNumber();

    const invoice = await Invoice.create({
      invoiceNumber,
      client,
      amount: parseFloat(amount),
      gst,
      gstRate: rate,
      hsn: hsn || '',
      date: new Date(date),
      dueDate: new Date(dueDate),
      description: description || '',
      createdBy: req.user._id,
    });

    await logAudit(req.user._id, 'Created', 'Invoice', invoiceNumber, `${client} ₹${amount}`, req.ip);
    const populated = await Invoice.findById(invoice._id).populate('createdBy', 'name employeeId');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const { client, amount, gstRate, hsn, date, dueDate, status, description } = req.body;
    if (client) invoice.client = client;
    if (amount !== undefined) {
      invoice.amount = parseFloat(amount);
      const rate = parseFloat(gstRate) || invoice.gstRate;
      invoice.gst = Math.round((invoice.amount * rate) / 100);
      invoice.gstRate = rate;
    }
    if (hsn) invoice.hsn = hsn;
    if (date) invoice.date = new Date(date);
    if (dueDate) invoice.dueDate = new Date(dueDate);
    if (status) invoice.status = status;
    if (description !== undefined) invoice.description = description;

    // auto-mark overdue
    if (invoice.status === 'pending' && invoice.dueDate < new Date()) {
      invoice.status = 'overdue';
    }

    await invoice.save();
    await logAudit(req.user._id, 'Edited', 'Invoice', invoice.invoiceNumber, `status: ${invoice.status}`, req.ip);

    const populated = await Invoice.findById(invoice._id).populate('createdBy', 'name employeeId');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    if (invoice.status === 'paid') {
      return res.status(400).json({ message: 'Cannot delete a paid invoice' });
    }
    await invoice.deleteOne();
    await logAudit(req.user._id, 'Deleted', 'Invoice', invoice.invoiceNumber, '', req.ip);
    res.json({ message: 'Invoice deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============ PAYMENT HANDLERS ============

async function nextPaymentNumber() {
  const last = await Payment.findOne({}, {}, { sort: { createdAt: -1 } });
  if (!last) return 'PAY-1001';
  const match = last.paymentNumber.match(/(\d+)$/);
  const next = match ? parseInt(match[1]) + 1 : 1001;
  return `PAY-${next}`;
}

exports.getPayments = async (req, res) => {
  const { status, month, year, limit = 50, skip = 0 } = req.query;
  try {
    let filter = {};
    if (status) filter.status = status;
    if (month && year) filter.date = monthRange(month, year);

    const payments = await Payment.find(filter)
      .populate('invoiceId', 'invoiceNumber client')
      .populate('createdBy', 'name employeeId')
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Payment.countDocuments(filter);
    const stats = await Payment.aggregate([
      { $group: { _id: '$status', total: { $sum: '$paid' }, count: { $sum: 1 } } },
    ]);

    res.json({ payments, total, stats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createPayment = async (req, res) => {
  const { invoiceId, client, amount, paid, mode, date, notes } = req.body;
  try {
    if (!client || !amount) return res.status(400).json({ message: 'Client and amount are required' });

    const paidAmt = parseFloat(paid) || 0;
    const totalAmt = parseFloat(amount);
    const status = paidAmt >= totalAmt ? 'Paid' : paidAmt > 0 ? 'Partial' : 'Pending';
    const paymentNumber = await nextPaymentNumber();

    const payment = await Payment.create({
      paymentNumber,
      invoiceId: invoiceId || undefined,
      client,
      amount: totalAmt,
      paid: paidAmt,
      mode: mode || 'Bank Transfer',
      date: date ? new Date(date) : new Date(),
      status,
      notes: notes || '',
      createdBy: req.user._id,
    });

    // sync invoice status if linked
    if (invoiceId) {
      const invoice = await Invoice.findById(invoiceId);
      if (invoice) {
        invoice.status = status === 'Paid' ? 'paid' : 'pending';
        await invoice.save();
      }
    }

    await logAudit(req.user._id, 'Created', 'Payment', paymentNumber, `${client} ₹${paidAmt}`, req.ip);
    const populated = await Payment.findById(payment._id)
      .populate('invoiceId', 'invoiceNumber client')
      .populate('createdBy', 'name employeeId');

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updatePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    const { paid, mode, date, notes, status } = req.body;
    if (paid !== undefined) {
      payment.paid = parseFloat(paid);
      payment.status = payment.paid >= payment.amount ? 'Paid' : payment.paid > 0 ? 'Partial' : 'Pending';
    }
    if (status) payment.status = status;
    if (mode) payment.mode = mode;
    if (date) payment.date = new Date(date);
    if (notes !== undefined) payment.notes = notes;

    await payment.save();
    await logAudit(req.user._id, 'Edited', 'Payment', payment.paymentNumber, '', req.ip);

    const populated = await Payment.findById(payment._id)
      .populate('invoiceId', 'invoiceNumber client')
      .populate('createdBy', 'name employeeId');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    await payment.deleteOne();
    await logAudit(req.user._id, 'Deleted', 'Payment', payment.paymentNumber, '', req.ip);
    res.json({ message: 'Payment deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============ RECEIVABLES HANDLERS ============

exports.getReceivables = async (req, res) => {
  try {
    const now = new Date();
    const invoices = await Invoice.find({ status: { $in: ['pending', 'overdue'] } })
      .populate('createdBy', 'name employeeId')
      .sort({ dueDate: 1 });

    const buckets = { current: 0, days30: 0, days60: 0, days90plus: 0 };
    const enriched = invoices.map(inv => {
      const daysOverdue = Math.max(0, Math.floor((now - inv.dueDate) / 86400000));
      const totalWithGst = inv.amount + inv.gst;

      if (daysOverdue === 0) buckets.current += totalWithGst;
      else if (daysOverdue <= 30) buckets.days30 += totalWithGst;
      else if (daysOverdue <= 60) buckets.days60 += totalWithGst;
      else buckets.days90plus += totalWithGst;

      return { ...inv.toObject(), daysOverdue, totalWithGst };
    });

    const totalOutstanding = enriched.reduce((s, i) => s + i.totalWithGst, 0);

    res.json({ invoices: enriched, buckets, totalOutstanding });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============ VENDOR HANDLERS ============

async function nextVendorId() {
  const last = await Vendor.findOne({}, {}, { sort: { createdAt: -1 } });
  if (!last) return 'VEN-001';
  const match = last.vendorId.match(/(\d+)$/);
  const next = match ? parseInt(match[1]) + 1 : 1;
  return `VEN-${String(next).padStart(3, '0')}`;
}

exports.getVendors = async (req, res) => {
  const { status, category, limit = 50, skip = 0 } = req.query;
  try {
    let filter = {};
    if (status) filter.status = status;
    if (category) filter.category = new RegExp(category, 'i');

    const vendors = await Vendor.find(filter)
      .populate('createdBy', 'name employeeId')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Vendor.countDocuments(filter);
    const totalPayable = await Vendor.aggregate([
      { $match: filter },
      { $group: { _id: null, payable: { $sum: '$totalPayable' }, paid: { $sum: '$paid' } } },
    ]);

    res.json({
      vendors: vendors.map(v => ({ ...v.toObject(), pending: v.totalPayable - v.paid })),
      total,
      totalPayable: totalPayable[0]?.payable || 0,
      totalPaid: totalPayable[0]?.paid || 0,
      totalPending: (totalPayable[0]?.payable || 0) - (totalPayable[0]?.paid || 0),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createVendor = async (req, res) => {
  const { name, contact, phone, gstin, category, totalPayable, notes } = req.body;
  try {
    if (!name) return res.status(400).json({ message: 'Vendor name is required' });

    const vendorId = await nextVendorId();
    const vendor = await Vendor.create({
      vendorId,
      name,
      contact: contact || '',
      phone: phone || '',
      gstin: gstin || '',
      category: category || 'General',
      totalPayable: parseFloat(totalPayable) || 0,
      notes: notes || '',
      createdBy: req.user._id,
    });

    await logAudit(req.user._id, 'Created', 'Vendor', vendorId, name, req.ip);
    res.status(201).json({ ...vendor.toObject(), pending: vendor.totalPayable - vendor.paid });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { name, contact, phone, gstin, category, totalPayable, paid, status, dueAlert, notes } = req.body;
    if (name) vendor.name = name;
    if (contact !== undefined) vendor.contact = contact;
    if (phone !== undefined) vendor.phone = phone;
    if (gstin !== undefined) vendor.gstin = gstin;
    if (category) vendor.category = category;
    if (totalPayable !== undefined) vendor.totalPayable = parseFloat(totalPayable);
    if (paid !== undefined) vendor.paid = parseFloat(paid);
    if (status) vendor.status = status;
    if (dueAlert !== undefined) vendor.dueAlert = dueAlert;
    if (notes !== undefined) vendor.notes = notes;

    await vendor.save();
    await logAudit(req.user._id, 'Edited', 'Vendor', vendor.vendorId, '', req.ip);
    res.json({ ...vendor.toObject(), pending: vendor.totalPayable - vendor.paid });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    await vendor.deleteOne();
    await logAudit(req.user._id, 'Deleted', 'Vendor', vendor.vendorId, '', req.ip);
    res.json({ message: 'Vendor deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============ SALARY HANDLERS ============

exports.getSalaryRegister = async (req, res) => {
  const { month, year } = req.query;
  try {
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();

    const payslips = await Payslip.find({ month: m, year: y })
      .populate('employee', 'name employeeId department role')
      .populate('generatedBy', 'name employeeId')
      .sort({ createdAt: -1 });

    const stats = {
      total: payslips.length,
      published: payslips.filter(p => p.status === 'published').length,
      totalNetSalary: payslips.reduce((s, p) => s + p.netSalary, 0),
      totalGrossSalary: payslips.reduce((s, p) => s + p.grossSalary, 0),
    };

    res.json({ payslips, stats, month: m, year: y });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============ CASH FLOW HANDLERS ============

exports.getCashFlow = async (req, res) => {
  const { year = new Date().getFullYear(), months: monthsCount = 6 } = req.query;
  try {
    const now = new Date();
    const data = [];

    for (let i = parseInt(monthsCount) - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const range = monthRange(m, y);

      const [income, expense] = await Promise.all([
        Income.aggregate([{ $match: { date: range } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Expense.aggregate([{ $match: { date: range } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      ]);

      const inflow = income[0]?.total || 0;
      const outflow = expense[0]?.total || 0;

      data.push({
        month: m,
        year: y,
        label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
        inflow,
        outflow,
        net: inflow - outflow,
      });
    }

    // running balance
    let balance = 0;
    const withBalance = data.map(d => {
      balance += d.net;
      return { ...d, balance };
    });

    // projections: avg of last 3 months
    const last3 = data.slice(-3);
    const avgInflow = last3.reduce((s, d) => s + d.inflow, 0) / (last3.length || 1);
    const avgOutflow = last3.reduce((s, d) => s + d.outflow, 0) / (last3.length || 1);

    res.json({
      data: withBalance,
      projections: {
        nextMonthInflow: Math.round(avgInflow),
        nextMonthOutflow: Math.round(avgOutflow),
        nextMonthNet: Math.round(avgInflow - avgOutflow),
        runway: avgOutflow > 0 ? Math.round(balance / avgOutflow) : null,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============ LEDGER HANDLERS ============

exports.getLedger = async (req, res) => {
  const { month, year, limit = 100, skip = 0 } = req.query;
  try {
    let filter = {};
    if (month && year) filter.date = monthRange(month, year);

    const [incomes, expenses] = await Promise.all([
      Income.find(filter.date ? { date: filter.date } : {})
        .populate('createdBy', 'name')
        .sort({ date: -1 })
        .limit(50),
      Expense.find(filter.date ? { date: filter.date } : {})
        .populate('createdBy', 'name')
        .sort({ date: -1 })
        .limit(50),
    ]);

    const entries = [
      ...incomes.map(i => ({
        _id: i._id,
        date: i.date,
        type: 'Credit',
        account: i.category || 'Revenue',
        description: i.description || 'Income',
        debit: 0,
        credit: i.amount,
        createdBy: i.createdBy,
      })),
      ...expenses.map(e => ({
        _id: e._id,
        date: e.date,
        type: 'Debit',
        account: e.category || 'Expense',
        description: e.description,
        debit: e.amount,
        credit: 0,
        createdBy: e.createdBy,
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);

    res.json({ entries, totalCredit, totalDebit, balance: totalCredit - totalDebit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============ COMPLIANCE HANDLERS ============

// Seed default filings for current year if none exist
async function seedDefaultFilings(year, userId) {
  const existing = await ComplianceFiling.countDocuments();
  if (existing > 0) return;

  const now = new Date();
  const monthName = (m) => new Date(year, m - 1).toLocaleString('default', { month: 'short' });
  const defaults = [];

  // Monthly GST filings for all months up to current
  for (let m = 1; m <= 12; m++) {
    const isPast = m < now.getMonth() + 1 || year < now.getFullYear();
    const isCurrent = m === now.getMonth() + 1 && year === now.getFullYear();
    const dueGstr1 = new Date(year, m - 1, 11);
    const dueGstr3b = new Date(year, m - 1, 20);

    defaults.push({
      name: 'GSTR-1',
      description: 'Outward supplies monthly return',
      filingType: 'GST',
      period: `${monthName(m)} ${year}`,
      dueDate: dueGstr1,
      status: isPast ? 'Filed' : isCurrent && now > dueGstr1 ? 'Overdue' : isCurrent ? 'Pending' : 'Upcoming',
      createdBy: userId,
    });

    defaults.push({
      name: 'GSTR-3B',
      description: 'Summary GST return',
      filingType: 'GST',
      period: `${monthName(m)} ${year}`,
      dueDate: dueGstr3b,
      status: isPast ? 'Filed' : isCurrent && now > dueGstr3b ? 'Overdue' : isCurrent ? 'Pending' : 'Upcoming',
      createdBy: userId,
    });
  }

  // Quarterly TDS (Apr, Jul, Oct, Jan)
  for (const [qMonth, label] of [[6, 'Q1 Apr-Jun'], [9, 'Q2 Jul-Sep'], [12, 'Q3 Oct-Dec'], [3, 'Q4 Jan-Mar']]) {
    const qYear = qMonth === 3 ? year + 1 : year;
    const due = new Date(qYear, qMonth - 1, 7);
    defaults.push({
      name: 'TDS Return',
      description: 'Tax deducted at source',
      filingType: 'TDS',
      period: `${label} ${year}`,
      dueDate: due,
      status: now > due ? (now > new Date(due.getTime() + 86400000) ? 'Filed' : 'Overdue') : 'Upcoming',
      createdBy: userId,
    });
  }

  // Annual filings
  defaults.push({
    name: 'GST Annual Return',
    description: 'GSTR-9 annual filing',
    filingType: 'GST',
    period: `FY ${year}-${year + 1}`,
    dueDate: new Date(year + 1, 11, 31),
    status: 'Upcoming',
    createdBy: userId,
  });

  defaults.push({
    name: 'Income Tax Return',
    description: 'Company ITR filing',
    filingType: 'Income Tax',
    period: `FY ${year}-${year + 1}`,
    dueDate: new Date(year + 1, 9, 31),
    status: 'Upcoming',
    createdBy: userId,
  });

  await ComplianceFiling.insertMany(defaults);
}

exports.getComplianceStatus = async (req, res) => {
  const { year = new Date().getFullYear() } = req.query;
  try {
    const now = new Date();
    const y = parseInt(year);
    await seedDefaultFilings(y, req.user._id);

    // Auto-mark overdue
    await ComplianceFiling.updateMany(
      { status: 'Pending', dueDate: { $lt: now } },
      { $set: { status: 'Overdue' } }
    );

    // Enrich GST amounts from invoices per month
    for (let m = 1; m <= 12; m++) {
      const range = monthRange(m, y);
      const period = `${new Date(y, m - 1).toLocaleString('default', { month: 'short' })} ${y}`;

      const [gstData, payslipData] = await Promise.all([
        Invoice.aggregate([
          { $match: { date: range } },
          { $group: { _id: null, totalGst: { $sum: '$gst' }, totalAmount: { $sum: '$amount' } } },
        ]),
        Payslip.aggregate([
          { $match: { month: m, year: y } },
          { $group: { _id: null, totalGross: { $sum: '$grossSalary' } } },
        ]),
      ]);

      const invoiceAmount = gstData[0]?.totalAmount || null;
      const gstAmount     = gstData[0]?.totalGst    || null;
      const tdsAmount     = payslipData[0]?.totalGross
        ? Math.round(payslipData[0].totalGross * 0.1)  // 10% TDS estimate
        : null;

      if (invoiceAmount !== null) {
        await ComplianceFiling.updateMany(
          { name: 'GSTR-1', period },
          { $set: { amount: invoiceAmount } }
        );
      }
      if (gstAmount !== null) {
        await ComplianceFiling.updateMany(
          { name: 'GSTR-3B', period },
          { $set: { amount: gstAmount } }
        );
      }
      if (tdsAmount !== null) {
        // Update TDS for the quarter this month belongs to
        const quarterLabel =
          m <= 3  ? `Q4 Jan-Mar ${y}` :
          m <= 6  ? `Q1 Apr-Jun ${y}` :
          m <= 9  ? `Q2 Jul-Sep ${y}` :
                    `Q3 Oct-Dec ${y}`;
        await ComplianceFiling.updateOne(
          { name: 'TDS Return', period: quarterLabel, amount: null },
          { $set: { amount: tdsAmount } }
        );
      }
    }

    const filings = await ComplianceFiling.find()
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name')
      .sort({ dueDate: 1 });

    const overdue  = filings.filter(f => f.status === 'Overdue').length;
    const pending  = filings.filter(f => f.status === 'Pending').length;
    const filed    = filings.filter(f => f.status === 'Filed').length;
    const upcoming = filings.filter(f => f.status === 'Upcoming').length;

    res.json({ filings, overdue, pending, filed, upcoming, total: filings.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createComplianceFiling = async (req, res) => {
  try {
    const filing = await ComplianceFiling.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json(filing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateComplianceFiling = async (req, res) => {
  try {
    const filing = await ComplianceFiling.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user._id },
      { new: true }
    );
    if (!filing) return res.status(404).json({ message: 'Filing not found' });
    res.json(filing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.markFiled = async (req, res) => {
  try {
    const filing = await ComplianceFiling.findByIdAndUpdate(
      req.params.id,
      { status: 'Filed', filedDate: new Date(), updatedBy: req.user._id },
      { new: true }
    );
    if (!filing) return res.status(404).json({ message: 'Filing not found' });
    res.json(filing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteComplianceFiling = async (req, res) => {
  try {
    await ComplianceFiling.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============ AUDIT LOG HANDLERS ============

exports.getAuditLog = async (req, res) => {
  const { action, module, limit = 100, skip = 0 } = req.query;
  try {
    let filter = {};
    if (action) filter.action = action;
    if (module) filter.module = module;

    const logs = await FinanceAuditLog.find(filter)
      .populate('user', 'name employeeId role')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await FinanceAuditLog.countDocuments(filter);
    res.json({ logs, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============ INTELLIGENCE HANDLERS ============

exports.getIntelligence = async (req, res) => {
  const { year = new Date().getFullYear() } = req.query;
  try {
    // 6-month trend
    const now = new Date();
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const range = monthRange(m, y);

      const [inc, exp] = await Promise.all([
        Income.aggregate([{ $match: { date: range } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Expense.aggregate([{ $match: { date: range } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      ]);

      trend.push({
        label: d.toLocaleString('default', { month: 'short' }),
        revenue: inc[0]?.total || 0,
        expenses: exp[0]?.total || 0,
        profit: (inc[0]?.total || 0) - (exp[0]?.total || 0),
      });
    }

    // top clients by invoice amount
    const topClients = await Invoice.aggregate([
      { $group: { _id: '$client', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
    ]);

    // expense category breakdown
    const expenseBreakdown = await Expense.aggregate([
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
      { $limit: 6 },
    ]);

    // current month vs last month
    const thisMonth = monthRange(now.getMonth() + 1, now.getFullYear());
    const lastMonthD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = monthRange(lastMonthD.getMonth() + 1, lastMonthD.getFullYear());

    const [thisInc, lastInc, thisExp, lastExp] = await Promise.all([
      Income.aggregate([{ $match: { date: thisMonth } }, { $group: { _id: null, t: { $sum: '$amount' } } }]),
      Income.aggregate([{ $match: { date: lastMonth } }, { $group: { _id: null, t: { $sum: '$amount' } } }]),
      Expense.aggregate([{ $match: { date: thisMonth } }, { $group: { _id: null, t: { $sum: '$amount' } } }]),
      Expense.aggregate([{ $match: { date: lastMonth } }, { $group: { _id: null, t: { $sum: '$amount' } } }]),
    ]);

    const curIncome = thisInc[0]?.t || 0;
    const prevIncome = lastInc[0]?.t || 0;
    const curExpense = thisExp[0]?.t || 0;
    const prevExpense = lastExp[0]?.t || 0;

    const incomeGrowth = prevIncome > 0 ? Math.round(((curIncome - prevIncome) / prevIncome) * 100) : 0;
    const expenseGrowth = prevExpense > 0 ? Math.round(((curExpense - prevExpense) / prevExpense) * 100) : 0;
    const profitMargin = curIncome > 0 ? Math.round(((curIncome - curExpense) / curIncome) * 100) : 0;

    res.json({ trend, topClients, expenseBreakdown, insights: { incomeGrowth, expenseGrowth, profitMargin, curIncome, curExpense } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============ SETTINGS HANDLERS ============

exports.getFinanceSettings = async (req, res) => {
  try {
    let settings = await FinanceSettings.findOne();
    if (!settings) settings = await FinanceSettings.create({});
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateFinanceSettings = async (req, res) => {
  try {
    let settings = await FinanceSettings.findOne();
    if (!settings) settings = new FinanceSettings({});

    const fields = ['gstRate', 'cgst', 'sgst', 'igst', 'tdsRate', 'invoicePrefix', 'invoiceStart', 'paymentTerms', 'defaultNotes', 'currency', 'enabledModes'];
    fields.forEach(f => { if (req.body[f] !== undefined) settings[f] = req.body[f]; });
    settings.updatedBy = req.user._id;

    await settings.save();
    await logAudit(req.user._id, 'Edited', 'Settings', 'Finance Settings', '', req.ip);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
