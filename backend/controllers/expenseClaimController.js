const ExpenseClaim = require('../models/ExpenseClaim');
const User = require('../models/User');
const notificationService = require('../services/notificationService');

const CATEGORIES = ['travel', 'food', 'accommodation', 'fuel', 'supplies', 'client-meeting', 'other'];

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

/**
 * Employee: submit a reimbursement claim.
 * Notifies all HR + Admin users, mirroring how leave requests route.
 */
exports.createClaim = async (req, res) => {
  const { category, amount, date, description } = req.body;
  try {
    if (!category || amount == null || !date || !description) {
      return res.status(400).json({ message: 'Category, amount, date and description are required' });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Invalid category' });
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: 'Amount must be a positive number' });
    }

    const claimData = {
      employee: req.user._id,
      category,
      amount: amt,
      date: new Date(date),
      description: String(description).trim(),
    };
    if (req.file) {
      claimData.receiptPath = req.file.path;
      claimData.receiptFileName = req.file.filename;
    }

    const claim = await ExpenseClaim.create(claimData);

    // Notify HR + Admin, same audience and channel as leave requests.
    const approvers = await User.find({ role: { $in: ['hr', 'admin'] }, isActive: true }, '_id');
    await notificationService.notifyMany(approvers.map(u => u._id), {
      title: 'New Expense Claim',
      message: `${req.user.name} submitted a ${category} claim for ${inr(amt)}.`,
      type: 'general',
      link: '/admin/expense-claims',
    });

    const populated = await ExpenseClaim.findById(claim._id).populate('employee', 'name employeeId');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Employee: list own claims (newest first). */
exports.getMyClaims = async (req, res) => {
  try {
    const claims = await ExpenseClaim.find({ employee: req.user._id })
      .sort({ createdAt: -1 })
      .populate('reviewedBy', 'name');
    res.json(claims);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Employee: withdraw an own claim while it is still pending. */
exports.deleteClaim = async (req, res) => {
  try {
    const claim = await ExpenseClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ message: 'Claim not found' });
    if (String(claim.employee) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only withdraw your own claims' });
    }
    if (claim.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending claims can be withdrawn' });
    }
    await claim.deleteOne();
    res.json({ message: 'Claim withdrawn' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** HR/Admin: list all claims, optionally filtered by status. */
exports.getAllClaims = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && ['pending', 'approved', 'rejected'].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const claims = await ExpenseClaim.find(filter)
      .sort({ createdAt: -1 })
      .populate('employee', 'name employeeId')
      .populate('reviewedBy', 'name');
    res.json(claims);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** HR/Admin: approve or reject a claim, then notify the claimant. */
exports.reviewClaim = async (req, res) => {
  const { status, reviewNote } = req.body;
  try {
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved or rejected' });
    }
    const claim = await ExpenseClaim.findById(req.params.id).populate('employee', 'name _id');
    if (!claim) return res.status(404).json({ message: 'Claim not found' });
    if (claim.status !== 'pending') {
      return res.status(400).json({ message: `This claim was already ${claim.status}` });
    }

    claim.status = status;
    claim.reviewedBy = req.user._id;
    claim.reviewedAt = new Date();
    claim.reviewNote = reviewNote ? String(reviewNote).trim() : '';
    await claim.save();

    await notificationService.notify(claim.employee._id, {
      title: status === 'approved' ? 'Expense Claim Approved' : 'Expense Claim Rejected',
      message: `Your ${claim.category} claim for ${inr(claim.amount)} was ${status}` +
        (claim.reviewNote ? `: ${claim.reviewNote}` : '.'),
      type: 'general',
      link: '/field-sales/expense-claims',
    });

    const populated = await ExpenseClaim.findById(claim._id)
      .populate('employee', 'name employeeId')
      .populate('reviewedBy', 'name');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
