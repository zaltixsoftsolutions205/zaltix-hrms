const mongoose = require('mongoose');

const leadCustomFieldOptionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const leadCustomFieldSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true, lowercase: true },
    type: {
      type: String,
      enum: ['text', 'number', 'email', 'phone', 'date', 'datetime', 'single-select', 'multi-select', 'person', 'reference', 'checkbox', 'url', 'currency',],
      required: true,
    },
    entity: { type: String, default: null, trim: true },
    options: { type: [leadCustomFieldOptionSchema], default: [] },
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Only one *active* field may hold a given key at a time — a soft-deleted
// field frees its key up for reuse rather than blocking it forever.
leadCustomFieldSchema.index(
  { key: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('LeadCustomField', leadCustomFieldSchema);