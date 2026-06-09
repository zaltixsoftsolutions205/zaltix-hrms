const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  client:        { type: String, required: true },
  amount:        { type: Number, required: true, min: 0 },
  gst:           { type: Number, default: 0 },
  gstRate:       { type: Number, default: 18 },
  date:           { type: Date, required: true },
  dueDate:        { type: Date, required: true },
  status:         { type: String, enum: ['paid', 'pending', 'overdue'], default: 'pending' },
  description:    { type: String, default: '' },
  companyAddress: { type: String, default: '' },
  companyGST:     { type: String, default: '' },
  companyPhone:   { type: String, default: '' },
  companyEmail:   { type: String, default: '' },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

invoiceSchema.index({ date: -1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ client: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
