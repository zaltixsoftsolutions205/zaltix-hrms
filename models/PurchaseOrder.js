const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  quantity:    { type: Number, required: true, min: 1 },
  rate:        { type: Number, required: true, min: 0 },
  amount:      { type: Number, required: true },
}, { _id: false });

const purchaseOrderSchema = new mongoose.Schema({
  poNumber:      { type: String, unique: true },
  quotation:     { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', default: null },
  clientName:    { type: String, required: true, trim: true },
  clientEmail:   { type: String, trim: true, default: '' },
  clientPhone:   { type: String, trim: true, default: '' },
  clientCompany: { type: String, trim: true, default: '' },
  items:         { type: [itemSchema], required: true },
  subtotal:      { type: Number, required: true },
  taxPercent:    { type: Number, default: 18 },
  taxAmount:     { type: Number, default: 0 },
  total:         { type: Number, required: true },
  status:        { type: String, enum: ['pending', 'confirmed', 'in-progress', 'delivered', 'cancelled'], default: 'pending' },
  deliveryDate:  { type: Date, default: null },
  paymentTerms:  { type: String, default: '' },
  notes:         { type: String, default: '' },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// Auto-generate PO number
purchaseOrderSchema.pre('save', async function (next) {
  if (!this.poNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('PurchaseOrder').countDocuments();
    this.poNumber = `PO-${year}-${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
