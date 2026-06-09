const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  vendorId:      { type: String, required: true, unique: true },
  name:          { type: String, required: true },
  contact:       { type: String, default: '' },
  phone:         { type: String, default: '' },
  gstin:         { type: String, default: '' },
  category:      { type: String, default: 'General' },
  totalPayable:  { type: Number, default: 0 },
  paid:          { type: Number, default: 0 },
  status:        { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  dueAlert:      { type: Boolean, default: false },
  notes:         { type: String, default: '' },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

vendorSchema.virtual('pending').get(function () {
  return this.totalPayable - this.paid;
});

vendorSchema.index({ status: 1 });

module.exports = mongoose.model('Vendor', vendorSchema);
