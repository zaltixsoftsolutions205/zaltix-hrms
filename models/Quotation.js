const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  quantity:    { type: Number, required: true, min: 1 },
  rate:        { type: Number, required: true, min: 0 },
  amount:      { type: Number, required: true },
}, { _id: false });

const quotationSchema = new mongoose.Schema({
  quotationNumber: { type: String, unique: true },
  lead:            { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  clientName:      { type: String, required: true, trim: true },
  clientEmail:     { type: String, trim: true, default: '' },
  clientPhone:     { type: String, trim: true, default: '' },
  clientCompany:   { type: String, trim: true, default: '' },
  items:           { type: [itemSchema], required: true },
  subtotal:        { type: Number, required: true },
  discountPercent: { type: Number, default: 0 },
  discountAmount:  { type: Number, default: 0 },
  taxPercent:      { type: Number, default: 18 },
  taxAmount:       { type: Number, default: 0 },
  total:           { type: Number, required: true },
  status:          { type: String, enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'], default: 'draft' },
  validUntil:      { type: Date, default: null },
  notes:           { type: String, default: '' },
  createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// Auto-generate quotation number
quotationSchema.pre('save', async function (next) {
  if (!this.quotationNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('Quotation').countDocuments();
    this.quotationNumber = `QT-${year}-${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Quotation', quotationSchema);
