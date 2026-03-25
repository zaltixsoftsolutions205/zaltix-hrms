const mongoose = require('mongoose');

const expenseCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      enum: ['salary', 'commission', 'rent', 'software', 'marketing', 'operational', 'custom'],
      unique: true,
      required: true,
    },
    label: { type: String, required: true },
    description: { type: String },
    isDefault: { type: Boolean, default: true },
    color: { type: String, default: '#6B7280' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExpenseCategory', expenseCategorySchema);
