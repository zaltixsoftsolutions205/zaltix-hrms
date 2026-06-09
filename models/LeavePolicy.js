const mongoose = require('mongoose');

const leavePolicySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, default: 'Default Policy' },
    year: { type: Number, required: true },
    casualLeaves: { type: Number, default: 12 },
    sickLeaves: { type: Number, default: 10 },
    otherLeaves: { type: Number, default: 5 },
    appliesTo: { type: String, enum: ['all', 'specific'], default: 'all' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LeavePolicy', leavePolicySchema);
