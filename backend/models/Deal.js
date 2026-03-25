const mongoose = require('mongoose');
const { SERVICE_TYPE_VALUES } = require('../constants/serviceTypes');

const dealSchema = new mongoose.Schema(
  {
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, unique: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    name: { type: String, required: true, trim: true },
    serviceType: { type: String, enum: SERVICE_TYPE_VALUES, required: true },
    quotedAmount: { type: Number, default: 0 },
    finalDealAmount: { type: Number, default: 0 },
    annualRevenue: { type: Number, default: 0 },
    probability: { type: Number, default: 0, min: 0, max: 100 },
    expectedCloseDate: { type: Date, default: null },
    closedDate: { type: Date, default: null },
    status: { type: String, enum: ['open', 'won', 'lost'], default: 'open' },
    commission: { type: Number, default: 0 },
    commissionPaid: { type: Boolean, default: false },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

dealSchema.index({ assignedTo: 1, status: 1 });
dealSchema.index({ serviceType: 1 });
dealSchema.index({ closedDate: 1 });
dealSchema.index({ department: 1 });

module.exports = mongoose.model('Deal', dealSchema);
