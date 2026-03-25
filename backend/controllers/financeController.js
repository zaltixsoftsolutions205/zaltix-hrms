const Income = require('../models/Income');
const Expense = require('../models/Expense');
const Deal = require('../models/Deal');

// ============ INCOME HANDLERS ============

exports.getIncome = async (req, res) => {
  const { month, year, type, category, serviceType, limit = 50, skip = 0 } = req.query;
  try {
    let filter = {};

    if (month && year) {
      const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      filter.date = { $gte: monthStart, $lt: monthEnd };
    }

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

    if (month && year) {
      const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      filter.date = { $gte: monthStart, $lt: monthEnd };
    }

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

    if (month && year) {
      const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      filter.date = { $gte: monthStart, $lt: monthEnd };
    }

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

    if (month && year) {
      const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      filter.date = { $gte: monthStart, $lt: monthEnd };
    }

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
    const populated = await Expense.findById(expense._id)
      .populate('createdBy', 'name employeeId')
      .populate('approvedBy', 'name employeeId');

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateExpense = async (req, res) => {
  const { category, amount, date, description, customCategory, notes, status } = req.body;
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

    if (month && year) {
      const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      filter.date = { $gte: monthStart, $lt: monthEnd };
    }

    const [incomeStats, expenseStats] = await Promise.all([
      Income.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Expense.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);

    const totalIncome = incomeStats[0]?.total || 0;
    const totalExpense = expenseStats[0]?.total || 0;
    const profit = totalIncome - totalExpense;
    const profitMargin = totalIncome > 0 ? Math.round((profit / totalIncome) * 100) : 0;

    res.json({
      totalIncome,
      totalExpense,
      profit,
      profitMargin,
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
    const yearStart = new Date(`${year}-01-01`);
    const yearEnd = new Date(`${year}-12-31`);

    const months = [];
    for (let i = 1; i <= 12; i++) {
      const monthStart = new Date(`${year}-${String(i).padStart(2, '0')}-01`);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      const [income, expense] = await Promise.all([
        Income.aggregate([
          { $match: { date: { $gte: monthStart, $lt: monthEnd } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Expense.aggregate([
          { $match: { date: { $gte: monthStart, $lt: monthEnd } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
      ]);

      const totalIncome = income[0]?.total || 0;
      const totalExpense = expense[0]?.total || 0;
      const profit = totalIncome - totalExpense;

      months.push({
        month: i,
        monthName: new Date(monthStart).toLocaleString('default', { month: 'short' }),
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

    if (month && year) {
      const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      filter.date = { $gte: monthStart, $lt: monthEnd };
    }

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
    let dateFilter;
    if (month) {
      const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      dateFilter = { $gte: monthStart, $lt: monthEnd };
    } else {
      dateFilter = { $gte: new Date(`${year}-01-01`), $lt: new Date(`${parseInt(year) + 1}-01-01`) };
    }

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
    const yearStart = new Date(`${year}-01-01`);
    const yearEnd = new Date(`${year}-12-31`);

    const revenue = await Income.aggregate([
      { $match: { date: { $gte: yearStart, $lt: yearEnd } } },
      { $group: { _id: '$serviceType', revenue: { $sum: '$amount' } } },
    ]);

    const result = revenue.map((service) => ({
      serviceType: service._id || 'Unknown',
      revenue: service.revenue,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
