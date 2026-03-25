const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  type: { type: String, enum: ['call', 'meeting', 'follow-up', 'note'], required: true },
  note: { type: String, required: true },
  date: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
    source: { type: String, enum: ['website', 'referral', 'social', 'cold-call', 'other'], default: 'other' },
    status: { type: String, enum: ['new', 'interested', 'not-interested', 'converted'], default: 'new' },
    notes: { type: String, default: '' },
    serviceType: { type: String, enum: ['automated-systems', 'web-mobile-apps', 'digital-marketing', 'outsourcing', 'eshcul', ''], default: '' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    activities: [activitySchema],
    convertedDate: { type: Date, default: null },
    // Pipeline & Deal fields
    pipelineStage: { type: String, enum: ['prospect', 'qualified', 'proposal', 'negotiation', 'closed-won', 'closed-lost'], default: 'prospect' },
    followUpDate: { type: Date, default: null },
    dealValue: { type: Number, default: 0 },
    probability: { type: Number, default: 0 },
    expectedCloseDate: { type: Date, default: null },
    commission: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lead', leadSchema);
