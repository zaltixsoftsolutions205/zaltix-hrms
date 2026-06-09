const mongoose = require('mongoose');

const complianceFilingSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  period:      { type: String, required: true },
  dueDate:     { type: Date, required: true },
  filedDate:   { type: Date, default: null },
  status:      { type: String, enum: ['Pending', 'Filed', 'Overdue', 'Upcoming'], default: 'Pending' },
  amount:      { type: Number, default: null },
  notes:       { type: String, default: '' },
  filingType:  { type: String, enum: ['GST', 'TDS', 'Income Tax', 'PF', 'ESI', 'Other'], default: 'Other' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Auto-mark overdue on read
complianceFilingSchema.pre('find', function () {
  const now = new Date();
  this.model.updateMany(
    { status: 'Pending', dueDate: { $lt: now } },
    { $set: { status: 'Overdue' } }
  ).exec();
});

module.exports = mongoose.model('ComplianceFiling', complianceFilingSchema);
