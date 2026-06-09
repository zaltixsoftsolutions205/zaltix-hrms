const mongoose = require('mongoose');

const incomeSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['deal', 'manual'], required: true },
    category: {
      type: String,
      enum: ['investment', 'client_payment', 'talent_acquisition', 'product_sale', 'general'],
      default: 'general',
    },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    description: { type: String },
    dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', unique: true, sparse: true },
    serviceType: { type: String },
    syncedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String },
  },
  { timestamps: true }
);

incomeSchema.index({ date: -1 });
incomeSchema.index({ type: 1 });
incomeSchema.index({ serviceType: 1 });

module.exports = mongoose.model('Income', incomeSchema);
