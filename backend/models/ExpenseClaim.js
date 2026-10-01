const mongoose = require('mongoose');

/**
 * Employee expense-reimbursement claim.
 *
 * Deliberately separate from the finance `Expense` model: that one tracks
 * company costs (salary, rent, software) entered by HR/Admin, whereas this is
 * a personal reimbursement raised by any employee. Keeping them apart stops
 * unapproved personal claims from polluting the Finance ledger.
 */
const expenseClaimSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: {
      type: String,
      enum: ['travel', 'food', 'accommodation', 'fuel', 'supplies', 'client-meeting', 'other'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true }, // date the expense was incurred
    description: { type: String, required: true, trim: true },
    receiptPath: { type: String },
    receiptFileName: { type: String },

    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true }, // reason on approve/reject
  },
  { timestamps: true }
);

expenseClaimSchema.index({ employee: 1, createdAt: -1 });
expenseClaimSchema.index({ status: 1 });

module.exports = mongoose.model('ExpenseClaim', expenseClaimSchema);
