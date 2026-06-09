const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentNumber: { type: String, required: true, unique: true },
  invoiceId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  client:        { type: String, required: true },
  amount:        { type: Number, required: true, min: 0 },
  paid:          { type: Number, default: 0 },
  mode:          { type: String, enum: ['Bank Transfer', 'UPI', 'Cash', 'Cheque', 'Credit Card', 'Debit Card'], default: 'Bank Transfer' },
  date:          { type: Date },
  status:        { type: String, enum: ['Paid', 'Partial', 'Pending'], default: 'Pending' },
  notes:         { type: String, default: '' },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

paymentSchema.index({ date: -1 });
paymentSchema.index({ status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
