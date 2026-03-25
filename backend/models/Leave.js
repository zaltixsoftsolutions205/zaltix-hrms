const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['casual', 'sick', 'other', 'lop'], required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    totalDays: { type: Number, required: true },
    reason: { type: String, required: true },
    halfDay: { type: Boolean, default: false },
    session: { type: String, enum: ['morning', 'afternoon'], default: null },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvalDate: { type: Date, default: null },
    approverComments: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Leave', leaveSchema);
