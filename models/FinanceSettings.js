const mongoose = require('mongoose');

const financeSettingsSchema = new mongoose.Schema({
  gstRate:        { type: Number, default: 18 },
  cgst:           { type: Number, default: 9 },
  sgst:           { type: Number, default: 9 },
  igst:           { type: Number, default: 18 },
  tdsRate:        { type: Number, default: 10 },
  invoicePrefix:  { type: String, default: 'INV-' },
  invoiceStart:   { type: Number, default: 1001 },
  paymentTerms:   { type: Number, default: 30 },
  defaultNotes:   { type: String, default: 'Thank you for your business. Payment is due within 30 days.' },
  currency:       { type: String, default: 'INR' },
  enabledModes:   { type: [String], default: ['Bank Transfer', 'UPI', 'Cash'] },
  updatedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('FinanceSettings', financeSettingsSchema);
