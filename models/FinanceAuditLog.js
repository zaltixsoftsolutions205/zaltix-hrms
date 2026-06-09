const mongoose = require('mongoose');

const financeAuditLogSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action:  { type: String, enum: ['Created', 'Edited', 'Deleted', 'Viewed', 'Approved', 'Rejected'], required: true },
  module:  { type: String, required: true },
  target:  { type: String, required: true },
  details: { type: String, default: '' },
  ip:      { type: String, default: '' },
}, { timestamps: true });

financeAuditLogSchema.index({ createdAt: -1 });
financeAuditLogSchema.index({ action: 1 });
financeAuditLogSchema.index({ module: 1 });

module.exports = mongoose.model('FinanceAuditLog', financeAuditLogSchema);
