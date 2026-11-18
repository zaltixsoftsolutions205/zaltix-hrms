const mongoose = require('mongoose');

const leadCustomFieldValueSchema = new mongoose.Schema(
  {
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    field: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadCustomField', required: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

// One value per (lead, field) pair — concurrent upserts rely on this index.
leadCustomFieldValueSchema.index({ lead: 1, field: 1 }, { unique: true });

module.exports = mongoose.model('LeadCustomFieldValue', leadCustomFieldValueSchema);